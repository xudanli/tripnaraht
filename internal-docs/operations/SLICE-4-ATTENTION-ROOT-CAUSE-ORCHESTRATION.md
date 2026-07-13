# Slice 4 — Attention & Root-Cause Orchestration Vertical Slice 需求书

**中文名：** 注意力编排与根因聚合闭环  
**Effective:** 2026-07-11  
**Status:** **FROZEN · SHADOW_CLOSED · NO_VISIBLE_CUTOVER** · Runtime cutover = **BLOCKED_BY_SLICE_3_CLOSURE**  
**Prerequisite:** Slice 3 Native E2E + Operational Sign-off **CLOSED**  
**ADR:** [ADR-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md](../architecture/ADR-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md)

### 正式状态行（2026-07-11）

| 状态行 | 当前值 |
|--------|--------|
| Slice 4 Contract Freeze | **PASS** |
| Slice 4 Shadow Engineering Closure | **PASS** |
| Slice 4 Staging Observation Closure | **PASS** |
| Slice 4 Human Adjudication | **PASS** — [ATTENTION-SHADOW-HUMAN-ADJUDICATION-2026-07-11.md](./ATTENTION-SHADOW-HUMAN-ADJUDICATION-2026-07-11.md) |
| Slice 4 Observation Closure | **PASS** |
| Primary SSO | **NOT ELIGIBLE** |
| Visible Queue Cutover | **NOT ELIGIBLE** |
| Notifications | **OFF** |

**Slice 4 Shadow Observation 已关闭** — 工程与产品语义均通过。Slice 4 已证明「它会正确收敛问题」；下一步须等 Slice 3 CLOSED 后，证明「收敛后的那一张卡也能正确驱动用户完成决策和写回」。

**当前唯一依赖：** 等待 Slice 3 正式 **CLOSED**。Slice 3 关闭前，Slice 4 保持 **FROZEN · SHADOW_CLOSED · NO_VISIBLE_CUTOVER**。

**项目主线（当前阻塞点不在 Slice 4）：** 完成 Slice 3 Native E2E、Operational Sign-off，并正式 CLOSED → 随即进入 Slice 4 **Internal Dual-Read**（**不是**直接开 Primary SSO）。

<details>
<summary>Harness / Engineering 明细（Observation Closure 证据）</summary>

| 状态行 | 当前值 |
|--------|--------|
| Slice 4 Shadow Runtime Skeleton | **PASS** |
| Slice 4 Harness (unit) | **PASS — 15/15** |
| Slice 4 Shadow Wiring Harness | **PASS — S4-S1…S4-S6** |
| Slice 4 Observation Catalog | **PASS — 30/30 samples** |
| Slice 4 Observation Harness | **PASS — adjudication + episode authority** |
| Slice 4 Canonical Read Model Wiring | **PASS**（只读 `collectRows`） |
| Slice 4 Staging Real-DB Replay | **PASS — 10/10** |

</details>

### Staging 实库 Replay（Observation Closure 最后一步）

```bash
# 默认：seed + 按场景写实库 profile + replay
npm run attention:staging-closure

# 分步
npm run attention:staging-seed
ATTENTION_ROOT_CAUSE_ORCHESTRATION=1 npm run attention:staging-replay

# 单场景
ATTENTION_ROOT_CAUSE_ORCHESTRATION=1 npm run attention:staging-replay -- --scenario=STG-REPLAY-B

# 连通性检查（不写 evidence）
ATTENTION_ROOT_CAUSE_ORCHESTRATION=1 npm run attention:staging-replay -- --dry-run --scenario=STG-REPLAY-A
```

| 输出 | 路径 |
|------|------|
| 逐场景 evidence | `internal-docs/operations/evidence/attention-shadow/attention-shadow-staging-{scenarioId}-*.json` |
| Batch summary | `attention-shadow-staging-batch-*.json` |
| 人工签字模板 | [ATTENTION-SHADOW-HUMAN-ADJUDICATION-2026-07-11.md](./ATTENTION-SHADOW-HUMAN-ADJUDICATION-2026-07-11.md) |

