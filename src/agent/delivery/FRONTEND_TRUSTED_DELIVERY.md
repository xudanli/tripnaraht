# 前端可信交付面（Trusted Delivery）

> Schema：`tripnara.trusted_delivery@v1`  
> 路径：`response.result.payload.trusted_delivery_v1`  
> 总览：[AGENT_UNIFIED_INTERFACE_SCOPE.md](./AGENT_UNIFIED_INTERFACE_SCOPE.md)  
> 原则：**只读公共阶段与用户动作**，不要解析 / 展示 `research`、`poi_selection`、`KERNEL_*` 等内部节点名

---

## 1. 接哪条 API

| 场景 | 接口 |
|------|------|
| 短问答 / 轻量改稿 | `POST /api/agent/route_and_run`（同步） |
| 行程生成（推荐） | `POST /api/agent/route_and_run/async` → SSE + poll |
| 终态数据 | 同步响应本体，或 async `task/status` 的 `data`（同 `RouteAndRunResponseDto`） |

异步配合：[FRONTEND_ASYNC_TASK_LEASE.md](./FRONTEND_ASYNC_TASK_LEASE.md)

---

## 2. 先判 `delivery_verdict`，再判 `result.status`

P0-1 起，`trusted_delivery_v1.delivery_verdict` 是产品可感知交付态：

| `delivery_verdict` | 含义 | 前端硬约束 |
|--------------------|------|------------|
| `VERIFIED` | 验证收敛可展示为已验证方案 | 可进入 Confirm / Apply（仍须用户授权） |
| `VERIFIED_WITH_WARNINGS` | 有软警告 | Banner 警告；勿静默当完美方案 |
| `FLAWED_DRAFT` | 显式瑕疵草案 | **不得**显示为已验证；**不得** AUTO Apply；默认要求确认 |
| `BLOCKED` | 需澄清/确认/门控阻断 | 走澄清或确认流 |
| `FAILED` | 失败/超时 | 错误态 |

```ts
type ResultStatus =
  | 'OK'
  | 'NEED_MORE_INFO'
  | 'NEED_CONFIRMATION'
  | 'NEED_CONSENT'
  | 'FAILED'
  | 'TIMEOUT'
  | 'REDIRECT_REQUIRED';

const status = response.result.status;
const td = response.result.payload?.trusted_delivery_v1;
const verdict = td?.delivery_verdict;
const ui = response.result.payload?.ui_display;
const flawed = response.result.payload?.flawed_draft_v1;

if (verdict === 'FLAWED_DRAFT' || flawed?.is_flawed) {
  // 展示瑕疵 Banner；禁止当「已验证方案」；禁止静默 Apply
}
```

| `status` | 前端动作 |
|----------|----------|
| `OK` | 渲染行程 + `ui_display`；若 `td.flawed_disclosure.present` 仍要 Banner |
| `NEED_MORE_INFO` | 澄清卡（`answer_html` / clarification questions） |
| `NEED_CONFIRMATION` | 确认/协商 UI → `POST /api/agent/confirm_negotiation` |
| `NEED_CONSENT` | 授权流 |
| `FAILED` / `TIMEOUT` | 错误态；可读 `explain` / `td.degraded_explanation` |
| `REDIRECT_REQUIRED` | 跳转工作台等（payload 内 redirect） |

**不要**用内部 `current_step` / `decision_log.step` 驱动主 UI；进度文案用 `td.task_progress`。

---

## 3. 五面字段怎么用

```ts
interface TrustedDeliveryV1 {
  schemaId: 'tripnara.trusted_delivery@v1';
  version: 1;
  task_progress: {
    phase: 'understanding' | 'researching' | 'selecting_places' | 'checking_rules'
      | 'planning' | 'validating' | 'fixing' | 'narrating' | 'quality_check'
      | 'done' | 'blocked' | 'unknown';
    label_zh: string;   // 直接展示，如「调研中」
    percent?: number;
    message?: string;
  };
  user_confirm: {
    required: boolean;
    kind?: 'clarification' | 'confirmation' | 'consent';
    summary_zh?: string;
  };
  degraded_explanation: {
    present: boolean;
    summary_zh?: string;
    reasons_zh?: string[]; // 已是中文，可直接列表展示
  };
  flawed_disclosure: {
    present: boolean;
    headline_zh?: string;
    reason_codes?: string[];
  };
  ai_operation_log: Array<{
    label_zh: string;
    summary?: string;
    duration_ms?: number;
  }>;
}
```

