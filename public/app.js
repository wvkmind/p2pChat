/**
 * WebSocket 聊天客户端 (Forest Theme Edition)
 */

// 自动判断 WS 协议
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${window.location.host}/ws`;

let socket = null;
let roomId = null;

// DOM 元素
const connectPanel = document.getElementById('connect-panel');
const chatPanel = document.getElementById('chat-panel');
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const roomInput = document.getElementById('room-input');
const passwordInput = document.getElementById('password-input');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const logsDiv = document.getElementById('logs');
const shareBtn = document.getElementById('share-btn');

let currentPassword = '';

// 初始化: 检查 URL 参数
function init() {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');

    if (roomFromUrl) {
        roomInput.value = roomFromUrl;
        // 如果有 URL 参数，显示“加入”按钮，隐藏“创建”按钮
        createBtn.classList.add('hidden');
        joinBtn.classList.remove('hidden');
        if (passwordInput) passwordInput.focus();
    }
}
init();

// 事件监听
createBtn.addEventListener('click', createRoom);
joinBtn.addEventListener('click', () => joinRoom(roomInput.value.trim()));
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendBtn.disabled) sendMessage();
});

// 复制邀请链接
shareBtn.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId); // 确保链接带 room 参数

    navigator.clipboard.writeText(url.toString()).then(() => {
        addSystemMessage('🍃 邀请叶子(链接)已复制，快去发给朋友吧');
        // 按钮反馈动画
        const originalIcon = shareBtn.innerHTML;
        shareBtn.innerHTML = '✅';
        setTimeout(() => shareBtn.innerHTML = originalIcon, 2000);
    }).catch(err => {
        console.error('Copy failed', err);
        addSystemMessage('🍂 复制失败，请手动复制浏览器地址栏');
    });
});

// 生成随机房间ID
function generateId() {
    return Math.random().toString(36).substring(2, 8);
}

// 创建房间
async function createRoom() {
    const id = generateId();
    roomInput.value = id;

    // 更新浏览器 URL (不刷新页面)
    const url = new URL(window.location.href);
    url.searchParams.set('room', id);
    window.history.pushState({}, '', url);

    joinRoom(id);
}

// 加入房间 (核心逻辑)
function joinRoom(id) {
    if (!id) {
        alert('房间号不能为空');
        return;
    }

    roomId = id;
    currentPassword = passwordInput.value.trim();

    // 按钮 loading 态
    const activeBtn = createBtn.classList.contains('hidden') ? joinBtn : createBtn;
    const originalText = activeBtn.textContent;
    activeBtn.disabled = true;
    activeBtn.textContent = '连接森林中...';

    // 建立连接
    const url = `${WS_URL}?roomId=${id}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
        updateStatus('connected');
        switchView('chat');

        // 显示分享按钮
        shareBtn.classList.remove('hidden');

        // 恢复按钮状态
        activeBtn.disabled = false;
        activeBtn.textContent = originalText;

        // 启用输入
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();

        addSystemMessage(`已进入树洞: ${roomId}`);
        if (currentPassword) addSystemMessage('🔒 已开启端到端加密');
    };

    socket.onclose = () => {
        updateStatus('disconnected');
        shareBtn.classList.add('hidden');
        messageInput.disabled = true;
        sendBtn.disabled = true;

        // 恢复按钮状态
        activeBtn.disabled = false;
        activeBtn.textContent = originalText;
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'msg') {
                let content = data.text;
                let isEncrypted = data.encrypted;

                // 解密逻辑
                if (isEncrypted) {
                    if (!currentPassword) {
                        content = '🔒 [加密消息] 请重新加入并输入密码';
                    } else {
                        try {
                            const bytes = CryptoJS.AES.decrypt(content, currentPassword);
                            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                            content = decrypted || '🚫 密码错误，无法解读';
                        } catch (e) {
                            content = '🚫 消息损坏';
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
        activeBtn.disabled = false;
        activeBtn.textContent = originalText;
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
    addMessage(text, true, !!currentPassword);
    messageInput.value = '';
}

// 状态更新 UI
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

// 视图切换
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

// 辅助函数
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
    if (isEncrypted) text = '🔒 ' + text;
    msg.textContent = text;
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