场景 catalog：`attention-shadow-staging-replay-catalog.ts`（STG-REPLAY-A…F + 07–10）


## 0. 唯一目标

```
多个相关 DecisionProblem
  → 识别共同根因
  → 形成一个 RootCauseCluster
  → 选择一个 Primary Decision Item
  → 分配 Attention Level
  → 用户只看到一张主卡
```

**Slice 4 不是新检测能力。** 它消费 Weather、Road、Execution Slip 已产生的 Canonical Problems，在上层完成聚合、去重、排序、升级、展示。

---

## 1. 第一阶段范围（MVP — 仅一个场景）

### 1.1 In scope

| 维度 | 范围 |
|------|------|
| 因果链 | 强风 → 驾驶速度下降 → Execution Slip → ETA 超过 `lastEntryAt` → 夜间驾驶风险 |
| 输入 Problem | Weather Problem、Execution Problem（`EXECUTION_SCHEDULE_INFEASIBLE`）、Time Window Problem、Night Driving 衍生 |
| 输出 | **一个** Primary Decision Item；related effects 挂载；**一个**确认入口 |
| 运行模式 | Shadow-first → Canary Drill → Primary SSOT 切换 |
| 目的地 | 冰岛 Canary（复用 Execution Slip Canary trip） |

### 1.2 Out of scope（本切片不做）

- 新天气监测、新道路数据源、新 Repair 类型、新导航引擎
- 新成员状态推断、新顾问工作台
- Weather + Road **跨根因**合并（无因果关系时必须两个 cluster）
- `SUMMARY` Attention Level 的完整 UI 验证（契约保留，不重点验收）
- 直接替换现有 `decision-queue` 为用户 SSOT（须 Shadow 证据通过后）
- 修改 Weather / Road / Execution Slip 检测逻辑

---

## 2. 目标场景（Canonical Narrative）

用户在冰岛自驾。Day N 计划经某 `routeSegmentId` 前往下一 POI，该 POI 有 `lastEntryAt=16:00`。

| 时刻 | 事件 | 系统行为（Slice 4 前） | 系统行为（Slice 4 后） |
|------|------|------------------------|------------------------|
| T0 | Vedur 报告路段强风 | 可能产生 Weather Problem | 创建 cluster；Attention 待定 |
| T1 | 强风导致驾驶速度下降 | Weather assertion 更新 | 更新原 cluster |
| T2 | 用户「我晚了」或系统检测到 Execution Slip | 产生 Execution Problem | 加入 `relatedProblemIds`；不新建卡 |
| T3 | ETA 16:18 > lastEntryAt 16:00 | 可能产生 Time Window Problem | Primary 升级为 `EXECUTION_SCHEDULE_INFEASIBLE` |
| T4 | 绕行路径落入 sunset cutoff 后 | 可能产生 Night Driving 风险 | 加入 related effects；Attention 可能升级 |

**用户最终只看到一张主卡：**

> **强风导致今天的原计划无法按时完成**  
> 预计到达下一活动时间为 16:18，已超过 16:00 最晚入场时间；绕行还会导致夜间驾驶。  
> 推荐取消下一活动并提前前往住宿。

- 底层：Weather / Execution / Time Window Problems **均保留**
- 上层：一个 Primary Item + 一个确认入口

---

## 3. 冻结契约

**Type SSOT：** `src/trips/guardian-decision-core/contracts/attention-orchestration.types.ts`

完整定义见 ADR § Type Contracts。本节列出验收必须字段。

### 3.1 RootCauseCluster

