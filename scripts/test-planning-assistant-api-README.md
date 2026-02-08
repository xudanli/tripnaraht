# 规划助手智能体接口测试指南

## 前置条件

1. **启动服务器**
   ```bash
   npm run start:dev
   # 或
   npm run start
   ```

2. **确认服务器运行在** `http://localhost:3000`

## 运行测试

### TypeScript 测试脚本（推荐）

```bash
# 设置API地址（可选，默认 http://localhost:3000）
export API_BASE_URL=http://localhost:3000

# 设置测试用户ID（可选，默认会自动生成）
export TEST_USER_ID=my-test-user

# 运行测试
npx tsx scripts/test-planning-assistant-api.ts
```

### Shell 测试脚本

```bash
# 设置API地址（可选）
export API_BASE_URL=http://localhost:3000

# 设置测试用户ID（可选）
export TEST_USER_ID=my-test-user

# 运行测试
bash scripts/test-planning-assistant-api.sh
```

## 测试覆盖

### ✅ 测试1: 创建匿名会话
- 测试创建不关联用户的会话
- 验证返回 `sessionId`
- 验证 HTTP 状态码 201

### ✅ 测试2: 创建用户会话
- 测试创建关联用户的会话
- 验证返回 `sessionId`
- 验证 HTTP 状态码 201

### ✅ 测试3: 发送消息进行对话
- 测试向规划助手发送消息
- 验证返回回复消息和阶段
- 验证可能返回的推荐和方案
- 验证 HTTP 状态码 200

### ✅ 测试4: 获取会话状态
- 测试获取会话的当前状态
- 验证返回会话信息、阶段、消息数等
- 验证 HTTP 状态码 200

### ✅ 测试5: 快速推荐（无需会话）
- 测试无需创建会话即可获取推荐
- 验证返回推荐列表
- 验证 HTTP 状态码 200

### ✅ 测试6: 获取用户偏好摘要
- 测试获取系统学习到的用户偏好
- 验证返回偏好数据（如果存在）
- 验证 HTTP 状态码 200

### ✅ 测试7: 清除用户偏好
- 测试清除用户的学习偏好
- 验证清除成功
- 验证 HTTP 状态码 200

## 手动测试示例

### 1. 创建会话

```bash
# 创建匿名会话
curl -X POST "http://localhost:3000/api/agent/planning-assistant/sessions" \
  -H "Content-Type: application/json" \
  -d '{}'

# 创建用户会话
curl -X POST "http://localhost:3000/api/agent/planning-assistant/sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123456"
  }'
```

### 2. 发送消息进行对话

```bash
curl -X POST "http://localhost:3000/api/agent/planning-assistant/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "YOUR_SESSION_ID",
    "userId": "user_123456",
    "message": "我想去冰岛旅行，有什么推荐吗？",
    "language": "zh"
  }'
```

### 3. 获取会话状态

```bash
curl -X GET "http://localhost:3000/api/agent/planning-assistant/sessions/YOUR_SESSION_ID"
```

### 4. 快速推荐

```bash
curl -X GET "http://localhost:3000/api/agent/planning-assistant/quick-recommend?budget=20000&travelersCount=2&duration_days=7&travel_style=adventure&language=zh"
```

### 5. 获取用户偏好摘要

```bash
curl -X GET "http://localhost:3000/api/agent/planning-assistant/users/USER_ID/preferences"
```

### 6. 清除用户偏好

```bash
curl -X POST "http://localhost:3000/api/agent/planning-assistant/users/USER_ID/preferences/clear" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 预期结果

### 成功场景

所有测试应该返回：
- ✅ HTTP 状态码正确（201 或 200）
- ✅ 响应体包含预期的字段
- ✅ 数据格式正确

### 常见问题

1. **连接失败**
   - 检查服务器是否运行：`curl http://localhost:3000/health`
   - 确认端口号正确
   - 检查防火墙设置

2. **会话不存在（404）**
   - 确保先创建会话获取 `sessionId`
   - 检查会话是否过期（默认24小时）

3. **偏好数据为空**
   - 这是正常的，如果用户还没有使用过规划助手
   - 偏好数据是通过用户交互学习生成的

## 测试输出示例

```
🚀 开始测试规划助手智能体接口...
📍 API地址: http://localhost:3000
👤 测试用户ID: test-user-1770538626640

📋 测试1: 创建匿名会话
  ✅ 成功 - 会话ID: 550e8400-e29b-41d4-a716-446655440000

📋 测试2: 创建用户会话
  ✅ 成功 - 会话ID: 550e8400-e29b-41d4-a716-446655440001

📋 测试3: 发送消息进行对话
  ✅ 成功
  - 阶段: RECOMMENDING_DESTINATIONS
  - 回复: 我很乐意帮您规划冰岛之旅！冰岛是一个充满自然奇观的国家...
  - 推荐数量: 3

📋 测试4: 获取会话状态
  ✅ 成功
  - 会话ID: 550e8400-e29b-41d4-a716-446655440000
  - 阶段: RECOMMENDING_DESTINATIONS
  - 消息数: 2

📋 测试5: 快速推荐（无需会话）
  ✅ 成功
  - 会话ID: 550e8400-e29b-41d4-a716-446655440002
  - 推荐数量: 5
    - 冰岛 (IS)
    - 挪威 (NO)
    - 芬兰 (FI)

📋 测试6: 获取用户偏好摘要
  ✅ 成功
  - 偏好数量: 3
    - destination: 冰岛 (置信度: 0.85)
    - travel_style: adventure (置信度: 0.72)
    - budget_level: medium (置信度: 0.68)

📋 测试7: 清除用户偏好
  ✅ 成功

============================================================
📊 测试结果汇总
============================================================
1. ✅ 创建匿名会话 (45ms)
2. ✅ 创建用户会话 (38ms)
3. ✅ 发送消息进行对话 (1234ms)
4. ✅ 获取会话状态 (12ms)
5. ✅ 快速推荐 (1567ms)
6. ✅ 获取用户偏好摘要 (23ms)
7. ✅ 清除用户偏好 (15ms)

总计: 7 个测试
通过: 7 个 ✅
失败: 0 个 ❌
总耗时: 2934ms
```

## 注意事项

1. **会话TTL**: 会话默认有效期为 24 小时
2. **公开接口**: 所有接口都是公开的，无需认证
3. **异步处理**: 某些操作（如生成方案）可能需要较长时间
4. **测试数据**: 测试脚本会自动生成测试用户ID，不会影响生产数据
