/**
 * WebRTC P2P Chat - 前端逻辑
 */

// API Base URL (相对路径，适配本地开发和生产环境)
const API_BASE = '/api';

// WebRTC 配置
const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

// 全局状态
let roomId = null;
let peerId = null;
let role = null; // 'host' | 'guest'
let targetPeerId = null;
let peerConnection = null;
let dataChannel = null;
let pollingTimer = null;
let lastSignalTs = 0;

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

// 创建房间
async function createRoom() {
    log('正在创建房间...');
    createBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/room`, { method: 'POST' });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        roomId = data.roomId;
        peerId = data.peerId;
        role = data.role;

        log(`房间已创建: ${roomId}`, 'success');
        showStatus(`房间 ID: ${roomId}`, '等待对方加入...');

        // 等待对方加入后再开始 WebRTC
        startPolling();
    } catch (err) {
        log(`创建失败: ${err.message}`, 'error');
        createBtn.disabled = false;
    }
}

// 加入房间
async function joinRoom(id) {
    if (!id) {
        log('请输入房间 ID', 'error');
        return;
    }

    log(`正在加入房间 ${id}...`);
    joinBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/room/${id}/join`, { method: 'POST' });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        roomId = data.roomId;
        peerId = data.peerId;
        role = data.role;
        targetPeerId = data.hostId;

        log(`已加入房间，角色: ${role}`, 'success');
        showStatus(`房间 ID: ${roomId}`, '正在建立连接...');

        // Guest 先开始轮询，然后创建 Offer
        startPolling();
        await initWebRTC();
        await createOffer();
    } catch (err) {
        log(`加入失败: ${err.message}`, 'error');
        joinBtn.disabled = false;
    }
}

// 显示状态面板
function showStatus(room, status) {
    connectPanel.classList.add('hidden');
    statusPanel.classList.remove('hidden');
    chatPanel.classList.remove('hidden');
    roomInfo.textContent = room;
    statusText.textContent = status;
}

// 日志
function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsDiv.appendChild(entry);
    logsDiv.scrollTop = logsDiv.scrollHeight;
    console.log(`[${type}] ${message}`);
}

// 系统消息
function addSystemMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'message system';
    msg.textContent = text;
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// 聊天消息
function addMessage(text, isSent) {
    const msg = document.createElement('div');
    msg.className = `message ${isSent ? 'sent' : 'received'}`;
    msg.textContent = text;
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// 发送消息
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !dataChannel || dataChannel.readyState !== 'open') return;

    dataChannel.send(text);
    addMessage(text, true);
    messageInput.value = '';
}

// ===== WebRTC =====

async function initWebRTC() {
    log('初始化 WebRTC...');

    peerConnection = new RTCPeerConnection(RTC_CONFIG);

    // ICE 候选
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            log('发送 ICE 候选');
            await sendSignal('ice', event.candidate);
        }
    };

    // 连接状态
    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        log(`连接状态: ${state}`);

        if (state === 'connected') {
            statusDot.classList.add('connected');
            statusText.textContent = '已连接 ✓';
            stopPolling();
            addSystemMessage('🎉 P2P 连接已建立！');
        } else if (state === 'failed' || state === 'disconnected') {
            statusDot.classList.add('error');
            statusText.textContent = '连接断开';
            addSystemMessage('⚠️ 连接已断开');
        }
    };

    // 数据通道（接收端）
    peerConnection.ondatachannel = (event) => {
        log('收到数据通道');
        setupDataChannel(event.channel);
    };

    // 如果是 Guest，创建数据通道
    if (role === 'guest') {
        const channel = peerConnection.createDataChannel('chat');
        setupDataChannel(channel);
    }
}

function setupDataChannel(channel) {
    dataChannel = channel;

    dataChannel.onopen = () => {
        log('数据通道已打开', 'success');
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
    };

    dataChannel.onclose = () => {
        log('数据通道已关闭');
        messageInput.disabled = true;
        sendBtn.disabled = true;
    };

    dataChannel.onmessage = (event) => {
        addMessage(event.data, false);
    };
}

async function createOffer() {
    log('创建 Offer...');
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await sendSignal('offer', offer);
}

async function handleOffer(offer) {
    log('收到 Offer，创建 Answer...');

    if (!peerConnection) {
        await initWebRTC();
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await sendSignal('answer', answer);
}

async function handleAnswer(answer) {
    log('收到 Answer');
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIce(candidate) {
    log('收到 ICE 候选');
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        log(`添加 ICE 失败: ${err.message}`, 'error');
    }
}

// ===== 信令 =====

async function sendSignal(type, data) {
    await fetch(`${API_BASE}/room/${roomId}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: peerId,
            to: targetPeerId,
            type,
            data,
        }),
    });
}

function startPolling() {
    log('开始轮询信令...');
    pollingTimer = setInterval(pollSignals, 500);
}

function stopPolling() {
    if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
        log('停止轮询');
    }
}

async function pollSignals() {
    try {
        const res = await fetch(
            `${API_BASE}/room/${roomId}/signal?peerId=${peerId}&lastTs=${lastSignalTs}`
        );
        const data = await res.json();

        for (const signal of data.signals) {
            lastSignalTs = Math.max(lastSignalTs, signal.timestamp);

            // 如果是 Host，第一次收到信令时记录对方 ID
            if (role === 'host' && !targetPeerId) {
                targetPeerId = signal.from;
                log(`对方已加入: ${targetPeerId}`);
            }

            switch (signal.type) {
                case 'offer':
                    await handleOffer(signal.data);
                    break;
                case 'answer':
                    await handleAnswer(signal.data);
                    break;
                case 'ice':
                    await handleIce(signal.data);
                    break;
            }
        }
    } catch (err) {
        // 静默处理轮询错误
    }
}
