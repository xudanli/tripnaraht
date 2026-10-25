# TripNARA Code Retirement Audit（Phase 1 — 只读）

> **审计日期：** 2026-08-11  
> **范围：** `src/`  
> **原则：** No evidence, no delete.  
> **本阶段禁止：** `rm` / `git rm` / 大规模 move / 重构 / 改 import / 改 tsconfig exclude / 自动删 unused。  
> **交付物：** 仅本审计报告；**不改业务代码**。

---

## 0. 执行摘要

仓库处于 **生产切换期（Production Transition）**，不是退役完成期。`src/decision-runtime/PRODUCTION_TRANSITION.md` 明确：**Legacy 退役条件尚未满足**。

当前形态是 **多链并存 + 门控/软闸 + cutover 旁路未接线**：

| 现象 | 证据结论 |
|------|----------|
| 编排权威 | 仍是 `ClaudeOrchestratorService`（~16k 行）+ ExecutionGateway L1 |
| routing 迁出 | ~75 个 `*.runner.ts` 中绝大多数 **无生产 import**（仅 facade / 单测） |
| Decision | Canonical Gateway / Kernel / UWC 与 Legacy V1.5 / TripDecisionEngine **并存** |
| Memory | Travel Memory Runtime = Shadow/Selective Soft；**旧 Memory OS 仍是主路径** |
| P3 归档 | 文档称已迁入 `archives/p3-orphans/`，但 **`archives/` 不存在**，`src/cron`、`src/tasks`、`src/trip-templates` **仍在 src** |

**DELETE_CANDIDATE 极少**：严格六条件过滤后，仅少数「未注册 + 无生产入口 + 有明确归档/替代声明或纯研究自引用」条目达标。大量「看起来冗余」的代码是 **LEGACY fallback / SHADOW / CUTOVER_UNWIRED**，删了会毁掉迁移或降级路径。

---

## 1. 状态定义

| 状态 | 含义 |
|------|------|
| **ACTIVE_PRODUCTION** | 在 App/下游 Nest 图中可达，且有 Controller / Scheduler / Queue / CLI / Bootstrap 或被主链静态 import |
| **SHADOW** | 并行观测/对照，默认不改写 Effective Plan 或产品权威结果 |
| **LEGACY** | 旧实现，仍可作为 fallback / 兼容 / SSOT 拦截前的代码面 |
| **EXPERIMENTAL** | Feature flag / pilot / Gate1 等实验面 |
| **HARNESS_TEST** | harness / golden / e2e / contract spec 专用 |
| **UNKNOWN** | 无法在本轮证明用途 |

**recommendation 仅允许：** `KEEP` | `REVIEW` | `ISOLATE_FIRST` | `DELETE_CANDIDATE`

**DELETE_CANDIDATE 必须同时满足：**

1. 无生产入口  
2. 无 Nest 注册（运行时模块图中未挂载）  
3. 无动态调用证据  
4. 无主链引用  
5. 仅测试引用或完全无引用  
6. 已有明确替代实现，**或**能力已正式废弃/文档声明归档  

---

## 2. `src/` 一级模块分类总表

说明：二级重点模块在 §3–§5 展开。分类依据 = `app.module.ts` 直接挂载 ∪ 经 `TripsModule`/`AgentModule`/`DecisionModule`/`Gate1`/`RagModule` 等下游可达 ∪ 文档/开关证据。

