# Activity Editor AI Policy（对象级 Copilot）

**pageId:** `ACTIVITY_EDITOR`  
**pageMode:** `ACTIVITY_EDITOR`  
**insightScope:** `ACTIVITY`  
**contract:** `activity_editor@1.0`

## 定位

回答：**加入/修改这个活动，会影响什么？**

上下文：单活动 + 目标日期 + 当日安排 + Draft Delta + arrange-itinerary proposal 验证结果。

## 流程

```text
选择活动 + 目标日引用
  → ClientPageState（pageMode + insightScope + selectedRefs）
  → ActivityEditorPageContextBuilder
  → PlanProposalBuilderService.buildCreateItemProposal（不写库）
  → selectActivityEditorInsight（确定性 mode）
  → Narrative（统一系统提示 + 活动页提示）
  → advisorOutputValidator
  → NaraPageInsight（advisorCopy + PREVIEW_ADD_ACTIVITY）
```

## 模式门禁

| Proposal validation | 实质影响 | mode | 推荐 |
|---------------------|----------|------|------|
| 缺活动/日 / pageMode | — | ATTENTION + `CONTEXT_MISSING` | 否 |
| 无 proposal | — | ATTENTION + `NO_VALIDATED_RECOMMENDATION` | 否，仅「请先比较方案影响」 |
| `PASS` 且无实质影响 | 无 | **SILENT** | 不主动出卡 |
| `WARN` 或 medium/high impact | 有 | **ATTENTION** | 仅来自已验证 proposal |
| `BLOCK` | 不可行 | **INTERVENTION** | **不得**推荐未验证日/动作 |

## 允许动作

- `PREVIEW_ADD_ACTIVITY` → `payloadRef: plan-proposal:{id}`
- `COMPARE_TARGET_DAYS` / `REPLACE_ACTIVITY` / `ADJUST_DURATION` / `OPEN_DECISION`（合同声明；本刀主路径为 PREVIEW_ADD_ACTIVITY）

禁止：`APPLY_ACTIVITY`、`CONFIRM_BOOKING`、静默写行程。

## 文案

- `summary` ≤ 45 汉字 → `advisorCopy.body`
- `suggestion` ≤ 22 汉字 → `advisorCopy.advice`
- 不介绍活动是否热门；不复述页面标题

## 验收案例

1. **可直接加入：** PASS + 无实质影响 → SILENT  
2. **可加入但有影响：** WARN / material → ATTENTION + 预览动作  
3. **时间窗/准入不可行：** BLOCK → INTERVENTION，无未验证推荐  

前端打开预览：`resolvePlanProposalFromPayloadRef` → arrange-itinerary proposal / decision-inspector。
