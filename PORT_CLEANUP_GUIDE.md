# 端口清理指南

当应用启动时遇到 `Error: listen EADDRINUSE: address already in use 0.0.0.0:3000` 错误时，说明端口 3000 被占用。以下是清理方法。

## 方法 1: 查找并终止占用端口的进程（推荐）

### Linux 系统

```bash
# 查找占用端口 3000 的进程 PID
lsof -ti:3000
# 或
fuser 3000/tcp
# 或
netstat -tlnp | grep :3000
# 或
ss -tlnp | grep :3000

# 终止进程（使用上面命令获取的 PID）
kill -9 <PID>

# 或者一条命令直接终止
lsof -ti:3000 | xargs kill -9
fuser -k 3000/tcp
```

### 使用 netstat（如果系统有）

```bash
# 查看占用 3000 端口的进程
netstat -tlnp | grep :3000

# 输出示例：
# tcp  0  0  0.0.0.0:3000  0.0.0.0:*  LISTEN  12345/node

# 终止进程（使用上面输出的 PID，例如 12345）
kill -9 12345
```

### 使用 ss（更现代的工具）

```bash
# 查看占用 3000 端口的进程
ss -tlnp | grep :3000

# 输出示例：
# LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=12345,fd=18))

# 终止进程
kill -9 12345
```

## 方法 2: 终止所有 Node.js/Nest 相关进程

```bash
# 终止所有 node 进程（危险：会终止所有 Node.js 应用）
pkill -f node

# 更安全：只终止 nest start 相关进程
pkill -f "nest start"

# 或者终止包含 "npm run dev" 的进程
pkill -f "npm run dev"
```

## 方法 3: 在项目目录创建清理脚本

创建 `scripts/cleanup-port.sh`:

```bash
#!/bin/bash

PORT=${1:-3000}

echo "正在清理端口 $PORT..."

# 方法 1: 使用 lsof
if command -v lsof &> /dev/null; then
    PIDS=$(lsof -ti:$PORT)
    if [ -n "$PIDS" ]; then
        echo "找到进程: $PIDS"
        echo "$PIDS" | xargs kill -9
        echo "已终止占用端口 $PORT 的进程"
    else
        echo "端口 $PORT 未被占用"
    fi
    exit 0
fi

# 方法 2: 使用 fuser
if command -v fuser &> /dev/null; then
    fuser -k ${PORT}/tcp 2>/dev/null && echo "已终止占用端口 $PORT 的进程" || echo "端口 $PORT 未被占用"
    exit 0
fi

# 方法 3: 使用 netstat
if command -v netstat &> /dev/null; then
    PID=$(netstat -tlnp 2>/dev/null | grep :$PORT | awk '{print $7}' | cut -d'/' -f1 | head -1)
    if [ -n "$PID" ]; then
        echo "找到进程: $PID"
        kill -9 $PID
        echo "已终止占用端口 $PORT 的进程"
    else
        echo "端口 $PORT 未被占用"
    fi
    exit 0
fi

# 方法 4: 使用 ss
if command -v ss &> /dev/null; then
    PID=$(ss -tlnp 2>/dev/null | grep :$PORT | grep -oP 'pid=\K[0-9]+' | head -1)
    if [ -n "$PID" ]; then
        echo "找到进程: $PID"
        kill -9 $PID
        echo "已终止终止占用端口 $PORT 的进程"
    else
        echo "端口 $PORT 未被占用"
    fi
    exit 0
fi

echo "错误：未找到可用的端口检查工具（lsof/fuser/netstat/ss）"
exit 1
```

使用方式：

```bash
chmod +x scripts/cleanup-port.sh
./scripts/cleanup-port.sh 3000
```

## 方法 4: 使用 package.json 脚本

在 `package.json` 中添加：

```json
{
  "scripts": {
    "cleanup:port": "lsof -ti:3000 | xargs kill -9 2>/dev/null || fuser -k 3000/tcp 2>/dev/null || echo '端口未被占用或无法清理'",
    "dev:clean": "npm run cleanup:port && npm run dev"
  }
}
```

使用方式：

```bash
npm run cleanup:port
# 或直接清理并启动
npm run dev:clean
```

## 方法 5: 更改应用端口（临时方案）

如果无法清理端口，可以临时更改应用监听端口：

```bash
# 设置环境变量
PORT=3001 npm run dev

# 或在 .env 文件中添加
echo "PORT=3001" >> .env
```

## 验证端口是否已释放

```bash
# 检查端口是否还在使用
lsof -ti:3000 && echo "端口仍被占用" || echo "端口已释放"

# 或
netstat -tlnp | grep :3000 && echo "端口仍被占用" || echo "端口已释放"

# 或
ss -tlnp | grep :3000 && echo "端口仍被占用" || echo "端口已释放"
```

## 常见问题

### Q: 为什么会出现端口占用？

A: 通常是因为：
1. 之前的 `npm run dev` 进程没有正确终止（Ctrl+C 没有完全停止）
2. 应用崩溃后进程仍在运行
3. 多个终端同时运行了应用

### Q: 使用 `kill -9` 安全吗？

A: `kill -9` 是强制终止，会立即结束进程，不保存任何数据。对于开发环境通常是安全的。如果担心，可以先用 `kill <PID>`（发送 SIGTERM），等待几秒后再用 `kill -9`。

### Q: 如何避免端口占用问题？

A: 
1. 使用 `npm run dev:clean` 脚本（自动清理后启动）
2. 在启动前检查并清理端口
3. 使用进程管理器（如 PM2）管理应用生命周期
4. 确保使用 Ctrl+C 正确停止应用

## 一键清理脚本（完整版）

创建 `scripts/cleanup.sh`:

```bash
#!/bin/bash

set -e

PORT=${1:-3000}

echo "🔍 检查端口 $PORT 占用情况..."

# 尝试多种方法清理
if command -v lsof &> /dev/null; then
    PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "📌 找到进程: $PIDS"
        echo "$PIDS" | xargs kill -9 2>/dev/null || true
        echo "✅ 已清理端口 $PORT"
        exit 0
    fi
fi

if command -v fuser &> /dev/null; then
    if fuser ${PORT}/tcp &> /dev/null; then
        fuser -k ${PORT}/tcp 2>/dev/null || true
        echo "✅ 已清理端口 $PORT"
        exit 0
    fi
fi

if command -v ss &> /dev/null; then
    PID=$(ss -tlnp 2>/dev/null | grep :$PORT | grep -oP 'pid=\K[0-9]+' | head -1)
    if [ -n "$PID" ]; then
        echo "📌 找到进程: $PID"
        kill -9 $PID 2>/dev/null || true
        echo "✅ 已清理端口 $PORT"
        exit 0
    fi
fi

if command -v netstat &> /dev/null; then
    PID=$(netstat -tlnp 2>/dev/null | grep :$PORT | awk '{print $7}' | cut -d'/' -f1 | head -1)
    if [ -n "$PID" ] && [ "$PID" != "-" ]; then
        echo "📌 找到进程: $PID"
        kill -9 $PID 2>/dev/null || true
        echo "✅ 已清理端口 $PORT"
        exit 0
    fi
fi

# 尝试终止 nest 相关进程
if pgrep -f "nest start" > /dev/null 2>&1; then
    echo "📌 找到 nest start 进程"
    pkill -f "nest start" || true
    sleep 1
    echo "✅ 已清理 nest 进程"
    exit 0
fi

echo "ℹ️  端口 $PORT 未被占用或无法检测"
```

使用方式：

```bash
chmod +x scripts/cleanup.sh
./scripts/cleanup.sh 3000
```
