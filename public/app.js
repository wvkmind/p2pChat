/**
 * WebSocket 聊天客户端
 * 极简架构：不再使用 WebRTC，直接通过服务器转发
 */

// 自动判断 WS 协议 (https用wss, http用ws)
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${window.location.host}/ws`;

let socket = null;
let roomId = null;

// DOM 元素
const connectPanel = document.getElementById('connect-panel');
const statusPanel = document.getElementById('status-panel');
const chatPanel = document.getElementById('chat-panel');
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const roomInput = document.getElementById('room-input');
const passwordInput = document.getElementById('password-input');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const roomInfo = document.getElementById('room-info');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const logsDiv = document.getElementById('logs');

let currentPassword = '';

// 事件监听
createBtn.addEventListener('click', createRoom);
joinBtn.addEventListener('click', () => joinRoom(roomInput.value.trim()));
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendBtn.disabled) sendMessage();
});

// 生成随机房间ID
function generateId() {
    return Math.random().toString(36).substring(2, 8);
}

// 创建房间
async function createRoom() {
    const id = generateId();
    joinRoom(id);
}

// 加入房间 (连接 WebSocket)
function joinRoom(id) {
    if (!id) {
        log('请输入房间 ID', 'error');
        return;
    }

    roomId = id;
    currentPassword = passwordInput.value.trim();

    if (currentPassword) {
        log('🔒 已启用端到端加密', 'success');
    } else {
        log('⚠️ 未设置密码，聊天将以明文传输', 'warning');
    }

    log(`正在连接房间: ${id}...`);

    // 禁用按钮
    createBtn.disabled = true;
    joinBtn.disabled = true;

    // 建立连接
    const url = `${WS_URL}?roomId=${id}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
        log('WebSocket 连接成功!', 'success');
        showStatus(`房间 ID: ${roomId}`, '在线');
        statusDot.classList.add('connected');

        // 启用聊天
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
    };

    socket.onclose = () => {
        log('连接已断开', 'error');
        statusDot.classList.remove('connected');
        statusDot.classList.add('error');
        statusText.textContent = '离线';
        messageInput.disabled = true;
        sendBtn.disabled = true;

        // 允许重连
        createBtn.disabled = false;
        joinBtn.disabled = false;
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'msg') {
                let content = data.text;
                let isEncrypted = data.encrypted;

                // 尝试解密
                if (isEncrypted) {
                    if (!currentPassword) {
                        content = '🔒 [加密消息] 请输入密码查看';
                    } else {
                        try {
                            const bytes = CryptoJS.AES.decrypt(content, currentPassword);
                            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                            if (decrypted) {
                                content = decrypted;
                            } else {
                                content = '🚫 [解密失败] 密码错误';
                            }
                        } catch (e) {
                            content = '🚫 [解密失败] 数据损坏';
                        }
                    }
                }

                addMessage(content, false, isEncrypted);
            } else if (data.type === 'system') {
                addSystemMessage(data.text);
            }
        } catch (e) {
            console.error(e);
        }
    };

    socket.onerror = (err) => {
        log('连接发生错误', 'error');
        console.error(err);
    };
}

// 发送消息
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;

    let payload = { type: 'msg', text: text };

    // 加密
    if (currentPassword) {
        const encrypted = CryptoJS.AES.encrypt(text, currentPassword).toString();
        payload.text = encrypted;
        payload.encrypted = true;
    }

    socket.send(JSON.stringify(payload));

    // 自己界面显示 (直接显示原文，但标记为加密)
    addMessage(text, true, !!currentPassword);
    messageInput.value = '';
}

// 显示状态面板
function showStatus(room, status) {
    connectPanel.classList.add('hidden');
    statusPanel.classList.remove('hidden');
    chatPanel.classList.remove('hidden');
    roomInfo.textContent = room;
    statusText.textContent = status;
}

// UI 辅助函数
function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsDiv.appendChild(entry);
    logsDiv.scrollTop = logsDiv.scrollHeight;
}

function addSystemMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'message system';
    msg.textContent = text;
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addMessage(text, isSent, isEncrypted = false) {
    const msg = document.createElement('div');
    msg.className = `message ${isSent ? 'sent' : 'received'}`;

    if (isEncrypted) {
        text = '🔒 ' + text;
    }

    msg.textContent = text;
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