| 一级 path | current_status | nest / 入口摘要 | recommendation |
|-----------|----------------|-----------------|----------------|
| `admin/` | ACTIVE_PRODUCTION | App 注册；多 Controller | KEEP |
| `agent/` | ACTIVE_PRODUCTION | App 注册；`route_and_run` 主入口 | KEEP（内部见 §5） |
| `analytics/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `assets/` | UNKNOWN | 无 Nest；静态/mock 资源 | REVIEW |
| `assist/` | ACTIVE_PRODUCTION | 无 Module；DTO 被 voice/vision/schedule-action/trips 引用 | KEEP |
| `auth/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `canonical-poi-resolution/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `causal-protocol/` | ACTIVE_PRODUCTION | 经 Gateway / ConstraintSolver / Semantics | KEEP |
| `chain-of-work/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `cities/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `common/` | ACTIVE_PRODUCTION | 共享库式 | KEEP |
| `contact/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `content-strategy/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `countries/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `cron/` | LEGACY | **未注册**；P3 称已归档但文件仍在 | **DELETE_CANDIDATE** |
| `data-architecture/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `data-contracts/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `data-fusion/` | ACTIVE_PRODUCTION | 经 DataArchitectureModule | KEEP |
| `data-modeling/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `data-pipeline/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `data-privacy/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `data-quality/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `decision/` | ACTIVE_PRODUCTION | `DecisionKernelModule` @ App | KEEP |
| `decision-capabilities/` | ACTIVE_PRODUCTION | 无 Nest Module；被 Gateway/Guardian **静态 import** | KEEP |
| `decision-draft/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `decision-lab/` | SHADOW / EXPERIMENTAL | 经 DecisionModule；`DECISION_LAB_ENABLED` | ISOLATE_FIRST |
| `decision-runtime/` | ACTIVE_PRODUCTION + SHADOW 切片 | 经 Trips/Gate1；非 App 顶层一揽子 | KEEP（见 §4） |
| `domain/` | UNKNOWN / EXPERIMENTAL | 无 Nest；ontology/policy-lab/spatial | REVIEW |
| `e2e/` | HARNESS_TEST | 测试树 | KEEP |
| `flight-prices/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `gate1/` | EXPERIMENTAL | App 注册；挂 DecisionRuntime ops | KEEP |
| `generated/` | ACTIVE_PRODUCTION | 契约生成物 | KEEP |
| `governance/` | ACTIVE_PRODUCTION | 经 Agent/Skills | KEEP |
| `guide-to-plan/` | ACTIVE_PRODUCTION | App 注册；Canonical accept | KEEP |
| `harness/` | HARNESS_TEST | App 注册 HarnessModule | KEEP |
| `hiking-demo/` | EXPERIMENTAL | App；注释「不替换决策主路径」 | KEEP |
| `hiking-plans/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `hiking-route-share/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `hiking-trail-bookmarks/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `hotels/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `iceland-info/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `iceland-road/` | ACTIVE_PRODUCTION | 经 DecisionModule | KEEP |
| `identity-governance/` | ACTIVE_PRODUCTION | App + Trips | KEEP |
| `infrastructure/` | ACTIVE_PRODUCTION | RoadIs 等 | KEEP |
| `itinerary-items/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `itinerary-optimization/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `knowledge-base/` | ACTIVE_PRODUCTION | 经 RagModule | KEEP |
| `kpu/` | ACTIVE_PRODUCTION | 经 RagModule | KEEP |
| `llm/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `loops/` | ACTIVE_PRODUCTION | 经 TripsModule | KEEP |
| `match-learning/` | LEGACY / 半孤儿 | **不在 AppModule**；engine 被 Odyssey 静态用 | ISOLATE_FIRST |
| `match-square/` | LEGACY / 半孤儿 | **不在 AppModule**；engine 被 Odyssey 静态用 | ISOLATE_FIRST |
| `mcp/` | ACTIVE_PRODUCTION | App 大量 MCP 模块 | KEEP |
| `mobile/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `monitoring/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `odyssey-intake/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `places/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `planning-policy/` | ACTIVE_PRODUCTION | App 注册；Agent 深依赖 | KEEP |
| `poi/` | REVIEW | 有 Module；与 places/providers 边界需核对 | REVIEW |
| `poi-access-capacity/` | ACTIVE_PRODUCTION | 经 Constraint/Readiness/Skills | KEEP |
| `prisma/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `providers/` | ACTIVE_PRODUCTION | POI providers 等 | KEEP |
| `rag/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `railpass/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `redis/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `reputation-os/` | LEGACY / 半孤儿 | 仅经未挂载的 MatchSquareModule | ISOLATE_FIRST |
| `research/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `route-directions/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `safety/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `schedule-action/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `shared/` | ACTIVE_PRODUCTION | 共享库式 | KEEP |
| `skills/` | ACTIVE_PRODUCTION | App 注释掉，但 Agent/Trips/MCP **仍 import** | KEEP |
| `system/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `tasks/` | LEGACY | App 注释禁用；P3 称已归档 | **DELETE_CANDIDATE** |
| `trails/` | ACTIVE_PRODUCTION | App 注释；DecisionModule 仍 import | KEEP |
| `transport/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `travel-causal-decision/` | ACTIVE_PRODUCTION | 无顶层 Module；Gateway/pack/harness 引用 | KEEP |
| `travel-cognition/` | ACTIVE_PRODUCTION | Agent/DTO/data-contracts 引用 | KEEP |
| `travel-compiler/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `travel-context/` | ACTIVE_PRODUCTION / SHADOW 目标 | App 注册；文档称未贯通 Claude SM | KEEP |
| `travel-latent-shadow/` | SHADOW / 研究孤岛 | 无 Nest；无生产 import | **DELETE_CANDIDATE** |
| `travel-memory/` | SHADOW + ACTIVE（写入） | 经 DecisionKernel + Agent | KEEP |
| `travel-ontology/` | ACTIVE_PRODUCTION | Exploration 等；含 `_deprecated` 通知文件 | KEEP / REVIEW(`_deprecated`) |
| `travel-product-catalog/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `trip-templates/` | LEGACY | App 注释禁用；P3 称已归档 | **DELETE_CANDIDATE** |
| `trips/` | ACTIVE_PRODUCTION | App 注册；巨型聚合 | KEEP（内部分层见 §4） |
| `upload/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `users/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `vision/` | ACTIVE_PRODUCTION | App 注释；PlanningAssistant/MCP 仍用 | KEEP |
| `voice/` | ACTIVE_PRODUCTION | App 注释；InTripExecution 仍用 | KEEP |
| `weather/` | ACTIVE_PRODUCTION | App 注册 | KEEP |
| `world/` | ACTIVE_PRODUCTION | 库式；CGUS/约束引用 | KEEP |
| `world-facts/` | ACTIVE_PRODUCTION | Skills/Agent-phase/Ontology | KEEP |

**AppModule 明确注释但仍可能经下游存活：** `TripTemplatesModule`、`TasksModule`、`VoiceModule`、`VisionModule`、`TrailsModule`、`ReadinessModule`、`SkillsModule` — 后四者已被 Agent/Trips/MCP 重新挂载，**不是死代码**。

---

## 3. 重复主链对照（Cutover 重点）

### 3.1 Router

| 链 | path | 状态 |
|----|------|------|
| **旧** | `agent/services/router.service.ts` | LEGACY：`routeAndRunLegacy` / 熔断末级 |
| **新 L1** | `agent/routing/gateway-route-policy.util.ts` + `execution-gateway.route-and-run.orchestration.ts` | ACTIVE：选 `LEGACY \| CLAUDE_DYNAMIC \| CLAUDE_SM` |
| **新 L2** | `agent/routing/request-router.util.ts` / facade | 部分 ACTIVE；大量 runner **未接线** |
| **废弃 shim** | `agent/utils/orchestration-policy.util.ts` | LEGACY re-export → gateway-route-policy |
| **正交** | `assistants/.../smart-router.service.ts` | Planning Assistant 产品路由，勿与 L1 混删 |

