# 智能体统一入口 API - 前端接口文档

**文档版本**: v1.0  
**更新日期**: 2025-01-13  
**目标受众**: 前端开发工程师

---

## 概述

智能体统一入口 (`POST /agent/route_and_run`) 为已创建行程提供运营服务，包括查询、修改、执行阶段服务等。

**核心要求**：
- ✅ **必须提供 `trip_id`**（统一入口只为具体行程服务）
- ✅ **支持入口来源标识**（`entry_point`）
- ✅ **支持只读模式**（`readonly_mode`）

---

## 基础信息

### 接口地址

```
POST /agent/route_and_run
```

### 请求头

```http
Content-Type: application/json
Authorization: Bearer <token>  # 如果需要认证
```

---

## 请求参数

### 请求体结构

```typescript
interface RouteAndRunRequest {
  // 必需字段
  request_id: string;        // 请求唯一标识符
  user_id: string;           // 用户 ID
  trip_id: string | null;    // 行程 ID（统一入口强制要求，不能为空）
  message: string;           // 用户输入消息

  // 可选字段
  conversation_context?: {
    recent_messages?: string[];  // 最近的对话消息历史
    locale?: string;              // 用户语言环境，如 'zh-CN'
    timezone?: string;            // 用户时区，如 'Asia/Tokyo'
  };

  options?: {
    // 入口来源标识（新增）
    entry_point?: 'trip_detail_page' | 'trip_list_page' | 'dashboard' | 'planning_workbench';
    
    // 只读模式标志（新增）
    readonly_mode?: boolean;  // true 时限制为查询类操作，false 或不传则允许所有操作
    
    // 其他选项
    dry_run?: boolean;                    // 是否仅执行 dry-run（不实际执行操作）
    allow_webbrowse?: boolean;            // 是否允许使用浏览器（需要用户授权）
    max_seconds?: number;                 // System 2 最大执行时间（秒），默认 60
    max_steps?: number;                   // System 2 最大执行步数，默认 8
    max_browser_steps?: number;           // 浏览器操作最大步数，默认 12
    cost_budget_usd?: number;             // 成本预算（美元）
    llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic';  // LLM 提供商
    use_claude_orchestration?: boolean;   // 是否使用 Claude 编排
    use_state_machine_orchestration?: boolean;  // 是否使用状态机编排
  };
}
```

### 字段说明

#### 必需字段

| 字段 | 类型 | 说明 | 示例 |
|-----|------|------|------|
| `request_id` | string | 请求唯一标识符，建议使用 UUID | `"req-001"` |
| `user_id` | string | 用户 ID | `"user-123"` |
| `trip_id` | string \| null | **行程 ID（强制要求，不能为空字符串）** | `"trip-456"` |
| `message` | string | 用户输入消息 | `"查询我的行程"` |

#### 新增字段（重要）

| 字段 | 类型 | 说明 | 使用场景 |
|-----|------|------|---------|
| `options.entry_point` | string | 入口来源标识 | 标识请求来自哪个页面 |
| `options.readonly_mode` | boolean | 只读模式标志 | `true` 时限制为查询类操作 |

**入口来源标识 (`entry_point`)**：

| 值 | 说明 | 使用场景 |
|---|------|---------|
| `trip_detail_page` | 行程详情页 | `/trips/:tripId` 页面 |
| `trip_list_page` | 行程列表页 | `/trips` 页面 |
| `dashboard` | 首页/仪表盘 | `/` 或 `/dashboard` 页面 |
| `planning_workbench` | 规划工作台 | `/planning-workbench` 页面（通常不使用统一入口） |

**只读模式 (`readonly_mode`)**：

- `true`: 限制为查询类操作，修改类操作会被拦截并重定向到规划工作台
- `false` 或不传: 允许所有操作（查询、修改等）

---

## 响应格式

### 成功响应

```typescript
interface RouteAndRunResponse {
  request_id: string;
  route: {
    route: 'SYSTEM1_API' | 'SYSTEM1_RAG' | 'SYSTEM2_REASONING' | 'SYSTEM2_WEBBROWSE';
    confidence: number;
    reasons: string[];
    required_capabilities: string[];
    consent_required: boolean;
    budget: {
      max_seconds: number;
      max_steps: number;
      max_browser_steps: number;
    };
    ui_hint: {
      mode: 'fast' | 'slow';
      status: 'thinking' | 'browsing' | 'verifying' | 'repairing' | 
              'awaiting_consent' | 'awaiting_confirmation' | 'done' | 
              'failed' | 'redirect_required';
      message: string;
    };
  };
  result: {
    status: 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 
            'FAILED' | 'TIMEOUT' | 'REDIRECT_REQUIRED';
    answer_text: string;
    payload: {
      timeline: any[];
      dropped_items: any[];
      candidates: any[];
      evidence: any[];
      robustness: number | null;
      // 重定向信息（仅在 REDIRECT_REQUIRED 时存在）
      redirectInfo?: {
        redirect_to: string;
        redirect_reason: string;
        original_request: {
          message: string;
          user_id: string;
        };
      };
    };
  };
  explain: {
    decision_log: Array<{
      request_id: string;
      step: string;
      actor: string;
      inputs_summary: string;
      outputs_summary: string;
      evidence_refs: string[];
      timestamp: string;
      metadata?: any;
    }>;
  };
  observability: {
    latency_ms: number;
    router_ms: number;
    system_mode: 'SYSTEM1' | 'SYSTEM2' | 'REDIRECT';
    tool_calls: number;
    browser_steps: number;
    tokens_est: number;
    cost_est_usd: number;
    fallback_used: boolean;
    trace?: any;
  };
}
```

