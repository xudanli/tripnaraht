---
name: planning-phase-dialog-intent
description: >-
  TripNARA 规划阶段对话意图：跨时空鲁棒性抗风险、确定性供应链确认、多人偏好仲裁、
  非标路书/空间意图缝合。Use when user asks about 封路绕行/最坏情况预案/安全缓冲、
  充电桩间隔/无信号区/补给点营业状态、搭子分歧/遗憾度最低/风险耐受分支、
  插入小众锚点/GPX/小红书机位/导出路书 PPT，或规划期主动防御与确定性对冲。
---

# 规划阶段对话意图 — 四大核心维度

**与 `route-and-run-intent` 的分工**：

| 能力包 | 用户问的是… | 典型动词 |
|--------|-------------|----------|
| **route-and-run-intent** | 已有 Trip 上的**改排/重规划/槽位**操作 | 重新规划、删除 POI、加在第 N 天 |
| **本文件（planning-phase-dialog-intent）** | 规划期的**抗风险、供应链确定性、组队仲裁、非标锚点缝合** | 封了怎么办、能确保充电桩吗、四个人意见不合、把这个小众点插进 Day 4 |

**唤起**：对话涉及上表右侧语义时 **自动挂载**（`capabilities/intent/SKILL.md`）；亦可显式 **`/planning-intent`** 或 **`@` 本文件**。

---

## 实现落点（D1/D2 util + 方向 B 接线）

| 文件 | 职责 |
|------|------|
| `src/agent/utils/planning-intent-processor.util.ts` | Layer2 sub_signals、`contingency_branches` 模版、L0–L3 供应链熔断 |
| `src/agent/utils/planning-intent-intake.util.ts` | INTAKE 接线：`metadata.planning_phase_intent`、SYSTEM_MESSAGE、decision_log |
| `src/agent/utils/planning-intent-narrate.util.ts` | NARRATE 注入：供应链前缀 + 双轨摘要 |
| `src/agent/utils/planning-intent-party.util.ts` | D3 群成员 profile 合成、遗憾上界、Hold/Proceed 分支 |
| `src/agent/utils/planning-intent-spatial.util.ts` | D4 非标锚点 slot 冲突预检 |
| `src/agent/orchestration/graph/nodes/intake-phase.executor.ts` | `analyzeRouteAndRunIntent` 之后调用 `applyPlanningPhaseIntentToIntake` |
| `src/agent/execution/narrate-executor.service.ts` | `mergePlanningPhaseIntentIntoNarration` |
| `src/agent/dto/route-and-run.dto.ts` | `PlanningPhaseIntentDto` → `decision_metadata.planning_phase_intent` |

```bash
npx jest src/agent/utils/planning-intent-processor.util.spec.ts
npx jest src/agent/utils/planning-intent-intake.util.spec.ts
npx jest src/agent/utils/planning-intent-party-spatial.util.spec.ts
```

**INTAKE metadata 键**：`planning_phase_intent`（含 `sub_signals`、`contingency_branches`、`supply_chain_safety`、`party_negotiation`、`spatial_intent`）。

**decision_log**：`system_action: PLANNING_PHASE_INTENT_CLASSIFIED`。

---

## Agent Compliance

处理 **规划阶段防御性/确定性/仲裁/空间缝合** 类 Case 时，Agent **必须**：

1. **先分类维度**（见下表 §Intent Taxonomy），再选编排路径；**不得**把「封路绕行预案」误判为普通 `DATA_LOOKUP` 或「推荐几个景点」。
2. **Decision OS 优先**：能用确定性 util / Skill / Gate 回答的，**禁止**让 LLM 开放式编造「100% 确保」类承诺。
3. **区分「规划期推演」vs「执行期 REPLAN」**：用户问「如果 Day 3 取消会怎样」→ 走 counterfactual / Plan B / partial replan **预演**；用户说「Day 3 已经取消了帮我改」→ 走 `route-and-run-intent` 的 ADJUST/REPLAN。
4. **供应链回答须带证据层级**：历史统计 / 静态快照 / 实时确认 — 三者不可混称；无 L3 Token 时不得声称「100% 确保」。
5. **多人仲裁须有多 profile 输入**：缺队友偏好向量时，先澄清或走 HITL，不得假装已算纳什均衡。

---

## Intent Taxonomy（四大维度）

### D1 — 跨时空窗口鲁棒性抗风险（Robustness & Scenario Planning）

**用户痛点**：天气/交通突变导致核心活动或路段失效；想知道最坏情况下备用预案与额外天数成本。