### 3.2 Planner / Orchestration

| 链 | path | 状态 |
|----|------|------|
| **旧 System2 DAG** | `agent/plan-execute/*` | LEGACY ACTIVE |
| **旧 ReAct** | `agent/services/orchestrator.service.ts` | LEGACY fallback（DAG 不可用时） |
| **生产权威** | `agent/services/claude-orchestrator.service.ts` + `orchestration/graph/**` | ACTIVE_PRODUCTION |
| **Cutover 旁路** | `agent/routing/orchestrate.runner.ts`、`planning-state-machine.runner.ts`、`dynamic-dag.runner.ts` 等 ~70+ | **CUTOVER_UNWIRED / SHADOW**：实现已抽，生产未委托 |
| **平行产品** | Planning Workbench + Kernel bridge | ACTIVE；默认 `PLANNING_WORKBENCH_KERNEL_MODE=legacy`，shadow/native 灰度 |

### 3.3 Decision

| 链 | path | 状态 |
|----|------|------|
| **旧** | `trips/decision/` TripDecisionEngine + strategies + HTTP | LEGACY；HTTP 被 Kernel SSOT 挡，内部/技能仍可达 |
| **旧语义 L1** | `trips/decision-semantics/` + `legacy-v15-engine.adapter` | LEGACY fallback |
| **新 Runtime** | `decision-runtime/gateway` + constraints + trigger | ACTIVE / SHADOW_COMPARE |
| **Canonical 核** | `trips/guardian-decision-core/` | ACTIVE（RFC-001） |
| **Agent Kernel** | `decision/` DecisionKernelModule | ACTIVE（DSO/OPTIMIZE） |
| **Lab** | `decision-lab/` | SHADOW / flag |

### 3.4 Writeback vs UWC

| 链 | path | 状态 |
|----|------|------|
| **权威写** | `decision-runtime/execution/authoritative-write/**` `@Controller('uwc/v1')` | ACTIVE_PRODUCTION |
| **过渡软闸** | `legacy-mutation-commit.adapter` / `legacy-runtime-write-guard` | LEGACY cutover leftover |
| **CGUS outcome writeback** | `trips/decision/optimization/cgus-decision-outcome-loop*` | ACTIVE（**≠** 行程 Effective 写库） |
| **Guide** | Canonical accept 已接线；Legacy accept **LEGACY_CLOSED** | leftover 代码可能仍在树内 |

### 3.5 Agent orchestration 分支

```
POST /agent/route_and_run
  → AgentController → AgentService → ExecutionGateway
       resolveGatewayRoutePolicy
       ├─ CLAUDE_SM      → ClaudeOrchestrator.orchestrateWithStateMachine → orchestration/graph
       ├─ CLAUDE_DYNAMIC → ClaudeOrchestrator.orchestrate
       └─ LEGACY         → RouterService → System1 / DAG(plan-execute) / ReAct Orchestrator
```

`SystemCollaborationService`：**Nest 已注册，全仓无调用方** → 死注册，非 DELETE（因有 Nest 注册）。

### 3.6 Memory

| 链 | 状态 |
|----|------|
| 旧 Memory OS（`agent/memory` SharedMemory + assembler） | ACTIVE 主路径（`TMR_READINESS.md`） |
| `trips/memory` Synapse MemoryModule | 并行 ACTIVE |
| Travel Memory Runtime | Evidence 写入 ACTIVE；消费 = Shadow / Selective Soft |

---

## 4. 特别审计

### 4.1 `src/agent/services/claude-orchestrator.service.ts`

| 字段 | 内容 |
|------|------|
| **path** | `src/agent/services/claude-orchestrator.service.ts` |
| **responsibility** | Claude 编排上帝对象：`orchestrate` / `orchestrateWithStateMachine`、传感器、INTAKE→NARRATE、行程变更、Kernel 阶段 |
| **current_status** | ACTIVE_PRODUCTION |
| **production_entry** | ExecutionGateway → `AgentService.routeAndRunWithClaude*`；另 TripPlanner 可调 |
| **direct_references** | `agent.module.ts`、`agent.service.ts`、`trip-planner.service.ts`、大量 spec/e2e |
| **nest_registration** | `agent.module.ts` providers |
| **dynamic_usage** | 未发现对该服务的 `import()` 动态加载 |
| **test_only_usage** | 否 |
| **replacement** | 目标：`routing/orchestrate.runner.ts` + `planning-state-machine.runner.ts` 等；**尚未接线** |
| **delete_risk** | HIGH |
| **recommendation** | **KEEP** |
| **evidence** | 生产 import `lightweight-live-sensors.runner`；**不** import `orchestrate.runner` / `planning-state-machine.runner`；与迁出 runner 形成双份实现 |

### 4.2 `src/agent/`（编排相关二级）

