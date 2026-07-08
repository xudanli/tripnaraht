# Decision Runtime — 六层实施路线图

> **Status:** Production Transition（2026-07-02）  
> **Audience:** 架构 / 后端 / 决策引擎 / 前端决策中心 / QA  
> **Related:** [PRODUCTION_TRANSITION](./PRODUCTION_TRANSITION.md) · [DECISION_RUNTIME_MATURITY](./DECISION_RUNTIME_MATURITY.md) · [ADR-007](./ADR-007-Decision-Runtime-v2.md) · [DECISION_RUNTIME_ENV](./DECISION_RUNTIME_ENV.md) · [NEXT_PHASE](./benchmark/NEXT_PHASE.md) · [CONSTRAINT_SEMANTIC_CONSOLIDATION](./CONSTRAINT_SEMANTIC_CONSOLIDATION.md)

本文档是六层 Decision Runtime 的 **master roadmap**（Phase 0–5、逐层任务、验收标准）。  
**当前阶段：** [Production Transition](./PRODUCTION_TRANSITION.md) — 证明六层成为生产默认链路，而非继续搭建骨架。  
成熟度评估与概念校正见 [DECISION_RUNTIME_MATURITY.md](./DECISION_RUNTIME_MATURITY.md)；标定 run 与 freeze 操作见 [NEXT_PHASE.md](./benchmark/NEXT_PHASE.md)。

---

## 1. 总体目标

未来几个阶段的重点 **不是** 继续增加更多 Agent 或求解器，而是：

**把现有能力收敛进一条统一、默认、可观测、可灰度升级的 Decision Runtime 主链。**

### 1.1 目标主链

```
用户请求 / 世界事件
  → Decision Trigger Gateway
  → Canonical WorldStateSnapshot
  → Constraint Evaluation Gateway
  → Candidate Providers
  → Optimization Strategy
  → DecisionCore.finalize
  → Authorization Policy Gateway
  → Effective Plan Executor
  → Monitoring / Replanning
```

### 1.2 当前基本原则（保持不变）

| 原则 | 说明 |
|------|------|
| legacy-frozen | 继续作为 **生产 Authority** |
| Lexicographic | 继续在 **Shadow / Calibration** |
| Runtime 默认 | **不**切换 CANONICAL |
| Agent | **不**拥有最终决策权 |
| Shadow | **不**写 Effective Plan |
| 正式写入 | 必须 **authorize → execute** |

---

## 2. 总览路线图

| 层 | 当前成熟度 | 下一阶段目标 | 优先级 |
|----|------------|--------------|--------|
| **Agentic** | 3.5 / 5 | 多编排路径收敛为 Provider | P1 |
| **Constraint** | 3 / 5 | SHADOW_COMPARE → 部分场景 ON | P1 |
| **Optimization** | 3 / 5 | 完成 Calibration、Holdout、Canary 准入 | P1 / P2 |
| **Authorization** | 3 / 5 | 统一 Decision / Action / Commit 授权 | P2 |
| **Executor** | 4 / 5 | 强化幂等、回滚和审计，不重构主路径 | 持续 |
| **Monitoring** | 2 / 5 | 建立统一事件触发与重规划治理 | P2 / P3 |

---

## 3. Layer 1 — Agentic

### 3.1 阶段目标

将现有 Claude Orchestrator、Decision Kernel、ReAct、MCP Tool Loop、Neptune 等能力，从多条平行决策路径，收敛为统一 Runtime 的 **能力提供者**。

**最终结构：**

```
Agentic Orchestrator
├── ResearchProvider
├── CandidateGenerationProvider
├── RepairProvider
├── CriticProvider
└── NarrationProvider
```

Agent 可以生成、搜索、修复、解释，但 **不能**：

- 直接形成正式 Decision
- 自行判定硬约束最终状态
- 直接调用 Effective Plan 写入
- 绕过 `DecisionCore.finalize()`

### 3.2 近期任务

#### A1. Trigger Gateway 全面接线

将所有正式入口逐步接入：

- canonical-plan-selection
- Guide import / accept
- 用户主动修改行程
- Decision Center evaluate
- Monitoring poll
- 行中恢复请求
- Agent `route_and_run`（接线完成前仅：建议、候选、replanning hint；**不允许**直接产生正式 Decision）

