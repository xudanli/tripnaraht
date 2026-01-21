# RL Training API 详细接口说明

## 用户前端接口详情

### POST `/product/feedback/track-action`
追踪用户操作（采纳/编辑/导出/放弃）

```typescript
// 请求
{
  request_id: string;
  trip_id?: string;
  action: 'ACCEPT' | 'EDIT' | 'EXPORT' | 'ABANDON';
  edit_details?: { field: string; old_value: any; new_value: any };
}

// 响应
{ success: true, data: { tracked: true, feedback_id: string } }
```

### POST `/product/feedback/collect`
收集用户显式反馈

```typescript
// 请求
{
  request_id: string;
  trip_id?: string;
  rating?: number;      // 1-5
  comment?: string;
  tags?: string[];
}

// 响应
{ success: true, data: { feedback_id: string } }
```

### POST `/product/explainable/generate`
生成决策解释

```typescript
// 请求
{
  decision_log: DecisionLogEntry[];
  evidence_refs: EvidenceRef[];
  model_version?: string;
  trace_id: string;
}

// 响应
{
  success: true,
  data: {
    summary: string;
    decision_process: { steps: [{ step_name, decision, reasoning, confidence }] };
    evidence_chain: [{ evidence_id, evidence_type, evidence_content, relevance }];
    visualization: { type: 'DECISION_TREE', data: { nodes, edges } }
  }
}
```

### POST `/enhancement/clarification-prompt`
生成澄清问题

```typescript
// 请求
{
  user_request: string;
  missing_info: string[];
  context?: Record<string, any>;
}

// 响应
{
  success: true,
  data: {
    prompt: string;
    questions: [{ field: string; question: string; options?: string[] }]
  }
}
```

### POST `/enhancement/risk-prompt`
生成风险提示

```typescript
// 请求
{
  risk_type: 'WEATHER' | 'ROAD' | 'HEALTH' | 'SAFETY';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  details: Record<string, any>;
}

// 响应
{
  success: true,
  data: {
    title: string;
    message: string;
    suggestions: string[];
    action_required: boolean;
    alternatives?: [{ description: string; confidence: number }]
  }
}
```

---

## 前端对接示例代码

### 用户反馈组件

```typescript
// 追踪用户操作
async function trackUserAction(action: 'ACCEPT' | 'EDIT' | 'ABANDON') {
  await fetch('/api/training/product/feedback/track-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: currentRequestId, action })
  });
}

// 收集评分
async function collectRating(rating: number, comment?: string) {
  await fetch('/api/training/product/feedback/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: currentRequestId, rating, comment })
  });
}
```

### 决策解释展示

```typescript
async function getExplanation(traceId: string) {
  const res = await fetch('/api/training/product/explainable/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision_log, evidence_refs, trace_id: traceId })
  });
  const { data } = await res.json();
  
  showSummary(data.summary);
  showDecisionSteps(data.decision_process.steps);
  showEvidenceChain(data.evidence_chain);
}
```

### 澄清问题处理

```typescript
async function handleClarification(missingInfo: string[]) {
  const res = await fetch('/api/training/enhancement/clarification-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_request: originalRequest, missing_info: missingInfo })
  });
  const { data } = await res.json();
  showClarificationDialog({ prompt: data.prompt, questions: data.questions });
}
```

### 风险提示展示

```typescript
async function showRiskAlert(risk: Risk) {
  const res = await fetch('/api/training/enhancement/risk-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ risk_type: risk.type, severity: risk.severity, details: risk.details })
  });
  const { data } = await res.json();
  showAlert({ title: data.title, message: data.message, suggestions: data.suggestions });
}
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |

---

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `RL_INTEGRATION_ENABLED` | 是否启用RL集成 | `true` |
| `TRAINING_SERVICE_URL` | 训练服务URL | `http://localhost:8001` |
| `POLICY_SERVICE_URL` | 策略服务URL | `http://localhost:8002` |
| `LLM_JUDGE_URL` | LLM Judge服务URL | `http://localhost:8003` |