**典型 Query（fixtures）**：

| ID | 用户原话摘要 | 关键信号 |
|----|--------------|----------|
| D1-FROAD | 冰岛 F-Road 融雪延迟开放，两条涉水线若封路能否绕行、多花几天 | F-road、封路、绕行、融雪 |
| D1-DUKU | 独库公路 7 月初暴雨泥石流，规划时如何留安全缓冲 | 缓冲、泥石流、季节性 |
| D1-DECOUPLE | Day 3 冰川徒步若取消，后面酒店路线是否全废；能否「前置解耦」 | 取消、解耦、级联、Day N 核心 |

**期望 Agent 响应形态**：

> 已为您生成 **晴/雨双轨拓扑行程单**；Day 3 若遇暴雨将自动激活 B 轴绕行路由。（附：额外 +N 天 / +X km 上界）

**Decision OS 机制映射**：

| 机制 | 代码落点 | 成熟度 |
|------|----------|--------|
| Plan B / 风暴绕行 | `iceland-storm-rerouting-engine.util.ts`、`plan.transit.generatePlanB` | 冰岛 F-road 较完整；独库等需 Country Pack |
| 天气驱动 delay / BLOCKED | `apply-weather-drive-delay.ts`、`itinerary.verify` → SafeTravel | 有 |
| 最小遗憾 / 分支选择 | `select-counterfactual-decision.ts`（`min_expected_regret`） | 内核有；对话入口未直连 |
| 级联解耦（partial replan） | `build-partial-replan-graph.ts`、`adaptive-replan-constraint-parser.util.ts` | 部分；「前置解耦」文案需 NARRATE 显式化 |
| POMDP 远期推演 | TOT / CGUS 搜索、`cgus-search.service.ts` | 引擎层有；规划对话未统一暴露 |

**编排建议（planning phase）**：

```
INTAKE → classify D1 sub_intent
RESEARCH → safetravel / dem / weather / froad signals
GATE_EVAL → road_status + season
PLAN_GEN → 主轨 A + 条件激活 B 轴（metadata.contingency_branches）
VERIFY → itinerary.smart_update（封路 shadow read-only phase 已存在）
NARRATE → 双轨摘要 + regret/额外天数上界
```

**Gap（待产品化）**：

- [ ] INTAKE `sub_signals.scenario_planning_requested` 确定性检测（正则 + 国家 pack）
- [ ] 用户可见 **双轨拓扑行程单** UI 契约（A 轴默认 / B 轴 trigger 条件）
- [ ] 「前置解耦」：酒店/交通与活动 slot 的 **可独立滑动** 约束写入 `ItineraryItem.governance`

---

### D2 — 确定性供应链与资源可达性（Supply-Chain Verification）

**用户痛点**：极端目的地卡点在于油/电/信号/通行证/救援，而非景点本身。

**典型 Query**：

| ID | 用户原话摘要 | 关键信号 |
|----|--------------|----------|
| D2-EV-XZ | 两辆纯电 SUV 新藏线，规划能否 100% 确保充电桩间隔 | 纯电、充电桩、间隔、无人区 |
| D2-ALI-OFFLINE | 阿里环线无信号，能否打包避难所/救援点/离线地图进行前表 | 无信号、避难所、离线地图、行前包 |
| D2-WFJ-SEASON | 西峡湾加油站 5 月是否季节性关闭；推荐补给点依据历史还是实时 | 季节性关闭、补给、实时确认 |

**期望 Agent 响应形态**：

> 检测到 **150km 无信号区**；行前一键包已生成，含静态补给快照与时序打卡契约。

**Decision OS 机制映射**：

| 机制 | 代码落点 | 成熟度 |
|------|----------|--------|
| 油/电续航与 supply desert | `iceland-gas-ev-planner-core.util.ts`、`iceland-energy-stations.json` | 冰岛 seed 较完整 |
| 补给 POI 空间查询 | `GeoFactsPOIService.checkSupplyPoints`、readiness `sparse-supply.pack` | 通用框架有；新藏/阿里需 pack |
| 应急/通信弱 | `emergency.pack.ts`、`trip-emergency.service.ts` | 有 |
| L3 确定性 Token | readiness packs + Gate 证据链 | **概念有**；对话层「实时确认 vs 历史统计」未统一标注 |
| 行前一键包 | checklist / journey-assistant 片段 | 分散；缺统一 `pre_trip_supply_bundle` artifact |

**回答模板（强制证据层级）**：

