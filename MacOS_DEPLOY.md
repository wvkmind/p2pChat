# macOS 部署指南 + Cloudflare Tunnel

这是你的私有服务器部署包。请按照以下步骤在你的 macOS 上部署。

## 1. 传输文件
将整个项目文件夹 (`d:\ant` 下所有内容) 复制到你的 macOS 上 (例如 `~/webrtc-chat`)。

## 2. 运行服务器 (在 macOS 终端)
```bash
# 进入目录
cd ~/webrtc-chat

# 安装所有依赖
npm install

# 启动服务器
npm start
```
此时你应该能看到：`🚀 服务器已启动: http://localhost:3000`

---

## 3. 配置 Cloudflare Tunnel (穿透到外网)

### 安装 cloudflared
在 macOS 终端运行：
```bash
brew install cloudflared
```

### 登录并创建隧道
```bash
# 1. 登录 (会打开浏览器授权)
cloudflared tunnel login

# 2. 创建隧道 (名字随便起，比如 chat-tunnel)
cloudflared tunnel create chat-tunnel

# 3. 绑定域名 (必须是你刚才在 CF 加的 chat.wvkmind.com)
# 注意：这一步会把 chat.wvkmind.com 指向这个隧道
cloudflared tunnel route dns chat-tunnel chat.wvkmind.com
```

### 启动隧道
```bash
# 将隧道指向本地 3000 端口
cloudflared tunnel run --url http://localhost:3000 chat-tunnel
```

✅ **完成！**
现在访问 **https://chat.wvkmind.com**，它就会穿透到你 Mac 上的 `localhost:3000`。
- 没有 KV 限制
- 完全免费
- 速度取决于你 Mac 的网络
