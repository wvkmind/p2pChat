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
        alert('请输入房间号');
        return;
    }

    roomId = id;
    currentPassword = passwordInput.value.trim();

    // 按钮反馈
    joinBtn.disabled = true;
    joinBtn.textContent = '连接中...';

    // 建立连接
    const url = `${WS_URL}?roomId=${id}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
        updateStatus('connected');
        switchView('chat');

        // 恢复按钮
        joinBtn.disabled = false;
        joinBtn.textContent = '加入房间';

        // 启用聊天输入
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();

        addSystemMessage(`已进入房间: ${roomId}`);
        if (currentPassword) addSystemMessage('🔒 端到端加密已启用');
    };

    socket.onclose = () => {
        updateStatus('disconnected');
        messageInput.disabled = true;
        sendBtn.disabled = true;

        // 5秒后自动切换回登录页？或者留在这里看历史消息
        // switchView('login');
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
        updateStatus('error');
        console.error(err);
        joinBtn.disabled = false;
        joinBtn.textContent = '加入房间';
        alert('连接失败，请检查网络');
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

// 状态更新 (适配新 UI)
function updateStatus(status) {
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    badge.className = 'status-badge';

    if (status === 'connected') {
        badge.classList.add('connected');
        text.textContent = '在线';
    } else if (status === 'disconnected') {
        badge.classList.add('disconnected');
        text.textContent = '离线';
    } else if (status === 'error') {
        badge.classList.add('error');
        text.textContent = '错误';
    }
}

// 切换视图 (适配新 UI)
function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));

    if (viewName === 'chat') {
        document.getElementById('chat-panel').classList.add('active');
        document.getElementById('connect-panel').classList.remove('active');
    } else {
        document.getElementById('connect-panel').classList.add('active');
        document.getElementById('chat-panel').classList.remove('active');
    }
}

// UI 辅助函数 (日志显示在 console 或者浮层)
function log(message, type = 'info') {
    console.log(`[${type}] ${message}`);
    // 可选：实现一个 Toast 提示
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
