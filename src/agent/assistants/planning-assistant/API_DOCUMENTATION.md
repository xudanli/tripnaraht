# Planning Assistant API 文档

## 创建新会话

### 接口信息

**接口**: `POST /api/agent/planning-assistant/sessions`

**描述**: 创建一个新的旅行规划对话会话。会话用于管理规划过程中的状态、偏好和消息历史。

**标签**: `规划助手智能体`

**认证**: 公开接口（`@Public()`），无需认证

---

### 请求

#### 请求路径

```
POST /api/agent/planning-assistant/sessions
```

#### 请求头

```
Content-Type: application/json
```

#### 请求体

```typescript
{
  userId?: string;  // 可选，用户ID
}
```

**请求参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | string | 否 | 用户ID。如果提供，会话将与用户关联；如果不提供，将创建匿名会话 |

**请求示例**:

```json
{
  "userId": "user_123456"
}
```

或创建匿名会话：

```json
{}
```

---

### 响应

#### 成功响应

**HTTP 状态码**: `201 Created`

**响应体**:

```typescript
{
  sessionId: string;  // 会话ID，用于后续对话
}
```

**响应示例**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 错误响应

**HTTP 状态码**: `400 Bad Request`

当请求体格式不正确时返回。

**响应体**:

```json
{
  "statusCode": 400,
  "message": ["userId must be a string"],
  "error": "Bad Request"
}
```

---

### 使用场景

1. **开始新的规划流程**
   - 用户点击"开始规划"时调用此接口
   - 获取 `sessionId` 用于后续对话

2. **用户关联会话**
   - 如果用户已登录，传递 `userId` 参数
   - 会话将与用户账户关联，可以跨设备访问

3. **匿名会话**
   - 如果用户未登录，不传递 `userId`
   - 创建临时会话，会话数据在过期后自动清理

---

### 会话生命周期

- **会话TTL**: 默认会话有效期为 24 小时（可在服务配置中调整）
- **会话过期**: 过期后的会话无法继续使用，需要创建新会话
- **会话状态**: 会话状态包括：
  - `INITIAL`: 初始阶段
  - `COLLECTING_PREFERENCES`: 收集偏好
  - `RECOMMENDING_DESTINATIONS`: 推荐目的地
  - `COMPARING_PLANS`: 对比方案
  - `CONFIRMING`: 确认行程
  - `COMPLETED`: 已完成

---

### 后续操作

创建会话后，可以使用以下接口：

1. **发送消息进行对话**
   ```
   POST /api/agent/planning-assistant/chat
   ```
   使用 `sessionId` 发送消息，获取智能回复和推荐

2. **获取会话状态**
   ```
   GET /api/agent/planning-assistant/sessions/:sessionId
   ```
   查询会话的当前状态、偏好和推荐

---

### 代码示例

#### cURL

```bash
# 创建用户会话
curl -X POST "http://localhost:3000/api/agent/planning-assistant/sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123456"
  }'

# 创建匿名会话
curl -X POST "http://localhost:3000/api/agent/planning-assistant/sessions" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### JavaScript/TypeScript

```typescript
// 创建会话
async function createSession(userId?: string): Promise<string> {
  const response = await fetch('/api/agent/planning-assistant/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: userId || undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`创建会话失败: ${response.statusText}`);
  }

  const data = await response.json();
  return data.sessionId;
}

// 使用示例
const sessionId = await createSession('user_123456');
console.log('会话ID:', sessionId);
```

#### React Hook 示例

```typescript
import { useState } from 'react';

function usePlanningSession(userId?: string) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createSession = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/agent/planning-assistant/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error(`创建会话失败: ${response.statusText}`);
      }

      const data = await response.json();
      setSessionId(data.sessionId);
      return data.sessionId;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('未知错误');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    sessionId,
    loading,
    error,
    createSession,
  };
}