### 响应状态说明

| 状态 | 说明 | 处理方式 |
|-----|------|---------|
| `OK` | 执行成功 | 显示 `answer_text` 和 `payload` |
| `NEED_MORE_INFO` | 需要更多信息 | 提示用户提供更多信息 |
| `NEED_CONSENT` | 需要用户授权 | 显示授权确认 UI |
| `NEED_CONFIRMATION` | 需要用户确认 | 显示确认对话框 |
| `FAILED` | 执行失败 | 显示错误消息 |
| `TIMEOUT` | 执行超时 | 提示用户稍后重试 |
| `REDIRECT_REQUIRED` | 需要重定向 | 跳转到 `redirectInfo.redirect_to` |

---

## 错误响应

### 1. 缺少 trip_id 错误

**触发条件**：`trip_id` 为空或未提供

**响应示例**：
```json
{
  "request_id": "req-001",
  "route": {
    "route": "SYSTEM2_REASONING",
    "confidence": 1.0,
    "reasons": ["MISSING_INFO"],
    "ui_hint": {
      "status": "awaiting_confirmation",
      "message": "需要选择行程"
    }
  },
  "result": {
    "status": "FAILED",
    "answer_text": "智能体统一入口只为具体行程服务，请提供 trip_id。如果您想规划新行程，请使用规划工作台。",
    "payload": {
      "redirectInfo": {
        "redirect_to": "/planning-workbench/execute",
        "redirect_reason": "MISSING_TRIP_ID",
        "original_request": {
          "message": "查询我的行程",
          "user_id": "user-123"
        }
      }
    }
  }
}
```

**前端处理**：
```typescript
if (response.result.status === 'FAILED' && 
    response.result.payload.redirectInfo?.redirect_reason === 'MISSING_TRIP_ID') {
  // 显示错误提示
  showError({
    message: '需要选择行程',
    description: '智能体统一入口只为具体行程服务，请选择要查询的行程，或前往规划工作台创建新行程。',
    actions: [
      { label: '选择行程', onClick: () => openTripSelector() },
      { label: '前往规划工作台', onClick: () => router.push('/planning-workbench') },
    ],
  });
}
```

### 2. 只读模式限制错误

**触发条件**：`entry_point === 'trip_detail_page'` 且 `readonly_mode === true` 且消息包含修改类关键词

**响应示例**：
```json
{
  "request_id": "req-002",
  "route": {
    "route": "SYSTEM2_REASONING",
    "confidence": 1.0,
    "reasons": ["HIGH_RISK_ACTION"],
    "ui_hint": {
      "status": "redirect_required",
      "message": "行程详情页只支持查询操作"
    }
  },
  "result": {
    "status": "REDIRECT_REQUIRED",
    "answer_text": "行程详情页只支持查询操作，如需修改请前往规划工作台。",
    "payload": {
      "redirectInfo": {
        "redirect_to": "/planning-workbench/execute",
        "redirect_reason": "READONLY_MODE_RESTRICTION",
        "original_request": {
          "message": "修改第2天的行程",
          "user_id": "user-123"
        }
      }
    }
  }
}
```

**前端处理**：
```typescript
if (response.result.status === 'REDIRECT_REQUIRED' && 
    response.result.payload.redirectInfo?.redirect_reason === 'READONLY_MODE_RESTRICTION') {
  // 显示提示并引导用户
  showWarning({
    message: '行程详情页只支持查询操作',
    description: '如需修改行程，请前往规划工作台。',
    actions: [
      { label: '前往规划工作台', onClick: () => router.push('/planning-workbench') },
      { label: '取消', onClick: () => {} },
    ],
  });
}
```

### 3. 规划请求重定向

**触发条件**：检测到规划请求（无 `trip_id` 且包含规划关键词）

