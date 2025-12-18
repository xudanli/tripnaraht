# 端口占用清理指南

## 问题

启动服务时遇到错误：
```
Error: listen EADDRINUSE: address already in use :::3000
```

## 解决方案

### 方法 1：使用清理脚本（推荐）

```bash
# 清理端口 3000（默认）
./scripts/kill-port.sh

# 清理其他端口
./scripts/kill-port.sh 3001
```

### 方法 2：手动查找和终止

```bash
# 查找占用端口的进程
netstat -tlnp | grep :3000
# 或
ss -tlnp | grep :3000

# 终止进程（替换 PID 为实际进程 ID）
kill -9 <PID>
```

### 方法 3：使用 fuser（如果可用）

```bash
# 查找并终止占用端口的进程
fuser -k 3000/tcp
```

### 方法 4：查找所有 Node.js 进程

```bash
# 查找所有 node 进程
ps aux | grep node | grep -v grep

# 批量终止（谨慎使用）
pkill -f "node.*main.ts"
```

## 预防措施

### 1. 优雅关闭服务

使用 `Ctrl+C` 正常停止服务，而不是直接关闭终端。

### 2. 使用进程管理

```bash
# 使用 PM2 管理进程
npm install -g pm2
pm2 start npm --name "tripnara" -- run backend:dev
pm2 stop tripnara
```

### 3. 检查服务状态

启动前检查端口是否被占用：
```bash
./scripts/kill-port.sh 3000
npm run backend:dev
```

## 常见场景

### 场景 1：开发服务器未正常关闭

**原因**：直接关闭终端或强制退出，导致进程残留。

**解决**：
```bash
./scripts/kill-port.sh 3000
npm run backend:dev
```

### 场景 2：多个服务实例同时运行

**原因**：多次启动服务，导致多个实例。

**解决**：
```bash
# 查找所有 nest/node 进程
ps aux | grep -E "nest|node.*main" | grep -v grep

# 终止所有相关进程
pkill -f "nest|node.*main"
```

### 场景 3：测试脚本未清理

**原因**：测试脚本启动的服务未正确终止。

**解决**：
```bash
# 检查测试脚本的 PID 文件
cat /tmp/nestjs-dev.pid 2>/dev/null
cat /tmp/nestjs-test.pid 2>/dev/null

# 终止测试进程
kill $(cat /tmp/nestjs-dev.pid 2>/dev/null) 2>/dev/null
kill $(cat /tmp/nestjs-test.pid 2>/dev/null) 2>/dev/null
```

## 验证

清理后验证端口是否已释放：
```bash
netstat -tlnp | grep :3000
# 或
ss -tlnp | grep :3000
```

如果没有输出，说明端口已释放。

## 注意事项

⚠️ **警告**：使用 `kill -9` 会强制终止进程，可能导致数据丢失。优先使用 `kill`（SIGTERM）而不是 `kill -9`（SIGKILL）。

```bash
# 先尝试优雅终止
kill <PID>

# 等待 5 秒后，如果仍未终止，再强制终止
sleep 5
kill -9 <PID>
```

