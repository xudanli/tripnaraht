# Planning Overview AI Policy（行程级 Copilot）

**pageId:** `PLANNING_OVERVIEW`  
**pageMode:** `PLANNING_OVERVIEW`  
**insightScope:** `TRIP`  
**contract:** `planning_overview@1.0`

## 定位

回答：**整个行程还缺什么，先处理什么？**

做全局总结与排序，**不**展开单个决策方案，**不**返回 `SELECT_OPTION` / `APPLY_CASE_OPTION`。

## 流程

```text
ClientPageState（pageMode + insightScope=TRIP）
  → PlanningOverviewPageContextBuilder
  → Gateway listProblems（队列 SSOT）
  → FeasibilityReportService.getReportFast
  → selectPlanningOverviewInsight
  → Narrative（统一系统提示 + 概览页提示）
  → NaraPageInsight（仅导航 / 顺序处理入口）
```

## 模式门禁

| 条件 | mode |
|------|------|
| 缺 pageMode / 队列不可用 | ATTENTION + `CONTEXT_MISSING` |
| 无 MUST_CONFIRM / 阻塞 / 重要选择 | **SILENT** |
| IMPORTANT_CHOICE 待处理 | **ATTENTION** |
| MUST_CONFIRM / 可行性阻塞 / gateExecute.blocked | **INTERVENTION** |

## 允许动作

- `OPEN_DECISION_CASE` → 决策空间 + problem ref  
- `START_SEQUENTIAL_PROCESSING` → `decision-queue:start:{problemId}`  
- `OPEN_READINESS_DETAIL` → `READINESS_REPORT`  
- `OPEN_DAY_EDITOR` → 当日编排（有 dayIds 时）

## 文案

- `summary` ≤ 55 汉字 → `advisorCopy.body`  
- `suggestion` ≤ 24 汉字 → `advisorCopy.advice`  
- 只讲 1 个优先项；不列方案细节

## 验收

1. 队列清空 → SILENT  
2. 车型未确认等重要项 → ATTENTION，建议「先确认车型」  
3. MUST_CONFIRM / 执行门禁阻塞 → INTERVENTION + 打开优先决策  

前端：导航到既有决策空间 / 准备度页，不在本页完成决策。