> **现状（2026-07-02）：** 骨架在 `src/decision-runtime/trigger/`；部分入口已接线（plan-selection、Guide、部分 poll）。`DECISION_TRIGGER_GATEWAY_ENABLED=1` 显式开启。

#### A2. Provider Registry

建立统一注册表：

```typescript
interface DecisionProviderRegistry {
  researchProviders: ResearchProvider[];
  candidateProviders: CandidateGenerationProvider[];
  repairProviders: RepairProvider[];
  criticProviders: CriticProvider[];
  narrationProviders: NarrationProvider[];
}
```

统一管理：Provider 能力、版本、支持场景、超时、降级策略、输出 Schema、调用成本。

> **现状：** Provider **合同**已有（`candidates/contracts/decision-providers.ts`）；Registry **待建**。

#### A3. Agent 输出结构化

逐步禁止 Agent 只返回自然语言。正式链路必须产出：

```typescript
{
  candidates?: CandidatePlan[];
  evidence?: ConstraintEvidence[];
  repairProposals?: RepairProposal[];
  explanation?: DecisionExplanation;
  confidence?: number;
}
```

#### A4. 旧编排路径降级

不要求立刻删除旧代码，采用渐进迁移：

```
直接决策路径 → Provider Adapter → 标记 Deprecated → 禁止新增调用 → 最终删除
```

### 3.3 验收标准

- [ ] 90% 以上正式决策请求经过 Trigger Gateway
- [ ] Agent 直接写 Effective Plan：**0**
- [ ] Agent 直接生成正式 DecisionRecord：**0**
- [ ] 所有正式候选符合统一 Candidate Schema
- [ ] 每次 Agent 调用都有 `decisionRunId` / `providerId` / `providerVersion`
- [ ] 旧编排路径不再增加新功能

---

## 4. Layer 2 — Constraint

### 4.1 阶段目标

将 `CanonicalConstraintReport` 变成所有正式决策路径共同认可的 **唯一约束事实**。

**演进路线：**

```
OFF
  → SHADOW_COMPARE
  → ON_FOR_SELECTED_SCENARIOS
  → DEFAULT_ON
  → Legacy boolean deprecated
```

在此阶段（SHADOW_COMPARE）：**Legacy boolean = Authority**，**Canonical Report = Shadow** — 不改变生产行为，只统计差异。

> **现状：** `CONSTRAINT_GATEWAY_MODE` 支持 `OFF | SHADOW_COMPARE | ON`；metrics + staging 脚本已有；本地默认仍为 OFF。

### 4.2 近期任务

#### C1. 扩大 SHADOW_COMPARE

优先覆盖正式高价值场景：

- 冰岛道路关闭
- 天气禁止活动
- 日驾驶超载
- 营业时间冲突
- Guide 生成 Plan
- Full Plan Selection
- 行中重规划

#### C2. 完成 Provider Adapter

继续接入：Guardian 道路 / 天气 / 负荷、Destination Pack、User / Member constraint、Reservation / opening hours、Budget、Mobility / accessibility。

统一输出：`PASS` | `BLOCK` | `WARNING` | `UNKNOWN` | `REQUIRES_VERIFICATION`

#### C3. 消灭正式路径 boolean bypass

允许旧 Checker 保留，但必须：

```
Legacy Checker → Adapter → CanonicalConstraintReport
```

禁止正式决策直接消费 `isFeasible(): boolean`。架构测试应持续阻止新旁路。

> **现状：** 部分 caller 已迁移至 `ConstraintEngineService`；`constraint-formal-path.architecture.spec.ts` 已有。

#### C4. Constraint Registry

建立统一约束注册表 SSOT：

```typescript
{
  constraintCode,
  category,
  severity,
  defaultLevel,
  evidenceRequirements,
  freshnessPolicy,
  repairability,
  userFacingTemplate,
  destinationApplicability
}
```

#### C5. 选定场景切换 ON

先选择少量稳定场景（Shadow 指标达标后 Canonical Report 成为 Authority）：

- 冰岛 `ROAD_CLOSED`
- 天气 `ACTIVITY_PROHIBITED`
- 单日 `EXCESSIVE_DRIVE`

### 4.3 核心观测指标

- Legacy / Canonical 不一致率
- false PASS / false BLOCK
- UNKNOWN 比例
- REQUIRES_VERIFICATION 比例
- Provider 缺失率
- 数据过期率
- Evaluation timeout
- 每类 Constraint 触发率
- 修复成功率

