async function sendPrompt() {
    const input = document.getElementById('prompt-input');
    const chatBox = document.getElementById('chat-box');
    const text = input.value.trim();
    if (!text) return;

    appendMessage('You', text);
    input.value = '';

    try {
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({prompt: text})
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Request failed');
        appendMessage('EvilGPT', data.response);
    } catch (err) {
        appendMessage('System', err.message || 'Connection failed.');
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendMessage(sender, message) {
    const chatBox = document.getElementById('chat-box');
    const item = document.createElement('div');
    const label = document.createElement('b');
    item.className = 'message';
    label.textContent = sender + ': ';
    item.append(label, document.createTextNode(message));
    chatBox.appendChild(item);
}