| 字段 | 要求 |
|------|------|
| `clusterId` | 稳定 UUID；同一 `rootCauseKey` upsert 不换新 id |
| `rootCauseKey` | 见 § 3.3 |
| `rootCauseType` | 首版：`WEATHER_STRONG_WIND` |
| `primaryProblemId` | 按 § 4 优先级选择 |
| `relatedProblemIds` | 所有衍生 Problem；去重 |
| `causalChain` | 有序 CausalNode 列表 |
| `attentionLevel` | 见 § 5 |
| `status` | `OPEN` \| `ACKNOWLEDGED` \| `RESOLVED` |

### 3.2 rootCauseKey（必须稳定）

```
weather:strong-wind:{tripId}:{routeSegmentId}:{weatherEpisodeId}
```

| 组成部分 | 来源 |
|----------|------|
| `tripId` | 行程 ID |
| `routeSegmentId` | 受影响驾驶段（与 `buildItemSegmentId()` 一致） |
| `weatherEpisodeId` | Vedur assertion episode / fingerprint 边界（**非** `observedAt`） |

**禁止**作为 key 组成部分：

- `observedAt`
- `triggerEventId`
- polling 时间戳
- 实时 ETA

### 3.3 UnifiedDecisionItemProjection（前端消费）

| 字段 | 要求 |
|------|------|
| `primaryItem` | 单条；含 `headline`、`explanation`、`confirmationEntry` |
| `relatedEffects` | 衍生 Problem 摘要列表 |
| `attentionLevel` | 六档之一 |
| `causalStory` | 用户可读因果链 |

**前端禁令：** 零本地 dedupe；零自行选 Primary。

---

## 4. Primary Problem 选择规则

优先级（高 → 低）：

| 优先级 | 类型 | 示例 semanticCapability |
|--------|------|-------------------------|
| 1 | 安全不可行 | 硬阻断、夜间不可接受 |
| 2 | 当前计划不可执行 | `EXECUTION_SCHEDULE_INFEASIBLE` |
| 3 | 有明确决策截止时间 | 时间窗即将失效 |
| 4 | 软风险 | 强风 WARNING（计划仍可行） |
| 5 | 仅信息变化 | Evidence refresh |

**强风链首版预期：**

- 用户标题根因：**强风**
- Primary Problem：**`EXECUTION_SCHEDULE_INFEASIBLE`**（当 Slip 导致不可行时）
- 仅强风、计划仍可行：`attentionLevel` = `SILENT` / `LOG_ONLY`；可无 Queue 主卡

---

## 5. Attention 规则（首版最小集）

| 条件 | Attention Level | 用户可见 |
|------|-----------------|----------|
| 偏差存在但仍可执行 | `SILENT` / `LOG_ONLY` | 否 / 时间线 |
| 需要决定但还有时间 | `QUEUE` | 待处理队列 |
| 时间窗即将失效 | `INTERRUPT` | 强提醒 |
| 明确安全阻断 | `SAFETY_STOP` | 安全级 |

### Escalation

- 仅向上：`QUEUE` → `INTERRUPT` → `SAFETY_STOP`
- 升级时允许 re-notify
- 语义不变的 Evidence 更新 → 只更新 `lastUpdatedAt`

---

## 6. 去重规则

| # | 规则 | 验收 |
|---|------|------|
| D1 | 相同 `rootCauseKey` 不创建第二个 cluster | Harness |
| D2 | 新 Problem → `relatedProblemIds` | Harness |
| D3 | Primary 可升级替换 | Harness |
| D4 | Attention 仅向上升级 | Harness |
| D5 | 用户确认后不再重复通知 | E2E |
| D6 | Cluster `RESOLVED` 后移出 Queue | E2E |
| D7 | Evidence 更新 ≠ 重新提醒 | Harness |

---

## 7. Runtime 链路

```
Canonical DecisionProblems
  → RootCause Resolver
  → Cluster Upsert
  → Primary Selector
  → Attention Admission
  → Unified Decision Item Projection
  → Consumer Queue / Native UI
```

### 7.1 代码落点（Shadow 阶段已实现）

