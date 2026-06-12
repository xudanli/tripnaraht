---
name: route-and-run-intent
description: >-
  TripNARA route_and_run deterministic intent: Layer1 primary routing
  (SLOT_PLACEMENT, GENERAL_PLAN full-trip replan, ITINERARY_ADJUST, SKU_SHORT_CIRCUIT),
  Layer2 sub_signals, intake metadata, FULL_TRIP_REPLAN vs single-day adjust bugs.
  Use for 重新规划、改排、删除/新增 POI、只改第N天、意图识别、analyzeRouteAndRunIntent,
  itinerary-adjust-intent, intake system_action debugging, or /intent.
---

# route_and_run 意图识别主线

**唤起**：对话涉及改排/重规划/意图排查时 **自动挂载**（`.cursor/capabilities/intent/SKILL.md`）；亦可显式 **`/intent`** 或 **`@` 本文件**。

---

## Agent Compliance Specification

处理 **行程变更 / 意图识别** 的代码修改或线上 Case 排查时，Agent **必须**：

1. **代码第一**  
   意图分类由 `route-and-run-intent-analyzer.util.ts` 与 `itinerary-adjust-intent.util.ts` 的 **确定性启发式** 决定。  
   **严禁** 在 Prompt 里让 LLM 开放式判断「重规划 vs 单日调整」；只改 util + 单测。

2. **Runtime 分层（Layer1 → Layer2）**  
   - **Layer1**：绑定 Trip 时按优先级短路 — `ITINERARY_SLOT_PLACEMENT` → `GENERAL_PLAN`（含 `detectFullTripReplanIntent`）→ `ITINERARY_ADJUST` → `SKU_SHORT_CIRCUIT` → 默认 `GENERAL_PLAN`。  
   - **Layer2**：与 Layer1 并行收集 `collectSubSkuSignals()`（F-road 2WD、旺季错峰、marathon 等），写入 INTAKE metadata，**不替代** Layer1 primary。

3. **整段 vs 单日误判**  
   遇「重新规划 N 天 + 第 N 天约束（如返程日）」误入 `ITINERARY_ADJUST`：  
   定位 `itinerary-adjust-intent.util.ts` → 对比 `hasFullTripReplanScopeSignals` 与 `detectExplicitSingleDayAdjustAnchor` → 更新 `route-and-run-intent.fixtures.ts` 回归用例。

4. **日志对齐（线上排查）**  
   要求查看 INTAKE `decision_log` 的 `system_action`：  
   `FULL_TRIP_REPLAN_CLASSIFIED` vs `ITINERARY_ADJUST_CLASSIFIED`，以及 `metadata.route_and_run_intent`、`itinerary_full_trip_replan` / `itinerary_adjust_intake`。

5. **回归验证**  
   修改任何判定正则或优先级后，**必须**运行并通过：

   ```bash
   npx jest src/agent/utils/itinerary-adjust-intent.util.spec.ts
   npx jest src/agent/utils/route-and-run-intent-analyzer.util.spec.ts
   ```

---

## 三层文档与 Agent 消费方式

| 层 | 文件 | Agent 何时读 |
|----|------|--------------|
| 自动 Stub | `capabilities/intent/SKILL.md` | 改排/意图相关对话 **自动挂载**；只含 Trigger + 「去读主文档」 |
| 主指南 | 本文件 | 修改 util、写单测、PR 自检、误判表 |
| 原子注册 | `skills/orchestration/parse-user-intent.md` | 能力索引；链到本文件 |

**执行顺序**：Read 主指南 → 定位 util → 改代码 → 更新 fixtures/spec → 跑 Jest → 线上对照 INTAKE `system_action`。

---

## 说明

`route_and_run` 的「用户想干什么」**不是 LLM 分类**，而是 **INTAKE 前/中的确定性启发式**（正则 + Trip 绑定上下文）。改规则时必须同时更新单测；勿只在 prompt 里「提醒模型」。

