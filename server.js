/**
 * WebSocket 聊天服务器 - Node.js (Fastify) 版
 * 修复版：增强错误处理和 API 兼容性
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
        // 兼容性处理：取决于版本，有时是 socket，有时是 socketStream
        const socket = connection.socket || connection;

        const { roomId } = req.query;

        if (!roomId) {
            socket.close();
            return;
        }

        // 加入房间
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        const room = rooms.get(roomId);
        room.add(socket);

        fastify.log.info(`Client joined room ${roomId}. Total: ${room.size}`);

        // 通知其他人：有人加入了
        broadcast(roomId, { type: 'system', text: '新用户加入房间' }, socket);

        socket.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString()); // 确保转为字符串
                // 广播消息给房间内其他人
                broadcast(roomId, data, socket);
            } catch (err) {
                fastify.log.error('Message parse error');
            }
        });

        socket.on('close', () => {
            room.delete(socket);
            fastify.log.info(`Client left room ${roomId}. Total: ${room.size}`);
            if (room.size === 0) {
                rooms.delete(roomId);
            } else {
                broadcast(roomId, { type: 'system', text: '用户离开房间' }, null);
            }
        });

        socket.on('error', (err) => {
            fastify.log.error(`Socket error: ${err.message}`);
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
        if (client !== senderSocket && client.readyState === 1) { // 1 = OPEN
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
