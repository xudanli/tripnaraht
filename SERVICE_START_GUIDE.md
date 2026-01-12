# 服务启动指南

## 🔍 当前状态

服务未运行，需要启动服务才能测试 Claude 编排功能。

## 🚀 启动方式

### 方式 1: 开发模式（推荐用于测试）

```bash
cd /home/devbox/project
npm run dev
```

或者：

```bash
npm run backend:dev
```

### 方式 2: 生产模式

```bash
# 1. 构建
npm run build

# 2. 启动
npm start
```

### 方式 3: Docker（如果使用 Docker）

```bash
# 启动容器
docker-compose up -d

# 或
docker start tripnara-app
```

## 📋 启动前检查

### 1. 检查环境变量

```bash
# 确认 .env 文件存在
ls -la .env

# 检查关键配置
grep "^ANTHROPIC" .env
```

应该看到：
```bash
ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
ANTHROPIC_MODEL=claude-3-haiku-20240307
ANTHROPIC_BASE_URL=https://hongmacode.com/api
```

### 2. 检查端口占用

```bash
# 检查端口 3000 是否被占用
netstat -tlnp | grep :3000
# 或
ss -tlnp | grep :3000
```

如果端口被占用，可以：
- 停止占用端口的进程
- 或修改 `PORT` 环境变量使用其他端口

### 3. 检查依赖

```bash
# 安装依赖（如果需要）
npm install
```

## ✅ 启动成功标志

服务启动成功后，应该看到：

```
✅ [Bootstrap] API listening on http://0.0.0.0:3000
```

## 🧪 测试服务

启动后，测试服务是否正常：

```bash
# 测试健康检查
curl http://localhost:3000/api/system/status

# 测试 Claude 编排
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_id": "user-123",
    "message": "测试 Claude 编排",
    "options": {
      "use_claude_orchestration": true,
      "llm_provider": "anthropic"
    }
  }'
```

## 🔧 常见问题

### 问题 1: 端口被占用

```bash
# 查找占用端口的进程
lsof -i :3000
# 或
fuser 3000/tcp

# 停止进程
kill -9 <PID>
```

### 问题 2: 环境变量未加载

确保 `.env` 文件在项目根目录，且格式正确（无引号、无多余空格）。

### 问题 3: 依赖缺失

```bash
npm install
```

### 问题 4: 数据库连接失败

如果看到 Prisma 连接超时，这是正常的降级行为，不影响核心功能。

## 📝 当前配置总结

```bash
# Anthropic 配置
ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
ANTHROPIC_MODEL=claude-3-haiku-20240307
ANTHROPIC_BASE_URL=https://hongmacode.com/api

# Claude 编排
USE_CLAUDE_ORCHESTRATION=true
```

---

**最后更新**: 2024-01-12  
**状态**: ⚠️ 服务未运行，需要启动