| 角色 | 职责 | 主要落点 |
|------|------|----------|
| **主路由** | Layer1 primary + Layer2 SKU sub_signals | `route-and-run-intent-analyzer.util.ts` |
| **改排 vs 整段重规划** | FULL_TRIP_REPLAN / ITINERARY_ADJUST 分界 | `itinerary-adjust-intent.util.ts` |
| **INTAKE 落盘** | metadata 键、decision_log、system hints | `intake-phase.executor.ts` |
| **下游消费** | PLAN_GEN 全周 vs 单日走廊、草案文案 | `plan-gen-phase.executor.ts`、`itinerary-adjust-decision-log.util.ts`、`route-and-run-response-assembler.service.ts` |

---

## 双层模型

### Layer1 — `RouteAndRunPrimaryIntent`

定义于 `analyzeRouteAndRunIntent()`，**绑定 Trip 时**按下列顺序短路（见 `route-and-run-intent-analyzer.util.ts`）：

| 优先级 | primary | 条件摘要 |
|--------|---------|----------|
| 1 | `ITINERARY_SLOT_PLACEMENT` | 「哪一天/加在哪/顺路」+ 已有 Trip 上下文 |
| 2 | `GENERAL_PLAN` | `detectFullTripReplanIntent()` 为 true（整段多日重规划） |
| 3 | `ITINERARY_ADJUST` | `detectItineraryAdjustIntent()` 或 marathon_deferred 等 |
| 4 | `SKU_SHORT_CIRCUIT` | F-road 2WD、旺季错峰等 sub_signals |
| 5 | `GENERAL_PLAN` | 默认（新规划 / 未绑定 Trip） |

**CR-01**（见 `route-and-run-intent-analyzer.util.ts` 文件头）：`ITINERARY_SLOT_PLACEMENT` 时 Layer2 SKU **不得**跳过选日澄清。

### Layer2 — `RouteAndRunSubSkuSignals`

`collectSubSkuSignals()`：旺季错峰、F-road 2WD、极昼 marathon、北部观鲸等。可与 Layer1 并存（例如 SLOT_PLACEMENT + peak_season）。

---

## 整段重规划 vs 单日改排（最易踩坑）

### 目标行为

| 用户话术特征 | 应走 | INTAKE metadata |
|--------------|------|-----------------|
| 「重新规划 6 天行程」+ 每日车程/午餐/改路线 + 「第6天返程」 | `GENERAL_PLAN` + FULL_TRIP_REPLAN | `itinerary_full_trip_replan: true` |
| 「重新规划第二天」/「删除第3天 POI」/「6月2日行程更新为…」 | `ITINERARY_ADJUST` | `itinerary_adjust_intake: true`，`itinerary_adjust_target_date_iso` |
| 天气驱动 + 「每日车程不超过 X 小时」+ 日期跨度 | `GENERAL_PLAN` | `itinerary_full_trip_replan: true` |

### 判定链（`itinerary-adjust-intent.util.ts`）

```
detectFullTripReplanIntent(msg, dateRange)
  ├─ detectExplicitSingleDayAdjustAnchor → true 则整段重规划 FAIL
  └─ hasFullTripReplanScopeSignals → true 则整段重规划 OK

detectItineraryAdjustIntent
  └─ detectFullTripReplanIntent 为 true 则 FAIL（互斥）
```

**`hasFullTripReplanScopeSignals`** 看： stated N天、全程/整段、每日/每天物流约束、重新规划+行程、更改路线/目的地、雷克雅未克↔Vik 走廊等。

**`detectExplicitSingleDayAdjustAnchor`** 看：明天/今天、单日 CRUD、第 N 天、单月日、单 ISO 日期等——但 **整段 scope 信号优先**，避免把「第6天改为返程日」误判为仅改该日。

### 已知误判模式（改规则前先写回归用例）

