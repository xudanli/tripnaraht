# 智能体统一接口文档（前端版）

## 概述

智能体模块提供统一的对话接口，采用语义路由架构，根据用户输入自动路由到不同的处理系统（System 1 快速路径或 System 2 慢速路径）。

**接口地址**：`POST /api/agent/route_and_run`

**Content-Type**：`application/json`

---

## 请求参数

### 完整请求结构

```typescript
interface RouteAndRunRequest {
  // 必需字段
  request_id: string;        // 请求唯一标识符（前端生成，建议使用 UUID）
  user_id: string;           // 用户 ID
  message: string;           // 用户输入的自然语言消息
  
  // 可选字段
  trip_id?: string | null;   // 关联的行程 ID（如果有上下文行程）
  conversation_context?: {   // 对话上下文
    recent_messages?: string[];  // 最近的对话消息历史（可选）
    locale?: string;            // 用户语言环境，如 'zh-CN'（可选）
    timezone?: string;          // 用户时区，如 'Asia/Shanghai'（可选）
  };
  options?: {                // 执行选项
    dry_run?: boolean;              // 是否仅执行 dry-run（不实际执行操作），默认 false
    allow_webbrowse?: boolean;      // 是否允许使用浏览器（需要用户授权），默认 false
    max_seconds?: number;           // System 2 最大执行时间（秒），默认 60
    max_steps?: number;             // System 2 最大执行步数，默认 8
    max_browser_steps?: number;     // 浏览器操作最大步数，默认 12
    cost_budget_usd?: number;       // 成本预算（美元），如 0.20
    llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic';  // LLM 提供商，默认 'auto'
  };
}
```

### 字段说明

#### 必需字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `request_id` | `string` | 请求唯一标识符，前端生成，建议使用 UUID | `"req-001"` 或 `"550e8400-e29b-41d4-a716-446655440000"` |
| `user_id` | `string` | 用户 ID | `"user-123"` |
| `message` | `string` | 用户输入的自然语言消息 | `"推荐新宿拉面"` |

#### 可选字段

**trip_id**（`string | null`）
- 关联的行程 ID
- 如果用户正在编辑某个行程，传入该行程 ID
- 如果用户没有关联行程，可以不传或传 `null`

**conversation_context**（对象）
- 对话上下文信息
- `recent_messages`: 最近的对话消息历史（字符串数组）
- `locale`: 用户语言环境，如 `'zh-CN'`、`'en-US'`
- `timezone`: 用户时区，如 `'Asia/Shanghai'`、`'America/New_York'`

**options**（对象）
- `dry_run`: 是否仅执行 dry-run（不实际执行操作），默认 `false`
- `allow_webbrowse`: 是否允许使用浏览器（需要用户授权），默认 `false`
- `max_seconds`: System 2 最大执行时间（秒），默认 `60`
- `max_steps`: System 2 最大执行步数，默认 `8`
- `max_browser_steps`: 浏览器操作最大步数，默认 `12`
- `cost_budget_usd`: 成本预算（美元），如 `0.20`
- `llm_provider`: LLM 提供商，可选值：
  - `'auto'`（默认）：使用系统推荐的模型（根据环境变量自动选择）
  - `'openai'`：使用 OpenAI
  - `'deepseek'`：使用 DeepSeek
  - `'gemini'`：使用 Gemini
  - `'anthropic'`：使用 Anthropic

---

## 响应结构

### 完整响应结构

```typescript
interface RouteAndRunResponse {
  request_id: string;        // 请求 ID（与请求中的相同）
  
  route: {                   // 路由决策信息
    route: 'SYSTEM1_API' | 'SYSTEM1_RAG' | 'SYSTEM2_REASONING' | 'SYSTEM2_WEBBROWSE';
    confidence: number;      // 置信度（0-1）
    reasons: string[];       // 路由原因
    required_capabilities: string[];  // 所需能力
    consent_required: boolean;  // 是否需要用户授权
    budget: {                // 执行预算
      max_seconds: number;
      max_steps: number;
      max_browser_steps: number;
    };
    ui_hint: {               // UI 提示信息
      mode: 'fast' | 'slow';
      status: 'thinking' | 'browsing' | 'verifying' | 'repairing' | 'awaiting_consent' | 'awaiting_confirmation' | 'done' | 'failed';
      message: string;
    };
  };
  
  result: {                  // 执行结果
    status: 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 'FAILED' | 'TIMEOUT';
    answer_text: string;     // 处理结果的自然语言描述（主要展示内容）
    payload: {               // 载荷数据
      timeline: any[];       // 时间线（行程数据）
      dropped_items: any[];  // 被丢弃的项
      candidates: any[];     // 候选结果
      evidence: any[];       // 证据
      robustness: any;       // 稳健度评估
      suspensionInfo?: {     // 挂起信息（仅在 status 为 SUSPENDED 时存在，通过 payload 传递）
        approvalId: string;
        skillName: string;
        summary: string;
        payload: any;
      };
    };
  };
  
  explain: {                 // 决策解释（决策日志）
    decision_log: Array<{
      step: number;
      chosen_action: string;
      reason_code: string;
      facts: Record<string, any>;
      policy_id: string;
    }>;
  };
  
  observability: {           // 可观测性指标
    latency_ms: number;      // 总延迟（毫秒）
    router_ms: number;       // 路由延迟（毫秒）
    system_mode: 'SYSTEM1' | 'SYSTEM2';  // 系统模式
    tool_calls: number;      // 工具调用次数
    browser_steps: number;   // 浏览器操作步数
    tokens_est: number;      // 预估 token 数
    cost_est_usd: number;    // 预估成本（美元）
    fallback_used: boolean;  // 是否使用了降级方案
  };
}
```

