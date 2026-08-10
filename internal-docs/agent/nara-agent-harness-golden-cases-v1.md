# Nara Agent Golden Cases V1

> **配套**：[`nara-agent-harness-engineering-v1.md`](./nara-agent-harness-engineering-v1.md)  
> **用途**：Sprint 1+ 验收与 CI；不以「LLM 答得像样」为通过标准。  
> **扩展**：与 `src/agent/routing/route-and-run-golden-eval-fixtures.ts` 对齐，优先补 **MUST NOT** 断言。

---

## 约定

每条 Case 必须声明：

- `Expected.taskType` / `authority` / `runtime`
- `MUST`（应发生的事）
- `MUST NOT`（禁止发生的能力 / 路径）
- `DONE`（结束条件）

符号：

- `SM` = Full Planning / `CLAUDE_SM` / PLAN→OPTIMIZE→VERIFY→REPAIR 全链  
- `hint` = `intent_mode` / `entry_point` / `[日程] DayN`（不得单独定案）

---

## Fast Query

### CASE-Q01 — 哪一天没住宿

```
输入: 哪一天没住宿？
上下文: trip_id 绑定；可选 hint: itinerary_day_editor + intent_mode=TRIP_PLANNING + [日程] Day1

Expected:
  taskType = TRIP_QUERY
  authority = READ_ONLY
  runtime = FAST_QUERY / LIGHTWEIGHT
  context.required ⊇ { DAY_LIST, ACCOMMODATION_ANCHORS }

MUST:
  返回缺住日或「均已覆盖」的明确结论
  hints 被忽略（不得单独进 SM）

MUST NOT:
  PLAN | OPTIMIZE | SOLVER | VERIFY | REPAIR | CREATE_PROPOSAL | APPLY | CLAUDE_SM full chain

DONE:
  ANSWER_RETURNED
  可选 CTA「安排住宿」→ 点击后 NEW TASK=ITINERARY_ADJUST（非本 turn 升级）
```

### CASE-Q02 — 明天住哪里

```
输入: 明天住哪里？

Expected: TRIP_QUERY / READ_ONLY / FAST_QUERY
context: CURRENT_DAY(+1) + ACCOMMODATION_ANCHORS

MUST NOT: SM / APPLY
DONE: 给出住宿锚或明确缺口
```

### CASE-Q03 — 今天怎么安排

```
输入: 今天怎么安排？

Expected: TRIP_QUERY / READ_ONLY
context: CURRENT_DAY + TIMELINE

MUST NOT: PLAN / REPAIR / SM
```

### CASE-Q04 — 下一站是什么

```
输入: 下一站是什么？

Expected: TRIP_QUERY / READ_ONLY
context: CURRENT_POSITION + TIMELINE + NEXT_ACTIVITY

MUST NOT: SM
```

### CASE-Q05 — 还有哪些没确认

```
输入: 还有哪些没确认？

Expected: TRIP_QUERY / READ_ONLY
context: UNCONFIRMED_ITEMS + OPEN_DECISIONS

MUST NOT: DECISION_COMMIT / APPLY（只罗列，不替用户选）
```

### CASE-Q06 — 准备度怎么样

```
输入: 准备度怎么样？ / 有没有订酒店？

Expected: TRIP_QUERY 或 STATUS_OVERVIEW（轻量）/ READ_ONLY
MUST NOT: 因「全面分析」误入 FULL_DEEP_PLAN / CGUS 驾驶舱（除非显式决策任务）
```

---

## Decision

### CASE-D01 — 两驱还是四驱

```
输入: 我们租两驱还是四驱？

Expected:
  taskType = DECISION_SUPPORT
  decisionKey ≈ VEHICLE_ROAD_FIT
  authority = DECISION_COMMIT（选完 Commit Decision）

MUST:
  Options → Gate → Compare → Recommendation → Select → Decision Commit

MUST NOT:
  直接修改行程 / APPLY Plan
```

### CASE-D02 — 环岛还是南岸

