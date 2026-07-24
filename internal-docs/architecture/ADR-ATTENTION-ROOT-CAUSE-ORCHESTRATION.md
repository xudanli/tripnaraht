# ADR-ATTENTION: Attention & Root-Cause Orchestration — 注意力编排与根因聚合闭环

## Status

**Accepted** (2026-07-11) — Shadow Observation **CLOSED**；工程与产品语义均通过。Cutover **BLOCKED_BY_SLICE_3_CLOSURE**。

| 状态行 | 当前值 |
|--------|--------|
| Slice 4 Contract Freeze | PASS |
| Slice 4 Shadow Engineering Closure | PASS |
| Slice 4 Staging Observation Closure | PASS |
| Slice 4 Human Adjudication | PASS |
| Slice 4 Observation Closure | PASS |
| Primary SSO | NOT ELIGIBLE |
| Visible Queue Cutover | NOT ELIGIBLE |
| Notifications | OFF |

Slice 4 已证明「它会正确收敛问题」。下一证明目标（Slice 3 CLOSED 后）：「收敛后的那一张卡也能正确驱动用户完成决策和写回」。

## Context

### 已解决的问题（Slice 1–3）

TripNARA 已能独立发现多类 Canonical DecisionProblem：

| Slice | 能力 | 典型输出 |
|-------|------|----------|
| Slice 1 | 天气监测 | Weather Problem（如强风） |
| Slice 2 | 道路状态 | Road Problem（如 F-road CLOSED） |
| Slice 3 | 执行偏差 | Execution Problem（如 `EXECUTION_SCHEDULE_INFEASIBLE`） |

各模块可进一步产生衍生问题：驾驶时间增加、时间窗不可行、夜间驾驶风险等。

### 尚未解决的问题

这些问题往往不是彼此独立的。典型因果链：

```
强风
  → 驾驶速度下降
  → Execution Slip
  → ETA 超过 lastEntryAt
  → 绕行后夜间驾驶风险
```

若各模块分别出卡，用户会收到 5 张互不关联的决策卡，导致：

- 重复提醒、信息轰炸
- 多张卡互相冲突
- 用户不知道先处理哪个
- 用户关闭通知

**Slice 4 解决的不是「系统还能发现什么问题」，而是「当系统发现很多相关问题时，用户最终应该看到哪一个」。**

### 现有碎片（可复用，非 SSOT）

| 模块 | 现状 | 局限 |
|------|------|------|
| `decision-queue-admission.util.ts` | 单 Problem 入队过滤 | 无跨模块聚类 |
| `aggregateRowsByInstanceKey()` | 同 `instanceKey` 去重 | 仅限同 semantic 实例 |
| `execution-risk-cluster.util.ts` | ERC ActiveRisk 聚类 | 投影层，非 Canonical Problem SSOT |
| `getAttentionQueue()` | Attention Item 列表 | 无 rootCauseKey / escalation |
| `execution-slip-shadow-metrics.service.ts` | Slice 3 shadow 计数 | 非完整 Attention orchestration |

Slice 4 在上层新增 **Attention Runtime**，消费已有 Canonical Problems，不修改各 Slice 的检测逻辑。

### 前置条件

- Slice 3 Native E2E + Sign-off **CLOSED**
- Weather / Road / Execution Slip Canonical Problem 管线稳定

---

## Decision

### 1. Slice 4 的唯一目标

```
多个相关 DecisionProblem
  → 识别共同根因
  → 形成一个 RootCauseCluster
  → 选择一个 Primary Decision Item
  → 分配 Attention Level
  → 用户只看到一张主卡
```

### 2. 正式命名

| 语言 | 名称 |
|------|------|
| EN | **Slice 4 — Attention & Root-Cause Orchestration** |
| 中文 | **注意力编排与根因聚合闭环** |

### 3. 架构原则

#### 3.1 只消费，不检测

Slice 4 **不得**修改 Weather、Road、Execution Slip 的问题检测逻辑。它消费各模块已产生的 Canonical Problems，在上层完成编排。

