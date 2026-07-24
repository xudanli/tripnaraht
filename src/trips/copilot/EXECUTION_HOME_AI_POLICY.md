# Execution Home AI Policy（行中实时 Copilot）

**pageId:** `EXECUTION_HOME`  
**pageMode:** `EXECUTION_HOME`  
**insightScope:** `EXECUTION`  
**contract:** `execution_home@1.0`

## 定位

回答：**现在还能否按计划继续，以及最晚何时必须行动？**

只讲安全 / 可执行性 / 时间窗 / 必须确认。**不**推荐体验优化。

## 流程

```text
ClientPageState（pageMode + insightScope=EXECUTION + lifecycle=TRAVELING）
  → ExecutionHomePageContextBuilder
  → Prisma delay / next activity
  →（可选）ExecutionAdvisory + ActiveRiskAggregation + Gateway 队列
  → selectExecutionHomeInsight
  → Narrative（统一系统提示 + 执行首页提示）
  → NaraPageInsight
```

## 模式门禁

| 条件 | mode |
|------|------|
| 缺 pageMode / insightScope / 非 TRAVELING | ATTENTION + `CONTEXT_MISSING` |
| severity=CLEAR 且非强制刷新 | **SILENT**（`EXEC_ON_TRACK`） |
| 晚点≥15 或 AT_RISK / MEDIUM+ 风险 | **ATTENTION** |
| STOP / CRITICAL / 错过时间窗 / 阻塞决策 | **INTERVENTION** |

## 允许动作

- `ACKNOWLEDGE_RISK` → `execution-risk:{riskId}`（需确认）  
- `PREVIEW_PLAN_CHANGE` → 风险调整预览  
- `OPEN_DECISION` → 行中待决问题  

## 文案

- `summary` ≤ 45 汉字 → `advisorCopy.body`  
- `suggestion` ≤ 22 汉字 → `advisorCopy.advice`  
- 优先级：安全 > 可执行性 > 时间窗 > 必须确认  

## 验收

1. 进度正常 → SILENT  
2. 晚点 15+ 分钟 → ATTENTION，建议抓紧下一站  
3. CRITICAL / STOP 风险 → INTERVENTION + 知晓风险 / 查看调整  

前端：Banner 为主；动作走既有风险中心 / 决策空间，不新增写通道。