**响应示例**：
```json
{
  "request_id": "req-003",
  "route": {
    "route": "SYSTEM2_REASONING",
    "confidence": 1.0,
    "reasons": ["REDIRECT_TO_PLANNING_WORKBENCH"],
    "ui_hint": {
      "status": "redirect_required",
      "message": "需要前往规划工作台"
    }
  },
  "result": {
    "status": "REDIRECT_REQUIRED",
    "answer_text": "行程规划功能已迁移到规划工作台，请使用 POST /planning-workbench/execute 接口。",
    "payload": {
      "redirectInfo": {
        "redirect_to": "/planning-workbench/execute",
        "redirect_reason": "PLANNING_REQUEST_DETECTED",
        "original_request": {
          "message": "规划一个5天冰岛行程",
          "user_id": "user-123"
        }
      }
    }
  }
}
```

**前端处理**：
```typescript
if (response.result.status === 'REDIRECT_REQUIRED' && 
    response.result.payload.redirectInfo?.redirect_reason === 'PLANNING_REQUEST_DETECTED') {
  // 自动跳转到规划工作台
  router.push('/planning-workbench');
  // 可选：传递原始请求信息
  router.push({
    path: '/planning-workbench',
    query: {
      message: response.result.payload.redirectInfo.original_request.message,
    },
  });
}
```

---

## 使用示例

### 示例 1：行程详情页查询（只读模式）

```typescript
// 在行程详情页 (/trips/:tripId)
const request = {
  request_id: generateUUID(),
  user_id: currentUser.id,
  trip_id: tripId,  // 从 URL 获取
  message: '第2天有什么安排？',
  options: {
    entry_point: 'trip_detail_page',
    readonly_mode: true,  // 只读模式
  },
};

const response = await fetch('/agent/route_and_run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request),
});

const data = await response.json();

if (data.result.status === 'OK') {
  // 显示查询结果
  displayAnswer(data.result.answer_text);
} else if (data.result.status === 'REDIRECT_REQUIRED') {
  // 处理重定向
  handleRedirect(data.result.payload.redirectInfo);
}
```

### 示例 2：行程列表页查询（默认绑定最新行程）

```typescript
// 在行程列表页 (/trips)
const defaultTripId = await getLatestTripId(userId);

const request = {
  request_id: generateUUID(),
  user_id: currentUser.id,
  trip_id: defaultTripId,  // 默认绑定最新行程
  message: '查询我的行程',
  options: {
    entry_point: 'trip_list_page',
    readonly_mode: true,  // 只读模式
  },
};

const response = await fetch('/agent/route_and_run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request),
});
```

### 示例 3：行程修改（非只读模式）

```typescript
// 在行程列表页或其他允许修改的页面
const request = {
  request_id: generateUUID(),
  user_id: currentUser.id,
  trip_id: tripId,
  message: '修改第2天的行程',
  options: {
    entry_point: 'trip_list_page',
    readonly_mode: false,  // 允许修改
  },
};

const response = await fetch('/agent/route_and_run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request),
});
```

### 示例 4：错误处理（缺少 trip_id）

```typescript
const request = {
  request_id: generateUUID(),
  user_id: currentUser.id,
  // trip_id 缺失或为空
  message: '查询我的行程',
};

const response = await fetch('/agent/route_and_run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request),
});

const data = await response.json();

if (data.result.status === 'FAILED' && 
    data.result.payload.redirectInfo?.redirect_reason === 'MISSING_TRIP_ID') {
  // 显示错误提示
  showErrorDialog({
    title: '需要选择行程',
    message: data.result.answer_text,
    actions: [
      {
        label: '选择行程',
        onClick: () => {
          // 打开行程选择器
          openTripSelector({
            onSelect: (tripId) => {
              // 重新发送请求
              sendAgentRequest({ ...request, trip_id: tripId });
            },
          });
        },
      },
      {
        label: '前往规划工作台',
        onClick: () => router.push('/planning-workbench'),
      },
    ],
  });
}
```

---

## 前端实现指南

### 1. 请求构建函数

```typescript
/**
 * 构建智能体请求
 */
function buildAgentRequest(
  message: string,
  entryPoint: 'trip_detail_page' | 'trip_list_page' | 'dashboard' | 'planning_workbench',
  tripId?: string,
  options?: {
    readonlyMode?: boolean;
    [key: string]: any;
  }
): RouteAndRunRequest {
  // 验证 trip_id（统一入口强制要求）
  if (!tripId && entryPoint !== 'planning_workbench') {
    throw new Error('智能体统一入口需要 trip_id');
  }

  return {
    request_id: generateUUID(),
    user_id: getCurrentUserId(),
    trip_id: tripId || null,
    message,
    options: {
      entry_point: entryPoint,
      readonly_mode: entryPoint === 'trip_detail_page' || entryPoint === 'trip_list_page',
      ...options,
    },
  };
}
```

### 2. 响应处理函数