#### 3.2 Cluster 是投影，不是删除

```
底层多个 Canonical Problem 保留
  → 上层只投影一个 Decision Item
```

Cluster 是用户可见投影；底层 Canonical Problems 必须完整保留，供审计、replay、revalidation 使用。

#### 3.3 前端不得聚类

Mobile / Web **只能消费**：

- `primaryItem`
- `relatedEffects`
- `attentionLevel`
- `causalStory`

**禁止**由前端本地 dedupe 或自行选择主卡。

#### 3.4 Shadow-first  rollout

Slice 4 **先 Shadow**，不直接替换现有用户队列。

先观察错误合并、漏合并、错误 Primary、错误 Attention 升级；证据稳定后，再让统一 Decision Item 成为用户可见 SSOT。

### 4. Runtime 链路（冻结）

```
Canonical DecisionProblems
  → RootCause Resolver
  → Cluster Upsert
  → Primary Selector
  → Attention Admission
  → Unified Decision Item Projection
  → Consumer Queue / Native UI
```

**目标落点（待实现）：** `src/trips/guardian-decision-core/attention/`

| 阶段 | 组件 | 职责 |
|------|------|------|
| Resolve | `root-cause-resolver.service.ts` | 从 Problem lineage / causal refs 解析 `rootCauseKey` |
| Upsert | `root-cause-cluster.store.ts` | 按 `rootCauseKey` upsert cluster |
| Select | `primary-problem-selector.util.ts` | 按优先级选 Primary Problem |
| Admit | `attention-admission.util.ts` | 分配 / 升级 Attention Level |
| Project | `unified-decision-item.projection.ts` | 投影 Primary Item + related effects |

### 5. Primary Problem 选择规则

**禁止**简单按「最早创建」选择 Primary。

按优先级（高 → 低）：

1. **安全不可行** — `SAFETY_STOP` 级阻断
2. **当前计划不可执行** — 如 `EXECUTION_SCHEDULE_INFEASIBLE`
3. **有明确决策截止时间** — 时间窗即将失效
4. **软风险** — WARNING 级衍生影响
5. **仅信息变化** — Evidence 更新但语义不变

**根因 vs Primary 分离：**

| 角色 | 用途 | 示例 |
|------|------|------|
| 根因 | 解释、聚类、`rootCauseKey` | 强风 `WEATHER_STRONG_WIND` |
| Primary Problem | 驱动决策、确认入口、Repair 候选 | `EXECUTION_SCHEDULE_INFEASIBLE` |
| Related effects | 补充影响范围 | 夜间驾驶、时间窗失效 |

用户可见主标题示例：

> 强风导致今天的原计划无法按时完成

底层 Primary Problem 仍为 `EXECUTION_SCHEDULE_INFEASIBLE`。

**不要**强行把「最上游根因」永远作为可执行主问题。

### 6. 聚类规则（防错）

**禁止**按时间接近聚类。两个问题在同一分钟发生，不代表同根因。

合并必须至少满足以下之一（实现时组合使用）：

- **lineage** — Problem 因果 lineage 引用
- **causal refs** — 显式 `causedByProblemId` / `derivedFromAssertionId`
- **shared entity/scope** — 同一 `routeSegmentId` + 同一 `weatherEpisodeId`
- **rootCauseCode** — 知识库因果链匹配
- **明确规则** — 首版强风链规则表（见 Vertical Slice 需求书）

**禁止错误合并：** Weather 与 Road 无因果关系时，必须保留两个 cluster。

---

## Type Contracts (Frozen)

**契约文件：** `src/trips/guardian-decision-core/contracts/attention-orchestration.types.ts`

### AttentionLevel

```typescript
export type AttentionLevel =
  | 'SILENT'       // 后台记录，不展示
  | 'LOG_ONLY'     // 时间线记录
  | 'SUMMARY'      // 汇总展示（首版保留契约，不重点验证）
  | 'QUEUE'        // 进入待处理队列
  | 'INTERRUPT'    // 需要立即处理
  | 'SAFETY_STOP'; // 安全级强提醒
```