| 组件 | 路径 | 状态 |
|------|------|------|
| 契约 | `contracts/attention-orchestration.types.ts` | ✅ |
| Runtime（内存 rebuild） | `attention/attention-orchestration.runtime.ts` | ✅ |
| Read Model 适配 | `attention/unified-row-to-orchestration-input.adapter.ts` | ✅ |
| Shadow Run（纯函数） | `attention/attention-shadow-run.util.ts` | ✅ |
| Shadow Runner（Nest） | `attention/attention-orchestration-shadow-runner.service.ts` | ✅ |
| 对比逻辑 | `attention/attention-shadow-comparison.util.ts` | ✅ |
| Evidence Writer | `attention/attention-shadow-evidence.writer.ts` | ✅ |
| Shadow Metrics | `shadow/attention-orchestration-shadow-metrics.service.ts` | ✅ |
| Unit Harness | `e2e/attention-wind-execution-slip.harness.spec.ts` | ✅ 15/15 |
| Shadow Wiring Harness | `e2e/attention-shadow-wiring.harness.spec.ts` | ✅ S4-S1…S6 |

Evidence 输出目录：`internal-docs/operations/evidence/attention-shadow/attention-shadow-{tripId}-{timestamp}.json`

**边界（冻结）：** Shadow Runner 只读 `UnifiedDecisionProblemReadModelService.collectRows()`；**不**写 queue、**不**改 admission、**不**触发通知。

### 7.2 Feature Flags

| Flag | 含义 |
|------|------|
| `ATTENTION_ROOT_CAUSE_ORCHESTRATION=1` | 启用 Shadow Cluster Runtime |
| `ATTENTION_ROOT_CAUSE_PRIMARY_SSO=1` | Primary Item 成为用户可见 SSOT（Canary 签字后） |

### 7.3 本地 Harness

```bash
ATTENTION_ROOT_CAUSE_ORCHESTRATION=1 npm test -- attention-shadow-observation.harness.spec.ts
ATTENTION_ROOT_CAUSE_ORCHESTRATION=1 npm test -- attention-wind-execution-slip.harness.spec.ts attention-shadow-wiring.harness.spec.ts
```

Staging 只读 Shadow（需 DB + flag）：

```typescript
// AttentionOrchestrationShadowRunnerService.runForTrip(tripId)
// ATTENTION_ROOT_CAUSE_ORCHESTRATION=1
```

```

### 7.4 Shadow 对比指标

Shadow 阶段必须对比现有 Queue，至少记录：

| 指标 | 说明 |
|------|------|
| `clusterCount` | Shadow cluster 数量 |
| `legacyQueueItemCount` | 现有 decision-queue 可见项 |
| `duplicateVisibleCardsAvoided` | Shadow 避免的重复卡数 |
| `falseMergeCount` | 错误合并（人工/adjudication） |
| `missedMergeCount` | 漏合并 |
| `wrongPrimaryCount` | 错误 Primary 选择 |
| `wrongAttentionEscalationCount` | 错误 Attention 升级 |

---

## 8. 聚类规则（防错 — 必须实现）

### 8.1 允许合并

必须至少满足以下之一：

- Problem **lineage** 引用（`causedByProblemId`）
- **causal refs**（assertion → problem 链）
- **shared scope**：同一 `routeSegmentId` + 同一 `weatherEpisodeId`
- **rootCauseCode** 知识库匹配
- **首版规则表**（强风链硬编码，见 § 8.3）

### 8.2 禁止合并

| 场景 | 预期 |
|------|------|
| 两个无关根因（强风 + 无关 Road CLOSED） | **两个** cluster |
| Weather 与 Road 无因果关系 | 不合并 |
| 仅时间接近 | 不合并 |

### 8.3 首版强风链规则表

```
WEATHER_STRONG_WIND (root)
  → DRIVING_SPEED_REDUCED (effect)
  → EXECUTION_DEPARTURE_SLIP (effect)
  → EXECUTION_SCHEDULE_INFEASIBLE (primary candidate)
  → ACTIVITY_WINDOW_MISSED (effect)
  → NIGHT_DRIVING_RISK (effect)