| 误判 | 原因 | 修复方向 |
|------|------|----------|
| 顾问式 6 天重规划 → 只改第 6 天 | 「第6天」触发单日锚；「12:00」+「改为」误触 `detectItineraryItemUpdateIntent` | `hasFullTripReplanScopeSignals` 在 `detectExplicitSingleDayAdjustAnchor` **最前**短路 |
| 「把那几天定为极光观测日」→ 深度 GENERAL_PLAN | `SLOT_PLACEMENT` 只认「哪几天」不认「那几天」；活动锚点无「极光」 | 扩展 `detectItinerarySlotPlacementIntent`：那几天/定为/极光观测日 |
| SLOT 路径正确但澄清卡写观鲸 | `buildItinerarySlotPlacementPayload` 默认 intro/`route_type` 写死观鲸 SKU | `detectItinerarySlotActivityKind` → 极光/观鲸/generic 分支 copy |
| 「每日车程」未抵消「第 N 天」 | 旧正则只认 `每天` 不认 `每日` | `(?:各\|每)\s*(?:天\|日)` |
| 整段重规划被挡后仍抽 target day | `extractItineraryAdjustTargetDateFromMessage` 解析「第6天」 | 先修 primary；勿在 FULL_TRIP_REPLAN 路径写 `itinerary_adjust_target_date_iso` |

### 回归用例（必须保持绿）

`itinerary-adjust-intent.util.spec.ts`：

- `detects consultant-style full replan with day-6 return constraint`
- `detects consultant-style full replan when only 每日 (not 每天) marks per-day constraints`
- `detects weather-driven full trip replan`
- `detects 6-day bound trip replan with accommodation and daily lunch`

`route-and-run-intent-analyzer.util.spec.ts`：

- slot placement 优先于 peak SKU
- 绑定 Trip + 天气改排 → `GENERAL_PLAN`
- 绑定 Trip + 「重新规划第二天」→ `ITINERARY_ADJUST`

---

## INTAKE 落盘（`intake-phase.executor.ts`）

分析入口：`analyzeRouteAndRunIntent(intakeMsg, { trip, tripId, hasTripDays })` → 写入 `metadata.route_and_run_intent`。

### FULL_TRIP_REPLAN 分支

- `metadata.itinerary_full_trip_replan = true`
- 可选 `full_trip_replan_hotel_requested`
- `appendFullTripReplanSystemHints()` → `[SYSTEM_MESSAGE][FULL_TRIP_REPLAN]`
- decision_log：`system_action: FULL_TRIP_REPLAN_CLASSIFIED`

### ITINERARY_ADJUST 分支

- `metadata.itinerary_adjust_intake = true`
- `metadata.itinerary_adjust_target_date_iso`（来自 `extractItineraryAdjustTargetDateFromMessage`）
- `metadata.itinerary_adjust_sub_intent`
- 可选 `adaptive_replan_requested`
- `appendItineraryAdjustSystemHints()` → `[SYSTEM_MESSAGE][ITINERARY_ADJUST]`
- decision_log：`system_action: ITINERARY_ADJUST_CLASSIFIED`

**注意**：`fullTripReplan` 与 `ITINERARY_ADJUST` 在 INTAKE 是 **两个 if**；primary 为 `GENERAL_PLAN` 且 `detectFullTripReplanIntent` 时才走前者。primary 为 `ITINERARY_ADJUST` 时走后者——因此 **主路由必须先判对**。

---

## Query Rewriting 边界（与意图分层分离）

| 管道 | 输入假设 | 用于 |
|------|----------|------|
| **`analyzeRouteAndRunIntent`** | 用户原话（`stripSystemMessageBlocksForIntakeNl`） | INTAKE primary / metadata |
| **`QueryRewritingService`** | POI/酒店 **检索 query** | 住宿 MCP、POI 多路召回 |
| **`orchestration-signals`** | 用户原话 | `taskType`（TRIP_PLANNING vs DATA_LOOKUP） |

**问题**：用户在工作台常输入 **行程操作句**（如「把那几天定为极光观测日」），不是检索 query；若误进 `rewriteQueryWithRules`，会 **prepend 目的地、合并上轮 history**，破坏选日/改排语义。

**防护**：`query-rewrite-orchestration-guard.util.ts` — 命中 slot/adjust/full-replan 启发式时 **passthrough**（`contextualized_query === original`）。  
**注意**：route_and_run INTAKE **从不**调用 Query Rewriting；防护主要覆盖 PA 住宿搜索误用 `dto.message` 的路径。

