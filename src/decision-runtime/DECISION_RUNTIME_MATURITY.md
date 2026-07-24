# Decision Runtime — 六层映射、成熟度与治理收敛

> **Status:** Living document（2026-07-02）  
> **Audience:** 架构 / 后端 / 决策引擎 / 前端决策中心  
> **Product positioning:** [TRIPNARA_AI_NATIVE_POSITIONING.md](../../internal-docs/product/TRIPNARA_AI_NATIVE_POSITIONING.md)  
> **Related:** [DECISION_RUNTIME_ROADMAP](./DECISION_RUNTIME_ROADMAP.md) · [ADR-006](./constraints/ADR-006-Unified-Decision-Runtime.md) · [ADR-007](./ADR-007-Decision-Runtime-v2.md) · [DECISION_RUNTIME_ENV](./DECISION_RUNTIME_ENV.md) · [NEXT_PHASE](./benchmark/NEXT_PHASE.md)

---

## 1. 一句话现状

TripNARA **不是缺少决策能力**，而是已有很多能力，但尚未完全收敛成一条 **默认、统一、可治理** 的 Decision Runtime 主链。

**更精确地说：** Decision Runtime v2 的 **骨架、权威边界与执行安全** 已经成立；当前缺的不是更多智能，而是让已有智能 **统一接入同一套决策治理**。

> TripNARA 现在已经有了一套正确的「宪法」；接下来要做的是让所有旧机构、新 Agent 和求解策略，都真正按照这套宪法运行。

---

## 2. 六层职责映射

| 层 | 负责什么 | 代码中的主要落点 |
|----|----------|------------------|
| **Agentic** | 理解、拆解、搜索、生成候选、修复候选、解释 | `ClaudeOrchestratorService`、`DecisionKernelService`、MCP Tool Loop、`TripDecisionEngine`（候选）、Neptune 修复 |
| **Constraint** | 判断现实上能不能 | `ConstraintEvaluationGatewayService` → `CanonicalConstraintReport` |
| **Optimization** | 在可行方案中选哪个 | `OptimizationStrategy`（`legacy-frozen`、`cp-sat-lexicographic`、future weighted/LNS） |
| **Decision Core** | 把选择变成正式决策记录（权威边界，非求解器） | `DecisionCoreService.finalize()` → `DecisionRecord (PROPOSED)` |
| **Authorization** | 决定是否允许成为正式决定 / 执行具体动作 | `Rfc001AuthorizationService`、Execution Policy Gateway、Action preview/commit |
| **Executor** | 真正修改 Effective Plan | `Rfc001PlanVersionApplyExecutor`（`authorize → execute`）+ Write Guard |
| **Monitoring** | 感知变化并触发决策 Run | `DecisionProblemDetectorService`、Kernel `shouldReplan`、InTripRecoveryLoop；**缺** Trigger Gateway / ReplanningPolicy |

### 2.1 完整正式链路（目标形态）

```
Agent 发现问题
  → Neptune 生成修复候选
  → Constraint Gateway 评估
  → Optimization Strategy（Lex / legacy-frozen）选择
  → Decision Core 形成正式记录
  → Authorization 审批
  → Executor 应用
```

**Lex 属于 Optimization 层**，不属于 Agentic：它不会主动查天气，也不会自己生成替代路线；只接收候选 + 约束报告做比较与选择，输出仍须经过 `DecisionCore.finalize`。

**Abu / Dr.Dre / Neptune** 属于 **候选生成与 Critic Provider**，不是平行的 Decision Runtime。

---

## 3. 关键概念校正（必读）

### 3.1 两个正交维度：Runtime 链路 vs 选择策略

| 维度 | 控制什么 | 环境变量 / 标识 |
|------|----------|-----------------|
| **Runtime 链路** | 走 Legacy 端到端，还是 Canonical v2 主链 | `DECISION_RUNTIME_MODE`：`LEGACY` / `SHADOW` / `CANONICAL` … |
| **Optimization 策略** | Canonical 主链内用哪种选择语义 | `OPTIMIZATION_STRATEGY_MODE` / `strategyId`：`legacy-frozen`、`cp-sat-lexicographic` … |

因此完全合法且符合设计意图的过渡态是：

```
Canonical Snapshot
  → Constraint Gateway
  → OptimizationProblem
  → legacy-frozen Strategy          ← 策略名含 "legacy"，但不是 Legacy Runtime
  → DecisionCore.finalize
```

