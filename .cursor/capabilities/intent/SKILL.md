---
name: intent
description: >-
  Automatically loads for TripNARA intent work: (A) route_and_run re-plan/adjust/slot
  placement, FULL_TRIP_REPLAN vs ITINERARY_ADJUST; (B) planning-phase dialog intents —
  robustness/scenario planning, supply-chain verification, multi-party negotiation,
  spatial intent capture. Use when user mentions 重新规划、改排、封路绕行/最坏预案、
  充电桩/无信号/补给确定性、搭子分歧/遗憾度、插入小众锚点/GPX/小红书机位，或
  /intent /planning-intent. Do not LLM-guess intent.
---

# Intent Recognition — 自动挂载 Stub

## Trigger Context

在以下任一情况 **自动加载本 Stub**，再按分支读取对应主文档（勿凭 LLM 语义猜意图）：

### A. route_and_run（改排 / 重规划）

- 用户要 **改/重规划/调整** 行程（如「重新规划」「改一下第2天」「删除 POI」「加个顺路点」「第6天返程」）
- 排查 **意图误判**（整段重规划被切成单日 `ITINERARY_ADJUST`、或相反）
- 工程任务涉及 **`analyzeRouteAndRunIntent`**、`itinerary-adjust-intent`、`intake-phase.executor`、INTAKE metadata
- 用户显式输入 **`/intent`**

### B. planning-phase dialog（规划期主动防御）

- **D1 鲁棒性**：封路/天气突变/最坏预案/安全缓冲/前置解耦/双轨绕行
- **D2 供应链**：充电桩间隔/无人区趴窝/无信号/避难所/离线地图/补给点营业状态
- **D3 多人仲裁**：搭子分歧/特种兵 vs 躺平/遗憾度最低/Hold vs Proceed 分支
- **D4 空间缝合**：小红书/GPX/小众机位插入 Day N、导出路书/PPT
- 用户显式输入 **`/planning-intent`**

## Action（Agent 必须执行）

1. **DO NOT guess intent.** 不得向模型提开放式「请判断用户想干什么」类问题。
2. **路由到主指南**（先判 A vs B，可同时涉及两者时 **两者都 Read**）：
   - **A → route_and_run**：  
     👉 [`.cursor/capabilities/route-and-run-intent/SKILL.md`](../route-and-run-intent/SKILL.md)
   - **B → planning-phase dialog**：  
     👉 [`.cursor/capabilities/planning-phase-dialog-intent/SKILL.md`](../planning-phase-dialog-intent/SKILL.md)
3. 按主文档 **Agent Compliance** 修改代码或排查 Case。
4. route_and_run 改判定正则后 **必须** 跑 `route-and-run-intent` 主文档列出的 Jest 单测。

**职责域 A**：Layer1 primary 短路、Layer2 sub_signals、`itinerary_full_trip_replan` / `itinerary_adjust_intake`、整段 vs 单日边界。

**职责域 B**：D1–D4 维度分类、Decision OS 机制映射、证据层级（L0–L3）、与 route_and_run 边界。
