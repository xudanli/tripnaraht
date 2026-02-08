# 规划助手智能体 V2 接口测试指南

## 前置条件

1. **启动服务器**
   ```bash
   npm run start:dev
   # 或
   npm run start
   ```

2. **确认服务器运行在** `http://localhost:3000`

## 快速测试

### 使用 TypeScript 测试脚本（推荐）

```bash
# 设置API地址（可选，默认 http://localhost:3000）
export API_BASE_URL=http://localhost:3000

# 运行测试
npx tsx scripts/test-planning-assistant-v2-api.ts
```

### 使用 curl 手动测试

#### 1. 创建会话

```bash
curl -X POST "http://localhost:3000/api/agent/planning-assistant/v2/sessions" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**预期响应**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2026-02-08T10:00:00Z"
}
```

#### 2. 智能对话（测试推荐数据）

```bash
curl -X POST "http://localhost:3000/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "YOUR_SESSION_ID",
    "message": "冰岛",
    "language": "zh"
  }'
```

**预期响应**（关键：应包含 `recommendations` 字段）:
```json
{
  "message": "I found 2 destination recommendations for you.",
  "messageCN": "我为您找到了2个目的地推荐。",
  "reply": "我为您找到了2个目的地推荐。",
  "replyCN": "我为您找到了2个目的地推荐。",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "phase": "RECOMMENDING",
  "routing": {
    "target": "recommendations",
    "reason": "Routed to recommendations",
    "params": {
      "destination": "冰岛",
      "filters": {
        "countryCode": "IS"
      }
    }
  },
  "recommendations": [
    {
      "id": "dest_1",
      "countryCode": "IS",
      "name": "Iceland",
      "nameCN": "冰岛",
      "description": "A land of fire and ice...",
      "descriptionCN": "冰与火之地...",
      "highlights": ["Northern Lights", "Geysers", "Glaciers"],
      "highlightsCN": ["极光", "间歇泉", "冰川"],
      "matchScore": 95,
      "matchReasons": ["符合您的预算", "适合7天旅行"],
      "matchReasonsCN": ["符合您的预算", "适合7天旅行"],
      "estimatedBudget": {
        "min": 40000,
        "max": 60000,
        "currency": "CNY"
      },
      "bestSeasons": ["夏季", "秋季"],
      "imageUrl": "https://example.com/iceland.jpg",
      "tags": ["自然", "冒险", "摄影"]
    }
  ]
}
```

**验证要点**:
- ✅ `recommendations` 字段存在且为数组
- ✅ `recommendations` 数组不为空
- ✅ 每个推荐项包含 `name`/`nameCN`、`countryCode`、`matchScore` 等字段
- ✅ `routing.target` 为 `"recommendations"`

#### 3. 获取会话状态（验证会话已保存）

```bash
curl -X GET "http://localhost:3000/api/agent/planning-assistant/v2/sessions/YOUR_SESSION_ID"
```

**预期响应**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": null,
  "phase": "RECOMMENDING",
  "recommendations": [
    {
      "id": "dest_1",
      "countryCode": "IS",
      "name": "Iceland",
      "nameCN": "冰岛",
      ...
    }
  ],
  "messageCount": 2,
  "createdAt": "2026-02-08T10:00:00Z",
  "updatedAt": "2026-02-08T10:05:00Z"
}
```

**验证要点**:
- ✅ 会话状态存在（不是 404）
- ✅ `phase` 为 `"RECOMMENDING"`
- ✅ `recommendations` 字段包含推荐数据
- ✅ `messageCount` 大于 0（表示消息已保存）

## 完整测试流程

```bash
# 1. 创建会话
SESSION_ID=$(curl -s -X POST "http://localhost:3000/api/agent/planning-assistant/v2/sessions" \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.sessionId')

echo "会话ID: $SESSION_ID"

# 2. 发送消息（测试推荐数据）
curl -X POST "http://localhost:3000/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"冰岛\",
    \"language\": \"zh\"
  }" | jq '{
    message: .messageCN,
    phase: .phase,
    routing_target: .routing.target,
    recommendations_count: (.recommendations | length),
    first_recommendation: .recommendations[0] | {nameCN, countryCode, matchScore}
  }'

# 3. 验证会话状态
curl -s "http://localhost:3000/api/agent/planning-assistant/v2/sessions/$SESSION_ID" | jq '{
  sessionId,
  phase,
  recommendations_count: (.recommendations | length),
  messageCount
}'
```

## 测试覆盖

### ✅ 测试1: 创建会话
- 测试创建不关联用户的会话
- 验证返回 `sessionId`
- 验证 HTTP 状态码 201

### ✅ 测试2: 智能对话（验证推荐数据）
- 测试向规划助手发送消息
- **关键**: 验证响应包含 `recommendations` 字段
- 验证推荐数据完整性（名称、国家代码、匹配分数等）
- 验证智能路由信息（`routing.target`）
- 验证 HTTP 状态码 200

### ✅ 测试3: 获取会话状态
- 测试获取会话的当前状态
- 验证会话状态已保存（不是 404）
- 验证会话状态包含推荐数据
- 验证消息历史已保存
- 验证 HTTP 状态码 200

## 常见问题

1. **连接失败**
   - 检查服务器是否运行：`curl http://localhost:3000/health`
   - 确认端口号正确
   - 检查防火墙设置

2. **会话不存在（404）**
   - 确保先创建会话获取 `sessionId`
   - 检查会话是否过期（默认24小时）
   - 验证会话状态保存逻辑是否正常工作

3. **推荐数据为空**
   - 检查推荐引擎服务是否正常运行
   - 验证智能路由是否正确路由到推荐接口
   - 检查响应中是否包含 `recommendations` 字段

4. **推荐数据不显示**
   - **关键**: 检查响应中是否包含 `recommendations` 字段
   - 验证前端是否正确读取和显示 `recommendations` 字段
   - 检查 `routing.target` 是否为 `"recommendations"`

## 测试输出示例

```
🚀 开始测试规划助手智能体 V2 接口...
📍 API地址: http://localhost:3000

✅ 测试1: 创建会话
   耗时: 45ms
   状态码: 201
   会话ID: 550e8400-e29b-41d4-a716-446655440000

✅ 测试2: 智能对话（验证推荐数据）
   耗时: 2341ms
   状态码: 200
   推荐数量: 2
   第一个推荐: 冰岛 (IS)
   匹配分数: 95
   路由目标: recommendations

   ✅ 推荐数据验证通过:
      - 推荐数量: 2
      - 第一个推荐: 冰岛
      - 国家代码: IS
      - 匹配分数: 95

✅ 测试3: 获取会话状态
   耗时: 12ms
   状态码: 200
   会话ID: 550e8400-e29b-41d4-a716-446655440000

   ✅ 会话状态包含推荐数据: 2 个推荐

============================================================
📊 测试结果汇总
============================================================

✅ 测试1: 创建会话
   耗时: 45ms
   状态码: 201
   会话ID: 550e8400-e29b-41d4-a716-446655440000

✅ 测试2: 智能对话（验证推荐数据）
   耗时: 2341ms
   状态码: 200
   推荐数量: 2
   第一个推荐: 冰岛 (IS)
   匹配分数: 95
   路由目标: recommendations

✅ 测试3: 获取会话状态
   耗时: 12ms
   状态码: 200
   会话ID: 550e8400-e29b-41d4-a716-446655440000

📈 总计: 3/3 通过

🎉 所有测试通过！
```