| 术语 | 含义 |
|------|------|
| **Legacy Runtime** | 旧的 **端到端** 编排与决策路径（Claude/ReAct/Kernel 分流，未必经 Gateway / finalize） |
| **legacy-frozen** | 被 **包进新 Runtime** 的旧选择语义；消费已组装的 `OptimizationProblem`，内部调用 `DecisionCore.finalize` |

**`legacy-frozen` ≠ Legacy Runtime。**

未来可在 **不改变** Constraint、Authorization、Executor 的前提下，将 `legacy-frozen` 替换为 `cp-sat-lexicographic` / native CP-SAT / `bounded-lns-repair`。

### 3.2 Decision Core 是权威边界，不是高级求解器

`DecisionCore.finalize()` 的核心价值不是「算法多高级」，而是 **所有策略必须经过的统一决策权威边界**。

| 组件 | 职责 |
|------|------|
| **Optimization Strategy** | 怎么比较和选择候选 |
| **DecisionCore.finalize** | 接收候选、应用硬约束淘汰、接收策略排序结果、生成正式 `DecisionRecord`、标记 `PROPOSED`、进入 Authorization |

即使未来接入 Native CP-SAT：

```
Native CP-SAT 生成/选择候选
  → DecisionCore.finalize
  → DecisionRecord
```

**Decision Core 仍然不可绕过。**

表述上应避免「生产仍是 naive finalize」——应说：**选择策略仍处保守/实验期，但权威边界已统一在 finalize。**

---

## 4. 六层成熟度评估（2026-07-02）

| 层 | 评分 | 判断 |
|----|------|------|
| Agentic | **3.5 / 5** | 能力强，入口与编排未收敛（能力成熟 ≠ 治理成熟） |
| Constraint | **3 / 5** | 合同成立，默认未全开，仍有 boolean 旁路 |
| Optimization | **3 / 5** | 权威边界成立，策略仍处实验期 |
| Authorization | **3 / 5** | 多套机制可用，统一模型不足 |
| Executor | **4 / 5** | 唯一写路径与 Guard 已成熟（六层中最稳） |
| Monitoring | **2 / 5** | 有检测能力，无统一触发治理 |

**最成熟的是 Executor 写入治理**——在决策系统里，最后的写路径必须最早收口。

---

## 5. 三种结构性分裂（当前真正的问题）

六层 **不是缺失**，而是 **未完全收敛**。当前最大风险来自三种分裂：

### 5.1 编排分裂

并存入口：`ClaudeOrchestrator`、`DecisionKernel`、`Legacy ReAct Orchestrator`、`Agentic MCP Tool Loop`。

分流依赖：`routePolicy`、env、场景代码、特定 API。

**后果：** 同一用户请求可能进入不同链路——有的不经 Constraint Gateway，有的不产生 Decision Record，有的不可 execute，有的只返回自然语言建议。

**收敛方向：** 所有正式请求经 **Decision Trigger Gateway** 产出统一 `DecisionRunRequest`；Agent 降级为 Provider（见 §8）。

### 5.2 约束事实分裂

并存表达：`CanonicalConstraintReport`、`ConstraintChecker`、`isFeasible(): boolean`、Guardian assertions、destination-specific checks。

**最大风险：**

- `Canonical = UNKNOWN`，Legacy boolean = `true`
- Guardian = `BLOCK`，旧路径仍继续生成并执行

**收敛方向：** Legacy Checker **仅作 Provider**，禁止直接成为最终结论：

```
✅ Legacy Checker → Adapter → CanonicalConstraintReport → Decision Runtime
❌ Legacy Checker → boolean true → 直接继续
```

下一阶段重点 **不是** 继续堆规则，而是 **消灭绕过 CanonicalConstraintReport 的正式决策路径**。

### 5.3 授权分裂

并存机制：行程级 RFC-001 L2、工具级 allow/ask/deny、Action preview/commit、Execution Gate。

**需区分、不可混为一谈、也不可完全割裂：**

| 概念 | 负责 |
|------|------|
| **Decision Authorization** | 这个方案是否可以成为 **正式决定** |
| **Action Authorization** | 执行这个决定时，**具体动作**是否允许 |

未来统一经 `AuthorizationPolicyGateway` 输出 `ALLOW | ASK | DENY | DEGRADE`，内部分 Decision / Tool / Effective Plan commit 三类审批。

---

## 6. 核心不变量（比有没有 CP-SAT 更重要）

