# 智能体相关接口总结

## 核心接口

### `/api/agent` - 智能体统一入口

智能体模块只有一个**统一入口接口**，采用语义路由架构，根据用户输入自动路由到不同的处理系统。

---

## 主要接口

### 1. `POST /api/agent/route_and_run`

**智能体统一入口 - 路由并执行**

#### 功能说明

根据用户输入自动路由到 System 1（快速路径）或 System 2（ReAct 循环），并执行相应的处理流程。

#### 路由系统

**System 1（快速路径）** - < 3秒
- `SYSTEM1_API`: 标准 API / CRUD / 简单查询
- `SYSTEM1_RAG`: 知识库/向量检索

**System 2（慢速路径）** - < 60秒
- `SYSTEM2_REASONING`: ReAct + 工具 + TravelPlanner/Critic
- `SYSTEM2_WEBBROWSE`: 无头浏览器兜底（仅授权后）

#### 路由策略

- **硬规则短路**：支付/退款/浏览器 → System2 + consent_required
- **明确 CRUD** → System1_API
- **单纯事实查询** → System1_RAG
- **规划/多约束/无 API** → System2_REASONING

#### 请求参数

```typescript
{
  request_id: string;           // 请求唯一标识符
  user_id: string;              // 用户 ID
  trip_id?: string | null;      // 关联的行程 ID（可选）
  message: string;              // 用户输入的自然语言消息
  conversation_context?: {      // 对话上下文（可选）
    recent_messages?: string[]; // 最近的对话消息历史
    locale?: string;            // 用户语言环境，如 'zh-CN'
    timezone?: string;          // 用户时区，如 'Asia/Shanghai'
  };
  options?: {                   // 执行选项（可选）
    dry_run?: boolean;          // 是否仅执行 dry-run（不实际执行操作）
    allow_webbrowse?: boolean;  // 是否允许使用浏览器（需要用户授权）
    max_seconds?: number;       // System 2 最大执行时间（秒），默认 60
    max_steps?: number;         // System 2 最大执行步数，默认 8
    max_browser_steps?: number; // 浏览器操作最大步数，默认 12
    cost_budget_usd?: number;   // 成本预算（美元），如 0.20
  };
}
```

#### 响应结构

```typescript
{
  request_id: string;           // 请求 ID（与请求中的相同）
  
  route: {                      // 路由决策信息
    route: string;              // 路由类型：SYSTEM1_API | SYSTEM1_RAG | SYSTEM2_REASONING | SYSTEM2_WEBBROWSE
    confidence: number;         // 置信度（0-1），如 0.85
    reasons: string[];          // 路由原因，如 ['MULTI_CONSTRAINT']
    required_capabilities: string[]; // 所需能力，如 ['places', 'transport']
    consent_required: boolean;  // 是否需要用户授权
    budget: {                   // 执行预算
      max_seconds: number;      // 最大执行时间（秒）
      max_steps: number;        // 最大执行步数
      max_browser_steps: number; // 最大浏览器操作步数
    };
    ui_hint: {                  // UI 提示信息
      mode: 'fast' | 'slow';    // 模式：快速或慢速
      status: string;           // 状态：thinking | browsing | verifying | repairing | awaiting_consent | awaiting_confirmation | done | failed
      message: string;          // 提示消息，如 '查询完成'
    };
  };
  
  result: {                     // 执行结果
    status: string;             // 状态：OK | NEED_MORE_INFO | NEED_CONSENT | NEED_CONFIRMATION | FAILED | TIMEOUT
    answer_text: string;        // 处理结果的自然语言描述
    payload: {                  // 载荷数据
      timeline: any[];          // 时间线
      dropped_items: any[];     // 被丢弃的项
      candidates: any[];        // 候选结果
      evidence: any[];          // 证据
      robustness: any;          // 稳健度评估
    };
  };
  
  explain: {                    // 决策解释（决策日志）
    decision_log: any[];        // 决策日志数组
  };
  
  observability: {              // 可观测性指标
    latency_ms: number;         // 总延迟（毫秒）
    router_ms: number;          // 路由决策耗时（毫秒）
    system_mode: 'SYSTEM1' | 'SYSTEM2'; // 系统模式
    tool_calls: number;         // 工具调用次数
    browser_steps: number;      // 浏览器操作步数
    tokens_est: number;         // 预估 token 数量
    cost_est_usd: number;       // 预估成本（美元）
    fallback_used: boolean;     // 是否使用了 fallback
  };
}
```

#### 请求示例

**示例 1: 简单查询**
```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "推荐新宿拉面"
}
```

**示例 2: 规划请求**
```json
{
  "request_id": "req-002",
  "user_id": "user-123",
  "message": "规划5天东京游，包含浅草寺、东京塔、新宿",
  "options": {
    "max_seconds": 60,
    "max_steps": 8
  }
}
```

**示例 3: 条件分支**
```json
{
  "request_id": "req-003",
  "user_id": "user-123",
  "message": "如果赶不上日落就改去横滨",
  "options": {
    "max_seconds": 30,
    "max_steps": 5
  }
}
```

#### 响应示例

