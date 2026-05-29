# Agent Runtime Defensive Core v2.0

> **P3 定夺（2026-05）：** 与 `src/trips/decision/optimization/axioms/`（行程优化**七公理**）**保持物理双轨、概念隔离**。二者仓库内均称 “Axiom”，但职责、时机、消费者完全不同，**禁止合并目录或共用 Registry**。

**概念别名（推荐口头/文档用语）：** *Runtime Guardians* / *Runtime Assertions*  
**物理路径（稳定）：** `src/agent/axioms/` — 大规模 rename 另开专项 PR，避免打断已接好的编排/监控/测试链路。  
**概念入口（别名）：** `src/agent/guardians/` — `index.ts` re-export，新代码可 `import … from '../guardians'`。

**ADR：** [`docs/decision/ADR-AGENT-RUNTIME-GUARDIANS-V2.md`](../../../docs/decision/ADR-AGENT-RUNTIME-GUARDIANS-V2.md)（双轨定夺 + FeasibilityBridge 预留）。

---

## 与优化七公理的对照（勿混用）

| 维度 | Agent 运行时公理（本目录） | 行程优化七公理（`trips/decision/optimization/axioms/`） |
|------|---------------------------|--------------------------------------------------------|
| **本质** | 编排生命周期内的**运行时守门人** | Solver 内的**静态效用/可行域约束** |
| **时机** | INTAKE → PLAN_GEN → VERIFY → REPAIR → TERMINAL AUDIT（分钟级对话流） | PLAN_GEN 内核迭代（毫秒～秒级、数万次拓扑评估） |
| **逻辑形态** | 命题式命中 + Evidence/L3 证明链 + `dominant_cid` | 效用归一化、硬约束优先、稳健性/多智能体一致性等**七条数学公理** |
| **输入** | NL Prompt、澄清答案、`trip_plan_request`、`itinerary` 汇总路由指标 | POI 图、时空矩阵、归一化分数 `[0,1]` |
| **输出** | `AxiomMatchResult` → 澄清 / 审计 / Prometheus `match_source` | `AxiomValidationReport`、分层效用、可行/不可行判定 |
| **典型条目** | `TERRAIN_F_ROAD_UNFIT`、`FATIGUE_OVERLOAD`、`ETA_INFEASIBLE`（3 条 SKU 映射） | 标准化、分层组合、硬约束优先、不确定性一致…（7 条） |
| **主要消费者** | `claude-orchestrator`、`agent.service`、terminal audit、intake simulator | `AxiomValidatorService`、OR/启发式搜索、admin axiom API |

**为何不走浅层合并（方案 B 暂缓）：**

- 输入/输出契约正交；桥接 `AxiomValidatorService` 会在热路径引入 Nest 依赖与 Solver 延迟，且 ETA/F-road 在 Agent 侧已是**聚合分钟级**指标，与优化层**秒级矩阵**不对齐。
- 若未来需要“投影”，应新增 **只读 Bridge 接口**（如 `projectFeasibilityHint(planSlice)`），由 REPAIR/VERIFY 显式调用，而非在 `matchAxioms` 内隐式嵌 Solver。

---

## 端到端管道（v2.0）

```
analyzeRouteAndRunIntent (Layer-1 SKU)
        ↓
applyClarificationAndTripToSubSignals (澄清 + mutated trip)
        ↓
buildAxiomMatchContext
        ↓
matchAxioms → validateAxiomMatchResult (evidence_schema)
        ↓
pickDominantAxiom → dominant_cid / L3 proof / Prometheus
```

**数据闭环（PLAN_GEN / REPAIR）：** `syncPlanRoutingMetricsToTripPlan` ← itinerary（DRIVE/TRANSIT 全量，WALK×0.3）→ 疲劳/ETA 热路径。

---

## SKU ↔ Runtime Axiom ↔ Clarification ↔ CID

Layer-1 共 **4** 个 `sub_signals`；运行时 Registry **3** 条公理（`whale_watching_north` 并入 `ETA_INFEASIBLE`，**不**单独注册第 4 条）。