以下六条须由 **CI + 运行时** 守住；只要成立，新增 Agent / 求解器 / 国家包不会把系统重新搞散。

| # | 不变量 |
|---|--------|
| 1 | Agent **不能**直接形成正式 Decision |
| 2 | Agent **不能**直接写 Effective Plan |
| 3 | 硬约束事实必须通过 **Constraint Gateway** 表达 |
| 4 | 所有正式方案选择必须进入 **`DecisionCore.finalize`** |
| 5 | 所有 Effective Plan 变更必须 **`authorize → execute`** |
| 6 | **Shadow 策略不能**影响正式执行结果 |

代码审计入口：`effective-plan-write-guard.architecture.spec.ts`、`write-permission.guard.ts`。

---

## 7. 当前不应立即做的事

Formal calibration **未闭环前**，不建议：

- 把 Lex 切成生产 Authority
- Native CP-SAT 全行程求解
- Bounded LNS 行中优化
- 大规模重构所有 Agent
- 旧接口一刀切删除
- 将 Runtime **默认**强行改为 `CANONICAL`

**阻塞项**（详见 [NEXT_PHASE.md](./benchmark/NEXT_PHASE.md)）：

- ~~3 个盲评 Materialized Review Cases~~ ✅（2026-07-01，`blind-review-submissions.json`）
- ~~TD-004 / TD-005 Objective Audit~~ ✅
- ~~Formal calibration P0~~ ✅（snapshot `42732583` · freeze tier=formal · tag `decision-benchmark-calibration-v1` @ `ba166c9a`）

---

## 8. Formal Calibration 完成后的架构优先级

> **详细任务、验收标准与 Phase 0–4 节奏** 见 [DECISION_RUNTIME_ROADMAP.md](./DECISION_RUNTIME_ROADMAP.md)。

### P1 — 统一正式入口

落实 **Decision Trigger Gateway**。所有正式请求统一为：

| 触发类型 | 示例 |
|----------|------|
| `UserIntent` | 用户改需求 |
| `WorldEvent` | 道路封闭、航班取消 |
| `ManualRepairRequest` | 人工修复 |
| `GuideImportRequest` | Guide 导入 |
| `InTripDeviation` | 行中偏差 |

统一产出：`DecisionRunRequest` → 进入 Canonical 主链。

### P2 — Agent 收敛为 Provider

不删除 Claude / Kernel / ReAct，统一角色：

| Provider | 输出合同 |
|----------|----------|
| `CandidateGenerationProvider` | `CandidatePlan[]` |
| `RepairProvider` | `RepairProposal[]` |
| `ResearchProvider` | 结构化证据 |
| `NarrationProvider` | `DecisionExplanation` |
| `CriticProvider` | 约束 / 质量信号 |

**禁止** 各 Agent 拥有独立完成决策的闭环。

### P3 — Constraint Gateway 渐进默认化

```
OFF → SHADOW_COMPARE → CANONICAL_FOR_SELECTED_SCENARIOS → DEFAULT_ON → OLD_BOOLEAN_DEPRECATED
```

监控指标：Canonical vs Legacy 不一致率、UNKNOWN 比例、Provider 缺失率、false BLOCK/PASS、evaluation timeout。

### P4 — Authorization 模型统一

`AuthorizationPolicyGateway` 统一输入/输出；内部仍区分 Decision approval、Tool execution approval、Effective Plan commit approval。

### P5 — Monitoring 与 Replan 统一

落实 **ReplanningTriggerPolicy**：感知到变化 ≠ 一定要全量重规划。

需统一判断：事件是否影响当前 Plan、影响范围、Decision 是否 STALE、局部修复 vs 全量重规划、是否需用户确认。

---

## 9. 目标代码结构（收敛后）

```
src/decision-runtime/
├── trigger/
│   ├── decision-trigger.gateway.service.ts  # ✅ P1 骨架
│   ├── decision-trigger.module.ts
│   └── replanning-trigger.policy.ts         # 待 Sprint 7
├── snapshot/
│   └── world-state-snapshot.service.ts
├── constraints/
│   ├── constraint-evaluation.gateway.service.ts
│   └── providers/
├── candidates/
│   ├── contracts/decision-providers.ts      # ✅ Provider 合同
│   ├── candidate-providers.module.ts
│   └── providers/legacy-candidate-generation.provider.ts
├── optimization/
│   ├── optimization-problem-assembler.util.ts
│   ├── strategy-selector.service.ts
│   └── strategies/
│       ├── legacy-frozen.strategy.ts        # ✅
│       └── cp-sat-lexicographic.strategy.ts # ✅ Shadow/Lab
├── core/
│   ├── decision-core.service.ts             # guardian-decision-core
│   └── full-plan-selection.service.ts
├── authorization/
│   └── authorization-policy.gateway.ts      # 待建
├── execution/
│   ├── plan-version-apply.executor.ts       # guardian-decision-core
│   └── effective-plan-write-guard.service.ts
├── monitoring/
│   ├── decision-validity.monitor.ts         # 待建
│   └── decision-event-consumer.ts           # 待建
└── observability/
    ├── shadow-comparison
    └── decision-ledger
```