```

---

## 9. 验收用例

### 9.1 Harness 用例

| Case ID | 输入 | 预期 |
|---------|------|------|
| S4-A1 | 强风单独出现 | 1 cluster；`relatedProblemIds` 含 weather problem |
| S4-A2 | 后续产生 execution slip | 更新原 cluster；不新建 |
| S4-A3 | 后续时间窗失效 | Primary 升级为 `EXECUTION_SCHEDULE_INFEASIBLE` |
| S4-A4 | 相同事件重复进入 | 不新增可见卡片 |
| S4-A5 | 严重度 QUEUE → INTERRUPT | 允许 re-notify |
| S4-A6 | 用户确认方案 | 不再重复提醒；status → `ACKNOWLEDGED`/`RESOLVED` |
| S4-A7 | Problem 全部 resolved | cluster 移出队列 |
| S4-A8 | 两个无关根因 | 2 cluster |
| S4-A9 | Weather + Road 无因果 | 不合并 |
| S4-A10 | 新 Evidence 语义不变 | 仅 `lastUpdatedAt` 更新 |

### 9.2 Shadow 验收

| Case ID | 预期 |
|---------|------|
| S4-S1 | Shadow runtime 运行；不修改用户可见 queue（flag off SSO） |
| S4-S2 | `duplicateVisibleCardsAvoided` > 0（对比 legacy queue） |
| S4-S3 | `falseMergeCount = 0` 或全部 adjudicated |
| S4-S4 | 底层 Canonical Problems 数量不变（仅投影层收敛） |

### 9.3 Canary Drill（Staging / Prod）

**Prerequisite：** Slice 3 Canary PASS；Execution Slip trip 可用

| 字段 | 建议值 |
|------|--------|
| tripId | `c0c77777-7777-4777-8777-777777777777`（Execution Slip Canary） |
| routeSegmentId | Canary 行程中已绑定驾驶段 |
| weatherEpisodeId | Vedur replay / live episode fixture |
| Activity B lastEntryAt | `16:00` |

**Drill 步骤：**

1. 注入强风 assertion（replay fixture）
2. 触发 Execution Slip（+45min 或等效）
3. 验证 Shadow：1 cluster，legacy queue 可能 >1 item
4. 验证 Primary headline 含强风根因解释
5. 验证确认入口绑定 `EXECUTION_SCHEDULE_INFEASIBLE` problemId
6. 用户确认 → cluster resolved → queue 移除

---

## 10. 完成标准（Slice 4 CLOSED）

| Gate | 标准 |
|------|------|
| Stable `rootCauseKey` | PASS |
| Cross-module clustering | PASS |
| Single Primary Decision Item | PASS |
| Attention admission | PASS |
| Escalation | PASS |
| Duplicate visible cards | **ZERO**（SSO 开启后） |
| Resolved queue removal | PASS |
| Underlying Canonical Problems preserved | PASS |
| Frontend local dedupe | **ZERO** |
| Shadow evidence pack | 签字 |

---

## 11. 实施顺序（冻结）

```
Slice 3 Native E2E + Operational Sign-off
  → Slice 3 CLOSED                    ← 当前唯一阻塞点
  → Internal Dual-Read                ← Slice 3 CLOSED 后首步（不是 Primary SSO）
  → Internal Primary Projection
  → Allowlist Canary（ATTENTION_ROOT_CAUSE_PRIMARY_SSO=1 + trip/user allowlist）
  → Visible Queue Cutover
  → Slice 4 Sign-off
```

**已完成（不再扩展）：**

```
Slice 4 ADR ✅
  → 契约冻结（attention-orchestration.types.ts）✅
  → Shadow-only Cluster Runtime ✅
  → Harness + Staging real-DB replay 10/10 ✅
  → Human Adjudication + Observation Closure ✅