| 字段 | UI 建议 |
|------|---------|
| `task_progress` | 进度条标题 = `label_zh`；可选 `percent`；异步过程中 SSE `message` 可叠加 |
| `user_confirm` | `required===true` 时置顶行动卡；`kind` 选澄清/确认组件 |
| `degraded_explanation` | `present` 时折叠「本次已降级」信息条，列 `reasons_zh` |
| `flawed_disclosure` | `present` 时瑕疵 Banner；详情仍读完整 `flawed_draft_v1`（见下） |
| `ai_operation_log` | 「AI 做了什么」时间线；只展示 `label_zh`，勿回显内部 step |

瑕疵详情仍以完整契约为准：[FRONTEND_FLAWED_DRAFT_DELIVERY.md](./FRONTEND_FLAWED_DRAFT_DELIVERY.md)

```ts
// 披露开关：可信面
if (td?.flawed_disclosure?.present) showFlawedBanner(td.flawed_disclosure.headline_zh);

// 详情：完整 flawed_draft_v1
const flawed = payload.flawed_draft_v1;
if (flawed?.is_flawed) showFlawedDetails(flawed.reasons);
```

---

## 4. 推荐页面叠放（SUCCESS / OK）

```
① flawed Banner（td.flawed_disclosure / flawed_draft_v1）
② degraded 信息条（可选折叠）
③ narration / answer_text
④ ui_display：dual_track / timeline / map / booking_*
⑤ ai_operation_log（可折叠「处理记录」）
```

进行中（async）：

```
进度条 ← td.task_progress.label_zh + SSE message
lease 状态 ← task_lease_v1（STALE/RESUMING 提示恢复中）
```

---

## 5. 最小接线示例

```ts
async function runPlanning(message: string) {
  // 长任务用 async；短问答可同步
  const { task_id } = await postJson('/api/agent/route_and_run/async', {
    message,
    user_id,
    trip_id, // 有则带上
    options: { async_mode: 'FORCE' },
  });

  subscribeSse(`/api/agent/task/stream/${task_id}`, (ev) => {
    // ev.message / progress → 更新进度文案
  });

  const final = await pollUntilDone(`/api/agent/task/status/${task_id}`);
  const res = final.data as RouteAndRunResponseDto;
  const td = res.result.payload?.trusted_delivery_v1;

  switch (res.result.status) {
    case 'OK':
      if (td?.flawed_disclosure?.present) showFlawedBanner(td);
      if (td?.degraded_explanation?.present) showDegraded(td.degraded_explanation);
      renderItinerary(res.result.payload);
      renderOpLog(td?.ai_operation_log);
      break;
    case 'NEED_MORE_INFO':
    case 'NEED_CONFIRMATION':
      showConfirmCard(td?.user_confirm, res.result);
      break;
    default:
      showError(res.result.answer_text, td?.degraded_explanation);
  }
}
```

---

## 6. 明确不要做

| 不要 | 原因 |
|------|------|
| 解析 `decision_log.step` / `observability.agent_run_trace_v1.nodes[].step` 当主进度 | 内部节点名会变；用 `task_progress` |
| 从 Markdown 正文猜「是否瑕疵」 | 以 `flawed_draft_v1` / `flawed_disclosure` 为准 |
| 把 `OK` 当完全可执行终态 | 可能仍是瑕疵草案 |
| 展示 `KERNEL_LEGACY_FALLBACK` 等内部码 | `degraded_explanation.reasons_zh` 已是用户文案 |

---

## 7. 相关文档

- [FRONTEND_FLAWED_DRAFT_DELIVERY.md](./FRONTEND_FLAWED_DRAFT_DELIVERY.md)
- [FRONTEND_ASYNC_TASK_LEASE.md](./FRONTEND_ASYNC_TASK_LEASE.md)
- [FRONTEND_BOOKING_DELIVERY.md](./FRONTEND_BOOKING_DELIVERY.md)
- [AGENT_UNIFIED_INTERFACE_SCOPE.md](./AGENT_UNIFIED_INTERFACE_SCOPE.md)
