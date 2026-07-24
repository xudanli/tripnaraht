# Decision Options · tradeoffs 字段契约

**日期：** 2026-07-02  
**消费方：** Plan Studio 决策空间 · `DecisionSpaceOptionCard`  
**相关端点：** `GET /api/trips/:tripId/decision-problems/:problemId/options`  
**后端投影：** `src/trips/decision-semantics/projections/decision-space-option-projection.util.ts`  
**联调 Handoff：** [FE_INTEGRATION_HANDOFF.md](./FE_INTEGRATION_HANDOFF.md)

---

## 1. 目标

决策空间方案卡需展示设计稿四格指标、路线预览、驾驶时长对比条、AI 支持度。其中 **四格指标与对比条依赖 BFF 返回结构化 `options[].tradeoffs[]`**；仅含 `explanation` 文案时前端会降级展示，但无法还原完整数值体验。

Legacy V1.5（`DecisionSemanticsService.getOptions`）与 Canonical L2（`bridgeCandidatesToOptions`）在返回前均经 **Decision Space 投影层** 补齐四格维度与 `routePreview`。

---

## 2. 响应形状（最小）

见 `decision-space-option-projection.util.spec.ts` 中 relocate_lodging fixture；与前端 `OPTIONS` 常量结构对齐。

---

## 3. 验收 curl

```bash
TRIP=3e4a1058-9218-467f-988a-c18008a14385
PROB=dp_id:coverage-gap:1
BASE=http://${BACKEND_HOST:-127.0.0.1}:${BACKEND_PORT:-3000}/api

curl -s "$BASE/trips/$TRIP/decision-problems/$PROB/options" | jq '
  .data.options[] | {
    id, title,
    route: .routePreview.placeNames,
    dims: [.tradeoffs[] | {dimension, direction, value, unit, hasExplanation: (.explanation != null)}]
  }'
```

**通过标准（P0 方案卡）：** 每个 option 至少含 2 条带 `value+unit` 的 tradeoff；驾驶类问题 `TIME` 行含 `explanation` 对比文案；住宿/改线类含 `routePreview.placeNames`。

---

## 4. 后端实现锚点

| 路径 | 投影入口 |
|------|----------|
| Legacy V1.5 | `DecisionSemanticsService.buildOptionsFromIssue` → `projectDecisionOptionsForSpaceView` |
| Canonical L2 | `bridgeCandidatesToOptions` → `projectDecisionOptionsForSpaceView` |
| 单测 Fixture | `decision-space-option-projection.util.spec.ts` |

完整字段说明见 Plan Studio 联调文档（前端 SSOT）。