| Layer-1 SKU (`sub_signals`) | Runtime `axiom_id` | Constraint ID (`cid`) | `severity` | Clarification `questionId` | 备注 |
|-----------------------------|-------------------|------------------------|------------|------------------------------|------|
| `froad_2wd_compliance` | `TERRAIN_F_ROAD_UNFIT` | `terrain.f_road_compatibility` | P0 | `froad_2wd_compliance_v1` | 意图优先：`isFroad2wdComplianceScenario`；启发式兜底需显式 2WD + F-road 关键词 |
| `marathon_deferred` | `FATIGUE_OVERLOAD` | `human.fatigue_capacity` | P1 | `marathon_continuous_drive_v1` | 极昼马拉松等无字面“N 小时”时靠意图通道；PLAN_GEN 后走 `routing_metrics` |
| `peak_season_crowd_avoidance` | `ETA_INFEASIBLE` | `time.eta_feasibility` | P1 | `peak_season_midnight_sun_whale_v1` | 与观鲸档期、人潮避让相关 |
| `whale_watching_north` | *(同上 ETA)* | `time.eta_feasibility` | P1 | `peak_season_midnight_sun_whale_v1`（`LOCK_MIDNIGHT_SUN_WHALE_SLOT`） | 无独立公理；匹配 ETA 同一 `cid` |
| *(编排，非 SKU)* | — | — | — | `itinerary_slot_placement_v1` | 影响 `itinerary_slot_placement` / 槽位，不直接映射三节公理 |
| *(Guardian debate)* | — | — | — | `guardian_debate_abu_reject_v1` | 分段环岛等 trip 突变，供澄清回灌 |

### `match_source` 语义（Prometheus / Evidence）

| 值 | 含义 |
|----|------|
| `INTENT_SIGNAL` | Layer-1 `route_and_run_intent.sub_signals` 命中 |
| `CLARIFICATION` | 澄清答案或 PLAN_GEN/REPAIR 热指标（如 `pure_driving_minutes`） |
| `HEURISTIC` | 仅 NL 正则/关键词，无 SKU（**应监控占比，促收入 SKU**） |

告警见：`monitoring/prometheus/rules/agent_axioms_alerts.yml`。

---

## 模块索引

| 文件 | 职责 |
|------|------|
| `axiom-registry.ts` | 3 条运行时公理 schema + `utility_anchor` |
| `axiom-matchers.ts` | `matchAxioms` / `pickDominantAxiom` |
| `build-axiom-match-context.util.ts` | 意图 + trip + itinerary 上下文 |
| `axiom-clarification-signals.util.ts` | 澄清 → sub_signals 回灌 |
| `plan-routing-metrics.util.ts` | itinerary → 驾驶/步行加权分钟 |
| `sync-plan-routing-metrics-to-trip.util.ts` | 写入 `trip_plan_request.routing_metrics` |
| `post-repair-routing-sync.util.ts` | REPAIR 后指标 + `post_repair_dominant_axiom_cid` |
| `axiom-evidence-validator.util.ts` | `AXIOM_VALIDATION_REGISTRY`（test throw / dev warn） |
| `axiom-l3-proof.util.ts` | 动态 L3 refId（`metric_details`） |
| `axiom-prometheus.util.ts` | `match_source` / CID 标签归一化 |

---

## 测试与回归

```bash
npx jest src/agent/axioms \
  src/agent/utils/intake-predictive-simulator.util.spec.ts \
  src/agent/utils/terminal-audit-report.simulated-to-real-join.spec.ts
```

（当前 **29** 条相关用例，含 PLAN_GEN 8.5h、REPAIR 360min 消警、evidence_schema、Yaris F208 端到端。）

---

## 优化七公理入口（只读引用）

- 定义：`src/trips/decision/optimization/axioms/axiom-system.ts`
- 验证服务：`src/trips/decision/optimization/axioms/axiom-validator.service.ts`
- 路线图：`src/trips/decision/optimization/EVOLUTION_ROADMAP.md`

**不要**从本目录 `import` 优化模块；跨轨集成需单独 ADR + Bridge PR。