| 层级 | 含义 | 允许措辞 |
|------|------|----------|
| L0 历史统计 | 往年开放季/关闭概率 | 「基于历史模式，5 月西峡湾部分站点可能关闭」 |
| L1 静态快照 | 规划时刻 pack 索引 | 「当前索引显示最近补给点距您路线 X km」 |
| L2 实时确认 | 外部 API / 官方 RSS 当轮拉取 | 「SafeTravel/路政 RSS 于 {ts} 显示…」 |
| L3 契约化 | Gate ALLOW + 打卡约束写入 itinerary | 「已写入 MUST_REFILL_BEFORE 锚点；偏离将触发 VERIFY ERROR」 |

**禁止**：在无 L2/L3 时对 EV 无人区使用「100% 确保」。

**Gap**：

- [ ] `supply_chain_verification_requested` INTAKE sub_signal
- [ ] 新藏/阿里 Country Pack 与 `runGasEvPlannerCore` 同级 planner
- [ ] 行前包 artifact：`{ offline_map_refs, shelters[], supply_checkpoints[], comms_dead_zones[] }`

---

### D3 — 多人出行偏好仲裁（Multi-Agent Preference Negotiation）

**用户痛点**：团队内 pace / 预算 / 风险策略分歧；希望无情感理性仲裁。

**典型 Query**：

| ID | 用户原话摘要 | 关键信号 |
|----|--------------|----------|
| D3-PACE-4 | 4 人拼车独库，特种兵 vs 躺平，遗憾度最低折中排期 | 遗憾度、折中、多人、偏好 |
| D3-RISK-BRANCH | 冰岛搭子：一方 Hold 一方 Proceed，能否生成分歧点双分支 | 风险耐受、Hold/Proceed、分支 |

**期望 Agent 响应形态**：

> 已拉取 4 位队友偏好向量，沙盒博弈后调换 Day 2/Day 5 顺序以逼近群体纳什均衡。

**Decision OS 机制映射**：

| 机制 | 代码落点 | 成熟度 |
|------|----------|--------|
| Pareto + 多人协商 | `runMultiAgentNegotiation`、`trip-draft.service` HYBRID 路径 | 草案层有 |
| Guardian 辩论 | `GuardianDebateService.negotiate` | 三人格 Gate 有 |
| 多人决策服务 | `multi-person-decision.service.ts`、`team-collaboration.service.ts` | 有 |
| 遗憾度 / rollback 偏置 | `negotiation-regret.application.ts`、`TradeoffEngineService.buildNegotiation` | 双选项谈判有 |
| 风险分歧双分支 | `select-counterfactual-decision` + branch metadata | **缺** 用户可见「Hold/Proceed 双轨路书」产品契约 |

**编排建议**：

```
INTAKE → party_size + per-member riskTolerance/pace vectors
RESEARCH → 各成员 DecisionParams / 历史 rollback
PLAN_GEN → Pareto front → runMultiAgentNegotiation
NARRATE → 调换说明 + 每人 regret 上界（可选匿名）
```

**Gap**：

- [ ] 群聊上下文绑定多 `user_id` → `DecisionParams` 聚合
- [ ] 「双分支路线」写入 `itinerary.metadata.branch_policies[]`（trigger: weather_threshold × member_id）

---

### D4 — 动态内容消费与非标路书转化（Spatial Intent Capture）

**用户痛点**：从小红书/GPX/社区锚点插入现有规划；或导出高阶路书。

**典型 Query**：

| ID | 用户原话摘要 | 关键信号 |
|----|--------------|----------|
| D4-POI-INSERT | 小红书机位/GPX 轨迹，插进 Day 4 是否合理、时空冲突 | 截图、GPX、插入、冲突 |
| D4-EXPORT-PPT | 极地生存行程导出含路况风险的高阶 PPT | 导出、PPT、赞助商、路书 |

**Decision OS 机制映射**：

| 机制 | 代码落点 | 成熟度 |
|------|----------|--------|
| GPX / 轨迹 | `create-trail.dto` gpxData、`route-difficulty.service` | 数据层有 |
| 槽位插入 / 冲突 | `ITINERARY_SLOT_PLACEMENT`、`itinerary.verify` 时间窗 | 有；**非标锚点**需 vision+geocode 管道 |
| Context GPX ref | `context-engine` `state.metadata.gpxRef` | 有 |
| 动态路书/PPT 渲染 | trip-recap、NARRATE | **弱**；无「路况风险 PPT」一键模板 |

**编排建议（D4-POI-INSERT）**：

