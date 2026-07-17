# NaraPageInsightCard — 跨页前端 Surface

本仓库无 React / iOS 工程。Web / iOS 按本契约渲染。**同一张卡**服务决策空间与活动编辑等页；差异由 `pageId` / `pageMode` / `insightScope` 与各自 `PageAIContract` 决定。

**数据来源（任选其一）：**

1. **推荐（Pilot 写入 + 读）** — Causal Decision BFF：[`../../travel-causal-decision/api/CAUSAL_DECISION_API.md`](../../travel-causal-decision/api/CAUSAL_DECISION_API.md)
2. Copilot 只读 — `POST .../copilot/page-insights:evaluate` → `insight` / `advisorCopy`
3. Decision Space 详情 — `problem.travelCausalDecision` / `problem.causalDecisionCard`

**Client（TS 参考）：** [`dto/frontend-page-insight-api-client.ts`](./dto/frontend-page-insight-api-client.ts)  
**活动编辑：** [`ACTIVITY_EDITOR_AI_POLICY.md`](./ACTIVITY_EDITOR_AI_POLICY.md)（summary≤45 / suggestion≤22）  
**Case AI 策略：** [`DECISION_CASE_AI_POLICY.md`](./DECISION_CASE_AI_POLICY.md)（`uiGroup` 管打扰 / `semanticKey` 管上下文）  
**通用冲突（午餐等）：** [`GENERIC_CONFLICT_AI_POLICY.md`](./GENERIC_CONFLICT_AI_POLICY.md)  
**iOS 完整 Checklist：** [`DECISION_SPACE_IOS_HANDOFF.md` §19](../../decision-runtime/decision-cases/DECISION_SPACE_IOS_HANDOFF.md)

## 原则

- 只根据结构化字段渲染，**不解析 Markdown**
- 按钮行为只读 `actions[]` 的 `kind` / `actionType` / `payloadRef`（Insight）或 BFF `optionId`（写入）
- Decision `PREVIEW` → `resolveDecisionPreviewFromPayloadRef`
- 活动 `PREVIEW_ADD_ACTIVITY` → `resolvePlanProposalFromPayloadRef`（arrange-itinerary proposal）
- `mode: SILENT` → 只显示轻量「问 Nara」入口，不展示卡片正文
- **有 `advisorCopy` 时：只渲染标题 / 说明 / 建议**（顾问短文），**禁止**再铺 `observation` + `impacts` + `causalDecisionCard`（会与详情页同文）
- 无 `advisorCopy` 且存在 `causalDecisionCard` / BFF `card` 时，才按决策卡结构渲染
- `modeReason=CONTEXT_MISSING`：展示缺什么上下文；**不要**让模型文案伪装成在查行程
- Apply 后文案用 `statusMessage`：**「等待实际到达」**，禁止「预测已验证」

## 顾问短卡（有 advisorCopy — 默认 Insight 黄条）

后端按 Nara 顾问提示词生成。决策空间：标题≤12 / 说明≤40 / 建议≤24。活动编辑：说明≤45 / 建议≤22。

**推荐标题（FE）：** 直接用 `insight.title` / `advisorCopy.title`（状态语句，如「Day 4 规划不完整」）  
不要再套固定前缀 `Copilot 建议：`。按钮只渲染 `insight.actions[]`，不要每个状态都放「查看草案｜补空档｜问 Nara」。

```
Nara 判断：{advisorCopy.title}
{advisorCopy.body}           ← 行程事实 + 推荐原因
{advisorCopy.advice}         ← 失效条件 / 明确建议

[比较方案] / [预览加入]       ← actions[]
```

**车型示例（不含 F-road）：**

```
Nara 判断：两驱已满足当前路线
当前路线不含 F-road，两驱小型车即可通行且成本更低。
加入高地路线后需重新选车
[比较方案]
```

兼容降级（旧客户端）：`title` / `observation.summary` / `recommendation.summary` 已写入同一三行文案；`impacts` 在顾问路径为空；`causalDecisionCard` 在顾问路径不下发。

`modeReason=CONTEXT_MISSING`（车型 / 保险）：展示「还无法判断…」+ 完善路线/车辆引导；**不要**让模型文案伪装成在查行程。查因：`evaluation.vehicleContextGate` / `insuranceContextGate`。

## Pilot 决策卡（完整接线）

> 仅用于**无** `advisorCopy` 的降级，或 Causal Decision BFF 主表面（非黄条复读）。