### 4.4 验收标准

- [ ] 正式路径绕过 Gateway：**0**
- [ ] L1 UNKNOWN 被当成 PASS：**0**
- [ ] BLOCK 方案进入 winner：**0**
- [ ] 第一批核心场景进入 ON
- [ ] 所有 Constraint 有注册表版本
- [ ] 前端风险文案可追溯到 Constraint Report

---

## 5. Layer 3 — Optimization

### 5.1 阶段目标

保持 `DecisionCore.finalize()` 为统一权威边界，通过实验治理逐步验证并晋级新选择策略。

| 策略 | 角色 |
|------|------|
| **legacy-frozen** | 当前生产选择策略（Candidate Selector） |
| **lexicographic** | Shadow / Calibration 选择策略 |

两者都是 Candidate Selector，**不是** Agent。所有策略结果仍须进入 `DecisionCore.finalize()`。

### 5.2 近期任务

#### O1. Formal Freeze 收尾（P0）

| 项 | 状态（2026-07-02） |
|----|-------------------|
| calibration-v1 15/15 | ✅ |
| TD-004 / TD-005 Objective Audit | ✅ |
| 3 条 Materialized 盲评 | ✅ |
| test-tier freeze manifest | ✅ |
| Aliyun post-migration baseline snapshot | ✅ `BackupSetId=42732583` |
| **formal** freeze manifest | ✅ `freezeTier=formal` |
| Git tag `decision-benchmark-calibration-v1` | ✅ `ba166c9af` → `origin` |

#### O2. TD-012 修复确认

保证输入不一致时：

- `eligibleForStrategyComparison = false`
- `divergenceType = INPUT_MISMATCH`
- `reviewDisposition = EXCLUDED`

不可比事件 **不能** 计入算法优劣统计。

> **现状：** 代码已修复（`resolveStagingShadowOptionsForRequest`）；`:3001` 需重启加载新代码后复验。

#### O3. Objective Registry 实现

将当前目标语义正式化 SSOT：

```typescript
{
  objectiveCode,
  layer,
  direction,
  normalization,
  tolerance,
  missingValuePolicy,
  applicability,
  version
}
```

示例：`L2.dailyDriveLoad`、`L2.physicalOverload`、`L3.requirementFit`、`L3.scheduleRobustness`、`L4.experienceCoverage`、`L4.preferenceFit`

#### O4. Objective Audit

对 TD-004、TD-005 固化审计工具链：

```
raw value → normalized value → tolerance → stage input → eliminated → remaining → winner
```

#### O5. 新 Calibration Run

任何语义或接线修改后：

```
新 commit → 29 故障注入 → 3 实例 Smoke → 人工审查 → 新 15 实例 Calibration
```

**不得**续跑 exploratory-v0。

#### O6. Holdout

Calibration 参数冻结后，再运行未参与调参的 Holdout。Holdout 期间禁止：修改目标层级、调整容差、只挑有利实例重跑、覆盖失败结果。

#### O7. Canary 准入标准

Lex 只有达到门槛才可进入 Canary：

- 输入一致率达到要求
- 无 L1 退化
- 无 blocked winner
- Shadow 错误率足够低
- 人工盲评非劣
- Pace / executability 有可解释改善
- 延迟满足 SLA
- Post Validation 稳定

### 5.3 暂不做

- Native CP-SAT 全行程生成
- Bounded LNS
- NSGA-II
- 自动替换 Legacy Authority

### 5.4 验收标准

- [ ] Objective Registry 成为 SSOT
- [ ] Calibration 和 Holdout 严格分离
- [ ] Lex 分叉均有完整 Stage Trace
- [ ] 不可比事件不进入统计
- [ ] Canary 准入标准文档化
- [ ] Legacy 和 Lex 可通过同一 Strategy 接口切换
- [ ] 所有策略结果仍进入 `DecisionCore.finalize()`

---

## 6. Layer 4 — Authorization

### 6.1 阶段目标

统一当前分散的：行程 Decision 授权、Agent 工具授权、Action preview / commit、Effective Plan commit 授权 — **但不** 粗暴合并成一个布尔值。

**统一输出：**

```typescript
type AuthorizationDecision = 'ALLOW' | 'ASK' | 'DENY' | 'DEGRADE';
```