**System 1 快速响应**
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
      "max_seconds": 3,
      "max_steps": 1,
      "max_browser_steps": 0
    },
    "ui_hint": {
      "mode": "fast",
      "status": "done",
      "message": "查询完成"
    }
  },
  "result": {
    "status": "OK",
    "answer_text": "我为您推荐以下新宿拉面店：\n1. 一蘭拉面（新宿店）\n2. 博多一風堂（新宿店）...",
    "payload": {
      "timeline": [],
      "dropped_items": [],
      "candidates": [],
      "evidence": [],
      "robustness": null
    }
  },
  "explain": {
    "decision_log": [
      {
        "step": 0,
        "chosen_action": "places.search",
        "reason_code": "SIMPLE_QUERY",
        "facts": {},
        "policy_id": "FACTS_FIRST"
      }
    ]
  },
  "observability": {
    "latency_ms": 234,
    "router_ms": 2,
    "system_mode": "SYSTEM1",
    "tool_calls": 1,
    "browser_steps": 0,
    "tokens_est": 0,
    "cost_est_usd": 0.001,
    "fallback_used": false
  }
}
```

**System 2 深度思考响应**
```json
{
  "request_id": "req-002",
  "route": {
    "route": "SYSTEM2_REASONING",
    "confidence": 0.88,
    "reasons": ["MULTI_CONSTRAINT", "PLANNING_REQUIRED"],
    "required_capabilities": ["places", "transport", "itinerary"],
    "consent_required": false,
    "budget": {
      "max_seconds": 60,
      "max_steps": 8,
      "max_browser_steps": 0
    },
    "ui_hint": {
      "mode": "slow",
      "status": "done",
      "message": "行程规划完成"
    }
  },
  "result": {
    "status": "OK",
    "answer_text": "我为您规划了5天东京行程，包含浅草寺、东京塔、新宿等景点...",
    "payload": {
      "timeline": [...],
      "dropped_items": [],
      "candidates": [...],
      "evidence": [...],
      "robustness": {...}
    }
  },
  "explain": {
    "decision_log": [
      {
        "step": 0,
        "chosen_action": "places.resolve_entities",
        "reason_code": "MISSING_POI_FACTS"
      },
      {
        "step": 1,
        "chosen_action": "itinerary.generate",
        "reason_code": "PLANNING_REQUIRED"
      }
    ]
  },
  "observability": {
    "latency_ms": 1234,
    "router_ms": 45,
    "system_mode": "SYSTEM2",
    "tool_calls": 5,
    "browser_steps": 0,
    "tokens_est": 5000,
    "cost_est_usd": 0.15,
    "fallback_used": false
  }
}
```

---

## 相关接口模块

虽然智能体模块本身只有一个统一入口，但它会调用其他模块的接口来完成任务。以下是智能体可能使用的相关接口：

### 📋 决策层接口 (`/api/decision`)

智能体的 System 2 路径会使用决策层的能力：

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/decision/validate-safety` | 安全规则校验行程（Abu 策略） |
| `POST` | `/api/decision/adjust-pacing` | 行程节奏智能调整（Dr.Dre 策略） |
| `GET` | `/api/decision/logs` | 获取决策日志 |
| `GET` | `/api/decision/stats` | 获取决策统计信息 |

### 📍 行程管理接口 (`/api/trips`)

智能体可以通过 Actions 调用行程相关接口：
- `POST /api/trips` - 创建行程
- `GET /api/trips/:id` - 获取行程
- `PUT /api/trips/:id` - 更新行程
- `POST /api/trips/draft` - 生成行程草案

### 🔍 地点查询接口 (`/api/places`)

智能体可以查询地点信息：
- `GET /api/places` - 搜索地点
- `GET /api/places/:id` - 获取地点详情

### 🚗 交通规划接口 (`/api/transport`)

智能体可以规划交通路线：
- `POST /api/transport/plan` - 规划交通路线

### 🧠 RAG 接口 (`/api/rag`)

System 1 的 RAG 路径会使用：
- 文档检索接口
- 合规规则提取接口

---

## 架构特点

### 1. 统一入口设计

所有智能体请求都通过 `POST /api/agent/route_and_run` 统一入口，简化前端调用。

### 2. 智能路由

根据用户输入的语义，自动选择最合适的处理路径：
- **简单查询** → System 1（快速）
- **复杂规划** → System 2（深度思考）

### 3. 双系统架构

- **System 1**：快速响应，适合简单查询和 CRUD 操作
- **System 2**：深度思考，适合复杂规划和多步骤任务

### 4. 可观测性

返回详细的执行指标：
- 延迟时间
- 工具调用次数
- 成本估算
- 决策日志

### 5. 用户控制

支持用户控制执行参数：
- 最大执行时间
- 最大执行步数
- 成本预算
- 浏览器操作授权

---

## 使用场景

### 场景 1: 简单查询

```
用户: "推荐新宿拉面"
→ 路由到 SYSTEM1_API
→ 调用 places.search
→ 快速返回结果（< 3秒）
```

### 场景 2: 复杂规划

```
用户: "规划5天东京游，包含浅草寺、东京塔、新宿"
→ 路由到 SYSTEM2_REASONING
→ ReAct 循环：
  1. Plan: 选择 places.resolve_entities
  2. Act: 执行地点实体解析
  3. Observe: 收集地点信息
  4. Plan: 选择 itinerary.generate
  5. Act: 生成行程
  6. Critic: 检查可行性
  7. Repair: 修复问题（如需要）
→ 返回完整行程（< 60秒）
```

### 场景 3: 需要授权

```
用户: "查询最新的酒店价格"
→ 路由到 SYSTEM2_WEBBROWSE
→ 检测到需要浏览器操作
→ 返回 status: AWAITING_CONSENT
→ 前端显示授权弹窗
→ 用户授权后继续执行
```

---

## 总结

智能体模块采用**统一入口设计**，只有一个核心接口：

- **`POST /api/agent/route_and_run`** - 智能体统一入口

通过语义路由，自动选择最合适的处理路径（System 1 或 System 2），并返回详细的执行结果和可观测性指标。

这种设计的优势：
- ✅ 前端调用简单（只需一个接口）
- ✅ 后端路由智能（自动选择最佳路径）
- ✅ 可观测性强（详细的执行指标）
- ✅ 用户可控（支持参数配置和授权）
