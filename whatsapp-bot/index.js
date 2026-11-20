import 'dotenv/config';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import P from 'pino';
import qrcode from 'qrcode-terminal';
import fs from 'node:fs';
import path from 'node:path';

const OWNER_NUMBER = (process.env.OWNER_NUMBER || '').replace(/\D/g, '');
const AI_URL = process.env.KAIROS_API_URL || 'https://evil-engine-ui.vercel.app/api/generate';
const CONFIG_PATH = path.resolve('bot-config.json');

if (!OWNER_NUMBER) {
  console.error('Missing OWNER_NUMBER. Add it to your private .env file.');
  process.exit(1);
}

let config = { enabled: true, name: process.env.BOT_NAME || 'Kairos GPT', bio: 'Your AI assistant on WhatsApp.' };
try {
  if (fs.existsSync(CONFIG_PATH)) config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
} catch {
  console.warn('Could not read bot-config.json; using defaults.');
}
function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

const histories = new Map();
const MAX_HISTORY = 12;
const logger = P({ level: 'silent' });

function senderNumber(jid = '') {
  const raw = jid.split('@')[0].split(':')[0];
  return raw.replace(/\D/g, '');
}
function getText(message) {
  const m = message?.message;
  return m?.conversation
    || m?.extendedTextMessage?.text
    || m?.imageMessage?.caption
    || m?.videoMessage?.caption
    || '';
}
function isOwner(jid) {
  return senderNumber(jid) === OWNER_NUMBER;
}
async function askKairos(jid, prompt) {
  const history = histories.get(jid) || [];
  const messages = [...history, { role: 'user', content: prompt }].slice(-MAX_HISTORY);
  const response = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI service returned HTTP ${response.status}: ${detail.slice(0, 250)}`);
  }
  const data = await response.json();
  const answer = String(data.response || '').trim();
  if (!answer) throw new Error('The AI returned an empty response.');
  histories.set(jid, [...messages, { role: 'assistant', content: answer }].slice(-MAX_HISTORY));
  return answer;
}

async function handleOwnerCommand(sock, jid, text) {
  const [command, ...args] = text.trim().split(/\s+/);
  const value = args.join(' ').trim();
  switch (command.toLowerCase()) {
    case '.alive':
      return 'Kairos GPT is online and connected. 💙';
    case '.ping':
      return 'Pong! 🏓';
    case '.status':
      return `Status: ${config.enabled ? 'ONLINE' : 'PAUSED'}\nName: ${config.name}\nOwner controls: active`;
    case '.off':
      config.enabled = false; saveConfig();
      return 'Automatic replies paused. Owner commands will still work.';
    case '.on':
      config.enabled = true; saveConfig();
      return 'Automatic replies are active again. 💙';
    case '.setname':
      if (!value) return 'Usage: .setname Kairos GPT';
      config.name = value.slice(0, 50); saveConfig();
      return `Bot name updated to ${config.name}.`;
    case '.setbio':
      if (!value) return 'Usage: .setbio Your new assistant description';
      config.bio = value.slice(0, 300); saveConfig();
      return 'Bot description updated.';
    case '.clear':
      histories.delete(jid);
      return 'Your chat context has been cleared.';
    case '.help':
      return 'OWNER COMMANDS\n.alive — check connection\n.ping — test response\n.status — bot status\n.off — pause AI replies\n.on — resume AI replies\n.setname Name — change bot name\n.setbio Text — change description\n.clear — clear your chat context\n.help — show commands';
    default:
      return null;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Kairos GPT', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\nScan this QR using the separate WhatsApp account:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') console.log('Kairos GPT WhatsApp is connected.');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log('Connection closed. Reconnecting...');
        setTimeout(startBot, 3000);
      } else {
        console.log('WhatsApp logged out. Remove auth_info_baileys and pair again.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      const jid = msg.key?.remoteJid;
      if (!jid || msg.key?.fromMe || jid === 'status@broadcast' || jid.endsWith('@g.us')) continue;
      const text = getText(msg).trim();
      if (!text) continue;

      try {
        if (isOwner(jid) && text.startsWith('.')) {
          const commandReply = await handleOwnerCommand(sock, jid, text);
          if (commandReply) await sock.sendMessage(jid, { text: commandReply });
          continue;
        }
        if (!config.enabled) continue;

        await sock.sendPresenceUpdate('composing', jid);
        const answer = await askKairos(jid, text);
        await sock.sendMessage(jid, { text: answer });
      } catch (error) {
        console.error('Message processing failed:', error.message);
        await sock.sendMessage(jid, { text: 'Sorry, I could not process that message just now. Please try again shortly.' });
      } finally {
        await sock.sendPresenceUpdate('paused', jid).catch(() => {});
      }
    }
  });
}

startBot().catch(error => {
  console.error('Could not start Kairos GPT WhatsApp:', error);
  process.exit(1);
});