| 类型 | 回答的问题 |
|------|------------|
| **Decision Authorization** | 这个方案能不能成为正式决定？ |
| **Action Authorization** | 执行该决定时，是否允许调用具体工具或外部动作？ |
| **Commit Authorization** | 是否允许把结果写成 Effective Plan？ |

> **现状：** `AuthorizationPolicyGateway` 骨架 + authorize/execute 接线；`AUTHORIZATION_POLICY_GATEWAY_ENABLED=0` 默认关闭。

### 6.2 近期任务

#### AU1. Authorization Policy Gateway 成为统一入口

**输入：**

```typescript
{
  decisionRecord,
  constraintReport,
  actionPlan,
  riskLevel,
  evidenceFreshness,
  runtimeMode,
  userConsent,
  actor,
  requestedOperation
}
```

**输出：**

```typescript
{
  decision: 'ALLOW' | 'ASK' | 'DENY' | 'DEGRADE',
  requiredLevel: 'L1' | 'L2' | 'L3',
  reasons: [],
  confirmationRequirements: [],
  expiresAt?: string
}
```

#### AU2. 统一风险级别

| 级别 | 场景 |
|------|------|
| **L1** | 低风险、可逆、无关键资源变化 |
| **L2** | 行程结构变化、酒店/路线调整、需用户确认 |
| **L3** | 高风险、不可逆、涉及支付或重大履约变化 |

#### AU3. 前端状态统一

前端只消费统一 Phase：

```
NEEDS_EVALUATE
AWAITING_AUTHORIZE
AWAITING_CONFIRMATION
AUTHORIZED
AWAITING_EXECUTE
EFFECTIVE
BLOCKED
EXPIRED
```

#### AU4. 授权有效期

依赖实时事实的授权必须过期：天气变化、道路状态变化、候选 Plan 变化、Constraint Report 变化 → 原 Authorization 失效。

### 6.3 验收标准

- [ ] 所有 Canonical execute 经过 Authorization Gateway
- [ ] 未授权 Plan 写入 Effective Plan：**0**
- [ ] 授权可追溯至 DecisionRecord 和 Constraint 版本
- [ ] Decision / Auth / Commit 职责明确
- [ ] 前端不再自行拼接授权状态
- [ ] 高风险行为有 HITL 和确认记录

---

## 7. Layer 5 — Executor

### 7.1 阶段目标

保持当前 **唯一写路径** 不变，强化执行安全，**不重做** Executor 架构。

```
DecisionRecord PROPOSED → Authorization → AUTHORIZED → EffectivePlanExecutor → EFFECTIVE
```

> **现状：** 六层中最成熟（4/5）；Write Guard + 架构 spec 已守住。

### 7.2 近期任务

| 任务 | 说明 |
|------|------|
| **E1. Exactly-once** | 基于 decisionId / authorizationId / operationId / idempotencyKey |
| **E2. 执行前最终校验** | Authorization 仍有效、Snapshot 未失效、Constraint 未过期、Plan 版本未被覆盖 |
| **E3. Rollback 标准化** | apply / rollback / partial failure / compensating action |
| **E4. Execution Ledger** | 谁执行、前后 PlanVersion、操作、结果、失败原因、回滚结果 |
| **E5. Shadow 隔离** | CI + 运行时保证 SHADOW 永远不能进入 Executor 正式写路径 |

### 7.3 验收标准

- [ ] 非 Executor 调用 setEffective：**0**
- [ ] 重复 Execute 产生重复版本：**0**
- [ ] 失败操作均有明确恢复状态
- [ ] Rollback 路径集成测试覆盖
- [ ] 所有 Plan 变更有 Ledger
- [ ] Shadow 写入 Effective Plan：**0**

---

## 8. Layer 6 — Monitoring

### 8.1 阶段目标

当前 **最大的结构性缺口**。从「多个 Detector 各自发现问题」升级为：

```
统一事件 → 判断影响 → 决定是否触发 → 局部修复或全量重规划 → 进入 Decision Runtime
```

> **现状：** 2/5；`ReplanningTriggerPolicy` + `MonitoringReplanningContextService` 骨架已有，默认未生效。

### 8.2 近期任务

#### M1. 统一事件合同

```typescript
interface DecisionTriggerEvent {
  eventId: string;
  eventType: string;
  source: string;
  occurredAt: string;
  observedAt: string;
  severity: string;
  confidence: number;
  affectedEntities: string[];
  evidence: unknown[];
}
```