// 使用示例
function PlanningComponent() {
  const { sessionId, loading, error, createSession } = usePlanningSession('user_123456');

  const handleStartPlanning = async () => {
    try {
      await createSession();
      // 会话创建成功，可以开始对话
    } catch (err) {
      console.error('创建会话失败:', err);
    }
  };

  return (
    <div>
      {!sessionId ? (
        <button onClick={handleStartPlanning} disabled={loading}>
          {loading ? '创建中...' : '开始规划'}
        </button>
      ) : (
        <div>会话ID: {sessionId}</div>
      )}
      {error && <div>错误: {error.message}</div>}
    </div>
  );
}
```

---

### 注意事项

1. **会话ID管理**
   - 会话ID是UUID格式的字符串
   - 前端应保存会话ID，用于后续对话请求
   - 建议使用 localStorage 或 sessionStorage 保存会话ID

2. **用户关联**
   - 如果用户已登录，建议传递 `userId`
   - 这样可以实现跨设备会话同步
   - 匿名会话在用户登录后无法关联到用户账户

3. **错误处理**
   - 网络错误：检查网络连接
   - 400错误：检查请求体格式
   - 500错误：服务器内部错误，稍后重试

4. **性能考虑**
   - 会话创建是轻量级操作，通常 < 100ms
   - 如果频繁创建会话，考虑复用现有会话

---

---

## 发送消息进行对话

### 接口信息

**接口**: `POST /api/agent/planning-assistant/chat`

**描述**: 向规划助手发送消息，获取智能回复、推荐和行程方案。需要先创建会话获取 `sessionId`。

**标签**: `规划助手智能体`

**认证**: 公开接口（`@Public()`），无需认证

---

### 请求

#### 请求路径

```
POST /api/agent/planning-assistant/chat
```

#### 请求头

```
Content-Type: application/json
```

#### 请求体

```typescript
{
  sessionId: string;        // 必填，会话ID（通过创建会话接口获取）
  userId?: string;           // 可选，用户ID
  message: string;           // 必填，用户消息
  language?: 'en' | 'zh';   // 可选，语言偏好，默认为 'zh'
  context?: {                // 可选，请求上下文
    currentLocation?: {
      lat?: number;
      lng?: number;
    };
    timezone?: string;
  };
}
```

**请求参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | 是 | 会话ID，通过 `POST /api/agent/planning-assistant/sessions` 获取 |
| userId | string | 否 | 用户ID |
| message | string | 是 | 用户发送的消息内容 |
| language | 'en' \| 'zh' | 否 | 语言偏好，默认为 'zh' |
| context | object | 否 | 请求上下文信息 |
| context.currentLocation | object | 否 | 当前位置信息 |
| context.currentLocation.lat | number | 否 | 纬度 |
| context.currentLocation.lng | number | 否 | 经度 |
| context.timezone | string | 否 | 时区 |

**请求示例**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user_123456",
  "message": "我想去冰岛旅行，有什么推荐吗？",
  "language": "zh",
  "context": {
    "currentLocation": {
      "lat": 39.9042,
      "lng": 116.4074
    },
    "timezone": "Asia/Shanghai"
  }
}
```

---

### 响应

#### 成功响应

**HTTP 状态码**: `200 OK`

**响应体**:

```typescript
{
  message: string;                    // 回复消息（英文）
  messageCN: string;                  // 回复消息（中文）
  phase: string;                      // 当前对话阶段
  guidingQuestions?: Array<{          // 可选，引导问题
    question: string;
    questionCN: string;
    options?: string[];
    optionsCN?: string[];
    type: 'single' | 'multiple' | 'text' | 'date' | 'number';
  }>;
  recommendations?: Array<{           // 可选，目的地推荐
    id: string;
    countryCode: string;
    name: string;
    nameCN: string;
    description: string;
    descriptionCN: string;
    highlights: string[];
    highlightsCN: string[];
    matchScore: number;
    matchReasons: string[];
    matchReasonsCN: string[];
    estimatedBudget: {
      min: number;
      max: number;
      currency: string;
    };
    bestSeasons: string[];
    imageUrl?: string;
    tags: string[];
  }>;
  planCandidates?: Array<{            // 可选，方案候选
    id: string;
    name: string;
    nameCN: string;
    description: string;
    descriptionCN: string;
    destination: string;
    duration: number;
    highlights: string[];
    estimatedBudget: {
      total: number;
      breakdown: {
        flight: number;
        accommodation: number;
        activities: number;
        food: number;
        other: number;
      };
    };
    pace: 'relaxed' | 'moderate' | 'intensive';
    suitability: {
      score: number;
      reasons: string[];
    };
    warnings?: string[];
  }>;
  comparison?: {                      // 可选，方案对比
    dimensions: string[];
    candidates: Array<{
      id: string;
      name: string;
      scores: Record<string, number>;
    }>;
    recommendation: string;
    recommendationCN: string;
  };
  confirmedTripId?: string;            // 可选，确认的行程ID
  suggestedActions?: Array<{          // 可选，建议操作
    action: string;
    label: string;
    labelCN: string;
  }>;
}
```

**响应示例**:

```json
{
  "message": "I'd be happy to help you plan a trip to Iceland!",
  "messageCN": "我很乐意帮您规划冰岛之旅！",
  "phase": "RECOMMENDING_DESTINATIONS",
  "recommendations": [
    {
      "id": "IS",
      "countryCode": "IS",
      "name": "Iceland",
      "nameCN": "冰岛",
      "description": "Land of fire and ice",
      "descriptionCN": "冰与火之地",
      "highlights": ["Northern Lights", "Geysers", "Glaciers"],
      "highlightsCN": ["极光", "间歇泉", "冰川"],
      "matchScore": 95,
      "matchReasons": ["Matches your interest in nature"],
      "matchReasonsCN": ["符合您对自然的兴趣"],
      "estimatedBudget": {
        "min": 15000,
        "max": 25000,
        "currency": "CNY"
      },
      "bestSeasons": ["summer", "winter"],
      "tags": ["nature", "adventure"]
    }
  ],
  "guidingQuestions": [
    {
      "question": "When would you like to travel?",
      "questionCN": "您想什么时候出行？",
      "type": "date"
    }
  ]
}
```