| path | status | recommendation | 一句话证据 |
|------|--------|----------------|------------|
| `routing/*`（L1 policy + 少量已接线 util） | ACTIVE | KEEP | gateway orchestration 引用 |
| `routing/*.runner.ts`（~70+ 未接线） | SHADOW / CUTOVER_UNWIRED | **ISOLATE_FIRST** | 仓外生产 import 扫描几乎全空；仅 facade/spec |
| `orchestration/graph/**` | ACTIVE | KEEP | Claude SM 真实调用 |
| `plan-execute/` | LEGACY ACTIVE | KEEP | `executeSystem2PlanAndExecute`；module 内有 `require('../agent.module')` |
| `services/router.service.ts` | LEGACY ACTIVE | KEEP / 可 ISOLATE_FIRST 加度量 | LEGACY 分支入口 |
| `services/orchestrator.service.ts` | LEGACY fallback | ISOLATE_FIRST | DAG 失败时 ReAct |
| `services/system-collaboration.service.ts` | LEGACY 死注册 | **ISOLATE_FIRST** | 仅 module 注册，无调用 |
| `utils/orchestration-policy.util.ts` | LEGACY shim | REVIEW | `@deprecated` re-export；agent.service/shadow 仍 import 类型 |
| Planning Workbench* | ACTIVE + bridge SHADOW | KEEP | 独立 HTTP/Workbench；非 Claude SM 范围 |
| intent/decision-state `*shadow*` | SHADOW | KEEP | 观测对比 |

### 4.3 `src/decision-runtime/`

| path | status | recommendation | 证据 |
|------|--------|----------------|------|
| gateway / constraints / authoritative-write / trigger | ACTIVE (+ SHADOW modes) | KEEP | TripsModule 切片；UWC Controller |
| `decision-runtime.module.ts`（Gate1 ops/outbox） | EXPERIMENTAL/ops | KEEP | Gate1Module；勿与 Gateway 混删 |
| `legacy-v15-engine.adapter.ts` | LEGACY | ISOLATE_FIRST | engineId `LEGACY_V15` |
| `legacy-checker.provider.ts` | LEGACY / SHADOW_COMPARE | ISOLATE_FIRST | 约束双跑腿 |
| `legacy-frozen.strategy.ts` | ACTIVE Authority（未签核替换） | KEEP | PRODUCTION_TRANSITION：优化 Authority 仍可是 legacy-frozen |
| `decision-lab` 消费 / fixtures | SHADOW | ISOLATE_FIRST | flag 关闭则无业务写 |
| `PRODUCTION_TRANSITION.md` / P5 catalogs | 文档/门禁 | KEEP | **Legacy 退役条件未满足** |

### 4.4 `src/trips/`（决策/研究相关）

| path | status | recommendation | 证据 |
|------|--------|----------------|------|
| `decision/` DecisionModule | LEGACY + 仍大量生产依赖 | ISOLATE_FIRST | App←Trips；引擎/策略/HTTP |
| `guardian-decision-core/` | ACTIVE | KEEP | Canonical RFC-001 |
| `decision-semantics/` | LEGACY fallback | REVIEW | Gateway 关时默认面 |
| `memory/` | ACTIVE 并行旧 Memory | ISOLATE_FIRST | 与 TMR 双轨 |
| `execution-vm` / `execution-simulation` / `execution-ir` | LEGACY 研究↔引擎 | REVIEW | Neptune / trip-decision-engine 引用 |
| `meta-dynamics` / `recursive-semantics` / `computational-ontology` | LEGACY 增强 | REVIEW | **被 `trip-decision-engine.service.ts` 运行时调用** `buildP7/P8/P10` |
| `multiverse/` | ACTIVE 类型被 simulation/agent 用 | KEEP | robustness 类型 |
| `goal-kernel/` | UNKNOWN 研究孤岛 | REVIEW→趋向 DELETE 需二轮 | **无外部 import**；无 Nest |
| `ontology-collapse/` | UNKNOWN 研究孤岛 | REVIEW→趋向 DELETE 需二轮 | **无外部 import**；无 Nest |
| `self-nullification/` + `observer-rewrite/` | UNKNOWN 研究岛 | REVIEW | 仅彼此引用；无 Nest；无主链 |
| `meta-reality/` | UNKNOWN | REVIEW | 被 `observer/observable-reality.types` 引用 |

---

## 5. Top 20 最高置信度冗余候选

> 按「可退役置信度」排序；**不等于**立刻可删。仅标注 `DELETE_CANDIDATE` 的条目满足六条件。

### #1 `src/travel-latent-shadow/`

| 字段 | 内容 |
|------|------|
| path | `src/travel-latent-shadow/` |
| responsibility | 隐式信号 Shadow 研究：解析假设、divergence、禁止写 Plan |
| current_status | SHADOW / 研究孤岛 |
| production_entry | **无** |
| direct_references | 仅包内 + `latent-shadow.contract.spec.ts`；仓内无 `from '...travel-latent-shadow'` 生产 import |
| nest_registration | **无** |
| dynamic_usage | 无证据 |
| test_only_usage | 是（contract spec） |
| replacement | 显式 DecisionScope / 正式 Intent 路径；Charter：`internal-docs/product/LATENT-IMPLICIT-PARSE-SHADOW-CHARTER.md` |
| delete_risk | LOW（对生产主链） |
| recommendation | **DELETE_CANDIDATE** |
| evidence | Grep 无生产 import；无 `*.module.ts`；`assertLatentShadowMustNotWritePlan` 自证非写路径 |

### #2 `src/cron/`（`SyncRoadStatusCron` / `SyncWeatherCron`）

| 字段 | 内容 |
|------|------|
| path | `src/cron/sync-road-status.cron.ts`, `src/cron/sync-weather.cron.ts` |
| responsibility | 曾计划的道路/天气日同步 Cron |
| current_status | LEGACY / 未挂载 |
| production_entry | **无**（注释要求手动加 providers，未执行） |
| direct_references | 自文件 + `p3-module-cleanup-status.util.ts` 点名 |
| nest_registration | **无**（无 module；未进 App providers） |
| dynamic_usage | 无 |
| test_only_usage | 基本无 |
| replacement | P3 声明：Road `EnvSyncWorkerService`/scripts；天气由其他 world 服务 |
| delete_risk | LOW |
| recommendation | **DELETE_CANDIDATE** |
| evidence | `P3_MODULE_CLEANUP.md` 列入 `unregisteredCronsRemoved` 且声称迁入 `archives/p3-orphans/cron`；**但 `archives/` 不存在，文件仍在 src** → 归档未完成的死代码 |