### 字段说明

#### result.status 状态说明

| 状态 | 说明 | 前端处理建议 |
|------|------|------------|
| `OK` | 执行成功，有完整结果 | 显示 `answer_text` 和 `payload` 中的内容 |
| `NEED_MORE_INFO` | 需要更多信息 | 显示 `answer_text`（通常包含引导性提示），提示用户补充信息 |
| `NEED_CONSENT` | 需要用户授权 | 显示授权提示（如浏览器使用授权），用户确认后重新请求并设置 `options.allow_webbrowse = true` |
| `NEED_CONFIRMATION` | 需要用户确认 | 显示确认提示，用户确认后继续执行 |
| `FAILED` | 执行失败 | 显示错误信息（`answer_text`），可能需要用户重试 |
| `TIMEOUT` | 执行超时 | 显示超时提示，建议用户简化请求或重试 |

#### route.ui_hint.status UI 状态说明

| 状态 | 说明 | 前端展示建议 |
|------|------|------------|
| `thinking` | 正在思考 | 显示加载动画，提示"正在思考..." |
| `browsing` | 正在浏览 | 显示加载动画，提示"正在浏览网页..." |
| `verifying` | 正在验证 | 显示加载动画，提示"正在验证..." |
| `repairing` | 正在修复 | 显示加载动画，提示"正在修复..." |
| `awaiting_consent` | 等待授权 | 显示授权对话框 |
| `awaiting_confirmation` | 等待确认 | 显示确认对话框 |
| `done` | 完成 | 显示结果 |
| `failed` | 失败 | 显示错误信息 |

---

## 请求示例

### 1. 简单查询（最简请求）

```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "推荐新宿拉面"
}
```

### 2. 带行程上下文的查询

```json
{
  "request_id": "req-002",
  "user_id": "user-123",
  "trip_id": "trip-456",
  "message": "添加东京塔到行程"
}
```

### 3. 规划请求（带选项）

```json
{
  "request_id": "req-003",
  "user_id": "user-123",
  "message": "规划5天东京游，包含浅草寺、东京塔、新宿",
  "options": {
    "max_seconds": 60,
    "max_steps": 8,
    "llm_provider": "deepseek"
  }
}
```

### 4. 带对话上下文的请求

```json
{
  "request_id": "req-004",
  "user_id": "user-123",
  "message": "帮我改一下时间",
  "conversation_context": {
    "recent_messages": [
      "用户: 规划5天东京游",
      "助手: 我为您规划了以下行程..."
    ],
    "locale": "zh-CN",
    "timezone": "Asia/Shanghai"
  },
  "options": {
    "llm_provider": "auto"
  }
}
```

### 5. 需要授权的请求（浏览器操作）

```json
{
  "request_id": "req-005",
  "user_id": "user-123",
  "message": "搜索东京最新的展览信息",
  "options": {
    "allow_webbrowse": true,
    "max_browser_steps": 12
  }
}
```

---

## 响应示例

### 成功响应（System 1）