```

### 11.1 Internal Dual-Read（Slice 3 CLOSED 后首步）

**目标：** 内部同时读取 **Current Unified Queue** + **Attention Primary Projection**，比较收敛是否正确、是否漏卡或错误隐藏、Primary 是否更合理、确认入口是否唯一。

**最小范围：**

| 维度 | 限制 |
|------|------|
| 账号 | 仅内部账号 |
| Trip | 仅 Canary Trip（`c0c77777-7777-4777-8777-777777777777`） |
| 场景 | 已有强风链 |
| 通知 | **不发送** |
| 用户 Queue | **不替换**正式 Queue |

**建议响应字段：**

```json
{
  "currentQueueItems": [],
  "attentionPrimaryItems": [],
  "comparison": {
    "currentVisibleCount": 3,
    "attentionVisibleCount": 1,
    "reductionCount": 2
  }
}
```

**比较项：** 当前队列有几张卡 · Attention 投影后有几张卡 · 是否有漏卡 · 是否错误隐藏问题 · Primary 是否更合理 · 用户确认入口是否唯一。

### 11.2 Internal Primary Projection

内部页面**默认展示** Attention Primary Item，但仍保留切换查看原始 Canonical Problems。

### 11.3 Allowlist Canary

仅对少量内部或测试用户开启 `ATTENTION_ROOT_CAUSE_PRIMARY_SSO=1`，且必须限制：

- trip allowlist
- user allowlist
- 无通知
- 可随时关闭
- 可回退到 current unified queue

### 11.4 用户可见切换前仍需验证

即使 Observation Closure = PASS，真正切用户可见前还要验证：

- Primary Item 能正确驱动 Slice 3 的确认与执行
- 用户确认后 cluster 正确 resolved
- 底层 Problem 状态变化能更新投影
- Native 不会同时展示原卡与 Primary 卡
- rollback 能恢复原 Queue
- 多实例环境下 projection 一致

### 11.5 禁止事项（Observation Closure 后冻结）

- 不新增天气、道路、成员聚类
- 不扩 Attention 规则
- 不改 `rootCauseKey`
- 不开通知
- 不新增 cluster 持久化表
- 不做全量 cutover
- 不修改已通过的 10 个 staging 场景
- **不继续扩 Slice 4**

---

## 12. 前端对接（Preview）

Slice 4 SSO 切换后，Native 应消费 **Unified Primary Item**，而非自行合并多张 decision-queue item。

| 元素 | 数据来源 |
|------|----------|
| 主标题 | `primaryItem.headline` |
| 发生了什么 | `primaryItem.explanation` |
| 因果链 | `primaryItem.causalStory` |
| 相关影响 | `primaryItem.relatedEffects[]` |
| 严重度 / 注意力 | `primaryItem.attentionLevel` |
| 确认按钮 | `primaryItem.confirmationEntry.problemId` → 现有 `accept-recommended` |

**禁止：** 按 `semanticCapability` 多张卡并列展示同一因果链。

详细前端 handoff 在 Shadow PASS + Canary 后单独出具（对标 `EXECUTION_SLIP_FRONTEND_HANDOFF.md`）。

---

## 13. 与 Slice 1–3 关系

| Slice | Slice 4 如何使用 |
|-------|------------------|
| Slice 1 Weather | 消费 Weather Canonical Problem；解析 `weatherEpisodeId` |
| Slice 2 Road | 首版不合并；后续扩展 Road cluster 规则 |
| Slice 3 Execution Slip | 消费 `EXECUTION_SCHEDULE_INFEASIBLE`；Primary 候选 |

---

## 14. Owner Sign-off（待填）

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Attention Runtime Engineering Owner | | | |
| Guardian / Decision Core Owner | | | |
| Native Client Owner | | | |
| Release Sign-off Owner | | | |

**Commit SHA at sign-off:** __________________
