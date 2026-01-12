# Claude API Key 认证错误修复

## 🐛 问题描述

生产环境日志显示 Claude API 认证错误：

```
WARN [ClaudeOrchestratorService] 意图分析失败，使用默认值: Anthropic API error: 401 
{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}
```

## 🔍 问题分析

### 错误原因

1. **API Key 无效**：环境变量中的 `ANTHROPIC_API_KEY` 可能：
   - 格式不正确
   - 已过期或被撤销
   - 未正确加载到服务中

2. **环境变量未加载**：
   - 服务启动时未读取 `.env` 文件
   - Docker 容器中环境变量未正确传递

3. **API Key 格式问题**：
   - 可能包含多余的空格或引号
   - 可能被截断

## ✅ 修复步骤

### 1. 检查 API Key 配置

```bash
# 检查 .env 文件中的 API Key
grep ANTHROPIC_API_KEY .env

# 应该看到类似：
# ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 2. 验证 API Key 格式

正确的 API Key 格式：
- 以 `sk-ant-api03-` 开头（Claude 3.5 Sonnet）
- 或 `sk-ant-` 开头（其他模型）
- 长度通常为 50+ 字符
- **不应包含引号**

**错误示例**：
```bash
ANTHROPIC_API_KEY="sk-ant-api03-..."  # ❌ 有引号
ANTHROPIC_API_KEY= sk-ant-api03-...   # ❌ 有空格
```

**正确示例**：
```bash
ANTHROPIC_API_KEY=sk-ant-api03-...    # ✅ 无引号，无空格
```

### 3. 测试 API Key 有效性

```bash
# 使用 curl 测试 API Key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

如果返回 401，说明 API Key 无效。

### 4. 修复 .env 文件

```bash
# 1. 备份当前配置
cp .env .env.backup

# 2. 编辑 .env 文件，确保：
# - 没有引号
# - 没有前后空格
# - 完整且正确

# 3. 验证格式
grep ANTHROPIC_API_KEY .env | sed 's/ANTHROPIC_API_KEY=//' | wc -c
# 应该显示 50+ 字符
```

### 5. 重启服务

修改 `.env` 文件后，**必须重启服务**才能生效：

```bash
# Docker 方式
docker restart tripnara-app

# 或
docker-compose restart

# 直接运行方式
# 停止服务（Ctrl+C）
# 重新启动
npm run dev
```

### 6. 验证修复

重启后，查看服务日志：

```bash
# 查看服务启动日志
docker logs tripnara-app --tail 50

# 应该看到：
# [ClaudeOrchestratorService] 已初始化
# [ClaudeOrchestratorService] SkillsRegistry: true, ActionRegistry: true
```

发送测试请求：

```bash
curl -X POST http://127.0.0.1:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_id": "user-123",
    "message": "测试",
    "options": {
      "use_claude_orchestration": true,
      "llm_provider": "anthropic"
    }
  }'
```

**成功标志**：
- 不再出现 `invalid x-api-key` 错误
- 日志中显示 Claude 编排正常执行
- 响应中包含决策日志

## 🔧 Docker 环境特殊处理

### 检查 Docker 环境变量

```bash
# 检查容器中的环境变量
docker exec tripnara-app env | grep ANTHROPIC

# 检查 docker-compose.yml 中的配置
grep -A 5 ANTHROPIC docker-compose.yml
```

### 在 docker-compose.yml 中配置

```yaml
services:
  app:
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    env_file:
      - .env
```

### 使用 Docker Secrets（推荐生产环境）

```yaml
services:
  app:
    secrets:
      - anthropic_api_key
    environment:
      - ANTHROPIC_API_KEY_FILE=/run/secrets/anthropic_api_key

secrets:
  anthropic_api_key:
    file: ./secrets/anthropic_api_key.txt
```

## 📋 检查清单

- [ ] `.env` 文件中 `ANTHROPIC_API_KEY` 存在且格式正确
- [ ] API Key 无引号、无前后空格
- [ ] API Key 格式正确（以 `sk-ant-` 开头）
- [ ] API Key 通过 curl 测试验证有效
- [ ] 服务已重启（环境变量已加载）
- [ ] Docker 容器中环境变量正确传递
- [ ] 日志中不再出现 401 错误

## ⚠️ 常见错误

### 错误 1: API Key 有引号

```bash
# ❌ 错误
ANTHROPIC_API_KEY="sk-ant-api03-..."

# ✅ 正确
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 错误 2: 环境变量未加载

```bash
# 检查服务是否读取了环境变量
docker exec tripnara-app printenv | grep ANTHROPIC
```

### 错误 3: API Key 已过期

如果 API Key 曾经有效但现在无效，可能是：
- API Key 被撤销
- 账户被暂停
- 需要重新生成 API Key

## 🚀 快速修复命令

```bash
# 1. 检查当前配置
grep ANTHROPIC_API_KEY .env

# 2. 如果格式有问题，修复（移除引号和空格）
sed -i 's/ANTHROPIC_API_KEY="\(.*\)"/ANTHROPIC_API_KEY=\1/' .env
sed -i 's/ANTHROPIC_API_KEY= \(.*\)/ANTHROPIC_API_KEY=\1/' .env

# 3. 验证格式
grep ANTHROPIC_API_KEY .env

# 4. 重启服务
docker restart tripnara-app

# 5. 查看日志确认
docker logs tripnara-app --tail 20 | grep -i anthropic
```

## 📝 验证 API Key 的脚本

创建 `scripts/verify-anthropic-key.sh`:

```bash
#!/bin/bash

API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2 | tr -d '"' | tr -d ' ')

if [ -z "$API_KEY" ]; then
  echo "❌ ANTHROPIC_API_KEY 未找到"
  exit 1
fi

echo "测试 API Key: ${API_KEY:0:20}..."

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  https://api.anthropic.com/v1/messages \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hi"}]
  }')

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ API Key 有效"
else
  echo "❌ API Key 无效 (HTTP $HTTP_STATUS)"
  echo "$BODY"
  exit 1
fi
```

---

**最后更新**: 2024-01-12  
**状态**: ⚠️ 需要修复 API Key 配置