Claude、Neptune、Abu、Dr.Dre **不会消失**，但位于 `candidates/providers`、`constraints/providers`、`narration/providers`，而非平行 Decision Runtime。

---

## 10. 环境变量速查（避免误读）

| 变量 | 管什么 | 常见误读 |
|------|--------|----------|
| `DECISION_RUNTIME_MODE=LEGACY` | 默认 **Runtime 链路** 仍走旧端到端 | ≠ 禁用 Canonical 合同 |
| `DECISION_RUNTIME_MODE=CANONICAL` | 正式 Canonical 主链 + execute | 仍需单独开 Gateway / full-plan-selection |
| `OPTIMIZATION_STRATEGY_MODE=LEGACY` | 强制 **策略** `legacy-frozen` | ≠ `DECISION_RUNTIME_MODE=LEGACY` |
| `RFC001_SHADOW_MODE=1` | finalize 持久化，**不写** Effective Plan | Shadow 观测必备 |
| `CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1` | 统一约束入口 | 默认 off，需显式开启 |

完整矩阵见 [DECISION_RUNTIME_ENV.md](./DECISION_RUNTIME_ENV.md)。

---

## 11. 前端与决策中心：如何读六层

> **读者：** 前端 / 决策中心 / 联调 QA  
> **详细 API：** [UNIFIED_DECISION_FRONTEND_INTEGRATION.md](../trips/decision-semantics/UNIFIED_DECISION_FRONTEND_INTEGRATION.md) · [TRIP_DETAIL_TAB_FRONTEND.md](../trips/TRIP_DETAIL_TAB_FRONTEND.md) · [FE_INTEGRATION_HANDOFF.md](../trips/decision-semantics/FE_INTEGRATION_HANDOFF.md)

前端 **不直接调用** Decision Runtime 内部模块，而是通过 **BFF 读模型** 与 **Decision Center Gateway** 消费六层结果。关键是分清：**哪些字段代表「已正式决策」**，哪些只是 **启发式 / 建议 / 待确认**。

### 11.1 两个前端面（不要混用）

| 面 | 用户场景 | 主要 API | 与六层关系 |
|----|----------|----------|------------|
| **行程详情 Tab** | 看行程、协作、文件、时间轴概览 | `timeline-overview`、`collab-overview`、`files/overview` … | 读 **Effective Plan 投影** + 启发式分数；**不是**决策写入口 |
| **决策中心** | 处理问题、选方案、确认生效 | `decision-center`、`decision-problems`、`evaluate/authorize/execute` | 读 **Decision Record** 状态机；Canonical 下是唯一正式 L2 写链 |

```
行程详情 Tab          →  「现在行程长什么样」+ 侧栏待办/提醒
决策中心              →  「有什么问题、选哪个方案、是否已生效」
Agent 对话 (route_and_run) → 「理解/搜索/生成/解释」（多数不直接写 Effective Plan）
```

### 11.2 六层 → 前端可见信号