来源：用户请求、道路、天气、航班、活动取消、成员状态、时间偏差、预算、供应商变化等。

#### M2. Decision Trigger Gateway

职责：标准化事件、去重、聚合、查找受影响 Trip、创建 DecisionRun、保存 Lineage、选择后续路由。

#### M3. ReplanningTriggerPolicy

回答五个问题：

1. 是否影响当前 Effective Plan？
2. 影响范围是哪几天 / 哪些活动？
3. 是否使 DecisionRecord STALE？
4. 需要局部修复还是全量重规划？
5. 是否需要用户立即确认？

**输出：**

```typescript
{
  shouldTrigger: boolean;
  scope: 'ITEM' | 'DAY' | 'SEGMENT' | 'FULL_TRIP';
  strategy: 'ADVISORY' | 'LOCAL_REPAIR' | 'FULL_REPLAN';
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  humanConfirmationRequired: boolean;
}
```

#### M4. 现有 Detector 接入

逐步迁移：road-segment-unavailable、weather-activity-prohibited、excessive-daily-load、Kernel `shouldReplan()`、InTripRecoveryLoop、Ledger stale reconcile、Monitoring polls。

**禁止** Detector 直接触发独立重规划流程。

#### M5. 去重和防抖

防止同一道路关闭被 weather poll、road poll、Guardian 各触发一次 Decision Run。需要：Event fingerprint、Time window dedup、Decision Run correlation、Cooldown、Severity upgrade。

#### M6. 行中局部修复

Trigger 治理稳定后再实现 `bounded-lns-repair`（调整某一天、替换活动、局部重排路线）。**不要**一遇到变化就重新生成整趟行程。

#### M7. 前端触发中心

用户侧展示：发生了什么、影响了哪一天、当前方案是否仍有效、系统建议什么、是否需要确认、是否已经自动修复。

### 8.3 验收标准

- [ ] 所有正式世界事件经过 Trigger Gateway
- [ ] 重复事件不重复产生 Decision Run
- [ ] 受影响 Decision 可正确标记 STALE
- [ ] 局部问题不会默认全量重规划
- [ ] CRITICAL 事件可立即进入高优先级流程
- [ ] 用户能看到事件—影响—方案—执行结果
- [ ] Monitoring 触发全程可追溯

---

## 9. 横向基础设施

六层之外，还需要几项横向治理。

### 9.1 Runtime Capabilities

继续完善 `GET /decision-engine/v1/runtime-capabilities`，返回：

- 当前 Runtime 模式
- 各 Gateway 状态
- 策略状态
- Provider / Constraint Registry / Objective Registry / Authorization Policy / Trigger Policy 版本

> **现状：** API 已有；Registry 版本字段待补全。

### 9.2 架构 Lint

持续守住：

| 规则 | |
|------|---|
| Agent 不能直接 Decision | |
| Agent 不能直接写 Plan | |
| Constraint 不能被正式路径绕过 | |
| Strategy 不能绕过 DecisionCore | |
| Execute 不能绕过 Authorization | |
| Shadow 不能写 Effective Plan | |
| Detector 不能绕过 Trigger Gateway | |

### 9.3 Decision Lineage

统一贯穿 ID：

```
triggerEventId → decisionRunId → snapshotId → candidateSetId → constraintReportId
  → decisionRecordId → authorizationId → executionId → planVersionId
```

### 9.4 Rollout 模式

每层 Gateway 建议支持：

```
OFF → SHADOW → SELECTIVE → ON
```

不要仅使用简单 boolean，以便灰度。

> **现状：** Constraint 已有 mode enum；其他 Gateway 多为 boolean，待对齐。

---

## 10. 建议实施节奏

### Phase 0：Formal Freeze 收尾（P0）

| 项 | 状态 |
|----|------|
| Schema verification | ✅ |
| Fault injection 29/29 | ✅ |
| Blind review 3/3 | ✅ |
| **test-tier** freeze manifest | ✅ `artifacts/task-e1-freeze/calibration-v1-freeze-manifest.json` |
| P0 status artifact | ✅ `artifacts/task-e1-freeze/p0-freeze-status.json` |
| Aliyun post-migration snapshot | ⏳ |
| **formal** freeze manifest | ✅ `freezeTier=formal`（snapshot `42732583`） |
| P0 status | ✅ **COMPLETE** |
| Git tag | ✅ `decision-benchmark-calibration-v1` @ `ba166c9af` |