```
输入: 环岛还是只跑南岸？

Expected: DECISION_SUPPORT
MUST NOT: 未 Confirm 就写 PlanVersion
```

---

## Adjustment

### CASE-A01 — 第三天轻松一点

```
输入: 第三天轻松一点

Expected:
  taskType = ITINERARY_ADJUST
  scope.days = [3]
  authority = DRAFT_REQUIRED

MUST:
  Draft → Verify → Before/After → WAIT_CONFIRM

MUST NOT:
  auto apply / 静默写 Plan
```

### CASE-A02 — 安排住宿（从 Query CTA）

```
前置: CASE-Q01 回答后用户点「安排住宿」
输入: 安排住宿 / 帮我补第4天住宿

Expected: NEW TASK = ITINERARY_ADJUST（或 LODGING fill）
MUST: 新 taskId；不得复用 Q01 的 READ_ONLY contract 继续跑 SM
```

### CASE-A03 — 重新规划整个行程

```
输入: 帮我重新规划整个行程

Expected: ITINERARY_ADJUST 或 GLOBAL 重规划 Runtime；Admission ALLOW (REPLAN)
MUST: Proposal / Confirm 边界仍在
```

---

## Live Execution

### CASE-E01 — 晚两小时还能去冰河湖吗

```
输入: 我们晚两个小时，还能去冰河湖吗？

Expected: LIVE_EXECUTION
context: CURRENT_TIME/LOCATION + WEATHER + ROAD + NEXT_DESTINATION（LIVE freshness）

MUST:
  能 / 不能 / 有条件 + 最晚时间 + 备选 + Evidence

MUST NOT:
  无确认改全行程；无 Evidence 的强结论
```

---

## Hint / Guard 回归

### CASE-G01 — 前端误传 TRIP_PLANNING

```
输入: 哪一天没住宿
options.intent_mode = TRIP_PLANNING
options.use_state_machine_orchestration = true
entry_point = itinerary_day_editor

Expected: 与 CASE-Q01 相同（轻量）
MUST NOT: mode_final = 误入的 CLAUDE_SM Full Planning
```

### CASE-G02 — ModeLock 不得按 trip 粘 SM

```
前置: 同 trip 刚完成一次规划 SM
输入: 总体行程怎么样？

Expected: LIGHTWEIGHT / TRIP_QUERY 类
MUST NOT: 因历史 ModeLock(trip) 锁回 CLAUDE_SM
```

### CASE-G03 — Day 锚不得单独定 scope 为「只查 Day1」而进规划

```
输入: 哪一天没住宿\n\n[日程] Day1 …
Expected: 全行程住宿缺口扫描（或明确全行程结论）
MUST NOT: 因 Day1 锚进入 Day1 LOCAL_EDIT / OPTIMIZE_DAY SM
```

---

## Meta / Clarification

### CASE-M01 — 寒暄

```
输入: 你好
有 trip_id

Expected: 元对话 / DATA_LOOKUP 轻量
MUST NOT: TRIP_PLANNING SM
```

### CASE-M02 — 澄清续答

```
输入: 选择冰岛南部
clarification_answers: [...]

Expected: 未完成 planning operation 续程（Admission ALLOW escalation）
MUST: 使用同一 planning_operation_id（若有）
```

---

## CI 建议

1. 将 CASE-Q01 / G01 / G02 做成 **确定性单测**（不依赖 LLM）：TaskContract + Admission + SM redirect。  
2. CASE-D/A/E 可先 shadow / harness，再进硬门禁。  
3. 失败信息必须打出：`taskType`、`allow/deny`、`runtime`、`escalation_reason`。

---

## 最小交付（本周）

研发启动时至少先绿：

- [ ] CASE-Q01  
- [ ] CASE-G01  
- [ ] CASE-G02  
- [ ] CASE-A01（Draft 边界，可不跑满 LLM）  
- [ ] CASE-A02（CTA → NEW TASK 协议）