```
{headline}                            ← BFF.headline / card.whatHappened
{actByLabel}                          ← 「最晚需要在 … 前决定」

为什么影响行程
{card.whyItMatters[]}                 ← 链，非图

什么都不做
{card.doNothing}
  ETA / 失约概率 / 损失（来自 decision.baselineOutcome）

推荐方案
{card.recommendation.title}
{card.recommendation.summary}
{card.recommendation.rationale[]}

已验证检查
{card.verifiedChecks[].label}         ← status=PASS 才展示勾

[预览] [采纳推荐] [其他方案] [暂不处理]
```

### 按钮行为（Pilot）

| 按钮 | 行为 |
|------|------|
| 预览 | Insight `PREVIEW` → Decision Space detail；或打开 interventions 对比 |
| 采纳推荐 | `POST .../causal-decisions/:id/select`（`optionId` = recommendation）→ `POST .../apply` |
| 其他方案 | 展开 `decision.interventions`；选中后同样 select → apply |
| 暂不处理 | select `opt_do_nothing`（若存在）或 defer / 关闭卡片，不上报 CONFIRMED |

### Apply 之后

```
{statusMessage}   // 「方案已应用，等待实际到达或签到结果」
lifecycleStatus = AWAITING_OBSERVATION
```

轮询 `GET .../causal-decisions/:id/outcome`；仅当 `reconciliation` ∈ {CONFIRMED, PARTIAL, DISPROVED} 时展示对账结果。

## 推荐结构（无 advisorCopy、无 causalDecisionCard）

```
Nara 对当前决策的判断          ← title（mode ≠ SILENT）

发生了什么
{observation.summary}

影响
{impacts[].dimension} · {impacts[].summary}

推荐
{recommendation.summary}
{recommendation.rationale}

[比较方案]                     ← actions[]
```

## 因果决策卡（有 causalDecisionCard、无 advisorCopy 时）

来自 `TravelCausalDecision` 投影；字段齐全时前端应渲染为：

```
发生了什么
{causalDecisionCard.whatHappened}

为什么影响行程
{causalDecisionCard.whyItMatters[]}   ← 逐步链，非图

最晚处理时间
{causalDecisionCard.latestActBy / interventionDeadline}

什么都不做
{causalDecisionCard.doNothing}

推荐方案
{causalDecisionCard.recommendation.title}
{causalDecisionCard.recommendation.summary}
{causalDecisionCard.recommendation.rationale[]}

已验证
{causalDecisionCard.verifiedChecks[].label}  （status=PASS）

[比较方案]                     ← 仍用 insight.actions[]；写入改走 BFF
```

Decision Space 问题详情同样暴露：

- `problem.travelCausalDecision`
- `problem.causalDecisionCard`

## mode → UI

| mode | 行为 |
|------|------|
| `SILENT` | 右下角 / Rail 折叠入口；点击带 `forceRefresh: true` 再 evaluate |
| `ATTENTION` | 轻提示条，点击展开（**仅列表态**；详情页默认不主动出黄卡） |
| `INTERVENTION` | 默认展开（阻塞 / 安全；**详情页仍抑制**，避免与「必须确认」叠床架屋） |

**详情页怪现象修复：** 已选中某条 Decision 时 surface=`DETAIL` → 默认 SILENT；去掉「打开决策空间 / 查看决策详情」死循环按钮；顾问短卡不复读问题摘要 / 因果卡全文。

`CONSTRAINT_WRITEBACK` 是 `writeChain` 技术枚举，**不要**在产品 UI 直接展示（iOS 应用 `uiGroupLabelZh`）。

## Preview 接线

```ts
for (const action of insight.actions) {
  if (action.kind === 'PREVIEW') {
    const target = resolveDecisionPreviewFromPayloadRef(tripId, action.payloadRef);
    // open Decision Space detail / bundle with target.problemId
  }
  if (action.kind === 'NAVIGATION' && action.target.pageId === 'DECISION_SPACE') {
    // focus entityRef
  }
}
```

点 Preview 后上报 feedback：`ACTION_PREVIEWED` + `actionRef: payloadRef`。

## P0 / Pilot 不做

- 根据文案猜按钮
- 复制一套 Options / Validate / Confirm（写入走 BFF 或现有 Decision write UI）
- 在前端绘制原始因果图
- Apply 后展示「预测已验证」
- 把详情页 `causalDecisionCard` 再原样铺进 Insight 黄条