**极光选日 RAG**：`ITINERARY_SLOT_PLACEMENT` + `activityKind=aurora` 时，INTAKE 调用 `fetchAuroraSlotPlacementRagSupplement`（`pois` + `practical` 检索），摘录写入澄清卡 **「3. 知识库参考（极光观测点）」**；metadata `slot_placement_aurora_rag.citation_count`。

---

## 相关 util 索引

| 文件 | 用途 |
|------|------|
| `route-and-run-intent-analyzer.util.ts` | Layer1/Layer2 主入口 |
| `route-and-run-intent.fixtures.ts` | 单测共享话术（顾问式 6 天重规划、极光选日等） |
| `query-rewrite-orchestration-guard.util.ts` | 检索改写 passthrough（行程操作句勿当 search query） |
| `query-rewriting.util.ts` | POI/酒店检索改写（Stage1 规则 + 可选 LLM） |
| `itinerary-adjust-intent.util.ts` | FULL_TRIP_REPLAN / ADJUST / target date / system hints |
| `itinerary-adjust-poi-slot-fill.util.ts` | POI 推荐填充（仍属 ADJUST 子路径） |
| `itinerary-item-add.util.ts` / `delete` / `update` | 单日 CRUD 意图（update 的时间正则易误触） |
| `itinerary-day-replan.util.ts` | 黄金圈等单日区域重排 |
| `itinerary-slot-placement.util.ts` | 槽位编排 |
| `aurora-slot-placement-rag.util.ts` | 极光选日澄清卡 RAG 摘录格式化 |
| `peak-season-time-shift-intake.util.ts` | 旺季错峰 sub_signal |
| `froad-intake-signals.util.ts` | F-road 2WD sub_signal |
| `guardian-debate-user-intent-anchor.util.ts` | marathon 等锚点 |
| `itinerary-adjust-decision-log.util.ts` | 用户可见「只调整了第 N 天」等文案 |

---

## 调试步骤

1. 复制用户原话，对 `stripSystemMessageBlocksForIntakeNl` 后的文本跑单测或临时脚本。
2. 依次打印：`detectExplicitSingleDayAdjustAnchor`、`hasFullTripReplanScopeSignals`（若可测）、`detectFullTripReplanIntent`、`detectItineraryAdjustIntent`、`analyzeRouteAndRunIntent`。
3. 查当轮 `decision_log` INTAKE 步的 `system_action` 与 `metadata.route_and_run_intent`。
4. 若 primary 已对但 PLAN 仍只改一日，查 `plan-gen-phase.executor` 是否读 `itinerary_full_trip_replan`。

### 跑测试

```bash
npx jest src/agent/utils/itinerary-adjust-intent.util.spec.ts
npx jest src/agent/utils/route-and-run-intent-analyzer.util.spec.ts
```

---

## PR 自检

- [ ] 新增/修改正则：是否在 **`itinerary-adjust-intent.util.spec.ts`** 或 **`route-and-run-intent-analyzer.util.spec.ts`** 增加 **正例 + 反例**（含绑定 Trip 的 `hasTripDays: true`）。
- [ ] 改 `detectExplicitSingleDayAdjustAnchor`：是否回归「删除第3天 POI」「重新规划第二天」仍为单日 ADJUST。
- [ ] 改 FULL_TRIP_REPLAN：是否仍与 `detectItineraryAdjustIntent` 互斥；INTAKE 是否不会同时写 `itinerary_adjust_target_date_iso`。
- [ ] 用户可见 copy（decision_log / 草案摘要）：是否与 primary 一致，避免「只调整了第 N 天」与整段重规划矛盾。
- [ ] 未绑定 Trip 时：行为是否与现有 `GENERAL_PLAN` 默认路径一致。

---

## 相邻主线 Skill

- 编排执行与 INTAKE 顺序：`orchestration-mainline`
- route_and_run Harness / 评测： `harness-runtime`、`pipelines/route-and-run-mainline.md`
- 改排草案应用与 decision_log：`itinerary-adjust-decision-log.util.ts`（实现），VERIFY 改排 UI：`planning-assistant/FRONTEND_INTEGRATION_GUIDE.md`
- 原子 skill 注册表：`.cursor/skills/orchestration/parse-user-intent.md`