```json
{
  "request_id": "req-001",
  "route": {
    "route": "SYSTEM1_API",
    "confidence": 0.95,
    "reasons": ["SIMPLE_QUERY"],
    "required_capabilities": ["places"],
    "consent_required": false,
    "budget": {
      "max_seconds": 60,
      "max_steps": 8,
      "max_browser_steps": 12
    },
    "ui_hint": {
      "mode": "fast",
      "status": "done",
      "message": "查询完成"
    }
  },
  "result": {
    "status": "OK",
    "answer_text": "我为您推荐以下新宿拉面店：\n\n1. **一風堂新宿店**\n   - 地址：东京都新宿区新宿3-34-11\n   - 特色：经典博多拉面\n\n2. **一蘭新宿店**\n   - 地址：东京都新宿区新宿3-34-11\n   - 特色：浓郁汤底，独立座位\n\n...",
    "payload": {
      "timeline": [],
      "dropped_items": [],
      "candidates": [
        {
          "name": "一風堂新宿店",
          "address": "东京都新宿区新宿3-34-11",
          "type": "restaurant"
        }
      ],
      "evidence": [],
      "robustness": null
    }
  },
  "explain": {
    "decision_log": []
  },
  "observability": {
    "latency_ms": 450,
    "router_ms": 2,
    "system_mode": "SYSTEM1",
    "tool_calls": 1,
    "browser_steps": 0,
    "tokens_est": 1200,
    "cost_est_usd": 0.002,
    "fallback_used": false
  }
}
```

### 需要更多信息

```json
{
  "request_id": "req-002",
  "route": {
    "route": "SYSTEM1_API",
    "confidence": 0.75,
    "reasons": ["AMBIGUOUS_QUERY"],
    "required_capabilities": ["places"],
    "consent_required": false,
    "budget": {
      "max_seconds": 60,
      "max_steps": 8,
      "max_browser_steps": 12
    },
    "ui_hint": {
      "mode": "fast",
      "status": "done",
      "message": "需要更多信息"
    }
  },
  "result": {
    "status": "NEED_MORE_INFO",
    "answer_text": "我可以帮您：\n\n• **添加地点**：例如\"添加东京塔到第2天\"\n• **修改时间**：例如\"将浅草寺的时间改为下午2点\"\n• **删除地点**：例如\"删除第1天的某个地点\"\n• **查看行程**：例如\"显示当前行程\"\n\n请告诉我您想要做什么？",
    "payload": {
      "timeline": [],
      "dropped_items": [],
      "candidates": [],
      "evidence": [],
      "robustness": null
    }
  },
  "explain": {
    "decision_log": []
  },
  "observability": {
    "latency_ms": 120,
    "router_ms": 2,
    "system_mode": "SYSTEM1",
    "tool_calls": 0,
    "browser_steps": 0,
    "tokens_est": 150,
    "cost_est_usd": 0.0001,
    "fallback_used": false
  }
}
```

### 规划请求（System 2）

```json
{
  "request_id": "req-003",
  "route": {
    "route": "SYSTEM2_REASONING",
    "confidence": 0.92,
    "reasons": ["MULTI_CONSTRAINT", "PLANNING_REQUIRED"],
    "required_capabilities": ["places", "transport", "itinerary"],
    "consent_required": false,
    "budget": {
      "max_seconds": 60,
      "max_steps": 8,
      "max_browser_steps": 12
    },
    "ui_hint": {
      "mode": "slow",
      "status": "done",
      "message": "规划完成"
    }
  },
  "result": {
    "status": "OK",
    "answer_text": "我为您规划了5天东京游行程：\n\n**第1天：浅草寺区域**\n- 上午：浅草寺参观（2小时）\n- 下午：晴空塔（3小时）\n...",
    "payload": {
      "timeline": [
        {
          "day": 1,
          "items": [
            {
              "place_id": "place-001",
              "name": "浅草寺",
              "start_time": "09:00",
              "end_time": "11:00"
            }
          ]
        }
      ],
      "dropped_items": [],
      "candidates": [],
      "evidence": [],
      "robustness": {
        "score": 0.85,
        "risks": []
      }
    }
  },
  "explain": {
    "decision_log": [
      {
        "step": 0,
        "chosen_action": "places.resolve_entities",
        "reason_code": "MISSING_POI_FACTS",
        "facts": {},
        "policy_id": "FACTS_FIRST"
      }
    ]
  },
  "observability": {
    "latency_ms": 8500,
    "router_ms": 3,
    "system_mode": "SYSTEM2",
    "tool_calls": 6,
    "browser_steps": 0,
    "tokens_est": 4500,
    "cost_est_usd": 0.015,
    "fallback_used": false
  }
}
```

---

## 错误处理

### HTTP 状态码

| 状态码 | 说明 | 处理建议 |
|--------|------|---------|
| `200` | 成功 | 正常处理响应 |
| `400` | 请求参数无效 | 检查请求参数格式 |
| `401` | 未授权 | 检查认证信息 |
| `500` | 服务器内部错误 | 记录错误，提示用户稍后重试 |

