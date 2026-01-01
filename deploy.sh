#!/bin/bash

echo "🚀 开始自动部署..."

# 1. 拉取最新代码
echo "📥 Git Pulling..."
git pull origin main

# 2. 安装依赖 (如果有新的)
echo "📦 Installing Dependencies..."
npm install

# 3. 查找并杀死旧进程 (防止端口冲突)
echo "🛑 Stopping old server..."
pkill -f "node server.js" || echo "No running server found."

# 4. 启动新服务 (后台运行)
echo "▶️ Starting Server..."
# 使用 nohup 后台运行，日志输出到 server.log
nohup node server.js > server.log 2>&1 &

echo "✅ 部署完成! Server PID: $!"
echo "📜 日志查看: tail -f server.log"