| 层 | 前端是否直接感知 | 决策中心读什么 | 行程 Tab 读什么 |
|----|------------------|----------------|-----------------|
| **Agentic** | 间接（候选、解释、叙事） | `evaluate` 返回的 `options` / `candidates`、`comparisonView` 文案来源 | `timeline-overview.tasks`、`persona-alerts`；Agent 页 `observability.*` |
| **Constraint** | 间接（BLOCK / 待确认） | `constraintAssertions`、`humanDecisionRequired`、option 上的 BLOCK 标记 | `stats.feasibilityScore`、`conflictCount`（**启发式**，≠ Gateway 报告） |
| **Optimization** | **不应暴露** strategyId 给用户 | `comparisonView`（方案对比）、`candidates[].utility` 等排序结果 | 无（策略选择发生在 `evaluate` 内） |
| **Decision Core** | 通过 `recordStatus` | `record.recordStatus`：`PROPOSED` → `AUTHORIZED` → `EFFECTIVE` | `decision-center.recentDecisions`（L1 镜像，需 `RFC001_V15_PROJECTION=1`） |
| **Authorization** | 通过阶段与 CTA | `classifyCanonicalL2Phase()` → `NEEDS_EVALUATE` / `AWAITING_AUTHORIZE` / `AWAITING_EXECUTE` | 无写操作；待办可链到 Decision Center |
| **Executor** | 通过行程刷新 | `execute` 成功后 `planVersion.status === 'EFFECTIVE'`；`shouldRefreshItineraryAfterCanonicalExecute()` | `tripsApi.getById` 刷新日程；时间轴 `feasibilityScore` 可能变化 |
| **Monitoring** | 问题卡片 + 主动检测 | `GET decision-problems` 新条目；`POST weather-hazard/poll`、`POST daily-load/scan` | `todayReminders`、侧栏待办；**尚无**统一 Trigger UI |

**重要：** `timeline-overview.stats.feasibilityScore` 由 **冲突严重度推导**，不是 `CanonicalConstraintReport.overallStatus` 的前端映射。决策语义以 **Decision Center + `recordStatus`** 为准。

### 11.3 决策中心：Canonical L2 与六层对应

Gateway 开启（`VITE_DECISION_GATEWAY_UNIFIED=1`）时，**用 `flow` 分流**，禁止按目的地硬编码：

```typescript
if (problem.flow === 'CANONICAL_L2') {
  // Constraint + Optimization + Decision Core 已在 POST evaluate 内完成
  // 前端只驱动 Authorization + Executor 两步
  await POST evaluate   // → recordStatus: PROPOSED
  await POST authorize  // → recordStatus: AUTHORIZED（choice 选候选）
  await POST execute    // → recordStatus: EFFECTIVE，Effective Plan 更新
} else if (problem.flow === 'LEGACY_V15') {
  // 旧轨：options → preview → POST decisions → poll
}
```

**Effective Plan 何时变？**（前端最常问）

| 阶段 | `recordStatus` | `planVersion.status` | 行程 UI 是否刷新 |
|------|----------------|----------------------|------------------|
| evaluate 后 | `PROPOSED` | `PENDING_AUTHORIZATION` | **否** |
| authorize 后 | `AUTHORIZED` | `PENDING_AUTHORIZATION` | **否** |
| execute 后 | `EFFECTIVE` | `EFFECTIVE` | **是**（`getById` / timeline） |

联调 L2 写路径须 **`RFC001_SHADOW_MODE=0`**；Shadow 模式下 finalize 入库但 **不产生 Effective Plan**。

**UI 阶段机（Canonical）：**

```typescript
import { classifyCanonicalL2Phase } from '@/generated/unified-decision-contracts';

const phase = classifyCanonicalL2Phase({ recordStatus, planVersionStatus, ... });
// NEEDS_EVALUATE      → 「生成方案」→ POST evaluate
// AWAITING_AUTHORIZE  → 展示 candidates + comparisonView → POST authorize { choice }
// AWAITING_EXECUTE    → 「确认生效」→ POST execute
// EFFECTIVE           → 完成，刷新 itinerary
```

`comparisonView` = Optimization 层结果的用户可读投影；`impactScopeView` = Constraint / Monitoring 影响范围叙事（i18n 用 `templateKey` + params）。

### 11.4 行程详情 Tab：读模型边界

Tab BFF **不承担决策写链**，只聚合 Effective Plan 周边读模型：

| Tab | API | 可对应六层 | 注意 |
|-----|-----|------------|------|
| 时间轴 | `GET …/timeline-overview` | Monitoring 提醒、Constraint **启发式** | `feasibilityScore` ≠ 正式约束结论 |
| 成员 | `GET …/collab-overview` | — | 协作，与决策链无关 |
| 文件 / 住宿 / 活动 | 各 overview API | Executor 落地后的资料态 | 反映已生效行程，非 PROPOSED 预览 |

首屏建议：`getById` + `timeline-overview` 并行；**决策操作**跳转 Decision Center，不在 Tab 内直接 `evaluate/execute`。

### 11.5 Agent 对话 vs 决策中心