### 响应中的错误状态

即使 HTTP 状态码为 200，`result.status` 也可能表示错误：

- `FAILED`: 执行失败，查看 `result.answer_text` 获取错误信息
- `TIMEOUT`: 执行超时，建议用户简化请求或重试

---

## 前端集成建议

### 1. 请求 ID 生成

```typescript
// 使用 UUID 生成请求 ID
import { v4 as uuidv4 } from 'uuid';

const requestId = uuidv4();
```

### 2. 基础请求封装

```typescript
interface AgentRequest {
  request_id: string;
  user_id: string;
  message: string;
  trip_id?: string | null;
  conversation_context?: {
    recent_messages?: string[];
    locale?: string;
    timezone?: string;
  };
  options?: {
    dry_run?: boolean;
    allow_webbrowse?: boolean;
    max_seconds?: number;
    max_steps?: number;
    max_browser_steps?: number;
    cost_budget_usd?: number;
    llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic';
  };
}

async function callAgent(request: AgentRequest): Promise<RouteAndRunResponse> {
  const response = await fetch('/api/agent/route_and_run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}
```

### 3. 状态处理

```typescript
function handleAgentResponse(response: RouteAndRunResponse) {
  // 显示 UI 提示
  if (response.route.ui_hint.status === 'thinking') {
    showLoading('正在思考...');
  } else if (response.route.ui_hint.status === 'browsing') {
    showLoading('正在浏览网页...');
  }
  
  // 处理结果状态
  switch (response.result.status) {
    case 'OK':
      displayAnswer(response.result.answer_text);
      if (response.result.payload.timeline) {
        displayTimeline(response.result.payload.timeline);
      }
      break;
      
    case 'NEED_MORE_INFO':
      displayAnswer(response.result.answer_text);
      promptUserForMoreInfo();
      break;
      
    case 'NEED_CONSENT':
      showConsentDialog(() => {
        // 用户授权后重新请求，设置 allow_webbrowse = true
        callAgent({
          ...request,
          options: { ...request.options, allow_webbrowse: true }
        });
      });
      break;
      
    case 'FAILED':
    case 'TIMEOUT':
      showError(response.result.answer_text);
      break;
  }
}
```

### 4. 对话上下文管理

```typescript
// 维护对话历史
const conversationHistory: string[] = [];

function addToHistory(userMessage: string, assistantMessage: string) {
  conversationHistory.push(`用户: ${userMessage}`);
  conversationHistory.push(`助手: ${assistantMessage}`);
  
  // 只保留最近 N 条消息
  if (conversationHistory.length > 20) {
    conversationHistory.splice(0, conversationHistory.length - 20);
  }
}

// 发送请求时包含对话上下文
const request: AgentRequest = {
  request_id: uuidv4(),
  user_id: currentUserId,
  message: userInput,
  conversation_context: {
    recent_messages: conversationHistory,
    locale: 'zh-CN',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
};
```

### 5. 模型选择

```typescript
// 用户可以在设置中选择 LLM 模型
const userPreferredModel: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic' = getUserPreference('llm_model') || 'auto';

const request: AgentRequest = {
  // ... 其他字段
  options: {
    llm_provider: userPreferredModel,
  },
};
```

---

## 注意事项

1. **请求 ID 唯一性**：每个请求的 `request_id` 应该是唯一的，建议使用 UUID
2. **对话上下文**：如果有对话历史，建议传入 `conversation_context.recent_messages`，有助于智能体理解上下文
3. **行程上下文**：如果用户在编辑某个行程，建议传入 `trip_id`
4. **授权处理**：如果 `result.status` 为 `NEED_CONSENT`，需要显示授权对话框，用户确认后重新请求并设置 `options.allow_webbrowse = true`
5. **超时处理**：System 2 请求可能需要较长时间（最长 60 秒），建议前端设置合理的超时时间
6. **错误重试**：对于 `FAILED` 或 `TIMEOUT` 状态，可以提示用户重试
7. **模型选择**：`llm_provider` 默认为 `'auto'`（系统推荐），用户可以在设置中选择特定模型

---

## 更新日志

### 2024-01-XX
- 新增 `llm_provider` 字段支持，允许用户选择 LLM 模型（'auto'、'openai'、'deepseek'、'gemini'、'anthropic'）
- 优化 `NEED_MORE_INFO` 状态的引导消息，提供更详细的示例

---

## 相关文档

- [智能体架构说明](./AGENT_ARCHITECTURE_SUMMARY.md)
- [模型选择功能说明](./AGENT_LLM_MODEL_SELECTION_IMPLEMENTATION.md)