```bash
# test-tier（当前环境已完成）
npm run task-e1:p0-freeze -- --test-tier-only --allow-dirty

# formal-tier（需 Aliyun RDS 快照 ID）
npm run task-e1:p0-freeze -- --snapshot-id <BackupSetId>
git tag decision-benchmark-calibration-v1
git push origin decision-benchmark-calibration-v1
```

### Phase 1：正式入口与事实统一 ✅

**重点：** Trigger Gateway 全面接线 · Agent 输出 Provider 化 · Constraint 进入 SHADOW_COMPARE · Objective Registry 落地

| 交付物 | 状态 |
|--------|------|
| Trigger 接线目录 | ✅ `decision-trigger-wiring.catalog.ts`（100% coverage） |
| Provider Registry | ✅ `DecisionProviderRegistryService`（5 kind runtime-bound） |
| Objective Registry SSOT | ✅ `ObjectiveSemanticsRegistry.snapshot()` |
| Constraint Registry SSOT | ✅ `constraint-registry.catalog.ts` |
| runtime-capabilities 扩展 | ✅ wiring + registries |
| In-trip / Kernel replan lineage | ✅ `recordTriggerLineageIfEnabled` |
| Constraint shadow staging | ✅ `npm run constraint-shadow:staging`（含 divergence probes） |
| P1 状态脚本 | ✅ `npm run p1-phase:status` |
| P1 staging 验证 | ✅ `npm run p1-staging:validate` |

```bash
# 启用 P1 灰度（本地 staging）
export DECISION_TRIGGER_GATEWAY_ENABLED=1
export CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE
export CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1
npm run p1-phase:status
npm run constraint-shadow:staging
```

**目标：** 所有正式决策共享同一入口、同一 Snapshot、同一约束事实。

### Phase 2：选择与授权治理 ✅

**重点：** Holdout · Canary 准入门槛 · Authorization Gateway staging · 前端 Phase 统一 · Constraint 渐进 ON

| 交付物 | 状态 |
|--------|------|
| Canary 准入门槛 SSOT | ✅ `canary-admission-gate.catalog.ts` |
| Canary 门槛评估 | ✅ `canary-admission-gate.evaluator.ts` |
| Holdout preflight | ✅ `npm run task-e1:holdout-preflight` |
| Constraint ON  rollout 目录 | ✅ `constraint-on-rollout.catalog.ts` |
| Authorization staging 探针 | ✅ `npm run p2-staging:validate` |
| 前端 L2 Phase（AU3） | ✅ `AWAITING_CONFIRMATION` / `BLOCKED` / `EXPIRED` |
| P2 状态脚本 | ✅ `npm run p2-phase:status` |
| Holdout 正式 run | ✅ `bench_7a43e23d-...`（28/30 + 2 EXCLUDED） |
| Holdout blind review | ✅ 2/2 materialized submitted |
| Constraint ON_FOR_SELECTED 模式 | ✅ `CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED` |
| Lex CANARY 治理 SSOT | ✅ `canary-rollout-governance.catalog.ts` |
| Constraint 场景 ON | ✅ staging 验证（iceland + weather canonical authority） |
| Lex CANARY 小流量 | ✅ `npm run lex-canary:pilot`（:3001 SHADOW dual-run） |
| P2 收口 | ✅ `npm run p2-phase:closure` |

```bash
npm run p2-phase:status
npm run task-e1:holdout-preflight
npm run constraint-shadow:staging
# ON_FOR_SELECTED（:3000 需 CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED + ON_SCENARIOS）
AUTHORIZATION_POLICY_GATEWAY_ENABLED=1 npm run p2-staging:validate
npm run lex-canary:pilot
npm run p2-phase:closure
```

**目标：** 决策如何选、是否允许执行，拥有统一规则和证据。  
**收口：** `artifacts/p2-phase-status/closure.json` → `READY_FOR_P3`

### Phase 3：Monitoring 闭环（✅ 已收口）

**重点：** Detector 接线目录 · ReplanningTriggerPolicy 生效 · 事件去重 · Kernel replan 治理