### #3 `src/tasks/`（`TasksModule` / 汇率 Cron）

| 字段 | 内容 |
|------|------|
| path | `src/tasks/tasks.module.ts`, `tasks.service.ts` |
| responsibility | 每日汇率更新 `@Cron` |
| current_status | LEGACY |
| production_entry | **无**（`app.module.ts` 注释 `// TasksModule`） |
| direct_references | 仅自身 + App 注释 + approval-cleanup 文档提及 |
| nest_registration | Module **定义存在**，**运行时未导入** |
| dynamic_usage | 无 |
| test_only_usage | 无实质测试入口 |
| replacement | P3：Currency MCP / admin FX |
| delete_risk | LOW–MEDIUM（若有人依赖静默汇率任务会失效——但模块本未挂载，生产上从未跑） |
| recommendation | **DELETE_CANDIDATE** |
| evidence | App 禁用；P3 `archivedOrphans` 含 `archives/p3-orphans/tasks`；archives 缺失 |

### #4 `src/trip-templates/`

| 字段 | 内容 |
|------|------|
| path | `src/trip-templates/` |
| responsibility | 行程模板 CRUD HTTP |
| current_status | LEGACY |
| production_entry | **无**（App 注释禁用） |
| direct_references | 仅自身 module/controller/service |
| nest_registration | Module 存在，**未挂 App** |
| dynamic_usage | 无 |
| test_only_usage | 无主链测试依赖证据 |
| replacement | Trips 创建/Guide-to-Plan/Exploration 物化路径；P3 标归档 |
| delete_risk | LOW |
| recommendation | **DELETE_CANDIDATE** |
| evidence | `app.module.ts:138` 注释；`P3_MODULE_CLEANUP.md` 表项；Controller 不可达 |

### #5 `src/agent/services/system-collaboration.service.ts`

| 字段 | 内容 |
|------|------|
| path | `src/agent/services/system-collaboration.service.ts` |
| responsibility | System1∥System2 协作实验 |
| current_status | LEGACY 死注册 |
| production_entry | **无调用** |
| direct_references | **仅** `agent.module.ts` import + providers |
| nest_registration | **有** |
| dynamic_usage | 无 |
| test_only_usage | 无专项 |
| replacement | route_and_run 稳定性层 + Claude 路径 |
| delete_risk | MEDIUM（摘 providers 需确认 DI 图） |
| recommendation | **ISOLATE_FIRST**（因有 Nest 注册，**不**标 DELETE） |
| evidence | Grep `SystemCollaborationService` 仅 module + 自身 |

### #6–#10 Cutover 未接线 runners（代表项）

下列均满足：无 Nest、无仓外生产 import、有明确「从 ClaudeOrchestrator 抽出」目标，但 **自身即 replacement 且权威仍在 Service 内** → **禁止 DELETE**，标 **ISOLATE_FIRST**。

| # | path | responsibility | evidence | recommendation |
|---|------|----------------|----------|----------------|
| 6 | `agent/routing/orchestrate.runner.ts` | 抽出的 `orchestrate` | 仅 facade export + 内部；Claude 服务未委托 | ISOLATE_FIRST |
| 7 | `agent/routing/planning-state-machine.runner.ts` | 抽出的 SM 路径 | 仅 facade + `*.spec.ts` | ISOLATE_FIRST |
| 8 | `agent/routing/dynamic-dag.runner.ts` | 抽出的 DYNAMIC DAG | 仅 facade + spec；被 orchestrate.runner 内部引用 | ISOLATE_FIRST |
| 9 | `agent/routing/execute-plan.runner.ts` | 抽出的 executePlan | 仅 facade + spec | ISOLATE_FIRST |
| 10 | `agent/routing/` 其余 ~65 个 `NO_PROD_REF` runners | 阶段/技能/澄清/传感器旁路实现副本 | 扫描：仓外生产路径无引用（除已接线的 live-sensors / lightweight-path / L1 policy） | ISOLATE_FIRST |

**已接线例外（勿当作冗余）：**  
`lightweight-live-sensors.runner` ← `claude-orchestrator.service.ts`；`lightweight-path.runner` ← `itinerary-day-view-fast-path.util.ts`；`resolveGatewayRoutePolicy` ← execution-gateway orchestration。

### #11 `src/agent/utils/orchestration-policy.util.ts`

| 字段 | 内容 |
|------|------|
| path | `src/agent/utils/orchestration-policy.util.ts` |
| responsibility | `@deprecated` 兼容 re-export → `gateway-route-policy.util` |
| current_status | LEGACY |
| production_entry | 类型仍被 `agent.service` / shadow evaluators / routing projection 引用 |
| nest_registration | 无 |
| dynamic_usage | 无 |
| test_only_usage | 大量 spec 仍直接 `routePolicy` |
| replacement | `routing/gateway-route-policy.util.ts` |
| delete_risk | MEDIUM |
| recommendation | **REVIEW**（迁完 import 后再删） |
| evidence | 文件头 deprecated；生产仍 import type |

### #12 `src/match-square/` Nest 壳 + #13 `src/match-learning/` Nest 壳 + #14 `src/reputation-os/` Nest 壳