#### 错误响应

**HTTP 状态码**: `400 Bad Request`

当请求参数不正确时返回。

**响应体**:

```json
{
  "statusCode": 400,
  "message": ["sessionId must be a string", "message must be a string"],
  "error": "Bad Request"
}
```

**HTTP 状态码**: `404 Not Found`

当会话不存在时返回。

---

### 对话阶段说明

| 阶段 | 说明 |
|------|------|
| `INITIAL` | 初始阶段，收集基本信息 |
| `COLLECTING_PREFERENCES` | 收集用户偏好 |
| `RECOMMENDING_DESTINATIONS` | 推荐目的地 |
| `COMPARING_PLANS` | 对比方案 |
| `CONFIRMING` | 确认行程 |
| `COMPLETED` | 已完成 |

---

### 代码示例

#### cURL

```bash
curl -X POST "http://localhost:3000/api/agent/planning-assistant/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "我想去冰岛旅行",
    "language": "zh"
  }'
```

#### JavaScript/TypeScript

```typescript
// 发送消息
async function sendMessage(
  sessionId: string,
  message: string,
  userId?: string,
  language: 'en' | 'zh' = 'zh'
): Promise<any> {
  const response = await fetch('/api/agent/planning-assistant/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      userId,
      message,
      language,
    }),
  });

  if (!response.ok) {
    throw new Error(`发送消息失败: ${response.statusText}`);
  }

  return await response.json();
}

// 使用示例
const response = await sendMessage(
  '550e8400-e29b-41d4-a716-446655440000',
  '我想去冰岛旅行',
  'user_123456',
  'zh'
);

console.log('回复:', response.messageCN);
console.log('阶段:', response.phase);
if (response.recommendations) {
  console.log('推荐:', response.recommendations);
}
```

#### React Hook 示例

```typescript
import { useState } from 'react';

function usePlanningChat(sessionId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [response, setResponse] = useState<any>(null);

  const sendMessage = async (
    message: string,
    userId?: string,
    language: 'en' | 'zh' = 'zh'
  ) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/agent/planning-assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          userId,
          message,
          language,
        }),
      });

      if (!res.ok) {
        throw new Error(`发送消息失败: ${res.statusText}`);
      }

      const data = await res.json();
      setResponse(data);
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('未知错误');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    response,
    sendMessage,
  };
}

// 使用示例
function ChatComponent({ sessionId }: { sessionId: string }) {
  const [input, setInput] = useState('');
  const { loading, error, response, sendMessage } = usePlanningChat(sessionId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    try {
      await sendMessage(input);
      setInput('');
    } catch (err) {
      console.error('发送失败:', err);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息..."
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? '发送中...' : '发送'}
        </button>
      </form>
      
      {error && <div>错误: {error.message}</div>}
      
      {response && (
        <div>
          <div>{response.messageCN}</div>
          {response.recommendations && (
            <div>
              <h3>推荐目的地:</h3>
              {response.recommendations.map((rec: any) => (
                <div key={rec.id}>{rec.nameCN}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

### 从旧接口迁移

**旧接口** (已删除):
```
POST /api/trip-planner/chat
```

**新接口**:
```
POST /api/agent/planning-assistant/chat
```

**主要差异**:

1. **参数变化**:
   - 旧接口: 需要 `tripId`（行程ID）
   - 新接口: 需要 `sessionId`（会话ID）

2. **使用流程**:
   - 旧接口: 直接使用 `tripId` 发送消息
   - 新接口: 先创建会话获取 `sessionId`，然后使用 `sessionId` 发送消息

3. **迁移步骤**:
   ```typescript
   // 旧代码
   await fetch('/api/trip-planner/chat', {
     method: 'POST',
     body: JSON.stringify({
       tripId: 'trip_123',
       message: '优化行程',
     }),
   });

   // 新代码
   // 1. 创建会话
   const sessionRes = await fetch('/api/agent/planning-assistant/sessions', {
     method: 'POST',
     body: JSON.stringify({ userId: 'user_123' }),
   });
   const { sessionId } = await sessionRes.json();

   // 2. 发送消息
   await fetch('/api/agent/planning-assistant/chat', {
     method: 'POST',
     body: JSON.stringify({
       sessionId,
       message: '优化行程',
     }),
   });
   ```

---

### 相关接口

- [创建新会话](#创建新会话)
- [获取会话状态](#获取会话状态)
- [快速推荐](#快速推荐)

---

### 更新日志

- **2026-02-04**: 初始版本
  - 支持创建用户会话和匿名会话
  - 会话TTL为24小时
  - 添加对话接口文档
