# Kairos GPT WhatsApp

Baileys-based WhatsApp companion for the existing Kairos GPT API.

## Requirements
- Node.js 20+
- A separate WhatsApp account for the bot
- The owner's personal WhatsApp number

## Local setup
1. Open this folder in a terminal.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `OWNER_NUMBER` to the owner's number in international format, digits only.
5. Run `npm start`.
6. Scan the QR code using the bot account: WhatsApp > Linked devices > Link a device.

The pairing session is saved in `auth_info_baileys/`. Keep this folder private and persistent. Never commit it or share its contents.

## Owner commands
- `.alive`
- `.ping`
- `.status`
- `.off` / `.on`
- `.setname Name`
- `.setbio Description`
- `.clear`
- `.help`

Only the configured owner number can execute dot commands. Other users' messages are treated as normal AI prompts.

## Notes
- Group chats are ignored in this first version.
- Conversation context is kept in memory per chat and resets when the process restarts.
- Use a persistent server and persistent storage for reliable long-running operation.
- Baileys is an unofficial WhatsApp Web client. Avoid bulk messaging and unsolicited messages; WhatsApp may restrict unofficial integrations.