| 交付物 | 状态 |
|--------|------|
| M1 统一事件合同 | ✅ `decision-trigger-event.types.ts` |
| M4 Detector 接线目录 | ✅ `monitoring-detector-wiring.catalog.ts` |
| M3 Replanning 决策映射 | ✅ `replanning-trigger-decision.util.ts` |
| M5 事件去重骨架 | ✅ `event-dedup.util.ts` |
| Kernel replan policy gate | ✅ `replan-coordinator.service.ts` |
| In-trip policy gate | ✅ `loop-trigger.service.ts` + `in-trip-replanning.util.ts` |
| P3 状态脚本 | ✅ `npm run p3-phase:status` |
| P3 staging 验证 | ✅ `npm run p3-staging:validate` |
| Bounded LNS 局部修复 | ✅ M6 `bounded-lns-repair.strategy.ts` |
| 前端触发中心 | ✅ M7 `GET /decision-engine/v1/trigger-center/by-trip/:tripId` |
| P3 收口 | ✅ `npm run p3-phase:closure` |

```bash
REPLANNING_TRIGGER_POLICY_ENABLED=1 BOUNDED_LNS_REPAIR_ENABLED=1 DECISION_TRIGGER_GATEWAY_ENABLED=1 npm run p3-staging:validate
npm run p3-phase:status
npm run p3-phase:closure
```

**目标：** 系统不仅能规划，还能感知变化并安全修复。  
**收口：** `artifacts/p3-phase-status/closure.json` → `READY_FOR_P4`

### Phase 4：Legacy 收敛（工程完成 → 生产切换中）

**重点：** 五级收敛阶梯 · Canonical selective 场景 ON · Legacy authority 不变

| 交付物 | 状态 |
|--------|------|
| 收敛阶梯 SSOT | ✅ `legacy-convergence-ladder.catalog.ts` |
| 阶段评估器 | ✅ `legacy-convergence.evaluator.ts` |
| Constraint 场景晋升 ON_FOR_SELECTED | ✅ iceland / weather / daily-load |
| P4 状态脚本 | ✅ `npm run p4-phase:status` |
| P4 staging 验证 | ✅ `npm run p4-staging:validate` |
| 触发中心前端文档 | ✅ `trigger/TRIGGER_CENTER_API.md` |
| P4 收口 | ✅ `npm run p4-phase:closure` |
| Agentic Research/Narration/Critic Provider | ✅ 结构化 stub + Registry 绑定 |
| Authorization selective rollout 目录 | ✅ `authorization-selective-rollout.catalog.ts` |
| P4 HTTP selective staging | ✅ `npm run p4-selective:staging` |
| Constraint rollout 状态 | ✅ `npm run constraint-rollout:status` |
| CANONICAL_DEFAULT 晋升门槛 | ✅ `canonical-default-promotion.catalog.ts` |
| CANONICAL_DEFAULT 预演 | ✅ `npm run p4-canonical-default:preview` / `:dev-3001` |
| CANONICAL_DEFAULT staging 收口 | ✅ `npm run p4-canonical-default:closure` |
| 生产 flip 计划 | ✅ `p4-phase/CANONICAL_DEFAULT_PRODUCTION_FLIP.md` |
| LEGACY_FALLBACK runbook | ✅ `p4-phase/LEGACY_FALLBACK_RUNBOOK.md` + `p4-legacy-fallback:drill` |
| 生产 flip advisory | ✅ `npm run p4-production-flip:advisory` |
| 开发 flip 全流程 drill | ✅ `npm run p4-flip-full-drill` |
| P4 工程收口 | ✅ `npm run p4-phase:final-closure` |
| 观察窗跟踪 | ✅ `npm run p4-observation:status` |
| Canonical default 切换 | ⏳ `P4_ENGINEERING_COMPLETE`；生产需 30d 观察 + 签字 |
| 六类生产观察指标 | ✅ `npm run production-observation:report` |

**收口：** `artifacts/p4-phase-status/final-closure.json` → `P4_ENGINEERING_COMPLETE`  
**生产切换 SSOT：** [PRODUCTION_TRANSITION.md](./PRODUCTION_TRANSITION.md)

### Phase 5：Legacy 退役（已启动）

**重点：** LEGACY_DEPRECATED 门槛 · architecture lint · constraint DEFAULT_ON → deprecated

