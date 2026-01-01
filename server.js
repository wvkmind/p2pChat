/**
 * WebRTC 信令服务器 - Node.js (Fastify) 版
 * 部署目标：macOS 本地服务器 + Cloudflare Tunnel
 */

const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs');

// 静态文件服务
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/',
});

// 内存数据库 (代替 Cloudflare KV)
// 注意：重启服务器数据会丢失，但对于即时聊天没关系
const rooms = new Map();
const signals = new Map();

// 路由定义

// 创建房间
fastify.post('/api/room', async (request, reply) => {
    const roomId = generateId();
    const hostId = generateId();

    rooms.set(roomId, {
        id: roomId,
        hostId: hostId,
        guestId: null,
        createdAt: Date.now(),
    });

    return { roomId, peerId: hostId, role: 'host' };
});

// 加入房间
fastify.post('/api/room/:roomId/join', async (request, reply) => {
    const { roomId } = request.params;
    const room = rooms.get(roomId);

    if (!room) {
        return reply.code(404).send({ error: '房间不存在' });
    }

    if (room.guestId) {
        return reply.code(400).send({ error: '房间已满' });
    }

    const guestId = generateId();
    room.guestId = guestId;

    return { roomId, peerId: guestId, role: 'guest', hostId: room.hostId };
});

// 发送信令
fastify.post('/api/room/:roomId/signal', async (request, reply) => {
    const { roomId } = request.params;
    const { from, to, type, data } = request.body;

    const signal = {
        from,
        to,
        type,
        data,
        timestamp: Date.now(),
    };

    // 获取该房间的信令队列
    let roomSignals = signals.get(roomId);
    if (!roomSignals) {
        roomSignals = [];
        signals.set(roomId, roomSignals);
    }

    // 清理过期消息 (超过 2 分钟)
    const now = Date.now();
    roomSignals = roomSignals.filter(s => now - s.timestamp < 120000);

    roomSignals.push(signal);
    signals.set(roomId, roomSignals); // 更新

    return { success: true, timestamp: signal.timestamp };
});

// 获取信令 (轮询)
fastify.get('/api/room/:roomId/signal', async (request, reply) => {
    const { roomId } = request.params;
    const { peerId, lastTs = 0 } = request.query;

    const roomSignals = signals.get(roomId) || [];

    // 过滤发给我的新消息
    const newSignals = roomSignals.filter(s =>
        s.to === peerId && s.timestamp > parseInt(lastTs)
    );

    return { signals: newSignals };
});

// 启动服务器
const start = async () => {
    try {
        // 监听所有网卡 (0.0.0.0) 以便局域网访问
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
        console.log(`\n🚀 服务器已启动: http://localhost:3000`);
        console.log(`📱 局域网访问: http://${getLocalIP()}:3000`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();

// 工具函数
function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

function getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}