```
INTAKE → spatial_intent_capture (attachment: image|gpx)
RESEARCH → geocode + dem + road_feasibility + opening_hours
GATE_EVAL → 土路/塌方 season
PLAN_GEN → slot placement on target_day OR reject with conflict report
NARRATE → 「插入 Day 4 可行 / 需挪至 Day 5 上午 + 额外 40min 车程」
```

**Gap**：

- [ ] 小红书截图 → POI 候选的结构化 intake（vision skill）
- [ ] `spatial_intent_feasibility_report` 标准 JSON
- [ ] 高阶路书导出 skill（非普通 markdown itinerary）

---

## 产品接口映射总表

| 用户提问痛点 | 规划阶段 Agent 响应（目标 copy） | Decision OS 机制 | Primary 意图（建议） | 关键 Skills / Utils |
|--------------|-----------------------------------|------------------|----------------------|---------------------|
| 怕天气突变行程报废 | 晴/雨双轨拓扑行程单；Day N 激活 B 轴 | 期望效用 / counterfactual regret | `SCENARIO_PLANNING` | storm reroute, plan.transit.generatePlanB, smart_update |
| 担心极端环境没油没信号 | 无信号区检测 + 行前一键包 | L3 Token + readiness packs | `SUPPLY_CHAIN_VERIFY` | gas-ev-planner, emergency.pack, sparse-supply |
| 朋友之间意见不合 | 偏好向量 + 沙盒博弈 + 顺序调换 | Multi-Agent Negotiation | `PARTY_NEGOTIATION` | runMultiAgentNegotiation, GuardianDebate, TradeoffEngine |
| 看到小众点想塞进行程 | 时空冲突报告 + 插入/改日建议 | Spatial feasibility + Gate | `SPATIAL_INTENT_CAPTURE` | slot placement, verify, route-difficulty |
| （扩展）导出路书/PPT | 动态渲染含风险分层的路书 | NARRATE + recap template | `EXPORT_BRIEFING` | trip-recap（待扩展） |

---

## 与现有 INTAKE 的关系

当前 `analyzeRouteAndRunIntent()` **不覆盖** 上述四维；它们应作为 **Layer2 sub_signals** 或 **parallel taskType** 进入编排：

| 信号键（建议） | 维度 | 写入 metadata |
|----------------|------|---------------|
| `scenario_planning_requested` | D1 | `contingency_mode: dual_track` |
| `supply_chain_verification_requested` | D2 | `supply_evidence_tier_required: L2` |
| `party_negotiation_requested` | D3 | `party_member_ids[]` |
| `spatial_intent_capture_requested` | D4 | `spatial_attachment_type: gpx|image` |

**与 `orchestration-signals.util.ts` taskType**：

- 含「改行程结构 / 双轨 / 插入点 / 多人折中排期」→ 倾向 `TRIP_PLANNING`
- 纯「补给站营业时间事实问句、无改草案期望」→ `DATA_LOOKUP` + readiness 证据
- 边界 Case：「如果封路**帮我**改路线」→ D1 + `route-and-run-intent` FULL_TRIP_REPLAN

---

## Fixtures（单测 / Harness 话术）

复制到 `planning-phase-dialog-intent.fixtures.ts`（待建）或 Harness case：

```typescript
export const PLANNING_DIALOG_FIXTURES = {
  D1_FROAD: '我查到下个月冰岛内陆 F-Road 可能会因为融雪延迟开放，咱们现在的行程里有两条线要涉水，如果到时候真的封路了，系统能帮我绕行吗？需要多花几天？',
  D1_DECOUPLE: '如果因为天气突变，我行程第三天最核心的那个冰川徒步被取消了，后面几天的酒店和路线是不是全废了？系统在规划时能做前置解耦吗？',
  D2_EV: '我们这次是两辆纯电 SUV 跑新藏线，在规划排期的时候，智能体能不能100%确保沿途充电桩的间隔，不会让我在断网的无人区趴窝？',
  D2_OFFLINE: '我要去西藏阿里环线，行程里有些路段没有手机信号。现在规划时，系统能不能把沿途所有的紧急避难所、野生救援点和离线地图，提前打包塞进我的行程表里？',
  D3_PACE: '我们一共 4 个人拼车去独库公路，我想多排点硬核越野，但我朋友想多留白。智能体能不能综合我们四个人的历史偏好，算出一个让我们所有人遗憾度最低的折中排期？',
  D3_RISK: '我和刚认识的旅行搭子组队去冰岛，我极度重视安全，只要天气预报有小雪就倾向于就地避险；但他喜欢冒险。系统在生成行程单时，能不能根据我们的风险耐受度，自动在分歧点生成两条分支路线？',
  D4_INSERT: '我发现这个藏在山谷里的机位太绝了，但看评论说去这里的土路经常下雨塌方。智能体能帮我算算，把它插进我现有的 Day 4 行程里合不合理？时空上会冲突吗？',
} as const;
```