| 交付物 | 状态 |
|--------|------|
| LEGACY_DEPRECATED 门槛 SSOT | ✅ `legacy-deprecated-readiness.catalog.ts` |
| 退役就绪评估器 | ✅ `legacy-deprecated-readiness.evaluator.ts` |
| P5 状态脚本 | ✅ `npm run p5-phase:status` |
| Legacy boolean 调用清零 | ✅ `npm run p5-architecture:lint` |
| Agentic Provider HTTP 接线 | ✅ `POST /providers/{research,narration,critic}` + staging |
| Constraint DEFAULT_ON 晋升 | ✅ `p5-constraint-default-on:status` / `:staging` |
| P5 每周运维巡检 | ✅ `npm run p5-weekly-ops` |
| P5 工程收口 | ✅ `npm run p5-phase:closure` |
| Constraint 全量 DEFAULT_ON | ⏳ 生产 flip 后更新 catalog phase |

```bash
npm run p5-phase:status
npm run p5-architecture:lint
npm run p5-agentic-providers:staging
npm run p5-constraint-default-on:status
npm run p5-weekly-ops
npm run p5-phase:closure
```

```
Legacy 默认 → Canonical selective → Canonical default → Legacy fallback → Legacy deprecated
```

```bash
LEGACY_CONVERGENCE_TARGET=CANONICAL_SELECTIVE \
REPLANNING_TRIGGER_POLICY_ENABLED=1 BOUNDED_LNS_REPAIR_ENABLED=1 \
DECISION_TRIGGER_GATEWAY_ENABLED=1 CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED \
CONSTRAINT_GATEWAY_ON_SCENARIOS=iceland-road-closed,weather-outdoor-storm,daily-load-excessive \
npm run p4-staging:validate
npm run p4-phase:status
npm run p4-phase:closure
npm run p4-selective:dev-3000   # 构建 + 启动 :3000 selective env + staging 探针
npm run p4-selective:staging    # 仅 HTTP 探针（服务已运行时）
npm run p4-canonical-default:dev-3001
CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=0 npm run p4-canonical-default:closure
npm run p4-legacy-fallback:drill
npm run p4-production-flip:advisory
npm run p4-flip-full-drill
npm run p4-phase:final-closure
npm run p4-observation:status
npm run p5-phase:status
```

**收口：** `artifacts/p4-phase-status/closure.json` → `CANONICAL_SELECTIVE_READY`  
**工程收口：** `artifacts/p4-phase-status/final-closure.json` → `P4_ENGINEERING_COMPLETE`  
**CANONICAL_DEFAULT staging 收口：** `artifacts/p4-canonical-default-status/closure.json` → `CANONICAL_DEFAULT_STAGING_READY`

---

## 11. 最终优先级（Production Transition）

> 详见 [PRODUCTION_TRANSITION.md](./PRODUCTION_TRANSITION.md)

| 优先级 | 任务 | 状态 |
|--------|------|------|
| **P0** | 30 天生产观察窗（六类指标 + 时间） | ⏳ `production-observation:report` |
| **P1** | Canonical Default 生产 flip（10% → 48h → 100%） | ⏳ 观察窗 PASS 后 |
| **P2** | Constraint 核心场景 DEFAULT_ON | ⏳ flip 稳定后 |
| **P3** | 生产验收勾选 + 持续运维 | ⏳ |
| **P4** | LEGACY_DEPRECATED（+90d lint） | ⏳ `legacyDeprecatedReady=false` |

**冻结（观察窗 / flip 期间）：** Objective 语义、Constraint 严重度、Lex 层级、Snapshot hash、Lineage 字段。

**当前不做：** Lex 切 Authority、全 Gateway 同时 ON、Constraint 全量 ON、删 Legacy 代码、未验证验收勾选。

---

## 12. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.1 | 2026-07-02 | Phase 0：`task-e1:p0-freeze` 编排脚本；test-tier freeze 完成 |
| 1.1.0 | 2026-07-02 | Phase 1 启动：Provider Registry、Trigger wiring catalog、P1 status CLI |
| 1.2.0 | 2026-07-02 | Phase 3 收口 READY_FOR_P4；M7 触发中心 API |
| 1.3.0 | 2026-07-02 | Phase 4 启动：Legacy convergence ladder + selective staging |
| 1.4.0 | 2026-07-02 | P4 工程收口 + flip drill；Phase 5 LEGACY_DEPRECATED 门槛启动 |
| 1.5.0 | 2026-07-02 | Production Transition SSOT；六类观察指标 `production-observation:report` |
