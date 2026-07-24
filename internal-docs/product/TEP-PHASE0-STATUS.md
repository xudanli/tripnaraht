# 冰岛自驾 TEP — Phase 0 状态与生产化路线图

**父文档：** [TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md](./TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md)  
**BFF：** [EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md](../frontend/EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md)  
**试点手册：** [TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md](./TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md)  
**签字 Checklist：** [TEP-PHASE0-SIGNOFF-CHECKLIST.md](./TEP-PHASE0-SIGNOFF-CHECKLIST.md)  
**版本：** 1.1.0 · **2026-07-12**

---

## 1. 正式项目状态

### 1.1 不再适用的表述

> Planning-time Executability MVP 基本完成  
> Runtime-ready 尚未完成

### 1.2 当前正式定义

| 英文 | 中文 |
|------|------|
| **Iceland Self-Drive TEP Phase 0 — Functional Complete → Limited Pilot** | **功能闭环完成；战略重心转为受控真实试点（非继续向内扩规则）** |

TEP 正式用途：**产品核心能力** · **真实用户试点系统** · **跨目的地复制基线**。  
详见 [TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md](./TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md)。

### 1.3 发布状态阶梯

| 层面 | 状态 | 说明 |
|------|------|------|
| **功能能力** | ✅ Functional Complete | 持续决策 Vertical Slice 主链可运行 |
| **自动化认证** | 🟡 核心切片通过 | ~126 TEP tests；IS-CERT 001–304 + 401–405 + **401-CONCURRENT** |
| **生产可信度** | 🟡 staging PG + mock | 401/402/**401-CONCURRENT** staging ✅；WP-TEP-17 门禁 ✅ |
| **发布状态** | 🎯 **Production Candidate — Limited Pilot**（目标） | **仅剩 WP-TEP-16 签字** |
| **正式发布** | ❌ Not Production Ready | 试点指标与运营台账未达标 |

**结论：** 工程目标已从「跑通闭环」转为「**真实行程中是否准确、稳定、有用、值得付费**」。不得对外宣称 Production Ready；签字后升级为 **Limited Pilot**，仍非 GA。

---

## 2. 已成立的主链

```
Travel Execution Planning
        ↓
Executability Assessment
        ↓
DecisionHook / RecoveryGraph / repairPreviews
        ↓
PlanVersion.metadata.tep（规划期可运行资产）
        ↓
WorldState Event（道路 / 天气 / 日照）
        ↓
TEP Runtime Hook → DecisionProblem
        ↓
Execution Adjustment Queue（intervention-tep-*）
        ↓
User Accept
        ↓
Local Repair（REMOVE）
        ↓
PlanVersion Writeback
        ↓
Itinerary Materialization
        ↓
Executability Re-validation
        ↓
Decision Read Model Cache Invalidation
```

### 2.1 产品闭环四件事

| # | 能力 | 状态 |
|---|------|------|
| 1 | **规划期可执行性判断**（SDR-001～003、101、201–203、301–303、202） | ✅ |
| 2 | **规划产出可运行资产**（hooks、recoveryGraph、repairPreviews、`metadata.tep`） | ✅ |
| 3 | **环境变化 → 待调整项**（Hook → Problem → ERC 修复卡） | ✅ |
| 4 | **确认 → 真实改计划**（REMOVE 写回 + 幂等 + 重验证 + STALE 门控） | ✅ mock DB + staging PG（含并发门禁） |

### 2.2 Phase 0 写回边界

| 项 | 范围 |
|----|------|
| 支持动作 | `REMOVE` + `REPLACE`（预计算 `replacementPoiId`） |
| 不支持 | LLM 临时 POI 写回 |
| 幂等键 | `trip:{tripId}:tep-repair:{optionId}` |
| Mobile | `POST /api/mobile/trips/{tripId}/execution/tep-repairs/{interventionId}/accept` |
| Canonical | `POST /api/trips/{tripId}/executability/repairs/{optionId}/apply` |

---

## 3. 已实现工作包（WP-TEP-09～12）

| WP | 名称 | 状态 |
|----|------|------|
| WP-TEP-10 | WorldState Evidence Bridge | ✅ |
| WP-TEP-11 | DecisionHook Projection + Runtime 触发 + 持久化 | ✅ |
| WP-TEP-12 | RecoveryGraph + Local Repair 预览 + REMOVE 写回 | ✅ |
| ERC 集成 | adjustment-queue / execution-alerts 富化 | ✅ |
| Pipeline | TEP Hook 优先，canonical 兜底 | ✅ |

**代码落点（摘要）：**

| 领域 | 路径 |
|------|------|
| 评估 BFF | `src/trips/tep/services/executability-assessment.service.ts` |
| 规划期 DecisionProblem | `src/trips/tep/projectors/planning-tep-decision-problem.projector.ts` |
| Hook 投影 | `src/trips/tep/projectors/decision-hook.projector.ts` |
| RecoveryGraph | `src/trips/tep/projectors/recovery-graph.projector.ts` |
| Runtime 桥接 | `src/trips/tep/services/tep-runtime-pipeline.bridge.ts` |
| ERC 桥接 | `src/trips/tep/services/tep-erc-bridge.service.ts` |
| 写回 | `src/trips/tep/services/tep-local-repair-apply.service.ts` |
| mock 写回认证 | `src/trips/tep/certification/is-cert-writeback.harness.ts` |

---

## 4. 规划期 IS-CERT（已通过）

| 场景 | 验证 |
|------|------|
| IS-CERT-001～003 | 规划期硬阻断 |
| IS-CERT-101～103 | 软处置 / 证据降级 |
| IS-CERT-201～203 | 弹性 / 天气 / 日照 / 租车 |
| IS-CERT-004 / 105 | SDR-003 租车合同 |

```bash
npm test -- src/trips/tep/certification/is-cert.harness.spec.ts
```

---

## 5. 运行时 IS-CERT（已通过）

| 场景 | 验证 |
|------|------|
| IS-CERT-301 | 道路 OPEN→CLOSED → Hook → DecisionProblem |
| IS-CERT-302 | HIGH load → RecoveryGraph → Local Repair 预览 |
| IS-CERT-302（写回） | REMOVE → PlanVersion + 物化（**mock Prisma**） |
| IS-CERT-303 | 天气 REPLACE fallback → PlanVersion + 物化（mock DB） |
| IS-CERT-304 | 日照 Runtime Hook → SCHEDULE_RISK |
| IS-CERT-405 | 执行 slip → 日照 Hook → REMOVE 写回 → 日照窗口恢复（mock DB） |
| IS-CERT-404 | 单道路事件 TEP 优先 → adjustment-queue 仅 1 张主卡（mock） |

```bash
npm test -- src/trips/tep/certification/is-cert-runtime.harness.spec.ts
npm test -- src/trips/tep/certification/is-cert-writeback.integration.spec.ts
DATABASE_URL="$(grep '^DATABASE_URL=' .env.staging | sed 's/^DATABASE_URL=//' | tr -d '"')" npm run test:tep-writeback-pg
npm test -- src/trips/tep   # 全量 TEP
```

---

## 6. 下一阶段：Limited Pilot（非向内扩规则）

**阶段命名：** `TEP Iceland Self-Drive — Limited Pilot`

**原则：** 停止大规模扩 SDR / 新规则；优先 **WP-TEP-16 签字**、**WP-TEP-17 写回门禁**、**真实冰岛行程试点**。

### 6.1 推进顺序（冻结）

| # | 工作包 | 目标 | 状态 |
|---|--------|------|------|
| 1 | **WP-TEP-16** Contract Sign-off | 三方签字 → `Production Candidate — Limited Pilot` | ⬜ [SIGNOFF-CHECKLIST](./TEP-PHASE0-SIGNOFF-CHECKLIST.md) |
| 2 | **WP-TEP-17** 分布式写回门禁 | [TEP-WRITE-CONCURRENCY-GATE.md](./TEP-WRITE-CONCURRENCY-GATE.md) | ✅ 2026-07-13 |
| 3 | Limited Pilot 发布 | 内部 5–10 行程 | ⬜ |
| 4 | 邀请制试点 | 20–30 行程 + 指标台账 | ⬜ |
| 5 | 小额付费测试 | 验证付费意愿 | ⬜ |
| 6 | SDR-102 / 103 | **暂缓** — 见 Playbook §5 触发条件 | 不做 |
| 7 | 新西兰最小 Pack | Playbook §8 门槛后 | 不做 |

**已完成（不再作为研发主线）：**

| WP | 状态 |
|----|------|
| WP-TEP-13 staging PG 401/402 | ✅ |
| WP-TEP-14 REPLACE | ✅ |
| WP-TEP-15 Slip→Daylight | ✅ |
| IS-CERT-403/404/405 mock | ✅ |
| BFF 文档对齐 | ✅ |

---

## 7. 工作包规格（WP-TEP-13～16）

### WP-TEP-13：真实数据库闭环认证

**目标：** Local Repair 在真实 PostgreSQL 上可安全、幂等、可回滚地执行。

| 场景 | 要求 |
|------|------|
| 正常路径 | Accept → 新 PlanVersion → 物化 → effective 提升 → executability 刷新 → cache 失效 |
| 幂等 | 同一 `optionId` 两次请求：一次副作用；第二次 `idempotentReplay`；不重复 PlanVersion |
| 并发 | 双请求同时 accept：仅一成功；另一获已处理结果 |
| 失败回滚 | PlanVersion 已创建但物化失败：不提升 effective；行程不部分修改；Problem 可重试 |
| 版本冲突 | `basePlanVersionId ≠ currentEffective` → `STALE_REPAIR_OPTION`；要求重算 preview |

### WP-TEP-14：REPLACE 写回 ✅

**首期范围：** Activity A → **预计算** Fallback B（规划期 `RecoveryGraph` 已存在）。

**禁止：** LLM 临时搜 POI 直接写回。

```typescript
interface RecoveryOption {
  action: 'REPLACE';
  targetRefs: string[];
  replacementRef?: string;   // 规划期 activity ref
  replacementPoiId: string;  // 物化 substitutePoiId（必填）
}
```

**规划期字段：** `PlannedActivity.weatherFallbackPoiId` / `weatherFallbackRef` → `RecoveryGraph.fallbackOptions`

**认证：** `IS-CERT-303` REPLACE writeback integration

### WP-TEP-15：执行偏差桥接 ✅

将 `tryTriggerFromDaylightScheduleRisk` 接入 **Planned Departure vs Actual Departure**（Execution Slip）。

**实现：** `ExecutionSlipPipelineService.runFromObservation` → `TepExecutionSlipDaylightBridgeService.tryTriggerFromExecutionSlip` → `TepRuntimePipelineBridgeService.tryTriggerFromDaylightScheduleRisk`

**工具：** `daylight-violation-minutes.util.ts`（slip 调整到达时间 → SDR-202 暮光违规分钟）

示例：晚出发 90min → 末段驾驶越过民用暮光 → `HOOK-DAYLIGHT-*` → `SCHEDULE_RISK`

### WP-TEP-16：Phase 0 契约冻结

**签字文档：** [TEP-PHASE0-CONTRACT-FREEZE.md](./TEP-PHASE0-CONTRACT-FREEZE.md) · **执行清单：** [TEP-PHASE0-SIGNOFF-CHECKLIST.md](./TEP-PHASE0-SIGNOFF-CHECKLIST.md)

签字冻结范围：

- 四核心对象 + `ExecutabilityStatus` / `RuleOutcome`
- `DecisionHook` / `RecoveryGraph` / `RecoveryOption` 契约
- 写回幂等键、`PlanVersion.metadata.tep` schema
- ERC `intervention-tep-*` 映射与 BFF 路径（[EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md](../frontend/EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md) §2.3a / §2.8 — ✅ 2026-07-12）
- IS-CERT 001–304 基线 + IS-CERT-401～405 门槛
- TEP / Canonical **去重键**（见 §8）

---

## 8. 生产加固设计约束（须冻结）

### 8.1 TEP / Canonical 去重

**去重键：**

```
tripId + eventSemanticKey + targetRef + effectivePlanVersionId
```

| 规则 | 说明 |
|------|------|
| TEP 优先 | 自驾执行问题 TEP 可完全解释时，TEP 为 primary |
| Canonical | comparison / fallback；不向用户展示重复卡片 |
| 写回权威 | 仅一个 authority 可对同一问题执行写回 |

### 8.2 `PlanVersion.metadata.tep` 版本化（目标形态）

当前实现：`schemaId: tripnara/tep_plan_version_metadata@v1`。

**WP-TEP-16 须明确：**

| 类别 | 字段示例 |
|------|----------|
| 事实快照 | `decisionHooks[]`、`recoveryGraphApplied` |
| 可重算投影 | `recoveryGraph`（写回后应 refresh） |
| 稳定 ID | `hookId`、`optionId` |
| 非长期 SSOT | `repairPreviews`（仅 BFF 读模型） |
| 版本继承 | 新 PlanVersion 如何重建 / 失效旧 Hook |

---

## 9. 生产认证门槛（IS-CERT-401～405）

| Case | 验证 | 状态 |
|------|------|------|
| **IS-CERT-401** | 同一修复两次 → 单 PlanVersion + idempotent replay | ✅ mock + **staging PG** |
| **IS-CERT-401-CONCURRENT** | 双并行 accept → 单 PlanVersion + 一次物化 | ✅ mock + **staging PG** |
| **IS-CERT-402** | 旧版本修复 → `STALE_REPAIR_OPTION` | ✅ mock + **staging PG** |
| **IS-CERT-403** | 物化失败回滚 → effective 不变 → 可重试 | ✅ mock DB |
| **IS-CERT-404** | TEP / Canonical 去重：单道路事件 → 用户只见一个主问题 | ✅ mock harness |
| **IS-CERT-405** | 执行晚点 → 日照风险 → Hook → REMOVE → 写回 → SDR-202 清除 | ✅ mock DB |

**IS-CERT-405 说明：** 冬季 Jan-15 场景（520min + 可选停靠）；90min slip 使 `driveMinutesAfterCivilDusk` 由 0→43；`TepExecutionSlipDaylightBridge` 触发 `HOOK-DAYLIGHT`；`REPAIR-SDR202-*` REMOVE 写回后日照违规归零（整体状态可为 `REQUIRES_CONFIRMATION`，因 SDR-101 负荷仍高）。

---

## 10. 对外里程碑表述（带边界）

**可以说：**

> TripNARA 在冰岛自驾场景已跑通持续决策闭环：可执行规划 → 环境/执行变化感知（含执行 slip→日照）→ 影响判断 → 用户决策 → 局部修复（REMOVE / REPLACE）→ 计划重验证。

**必须保留边界：**

- 规则为冰岛 Phase 0 子集
- 自动写回为 **REMOVE** + 预计算 **REPLACE**（无运行时 LLM POI）
- 真实 PostgreSQL E2E：**staging 已通过**（401/402/**401-CONCURRENT**）；生产库仍禁止
- 非全自动重规划；非全冰岛道路/活动覆盖

---

## 11. 产品演示脚本（已可演示）

1. 用户规划冰岛自驾 → 系统判断可执行性  
2. Planner 预埋天气 / 道路 / 日照 Hook  
3. 行中道路关闭或天气恶化  
4. 执行页出现 `intervention-tep-*` 待调整项（发生了什么 / 影响什么 / 推荐动作）  
5. 用户接受 REMOVE 修复  
6. 新 PlanVersion + 行程时间轴更新  
7. 重验证为可执行 → Problem 关闭  

**定位：** TripNARA 是**持续维护旅行可执行性的决策系统**，不是天气预警或静态规划工具。

---

## 12. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-13 | `tep:pilot-ci` + GitHub Actions nightly（`.github/workflows/tep-pilot-smoke-ci.yml`）；03 天气 Hook runtime smoke |
| 2026-07-13 | `tep:pilot-runtime-smoke` — PILOT-IS-02 道路 Hook + PILOT-IS-04 slip→日照→REMOVE（staging PG） |
| 2026-07-13 | PILOT-IS-01～04 seed + `tep:pilot-smoke(-all)`；`planningDecisionProblems[]` on GET executability |
| 2026-07-13 | WP-TEP-16 SIGNOFF-CHECKLIST + PILOT-TRIP-TEMPLATE；运营台账 W0 就绪 |
| 2026-07-12 | BFF 文档与代码路径对齐（§2.3a 投影/去重、§2.8 REPLACE 响应、WP-TEP-13 staging 注记） |
| 2026-07-12 | IS-CERT-401/402 `tripnara_staging` PG 通过；404/405 mock 完成 |
| 2026-07-12 | Phase 0 从「Planning MVP」升级为「Functional Complete → Production Hardening」；新增 WP-TEP-13～16 与 IS-CERT-401～405 |
