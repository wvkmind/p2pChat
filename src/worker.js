/**
 * WebRTC 信令服务器 - Cloudflare Workers
 * 使用 KV 轮询方式交换 SDP/ICE 信令
 */

import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
const assetManifest = JSON.parse(manifestJSON);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // API 路由
      if (path === '/api/room' && request.method === 'POST') {
        return await createRoom(env, corsHeaders);
      }

      if (path.match(/^\/api\/room\/[\w-]+\/join$/) && request.method === 'POST') {
        const roomId = path.split('/')[3];
        return await joinRoom(roomId, env, corsHeaders);
      }

      if (path.match(/^\/api\/room\/[\w-]+\/signal$/) && request.method === 'POST') {
        const roomId = path.split('/')[3];
        return await postSignal(roomId, request, env, corsHeaders);
      }

      if (path.match(/^\/api\/room\/[\w-]+\/signal$/) && request.method === 'GET') {
        const roomId = path.split('/')[3];
        const peerId = url.searchParams.get('peerId');
        const lastTs = url.searchParams.get('lastTs') || '0';
        return await getSignals(roomId, peerId, lastTs, env, corsHeaders);
      }

      // 处理静态文件
      return await getAssetFromKV(
        {
          request,
          waitUntil: ctx.waitUntil.bind(ctx),
        },
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: assetManifest,
        }
      );
    } catch (error) {
      // 如果是 404，尝试返回 index.html（SPA fallback）
      if (error.status === 404) {
        try {
          const indexRequest = new Request(new URL('/index.html', request.url).toString(), request);
          return await getAssetFromKV(
            {
              request: indexRequest,
              waitUntil: ctx.waitUntil.bind(ctx),
            },
            {
              ASSET_NAMESPACE: env.__STATIC_CONTENT,
              ASSET_MANIFEST: assetManifest,
            }
          );
        } catch (e) {
          // 继续返回原始错误
        }
      }
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status || 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

// 创建房间
async function createRoom(env, corsHeaders) {
  const roomId = generateId();
  const hostId = generateId();

  const room = {
    id: roomId,
    hostId: hostId,
    guestId: null,
    createdAt: Date.now(),
  };

  await env.ROOMS.put(`room:${roomId}`, JSON.stringify(room), {
    expirationTtl: 3600, // 1小时过期
  });

  return jsonResponse({ roomId, peerId: hostId, role: 'host' }, corsHeaders);
}

// 加入房间
async function joinRoom(roomId, env, corsHeaders) {
  const roomData = await env.ROOMS.get(`room:${roomId}`);

  if (!roomData) {
    return jsonResponse({ error: '房间不存在' }, corsHeaders, 404);
  }

  const room = JSON.parse(roomData);

  if (room.guestId) {
    return jsonResponse({ error: '房间已满' }, corsHeaders, 400);
  }

  const guestId = generateId();
  room.guestId = guestId;

  await env.ROOMS.put(`room:${roomId}`, JSON.stringify(room), {
    expirationTtl: 3600,
  });

  return jsonResponse({ roomId, peerId: guestId, role: 'guest', hostId: room.hostId }, corsHeaders);
}

// 发送信令
async function postSignal(roomId, request, env, corsHeaders) {
  const { from, to, type, data } = await request.json();

  const signal = {
    from,
    to,
    type, // 'offer' | 'answer' | 'ice'
    data,
    timestamp: Date.now(),
  };

  const key = `signals:${roomId}`;

  // 乐观并发控制：读取-修改-写入
  // 注意：在极高并发下可能会丢失消息，但对于 1v1 聊天够用了，且比 Durable Objects 便宜
  let signals = [];
  const existing = await env.ROOMS.get(key);
  if (existing) {
    signals = JSON.parse(existing);
  }

  // 清理过期消息 (超过 2 分钟的)
  const now = Date.now();
  signals = signals.filter(s => now - s.timestamp < 120000);

  signals.push(signal);

  await env.ROOMS.put(key, JSON.stringify(signals), {
    expirationTtl: 300, // 5分钟后整个 key 过期
  });

  return jsonResponse({ success: true, timestamp: signal.timestamp }, corsHeaders);
}

// 获取信令（轮询）
async function getSignals(roomId, peerId, lastTs, env, corsHeaders) {
  const key = `signals:${roomId}`;
  const data = await env.ROOMS.get(key);

  if (!data) {
    return jsonResponse({ signals: [] }, corsHeaders);
  }

  const allSignals = JSON.parse(data);

  // 过滤发给我的、且比 lastTs 新的消息
  const newSignals = allSignals.filter(s =>
    s.to === peerId && s.timestamp > parseInt(lastTs)
  );

  // 按时间排序
  newSignals.sort((a, b) => a.timestamp - b.timestamp);

  return jsonResponse({ signals: newSignals }, corsHeaders);
}

// 工具函数
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function jsonResponse(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