| 字段 | 内容 |
|------|------|
| path | `match-square/`、`match-learning/`、`reputation-os/` |
| responsibility | 匹配广场 / 学习权重 / 声誉 OS |
| current_status | LEGACY / 半孤儿 |
| production_entry | **Nest Module 未进 AppModule**；但 **engine/types 被 `odyssey-intake` 静态 import** |
| nest_registration | Module 文件存在；**运行时未挂**（P3 `keepAppOrphanModules`） |
| dynamic_usage | 无强证据 |
| test_only_usage | 有 unit specs |
| replacement | Odyssey Intake 冷启动；模块壳可与 engine 分离 |
| delete_risk | HIGH（若整树删除会断 Odyssey） |
| recommendation | **ISOLATE_FIRST**（可拆「未挂载 Nest 壳 / Controller / Scheduler」；**禁止整目录 DELETE**） |
| evidence | `P3_MODULE_CLEANUP.md`：「Engines/types used by Odyssey; Nest module itself unwired — do not delete trees」 |

### #15 `src/trips/decision/`（旧 Decision Engine 面）

| 字段 | 内容 |
|------|------|
| path | `src/trips/decision/`（含 `trip-decision-engine.service.ts`、HTTP controllers） |
| responsibility | Trip Decision OS V1.5 / 策略 / 引擎 HTTP |
| current_status | LEGACY（HTTP SSOT 挡；内部仍用） |
| production_entry | DecisionModule ← TripsModule；技能/内部注入 |
| nest_registration | **有** |
| dynamic_usage | DecisionModule 内有 `require()` 动态加载 Data*；Trigger `routeTarget` 字符串 |
| test_only_usage | 否 |
| replacement | Decision Gateway + Guardian Canonical + Decision Kernel |
| delete_risk | **HIGH** |
| recommendation | **ISOLATE_FIRST** |
| evidence | `PRODUCTION_TRANSITION.md` Legacy 退役未满足；引擎仍调用 P7/P8/P10 增强 |

### #16 `src/trips/memory/`（旧 Synapse Memory）

| 字段 | 内容 |
|------|------|
| path | `src/trips/memory/` |
| responsibility | 行程侧 MemoryModule / Controller |
| current_status | LEGACY 并行 |
| production_entry | TripsModule 注册 |
| nest_registration | 有 |
| replacement | Travel Memory Runtime（**尚未** Full Consume） |
| delete_risk | HIGH |
| recommendation | **ISOLATE_FIRST** |
| evidence | `TMR_READINESS.md`：旧 Memory OS 仍是主路径；TMR 为并列 soft |

### #17 Legacy write / mutation soft-gate

| 字段 | 内容 |
|------|------|
| path | `decision-runtime` 下 `legacy-mutation-commit.adapter` / `legacy-runtime-write-guard` 及相关 agent 注入点 |
| responsibility | 旧静默写观测/软闸；与 UWC 权威写并存 |
| current_status | LEGACY cutover leftover |
| production_entry | route_and_run 观测注入等 |
| nest_registration | 经 EffectivePlan / Agent 图 |
| replacement | UWC `uwc/v1` + EffectivePlanWriter |
| delete_risk | HIGH（过早删除会失去旁路防护） |
| recommendation | **ISOLATE_FIRST** |
| evidence | UWC 走廊 canary 文档；AUTHORIZED flags 与 legacy XOR 逻辑仍在 |

### #18 `src/decision-lab/`

| 字段 | 内容 |
|------|------|
| path | `src/decision-lab/` |
| responsibility | Solver lab / dual-run benchmark |
| current_status | SHADOW / EXPERIMENTAL |
| production_entry | `DECISION_LAB_ENABLED` 控制的 lab HTTP |
| nest_registration | 经 DecisionModule |
| replacement | 生产 Canonical 路径；lab 应迁出生产 Nest |
| delete_risk | MEDIUM |
| recommendation | **ISOLATE_FIRST** |
| evidence | flag 门控；fixtures 仍被 runtime tests 使用 → 非整树可删 |

### #19 `src/agent/services/orchestrator.service.ts` + Critic/LlmPlan

| 字段 | 内容 |
|------|------|
| path | `orchestrator.service.ts`（及 critic / llm-plan） |
| responsibility | 旧 ReAct 环 |
| current_status | LEGACY fallback |
| production_entry | `routeAndRunLegacy` 当 DAG 不可用 |
| nest_registration | 有 |
| replacement | Claude SM/DYNAMIC；短期仍是熔断底 |
| delete_risk | HIGH |
| recommendation | **ISOLATE_FIRST**（先打点命中率） |
| evidence | AgentService LEGACY 分支 |

### #20 研究孤岛簇（`goal-kernel` / `ontology-collapse` / `self-nullification` / `observer-rewrite`）

| 字段 | 内容 |
|------|------|
| path | `src/trips/{goal-kernel,ontology-collapse,self-nullification,observer-rewrite}/` |
| responsibility | P-series 研究内核（目标编译 / 本体坍缩 / 自我消解 / 观察者改写） |
| current_status | UNKNOWN / EXPERIMENTAL |
| production_entry | **无** |
| direct_references | **无 Nest**；`goal-kernel`/`ontology-collapse` **零外部 import**；后两者仅互引 |
| nest_registration | 无 |
| dynamic_usage | 无证据 |
| test_only_usage | 自包 `*.spec.ts` |
| replacement | **无正式替代声明**；亦无「正式废弃」公告 |
| delete_risk | LOW–MEDIUM（误删研究资产） |
| recommendation | **REVIEW**（证据接近 DELETE，但不满足「已正式废弃/明确替代」→ **本轮不标 DELETE_CANDIDATE**） |
| evidence | 外部 Grep 为空；对比 `meta-dynamics` 等仍被 `trip-decision-engine` 调用 |

---

