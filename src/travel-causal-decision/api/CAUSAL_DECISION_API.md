# Causal Decision Product API（BFF）

**Schema：** `tripnara.causal_decision_product@v1`  
**原则：** 前端只依赖本契约；不要解析 Canonical Trace / Gateway 内部字段。

底层仍调用现有 Gateway + Trace，不复制决策逻辑。

---

## Routes

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/trips/:tripId/causal-decisions` | 列表（仅含 `travelCausalDecision` 的问题） |
| `GET` | `/trips/:tripId/causal-decisions/:decisionId` | 详情（产品视图） |
| `POST` | `/trips/:tripId/causal-decisions/:decisionId/select` | 选择方案 |
| `POST` | `/trips/:tripId/causal-decisions/:decisionId/apply` | 应用方案 |
| `GET` | `/trips/:tripId/causal-decisions/:decisionId/outcome` | 对账状态 |

`decisionId` 可为 `dec_<problemId>` 或原始 `problemId`。

鉴权与 Unified Decision / Page Insight 一致：`@Public()` + trip member assert。

---

## Product view（节选）

```ts
{
  schema: 'tripnara.causal_decision_product@v1',
  decisionId, tripId, problemId,
  headline,                 // 单根因标题
  actByLabel,               // 「最晚需要在 HH:MM 前决定」
  interventionDeadline,
  card,                     // CausalDecisionCardView
  decision,                 // TravelCausalDecision（完整，可选渲染）
  lifecycleStatus,          // OPEN | SELECTED | APPLIED | AWAITING_OBSERVATION | RECONCILED | STALE
  outcome?,
  statusMessage?,           // Apply 后：「方案已应用，等待实际到达或签到结果」——禁止「预测已验证」
  contextHash, ruleVersion, modelVersion,
  generatedAt
}
```

---

## Select / Apply

**Select body**

```json
{ "optionId": "opt_depart_30min_earlier", "idempotencyKey?: "...", "reason?: "..." }
```

- 若 `optionId` 是 Gateway `actionId` → `submitResolution`
- 否则若存在 causal Trace → 仅 `bindSelected`（产品级选择；Apply 仍需 Gateway 可执行 action）

**Apply body**

```json
{ "optionId?: "..." }   // 可选；无 resolution 时先 select
```

- 调用 Gateway `applyResolution`
- Apply **不等于** outcome `CONFIRMED`；无观测保持 `PENDING` / `UNOBSERVABLE`

---

## 与 Copilot Insight 的关系

- Page Insight 仍可通过 `causalDecisionCard` 渲染同结构卡
- 写入（select/apply）优先走本 BFF，避免 FE 拼 Trace 路径
- Preview 比较方案可继续打开 Decision Space（现有 `PREVIEW` action）

实现：`CausalDecisionController` + `CausalDecisionProductService`（`decision-runtime/gateway`）
