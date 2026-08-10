# 瑕疵草案交付层 — 前端集成指南（P1.1）

> 适用接口：`POST /api/agent/route_and_run`（`result.status === 'SUCCESS'` 且未完全收敛）  
> 总览：[AGENT_UNIFIED_INTERFACE_SCOPE.md](./AGENT_UNIFIED_INTERFACE_SCOPE.md)  
> 数据路径：`response.result.payload.flawed_draft_v1` · `response.explain.flawed_draft_v1`（同源只读镜像）  
> 原则：**SUCCESS 不等于完全 VERIFIED** — `is_flawed=true` 时必须显式 Banner，不可当作可一键执行的终态行程。

---

## 1. 何时会出现

| 场景 | 后端行为 | 前端须做 |
|------|----------|----------|
| 默认（`allow_flawed_draft_narrate` 未设） | REPAIR/效用预算耗尽 → **澄清终端**，通常无 SUCCESS 草案 | 走 clarification / actionExecution |
| `options.allow_flawed_draft_narrate: true` | 继续 NARRATE → SUCCESS + `flawed_draft_v1` | **必须**展示瑕疵 Banner |
| **禁止矩阵**（即使 opt-in） | HARD `SAFETY` / `REACHABILITY`/`DEM` / 核心交通 / 硬时间窗 / access blocked | **仍走澄清**；不得瑕疵 SUCCESS |

禁止矩阵 SSOT：`src/agent/orchestration/flawed-draft-allow-matrix.constants.ts`。

| `allow_partial` 降级 | 日期等硬缺口放宽 | Banner + 补充确认 CTA |
| GATE `ADJUST_REQUIRED` / 未消解 VERIFY | 草案仍交付但带 reason | Banner + explain 面板 |

请求开关（同步 / 异步快照均有效）：

```typescript
await postRouteAndRun({
  message: '…',
  options: {
    allow_flawed_draft_narrate: true, // 显式 opt-in
  },
});
```

---

## 2. 读取路径

```typescript
const payload = response.result?.payload;
const flawed = payload?.flawed_draft_v1 ?? response.explain?.flawed_draft_v1;

if (flawed?.is_flawed) {
  // 展示 Banner — 见 §3
}
```

**不要**从 `narration.user_friendly_summary` 推断是否瑕疵；正文可能仍是积极语气，契约以 `flawed_draft_v1` 为准。

---

## 3. 页面布局建议

```
┌─────────────────────────────────────────┐
│ ⚠️ flawed_draft Banner（全宽置顶）       │  ← headline_zh + reasons[0]
│    [查看详情] [人工确认 / 继续调整]        │  ← user_action_recommended
├─────────────────────────────────────────┤
│ narration.user_friendly_summary          │
├─────────────────────────────────────────┤
│ dual_track_itinerary / 行程时间轴        │  ← 可展示但须带「草案」水印或标签
├─────────────────────────────────────────┤
│ booking_cart / booking_priority_list     │  ← 见 FRONTEND_BOOKING_DELIVERY.md
└─────────────────────────────────────────┘
```

Banner 文案优先读：

1. `headline_zh`（无则 fallback：`当前行程为瑕疵草案…`）
2. 折叠详情：`reasons[].detail_zh`
3. 调试：`repair_count` / `max_repair_count` · `gate_status` · `unresolved_verification_codes`

---

## 4. TypeScript 契约

```typescript
type FlawedDraftReasonCode =
  | 'REPAIR_BUDGET_EXCEEDED'
  | 'GATE_ADJUST_REQUIRED'
  | 'UNRESOLVED_VERIFICATION'
  | 'VERIFY_PARTIAL'
  | 'UTILITY_DECAY_BYPASSED'
  | 'ALLOW_PARTIAL_GATE_RELAXED';

interface FlawedDraftDescriptorV1 {
  schemaId: 'tripnara.flawed_draft@v1';
  version: 1;
  is_flawed: boolean;
  reasons: Array<{ code: FlawedDraftReasonCode; detail_zh?: string; detail_en?: string }>;
  repair_count?: number;
  max_repair_count?: number;
  gate_status?: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
  unresolved_verification_codes?: string[];
  user_action_recommended: boolean;
  headline_zh?: string;
  headline_en?: string;
}
```

---

## 5. 交互与 actionExecution

| 字段 | 建议 |
|------|------|
| `user_action_recommended === true` | 主 CTA：**「确认并继续调整」** 或复用现有 clarification 流 |
| `gate_status === 'ADJUST_REQUIRED'` | 次要 CTA 跳转 explain / 约束面板 |
| `unresolved_verification_codes` | explain 面板列出，与 `explain.failure_reason_codes` 对照 |

**禁止**在 `is_flawed=true` 时：

- 隐藏 Banner 仍展示「已验证」绿色勾
- 直接触发 `booking_cart/apply` checkout 而不二次确认
- 将瑕疵草案写入「我的已定稿行程」持久层（除非用户显式确认）

异步任务：`GET /api/agent/task/status/:taskId` 成功后的 `data` 即为完整 `RouteAndRunResponseDto`，同样读 `data.result.payload.flawed_draft_v1`。

---

## 6. reason code 速查

| code | 用户可读摘要（zh） |
|------|-------------------|
| `REPAIR_BUDGET_EXCEEDED` | 自动修复次数已达上限，部分冲突可能仍在 |
| `UTILITY_DECAY_BYPASSED` | 修复后方案质量连续下降，已按您的设置仍交付草案 |
| `GATE_ADJUST_REQUIRED` | 部分约束尚未满足，需您确认或调整 |
| `UNRESOLVED_VERIFICATION` | VERIFY 仍剩 **CONFLICT** 未消解（纯 ADVISORY 不标瑕疵，见 `VERIFIED_WITH_WARNINGS`） |
| `VERIFY_PARTIAL` | 门控/验证仍有关联违规摘要 |
| `ALLOW_PARTIAL_GATE_RELAXED` | 为补全草案已临时放宽日期等硬条件 |

---

## 7. Checklist

- [ ] SUCCESS 渲染路径先判断 `flawed_draft_v1?.is_flawed`
- [ ] Banner 置于 narration / 行程之上（高于 booking_priority_list 或与 P0 安全类并列由产品定）
- [ ] explain 面板与 Banner 共用同一 `reasons` 数据源
- [ ] checkout / 一键预订前若 `is_flawed` 弹确认
- [ ] 异步 RESULT：`task/status` 的 `data` 与同步响应同一套字段

相关文档：[FRONTEND_BOOKING_DELIVERY.md](./FRONTEND_BOOKING_DELIVERY.md) · [FRONTEND_ASYNC_TASK_LEASE.md](./FRONTEND_ASYNC_TASK_LEASE.md)
