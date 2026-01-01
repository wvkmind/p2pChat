/**
 * WebSocket 聊天服务器 - Node.js (Fastify) 版
 * 简化架构：直接转发，不再使用 WebRTC
 */

const fastify = require('fastify')({ logger: true });
const path = require('path');

// 静态文件服务
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/',
});

// WebSocket 支持
fastify.register(require('@fastify/websocket'));

// 房间管理: roomId -> Set<WebSocket>
const rooms = new Map();

fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
        const { roomId } = req.query;

        if (!roomId) {
            connection.socket.close();
            return;
        }

        // 加入房间
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        const room = rooms.get(roomId);
        room.add(connection.socket);

        fastify.log.info(`Client joined room ${roomId}. Total: ${room.size}`);

        // 通知其他人：有人加入了
        broadcast(roomId, { type: 'system', text: '新用户加入房间' }, connection.socket);

        connection.socket.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                // 广播消息给房间内其他人
                broadcast(roomId, data, connection.socket);
            } catch (err) {
                fastify.log.error('Message parse error');
            }
        });

        connection.socket.on('close', () => {
            room.delete(connection.socket);
            fastify.log.info(`Client left room ${roomId}. Total: ${room.size}`);
            if (room.size === 0) {
                rooms.delete(roomId);
            } else {
                broadcast(roomId, { type: 'system', text: '用户离开房间' }, null);
            }
        });
    });
});

// 广播工具函数
function broadcast(roomId, data, senderSocket) {
    const room = rooms.get(roomId);
    if (!room) return;

    const msgString = JSON.stringify(data);
    for (const client of room) {
        // 发送给除了自己以外的人 (或者如果是系统消息，发给所有人)
        if (client !== senderSocket && client.readyState === 1) {
            client.send(msgString);
        }
    }
}

// 启动服务器
const start = async () => {
    try {
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
        console.log(`\n🚀 WebSocket 服务器已启动: http://localhost:3000`);
        console.log(`🌍 外网访问: https://chat.wvkmind.com (通过 Tunnel)`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