| | Agent (`POST /agent/route_and_run`) | Decision Center |
|---|-------------------------------------|-----------------|
| 对应层 | **Agentic** 为主 | **Constraint → Optimization → Core → Auth → Executor** |
| 输出 | 自然语言 + 可选 itinerary 草案 | 结构化 `DecisionRecord` + `flow` |
| 能否写 Effective Plan | **否**（不变量 1–2） | **能**（仅 `execute` 后） |
| 前端展示 | 对话流、`observability.layers` | 问题列表、方案对比、确认 CTA |

用户说「帮我改第 5 天」→ Agent 可能生成建议；**正式改行程**须有问题卡片 → Decision Center → L2 三步（或 Legacy V1.5 轨）。

### 11.6 前端禁止事项（与后端不变量对齐）

1. ❌ Canonical 问题走 `POST decisions` + poll（须 `evaluate → authorize → execute`）
2. ❌ `authorize` 后立刻假设 itinerary 已变（须等 `execute` + `EFFECTIVE`）
3. ❌ `if (destination === 'IS')` 选 API（用 `flow` + `route.resolution`）
4. ❌ 把 `feasibilityScore` 当作「Gateway 已通过」
5. ❌ 对用户展示 `strategyId` / Shadow 策略标签（Lex vs legacy-frozen 是 ops/benchmark 概念）
6. ❌ 调用 deprecated internal RFC-001 harness API

### 11.7 联调与 PR 顺序

| 里程碑 | 文档 | 验收 |
|--------|------|------|
| Tab BFF 接入 | [TRIP_DETAIL_TAB_FRONTEND.md](../trips/TRIP_DETAIL_TAB_FRONTEND.md) | 时间轴 mock 替换为 `timeline-overview` |
| FE-UD-1 读模型 | [UNIFIED_DECISION… §14](../trips/decision-semantics/UNIFIED_DECISION_FRONTEND_INTEGRATION.md) | `decision-center` + `decision-problems` + `flow` 标签 |
| FE-UD-2–5 L2 写链 | [FE_INTEGRATION_HANDOFF.md](../trips/decision-semantics/FE_INTEGRATION_HANDOFF.md) | 冰岛 fixture `3e4a1058-…` 道路 / 天气 / 日负荷 |
| 后端 QA | `npm run decision-center:unified-qa` | Gateway env 7/7 绿 |

**推荐页面结构：**

```
TripDetailPage
├── TimelineTab        → timeline-overview（读）
├── …其他 Tab BFF
└── 链到 DecisionCenterPage

DecisionCenterPage
├── GET decision-center | overview（按 VITE_DECISION_GATEWAY_UNIFIED）
├── ProblemList        → GET decision-problems（统一列表，看 flow）
└── ProblemDetail
    ├── CANONICAL_L2   → evaluate / authorize / execute
    └── LEGACY_V15     → options / preview / POST decisions
```

---

## 12. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-07-02 | 初版：六层映射、概念校正、成熟度、分裂分析、收敛优先级 |
| 1.1.0 | 2026-07-02 | §11：前端 / 决策中心如何读六层 |
| 1.2.0 | 2026-07-02 | Trigger Gateway 骨架落地（`src/decision-runtime/trigger/`） |
| 1.3.0 | 2026-07-02 | Provider 合同 + Guide/Agent 接线 |
| 1.4.0 | 2026-07-02 | Constraint SHADOW_COMPARE + Neptune RepairProvider + Auth/Replan 骨架 |
| 1.5.0 | 2026-07-02 | Auth gateway 接入 authorize/execute；Monitoring replanning 上下文；Shadow 指标 |
| 1.6.0 | 2026-07-02 | runtime-capabilities API；Auth BLOCK 检查；constraint-shadow staging 脚本 |
| 1.7.0 | 2026-07-02 | Auth execute 校验 AUTHORIZED；编译修复；dev 0-error |
| 1.8.0 | 2026-07-02 | Grafana SHADOW_COMPARE 看板；calibration status / smoke CLI |
| 1.9.0 | 2026-07-02 | 链至 [DECISION_RUNTIME_ROADMAP.md](./DECISION_RUNTIME_ROADMAP.md)（六层 Phase 0–4 master roadmap） |
| 1.10.0 | 2026-07-02 | P0 test-tier freeze：`task-e1:p0-freeze` + `p0-freeze-status.json` |
| 1.11.0 | 2026-07-02 | P0 **COMPLETE**：formal freeze + tag `decision-benchmark-calibration-v1` |
| 1.12.0 | 2026-07-02 | Phase 1 启动：Provider Registry、Trigger wiring catalog、`p1-phase:status` |