## 6. 候选项详细卡（补充：主链 KEEP 对照）

### KEEP — 生产主链关键（禁止当冗余删）

| path | responsibility | status | production_entry | nest | recommendation |
|------|----------------|--------|------------------|------|----------------|
| `agent/services/claude-orchestrator.service.ts` | 编排权威 | ACTIVE | route_and_run Claude* | 有 | KEEP |
| `agent/orchestration/graph/**` | SM 图运行时 | ACTIVE | Claude SM | 无 Nest（静态） | KEEP |
| `decision/decision-kernel.module.ts` | Agent DSO/OPTIMIZE | ACTIVE | App | 有 | KEEP |
| `decision-runtime/execution/authoritative-write/**` | UWC 写权威 | ACTIVE | `uwc/v1` | 有 | KEEP |
| `trips/guardian-decision-core/` | RFC-001 Canonical | ACTIVE | evaluate/finalize | 有 | KEEP |
| `planning-policy/` | 规划策略库 | ACTIVE | Agent 深依赖 | App | KEEP |
| `guide-to-plan/` | 攻略→计划 | ACTIVE | App Controller | 有 | KEEP |
| `travel-memory/` | TMR | SHADOW+写 | Kernel/Agent | 有 | KEEP |
| `agent/memory/` SharedMemory | 旧 Memory OS 主路径 | ACTIVE | prepareTick 等 | App | KEEP |

---

## 7. 链路总览（本轮额外输出）

### 7.1 当前生产主链

```
Client / iOS
  → POST /api/agent/route_and_run
  → ExecutionGateway L1 (resolveGatewayRoutePolicy)
  → ClaudeOrchestrator (SM 优先 / DYNAMIC)
       → orchestration/graph + plan-verify-loop
       → Skills / MCP / Planning Policy / Decision Kernel (DSO/OPTIMIZE)
  →（决策治理）Decision Trigger/Gateway → Snapshot → Constraint → Assembler
       → Optimization（默认仍可 legacy-frozen）→ finalize
       → Authorization → EffectivePlan Executor
  → 写库权威：UWC Preview→Confirm→Apply (`/api/uwc/v1/...`)
  → Guide accept：GuideCanonicalAccept → Guardian finalize → PlanVersion
  → Memory 读主路径：旧 Memory OS / SharedMemory；TMR 写入 Episode/Ledger
```

并行产品面（仍属生产，非 Shadow）：Planning Workbench、Exploration/Attraction/Arrange BFF、Mobile BFF、Hiking*、Odyssey Intake。

### 7.2 当前 Shadow 链

| 链 | 开关 / 入口 |
|----|-------------|
| Constraint SHADOW_COMPARE | `CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE` |
| OR-Tools / Lex shadow | `OR_TOOLS_*`；`writeAttempted=false` |
| RFC-001 / Decision Runtime SHADOW | `DECISION_RUNTIME_MODE=SHADOW` / `RFC001_SHADOW_MODE` |
| UWC SHADOW_VALIDATE 走廊 | corridor write-mode config |
| Travel Context Assembly | `TRAVEL_CONTEXT_ASSEMBLY=shadow\|consume` |
| Travel Memory soft consume | CGUS `scoringHints`；`used` 门控 |
| Unified Intent / Decision-state / Routing shadow evaluators | env / prepareTick 观测 |
| Planning Workbench ↔ Kernel `shadowDiff` | `PLANNING_WORKBENCH_KERNEL_MODE=shadow` |
| Decision Lab dual-run | `DECISION_LAB_ENABLED=1` |
| `travel-latent-shadow` | 研究包（未接线） |

### 7.3 当前 Legacy 链

| 链 | 备注 |
|----|------|
| Agent `LEGACY` orchestration | RouterService → System1 / plan-execute DAG / ReAct |
| TripDecisionEngine + guardians 策略 + decision-engine HTTP | HTTP SSOT 挡；代码未删 |
| Legacy V1.5 engine adapter / decision-semantics L1 | Gateway 非 Canonical 时 |
| ConstraintChecker / legacy-checker | SHADOW_COMPARE / compat |
| legacy-frozen 优化策略 | 仍可能是 Authority |
| legacy mutation / write soft-gate | 与 UWC 并存 |
| 旧 Memory OS + `trips/memory` | TMR 未 Full Consume |
| App 注释但仍下游存活：Skills/Trails/Voice/Vision/Readiness | **不是死链** |

### 7.4 已完成 cutover 但未退休的代码

| 项 | 说明 |
|----|------|
| UWC 走廊 AUTHORITATIVE / canary 常量 | 权威写已切；legacy soft-gate / XOR 仍留 |
| Guide Legacy accept **LEGACY_CLOSED** | Canonical accept 已接线；旧面代码可能仍在树 |
| Decision Engine HTTP SSOT 阻断 | Controller/服务未删 |
| `routing/*.runner.ts` 大面积抽出 | **生产未委托**（双份实现） |
| P3「已归档」cron/tasks/trip-templates | 文档完成、**物理归档未完成**（`archives/` 缺失） |
| MatchSquare/MatchLearning Nest 壳 | engine 已由 Odyssey 使用；Module 未挂 App |
| `orchestration-policy.util` deprecated shim | 替代已存在，import 未收口 |

### 7.5 无法证明用途的代码（UNKNOWN）

