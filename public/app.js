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
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const roomInfo = document.getElementById('room-info');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const logsDiv = document.getElementById('logs');

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
                addMessage(data.text, false);
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

    // 发送给服务器
    socket.send(JSON.stringify({ type: 'msg', text: text }));

    // 自己界面显示
    addMessage(text, true);
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

function addMessage(text, isSent) {
    const msg = document.createElement('div');
    msg.className = `message ${isSent ? 'sent' : 'received'}`;
    msg.textContent = text;
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