```typescript
/**
 * 处理智能体响应
 */
async function handleAgentResponse(
  response: RouteAndRunResponse,
  router: any
): Promise<void> {
  // 处理重定向
  if (response.result.status === 'REDIRECT_REQUIRED') {
    const redirectInfo = response.result.payload.redirectInfo;
    if (redirectInfo?.redirect_to) {
      // 根据重定向原因显示不同的提示
      if (redirectInfo.redirect_reason === 'PLANNING_REQUEST_DETECTED') {
        showInfo({
          message: '行程规划功能已迁移到规划工作台',
          action: {
            label: '前往规划工作台',
            onClick: () => router.push(redirectInfo.redirect_to),
          },
        });
      } else if (redirectInfo.redirect_reason === 'READONLY_MODE_RESTRICTION') {
        showWarning({
          message: '行程详情页只支持查询操作',
          description: '如需修改行程，请前往规划工作台。',
          actions: [
            { label: '前往规划工作台', onClick: () => router.push(redirectInfo.redirect_to) },
            { label: '取消', onClick: () => {} },
          ],
        });
      } else {
        // 其他重定向原因，直接跳转
        router.push(redirectInfo.redirect_to);
      }
      return;
    }
  }

  // 处理错误
  if (response.result.status === 'FAILED') {
    const redirectInfo = response.result.payload.redirectInfo;
    if (redirectInfo?.redirect_reason === 'MISSING_TRIP_ID') {
      showError({
        message: '需要选择行程',
        description: response.result.answer_text,
        actions: [
          { label: '选择行程', onClick: () => openTripSelector() },
          { label: '前往规划工作台', onClick: () => router.push('/planning-workbench') },
        ],
      });
      return;
    }
    // 其他错误
    showError({ message: response.result.answer_text });
    return;
  }

  // 处理成功响应
  if (response.result.status === 'OK') {
    displayAnswer(response.result.answer_text, response.result.payload);
    return;
  }

  // 处理其他状态
  if (response.result.status === 'NEED_CONSENT') {
    showConsentDialog({
      message: response.result.answer_text,
      onConfirm: () => {
        // 重新发送请求，带上 consent
        resendRequest({ ...request, options: { ...request.options, allow_webbrowse: true } });
      },
    });
    return;
  }

  // 默认处理
  displayAnswer(response.result.answer_text);
}
```

### 3. 完整调用示例

```typescript
/**
 * 调用智能体统一入口
 */
async function callAgent(
  message: string,
  entryPoint: string,
  tripId?: string
): Promise<void> {
  try {
    // 1. 构建请求
    const request = buildAgentRequest(message, entryPoint, tripId);

    // 2. 发送请求
    const response = await fetch('/agent/route_and_run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: RouteAndRunResponse = await response.json();

    // 3. 处理响应
    await handleAgentResponse(data, router);
  } catch (error) {
    console.error('Agent request failed:', error);
    showError({ message: '请求失败，请稍后重试' });
  }
}
```

---

## 重定向原因说明

| 重定向原因 | 说明 | 前端处理 |
|-----------|------|---------|
| `MISSING_TRIP_ID` | 缺少 trip_id | 显示错误提示，引导用户选择行程或前往规划工作台 |
| `READONLY_MODE_RESTRICTION` | 只读模式限制 | 显示警告提示，引导用户前往规划工作台 |
| `PLANNING_REQUEST_DETECTED` | 检测到规划请求 | 自动跳转到规划工作台 |

---

## 注意事项

1. **trip_id 强制要求**：统一入口必须提供 `trip_id`，不能为空字符串
2. **入口来源标识**：建议始终传入 `entry_point`，便于后端进行权限控制
3. **只读模式**：行程详情页和行程列表页建议设置 `readonly_mode: true`
4. **错误处理**：所有错误响应都包含 `redirectInfo`，前端应该检查并处理
5. **重定向处理**：`REDIRECT_REQUIRED` 状态表示需要重定向，前端应该跳转到 `redirectInfo.redirect_to`

---

## 常见问题

### Q1: 为什么必须提供 trip_id？

A: 统一入口只为已创建行程提供运营服务，不处理新行程规划。规划新行程请使用规划工作台。

### Q2: 什么时候使用 readonly_mode？

A: 在行程详情页和行程列表页使用智能体入口时，建议设置 `readonly_mode: true`，限制为查询类操作。

### Q3: 如何区分查询和修改请求？

A: 后端会自动识别，如果只读模式下检测到修改请求，会返回 `REDIRECT_REQUIRED` 状态，前端应该引导用户前往规划工作台。

### Q4: 规划请求会被拦截吗？

A: 是的，如果检测到规划请求（无 `trip_id` 且包含规划关键词），会自动重定向到规划工作台。

---

**文档状态**: ✅ **完成，可供前端使用**