| path | 为何无法证明 |
|------|----------------|
| `src/assets/`（部分 mocks/strategy） | 无 Nest；需逐文件追静态引用 |
| `src/domain/policy-lab` 等 | 无 Module；与主链边界不清 |
| `src/trips/goal-kernel` | 零外部引用，无废弃公告 |
| `src/trips/ontology-collapse` | 零外部引用，无废弃公告 |
| `src/trips/self-nullification` + `observer-rewrite` | 仅互引研究岛 |
| `src/trips/meta-reality` | 仅弱类型引用，非主链入口 |
| `DecisionRuntimeModule` vs Gateway 同树不同职 | 易误判冗余，实为 Gate1 ops |
| 部分 `generated/` 未消费契约 | 需契约清单对照 |

---

## 8. 动态 / 字符串 / 反射入口（退役风险提示）

删除或隔离前必须再扫：

- L1 mode 字符串：`LEGACY` / `CLAUDE_SM` / `CLAUDE_DYNAMIC` / LIGHTWEIGHT  
- Gateway `engineId`：`CANONICAL_L2` / `LEGACY_V15`  
- Trigger `routeTarget`：`LEGACY_DECISION_ENGINE` / `CANONICAL_L2_EVALUATE` / `AGENTIC_ORCHESTRATION`  
- UWC corridor env：`UWC_CORRIDOR_MODE_*`  
- `PHASE6_LEGACY_DEPRECATION`、`PLANNING_WORKBENCH_KERNEL_MODE`、`TRAVEL_CONTEXT_ASSEMBLY`  
- `plan-execute.module.ts`：`require('../agent.module')`  
- `DecisionModule`：`require()` 加载 DataQuality/DataModeling  
- SSOT headers：`x-decision-kernel-ssot` / `x-legacy-engine-bypass`  
- Skills：`ENABLE_SKILLS_MODULE` 等 flag  

---

## 9. Phase 2 建议顺序（仅建议，本轮不执行）

1. **物理完成 P3 归档**：将已标 DELETE_CANDIDATE 的 `cron` / `tasks` / `trip-templates` / `travel-latent-shadow` 迁入真实 `archives/`（或删），并修正文档与 `p3-module-cleanup-status.util.ts` 路径真实性。  
2. **ISOLATE**：从 `agent.module` providers 摘掉 `SystemCollaborationService`；MatchSquare/Reputation Nest 壳与 Odyssey engine 拆包。  
3. **Cutover 真接线**：`ClaudeOrchestrator.orchestrate*` **委托**已迁出 runner，消灭双份后，再谈删 Service 内副本（当前删 runner = 毁迁移）。  
4. **度量后收口 LEGACY**：`mode_final` 分布、ReAct 命中、Constraint DEFAULT_ON、Canonical flip — 未过 `PRODUCTION_TRANSITION` 门禁前 **禁止**删 `trips/decision` 核 / legacy-frozen / plan-execute。  
5. **Memory**：TMR Full Consume 签核前，保留旧 Memory OS 与 `trips/memory`。  
6. **研究孤岛**：对 `goal-kernel` 等补「正式废弃」或迁 archives 的书面裁决后，再升格 DELETE_CANDIDATE。

---

## 10. 本轮合规声明

| 项 | 状态 |
|----|------|
| 是否删除文件 | **否** |
| 是否重构 / 改 import / 改生产逻辑 | **否** |
| 是否改 tsconfig exclude | **否** |
| 唯一产出 | **本文件 `internal-docs/archive/retirement/CODE_RETIREMENT_AUDIT.md`** |
| DELETE_CANDIDATE 数量 | **4 组路径**（#1–#4）；其余为 KEEP / REVIEW / ISOLATE_FIRST |
| 核心原则 | **No evidence, no delete.** |

---

## 附录 A — AppModule 直接 imports（生产挂载面速查）

`PrismaModule`, `TripRevisionModule`, `SharedMemoryModule`, `RoadIsModule`, `AuthModule`, `RedisModule`, `DataContractsModule`, `DataQualityModule`, `DataPrivacyModule`, `DataPipelineModule`, `DataModelingModule`, `DataArchitectureModule`, `ContentStrategyModule`, `SystemModule`, `MonitoringModule`, `ContactModule`, `UsersModule`, `OdysseyIntakeModule`, `CountriesModule`, `CitiesModule`, `WeatherModule`, `IcelandInfoModule`, `LlmModule`, `PlacesModule`, `TravelProductCatalogModule`, `CanonicalPoiResolutionModule`, `TravelCompilerModule`, `FlightPricesModule`, `HotelsModule`, `ItineraryItemsModule`, `ItineraryOptimizationModule`, `PlanningPolicyModule`, `TransportModule`, `ScheduleActionModule`, `TripsModule`, `RailPassModule`, `DemModule`, `HikingDemoModule`, `HikingPlansModule`, `HikingTrailBookmarksModule`, `HikingRouteShareModule`, `RouteDirectionsModule`, `RagModule`, `AgentModule`, `ContextEngineModule`, `DecisionKernelModule`, `HarnessModule`, `UploadModule`, `ChainOfWorkModule`, `DecisionDraftModule`, `AdminModule`, 多 MCP 模块, `AnalyticsModule`, `SafetyModule`, `WorldModelSchedulerModule`, `IdentityGovernanceModule`, `Gate1Module`, `GuideToPlanModule`, `ExplorationModule`, `AttractionExploreModule`, `ContextualRecommendationsModule`, `CopilotModule`, `ArrangeItineraryModule`, `ResearchModule`, `TravelContextModule`, `MobileModule`。

## 附录 B — Runner 无生产引用扫描方法

对 `src/agent/routing/*.runner.ts`（共 75）在 **排除 `src/agent/routing/` 自身** 后扫描标识符引用；结果中标注 `NO_PROD_REF` 的条目构成 §5 #6–#10 证据基线（2026-08-11）。已接线例外见 §5。

---

*End of Phase 1 Code Retirement Audit.*