---

## 调试步骤

1. 对用户原话标注 **D1–D4** 维度与子意图。
2. 查 INTAKE `metadata` 是否应含上表 sub_signals（当前可能缺失 → 记录 Gap）。
3. 跟 RESEARCH 证据：SafeTravel / energy planner / party params / GPX ref。
4. 看 GATE 与 VERIFY issues 是否已回答用户「最坏情况」。
5. 对照 NARRATE：是否误报「100%」或「只调整了第 N 天」（后者见 route-and-run-intent）。

---

## 相邻 Skill

- 改排/整段 vs 单日：`route-and-run-intent`
- 冰岛 F-road / 风暴：`country-pack-is`（`.cursor/skills/tripnara-export/country-pack-is/SKILL.md`）
- VERIFY / Gate：`verify-mainline`
- CGUS / 候选搜索：`optimization-candidate-search`
- 编排顺序：`orchestration-mainline`

---

## Next Sprint Backlog（单兵工具 → 全链路闭环）

```
P0 稳定性核心 ──> P1 数据链路 ──> P2 体验外显
Harness e2e       群聊 member 绑定   Vision + 前端 UI
```

### P0 — Harness e2e 覆盖四维 fixtures

**目标**：Prompt/编排多次迭代后，D1–D4 的 `SYSTEM_MESSAGE` 与 `metadata.planning_phase_intent` 仍稳定可回归。

| 交付 | 落点 |
|------|------|
| fixtures 常量 | `planning-phase-dialog-intent.fixtures.ts`（从 SKILL §Fixtures 迁出） |
| 确定性 INTAKE 断言 | 扩 `planning-intent-intake.util.spec.ts` + 新建 `planning-phase-intent.harness.spec.ts` |
| Harness eval case | `src/harness/eval/suite/` 注册 jest pattern；断言 `PLANNING_PHASE_INTENT_CLASSIFIED` + sub_signals |
| 防退化门禁 | L1 smoke：`sub_signals.*`、`contingency_branches.length`、`supply_chain_safety.safeToPromise` |

**验收**：四维话术各 1 正例；D2「100%+L1」必熔断；D1 预演 vs ADJUST 边界各 1 反例。

### P1 — 群聊真实 member_id → DecisionParams 批量拉取

**目标**：替代 `planning-intent-party.util.ts` 启发式合成，直连真实偏好向量 + 博弈求解。

| 交付 | 落点 |
|------|------|
| room_id → member_id[] | 群聊上下文解析（match-square / trip 绑定层） |
| 批量 DecisionParams | `DecisionParamsInjectorService.getDecisionParamsForUser` 循环 |
| INTAKE 注入 | `applyPlanningPhaseIntentToIntake({ memberProfilesById })` 已有参数位 |
| 博弈求解 | `runMultiAgentNegotiation` + 现有 `planning-intent-party-robustness.util.ts` 组织鲁棒性预演 |

**验收**：4 人真实 profile 时 `requires_hitl_clarification=false`；`regret_upper_bound` 来自真实向量而非 synthetic。

### P2 — D4 Vision geocode + 前端消费

**目标**：截图/GPX 多模态 → POI 坐标 → slot 预检；双轨/遗憾度 UI 外显。

| 交付 | 落点 |
|------|------|
| Vision 管道 | `spatial_intent_capture` + attachment → OCR/地标 → geocode |
| Slot 引擎输入 | `evaluateSpatialIntentFeasibility` 扩展 `anchor_coordinates` |
| 前端 | `decision_metadata.planning_phase_intent` → 晴雨双轨看板 + 遗憾度仪表 |

---

## 克谦 Test 对齐（当前版本）

- [x] **每个 Action 有 Eval**：四维触发 → `decision_log` 分类 + NARRATE 防御文案；25 个 unit tests 绿。
- [x] **边界清晰**：「如果发生（预演）」走 planning-phase；「已经发生（执行）」走 `route-and-run-intent` ADJUST/REPLAN。
- [ ] **Harness e2e 全链路**：P0 完成后勾选。
- [ ] **真实 member 数据闭环**：P1 完成后勾选。
- [ ] **多模态 + UI 外显**：P2 完成后勾选。