### CausalNode

```typescript
export interface CausalNode {
  code: string;
  label: string;
  problemId?: string;
  assertionId?: string;
  order: number;
}
```

### RootCauseCluster

```typescript
export interface RootCauseCluster {
  clusterId: string;
  tripId: string;

  rootCauseKey: string;
  rootCauseType: string;

  primaryProblemId: string;
  relatedProblemIds: string[];

  causalChain: CausalNode[];

  attentionLevel: AttentionLevel;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

  firstObservedAt: string;
  lastUpdatedAt: string;
}
```

### UnifiedDecisionItemProjection（用户可见 SSOT）

```typescript
export interface UnifiedDecisionItemProjection {
  clusterId: string;
  tripId: string;

  /** 用户确认入口绑定的 Primary Problem */
  primaryProblemId: string;
  primarySemanticCapability: string;

  headline: string;
  explanation: string;
  causalStory: CausalNode[];

  attentionLevel: AttentionLevel;
  status: RootCauseCluster['status'];

  relatedEffects: Array<{
    problemId: string;
    semanticCapability: string;
    label: string;
  }>;

  /** 只允许一个确认入口 */
  confirmationEntry: {
    problemId: string;
    actionRoute: 'decision-queue';
  };

  firstObservedAt: string;
  lastUpdatedAt: string;
}
```

### rootCauseKey 格式（必须稳定）

```
weather:strong-wind:{tripId}:{routeSegmentId}:{weatherEpisodeId}
```

**禁止**加入：

- `observedAt`
- `triggerEventId`
- 每次 polling 时间
- 易变化的 ETA

否则每次天气更新都会创建新 cluster。

**Road 先例（Slice 2 文档）：** `road.is:F208:CLOSED:{observedAt}` — Slice 4 强风链首版以 weather episode 为 episode 边界，后续 Road 聚类需单独评审 episode 语义。

---

## Attention Rules (Frozen — 首版最小集)

首版不必把六级全部做复杂逻辑。`SUMMARY` 保留契约，首个 Slice 不重点验证。

| 条件 | Attention Level |
|------|-----------------|
| 偏差存在但仍可执行 | `SILENT` / `LOG_ONLY` |
| 需要决定但还有时间 | `QUEUE` |
| 时间窗即将失效 | `INTERRUPT` |
| 明确安全阻断 | `SAFETY_STOP` |

### Escalation 规则

- Attention Level **只能向上升级**（如 `QUEUE` → `INTERRUPT` → `SAFETY_STOP`），除非 cluster 重新评估
- 升级时**允许**重新通知用户
- Evidence 更新但语义不变 → **仅**更新 `lastUpdatedAt`，不重新提醒

---

## Dedupe Rules (Frozen)

必须至少实现：

| 规则 | 行为 |
|------|------|
| 相同 `rootCauseKey` | 不创建第二个 cluster |
| 新 Problem 进入 | 加入 `relatedProblemIds` |
| Primary 升级 | 允许替换 `primaryProblemId` |
| Attention 升级 | 仅向上；升级时可 re-notify |
| 用户确认方案 | cluster → `ACKNOWLEDGED` / `RESOLVED`；不再重复通知 |
| Cluster resolved | 从 Queue 移除 |
| Evidence 更新 | ≠ 重新提醒（语义不变时） |

---

## Consequences

### Positive

- 用户只处理一个决策，降低认知负担
- 跨模块因果链可解释（`causalStory`）
- Shadow 模式可安全验证聚类质量
- 底层 Canonical Problems 完整保留，审计不受影响

### Negative / Risks

- 错误合并比漏合并伤害更大 — Shadow 阶段必须监控 false-merge
- Primary 选择错误会导致用户确认错误 Repair — 需 harness 覆盖升级路径
- 与现有 `decision-queue` / ERC cluster 存在短期双轨 — 需明确 SSOT 切换条件

### 与现有模块关系

| 模块 | Slice 4 动作 |
|------|--------------|
| Weather detection | **不修改** |
| Road detection | **不修改** |
| Execution Slip detection | **不修改** |
| `decision-queue` API | Shadow 并行；切换后 Primary Item 成为 SSOT |
| ERC `execution-risk-cluster.util.ts` | 可参考；Slice 4 SSOT 在 guardian-decision-core attention 层 |
| Frontend | 消费 `UnifiedDecisionItemProjection`；零本地 dedupe |

---

## Implementation Sequence (Frozen)

**已完成：**

```
Slice 4 ADR（本文档）✅
  → 契约冻结 ✅
  → Shadow-only Cluster Runtime ✅
  → Staging real-DB replay 10/10 + Human Adjudication ✅
  → Observation Closure PASS ✅
```

**Slice 3 CLOSED 后（当前唯一依赖）：**

```
Slice 3 CLOSED
  → Internal Dual-Read（Current Unified Queue + Attention Primary Projection 并排比较）
  → Internal Primary Projection
  → Allowlist Canary（ATTENTION_ROOT_CAUSE_PRIMARY_SSO=1 + trip/user allowlist）
  → Visible Queue Cutover
```

Internal Dual-Read **不是**直接开 Primary SSO。仅内部账号 · Canary Trip · 已有强风链 · 无通知 · 不替换正式 Queue。

**Feature flag：** `ATTENTION_ROOT_CAUSE_ORCHESTRATION=1`（shadow，**ON**）；`ATTENTION_ROOT_CAUSE_PRIMARY_SSO=1`（**NOT ELIGIBLE**，Allowlist Canary 阶段才启用）

---

## Acceptance Gates (Slice 4 CLOSED)

| Gate | 标准 |
|------|------|
| Stable `rootCauseKey` | PASS |
| Cross-module clustering | PASS |
| Single Primary Decision Item | PASS |
| Attention admission | PASS |
| Escalation | PASS |
| Duplicate visible cards | **ZERO** |
| Resolved queue removal | PASS |
| Underlying Canonical Problems preserved | PASS |
| Frontend local dedupe | **ZERO** |

详细验收用例见 [SLICE-4-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md](../operations/SLICE-4-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md)。

---

## References

- [EXECUTION-SLIP-PRODUCTION-SIGNOFF-PACK-2026-07-11.md](../operations/EXECUTION-SLIP-PRODUCTION-SIGNOFF-PACK-2026-07-11.md) — Slice 3 → Slice 4 衔接
- [SLICE-2-ICELAND-ROAD-CLOSE-CANARY-ACCEPTANCE.md](../operations/SLICE-2-ICELAND-ROAD-CLOSE-CANARY-ACCEPTANCE.md) — `rootCauseKey` 先例
- [EXECUTION_SLIP_FRONTEND_HANDOFF.md](../../src/trips/guardian-decision-core/EXECUTION_SLIP_FRONTEND_HANDOFF.md) — Slice 3 前端契约
- `src/decision-runtime/gateway/utils/decision-queue-admission.util.ts`
- `src/trips/execution-risk-center/utils/execution-risk-cluster.util.ts`

---

## Decision Log

| Date | Decision |
|------|----------|
| 2026-07-11 | Slice 4 正式命名与唯一目标冻结 |
| 2026-07-11 | Primary ≠ 根因；按决策优先级选 Primary |
| 2026-07-11 | Shadow-first；不直接替换现有队列 |
| 2026-07-11 | 首版仅强风 → Execution Slip 单场景 |
| 2026-07-11 | Shadow Observation Closure PASS；FROZEN · SHADOW_CLOSED · NO_VISIBLE_CUTOVER |
| 2026-07-11 | Cutover 序列冻结：Slice 3 CLOSED → Internal Dual-Read → … → Visible Queue Cutover |
