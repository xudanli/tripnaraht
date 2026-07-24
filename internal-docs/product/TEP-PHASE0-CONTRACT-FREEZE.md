# WP-TEP-16 — Phase 0 契约冻结（签字版）

**状态：** 待三方签字 → 签后项目状态升为 **Production Candidate — Limited Pilot** · **版本：** 1.0.4 · **2026-07-13**  
**签字 Checklist：** [TEP-PHASE0-SIGNOFF-CHECKLIST.md](./TEP-PHASE0-SIGNOFF-CHECKLIST.md)  
**父文档：** [TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md](./TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md)  
**状态 SSOT：** [TEP-PHASE0-STATUS.md](./TEP-PHASE0-STATUS.md)  
**试点手册：** [TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md](./TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md)

---

## 1. 签字范围

本文件冻结冰岛自驾 TEP Phase 0 **对外语义**与**写回边界**。

**签字确认的不是「代码没有 Bug」**，而是下列范围与已知缺口已被各方知晓并接受。  
签字后变更须走显式版本 bump（`@v2` schema 或新 WP）。

**签后发布状态：** `Production Candidate — Limited Pilot`（**不是** Production Ready）。

| # | 冻结项 | 规范位置 |
|---|--------|----------|
| 1 | `ExecutabilityStatus` / `RuleOutcome` 唯一对外状态语言 | §2 |
| 2 | 四核心对象 + Hook / RecoveryGraph / RecoveryOption | §3 |
| 3 | `PlanVersion.metadata.tep` schema `@v1` | §4 |
| 4 | 写回 API、ERC 映射、幂等键、STALE 门控 | §5 |
| 5 | TEP / Canonical 去重键 | §6 |
| 6 | IS-CERT 基线与 Production 门槛 | §7 |

---

## 2. 对外状态语言（冻结）

**唯一**对用户/BFF 暴露的可执行性状态：

| `ExecutabilityStatus` | 含义 |
|----------------------|------|
| `EXECUTABLE` | 可执行 |
| `EXECUTABLE_WITH_CAUTION` | 可执行但需留意 |
| `REQUIRES_REPAIR` | 需修复后方可执行 |
| `NOT_EXECUTABLE` | 不可执行 |

**唯一**规则裁决：

| `RuleOutcome` | 含义 |
|---------------|------|
| `PASS` | 通过 |
| `NEED_CONFIRM` | 需用户确认 |
| `REJECT` | 拒绝 |

禁止在 BFF / Mobile 引入平行状态枚举（如 `OK` / `WARNING` / `BLOCKED`）替代上述类型。

---

## 3. 核心对象契约（冻结）

### 3.1 四核心对象

```
DailyDrivePlan → ExecutabilityAssessment → DecisionHook → RecoveryGraph
```

| 对象 | schemaId |
|------|----------|
| RecoveryGraph | `tripnara/recovery_graph@v1` |
| DecisionHook | （内嵌于 assessment / metadata） |
| TEP Plan metadata | `tripnara/tep_plan_version_metadata@v1` |

### 3.2 RecoveryOption（写回最小动作）

Phase 0 **实现**：

```typescript
{ action: 'REMOVE'; optionId: string; targetRefs: string[] }
{ action: 'REPLACE'; optionId: string; targetRefs: string[]; replacementPoiId: string; replacementRef?: string }
```

**未实现（Phase 0 禁止写回）：**

```typescript
{ action: 'REPLACE'; ... }  // ✅ WP-TEP-14 — requires replacementPoiId
```

### 3.3 DecisionHook 触发类型（Runtime）

冻结枚举：`WEATHER_THRESHOLD` · `ROAD_STATUS_CHANGE` · `EXECUTION_SLIP` · `RESERVATION_DEADLINE` · `SUPPLY_THRESHOLD`

冰岛 Phase 0 已接线：`ROAD_STATUS_CHANGE` · `WEATHER_THRESHOLD` · `EXECUTION_SLIP`（日照 via `TepExecutionSlipDaylightBridgeService`）· 规划期 SDR 门禁

---

## 4. `PlanVersion.metadata.tep` @v1（冻结）

```typescript
interface TepPlanVersionMetadata {
  schemaId: 'tripnara/tep_plan_version_metadata@v1';
  decisionHooks: DecisionHook[];
  recoveryGraph?: RecoveryGraph;
  recoveryGraphApplied?: string;  // 上次成功写回的 optionId
  syncedAt: string;             // ISO-8601
}
```

| 字段类别 | 规则 |
|----------|------|
| 事实快照 | `decisionHooks[]`、`recoveryGraphApplied` 随 PlanVersion 继承 |
| 可重算投影 | `recoveryGraph` 写回后应 refresh（当前：子版本拷贝父图 + patch） |
| 稳定 ID | `hookId`、`optionId` 跨版本语义稳定 |

---

## 5. 写回 API 与门控（冻结）

### 5.1 路径

| 场景 | HTTP |
|------|------|
| Mobile accept | `POST /api/mobile/trips/{tripId}/execution/tep-repairs/{interventionId}/accept` |
| Canonical | `POST /api/trips/{tripId}/executability/repairs/{optionId}/apply` |

`interventionId` = `intervention-tep-{RecoveryOption.optionId}`

### 5.2 请求体（Mobile）

```json
{
  "optionId": "REPAIR-SDR101-D1-activity_stop_1",
  "basePlanVersionId": "plan_cert_302_v1",
  "comment": "optional"
}
```

`basePlanVersionId` 取自 `items[].recommendation.basePlanVersionId`（ERC 投影）。

### 5.3 幂等键（冻结）

```
trip:{tripId}:tep-repair:{optionId}
```

同一键二次请求：**一次副作用**；第二次 `idempotentReplay: true`；不重复创建 effective PlanVersion。

### 5.4 并发（进程内 + 分布式）

| 层 | 机制 |
|----|------|
| L0 | 同实例 `inflightApplies` 合并 |
| L1 | PostgreSQL `pg_advisory_xact_lock(tripId:optionId)` |
| L2 | `tep_repair_executions` 唯一 `idempotency_key` |
| 冲突 | 进行中 → **409** `REPAIR_IN_PROGRESS`（客户端退避重试） |

认证：`IS-CERT-401-CONCURRENT` mock + staging PG（2026-07-13）。规格：[TEP-WRITE-CONCURRENCY-GATE.md](./TEP-WRITE-CONCURRENCY-GATE.md)

### 5.5 STALE_REPAIR_OPTION（冻结）

当 `basePlanVersionId` 已提供且 ≠ 当前 effective PlanVersion：

```json
{
  "code": "STALE_REPAIR_OPTION",
  "message": "Recovery option preview is based on a superseded plan version; refresh adjustment queue",
  "optionId": "...",
  "basePlanVersionId": "...",
  "currentPlanVersionId": "..."
}
```

HTTP **409**（Mobile / Canonical 一致）。

### 5.6 物化失败回滚（冻结）

顺序：`upsert PENDING` → `materialize` → `setEffective` → `recordExecution`

物化失败：**不** `setEffective`；调用 `rollbackMaterialization`；pending 标记 `FAILED`；行程可重试。

---

## 6. TEP / Canonical 去重键（冻结）

```
tripId + eventSemanticKey + targetRef + effectivePlanVersionId
```

| 规则 | 说明 |
|------|------|
| TEP 优先 | 自驾执行问题 TEP 可完全解释时，TEP 为 primary |
| Canonical | comparison / fallback；不向用户展示重复卡片 |
| 写回权威 | 仅一个 authority 可对同一问题执行写回 |

**实现：** `tep-canonical-dedup.util.ts` + `TepErcBridgeService.enrichAdjustmentQueue` + `persistTepHookProblem` supersede；认证 `IS-CERT-404`。

---

## 7. 认证门槛（冻结）

### 7.1 基线（必须通过）

| 套件 | 命令 |
|------|------|
| 规划期 IS-CERT 001–203 | `npm test -- src/trips/tep/certification/is-cert.harness.spec.ts` |
| 运行时 301–304 | `npm test -- src/trips/tep/certification/is-cert-runtime.harness.spec.ts` |
| mock 写回 302 + 门控 401–403 + **401-CONCURRENT** | `npm test -- src/trips/tep/certification/is-cert-writeback.integration.spec.ts` |
| TEP/Canonical 去重 404 | `npm test -- src/trips/tep/certification/is-cert-404.integration.spec.ts` |

### 7.2 Production 门槛（签字前须通过）

| Case | 验证 | 运行方式 |
|------|------|----------|
| IS-CERT-401 | 真实 DB 幂等写回 | ✅ staging PG（2026-07-12） |
| IS-CERT-401-CONCURRENT | 双并行 accept → 单 PlanVersion | ✅ mock + staging PG（2026-07-13） |
| IS-CERT-402 | `STALE_REPAIR_OPTION` | ✅ staging PG（2026-07-12） |
| IS-CERT-403 | 物化失败回滚 | mock harness（PG 可选后续） |
| IS-CERT-404 | TEP / Canonical 去重 | ✅ `runIsCert404Scenario` + `tep-canonical-dedup.util` |
| IS-CERT-405 | slip→日照→写回 | ✅ mock harness（`runIsCert405Scenario`） |

```bash
# 真实 PostgreSQL（拒绝 tripnara_prod）
DATABASE_URL="$(grep '^DATABASE_URL=' .env.staging | sed 's/^DATABASE_URL=//' | tr -d '"')" npm run test:tep-writeback-pg
```

### 7.3 Production Candidate 签字条件

- [ ] 本文件 §1–§7 评审通过（使用 [SIGNOFF-CHECKLIST](./TEP-PHASE0-SIGNOFF-CHECKLIST.md)）
- [x] IS-CERT-401/402 真实 PG 通过（`tripnara_staging` · 2026-07-12）
- [x] IS-CERT-401-CONCURRENT mock + staging PG（2026-07-13）
- [x] IS-CERT-403 mock 通过
- [x] IS-CERT-404 TEP/Canonical 去重 mock 通过
- [x] IS-CERT-405 slip→日照→写回 mock 通过
- [x] BFF 文档与代码路径一致（[`EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md`](../frontend/EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md) · 2026-07-12）
- [x] WP-TEP-17 分布式写回门禁（[`TEP-WRITE-CONCURRENCY-GATE.md`](./TEP-WRITE-CONCURRENCY-GATE.md) · 2026-07-13）

### 7.4 已知缺口（签字即确认接受）

| 缺口 | 说明 | 试点前须完成 |
|------|------|--------------|
| ~~多实例写回竞态~~ | WP-TEP-17 已落地 | ✅ 已完成 |
| SDR-102 / 103 | 连续驾驶、多日疲劳 | ❌ 暂缓 |
| 全冰岛道路/活动覆盖 | Phase 0 子集 | ❌ 不在 Phase 0 |
| REPLACE 运行时 POI | 仅预计算 `replacementPoiId` | ❌ 不在 Phase 0 |
| 全自动重规划 | 用户确认后局部修复 only | ❌ 不在 Phase 0 |
| IS-CERT-403 PG E2E | mock 已通过 | ❌ 可选后续 |

---

## 8. 签字记录

签字即同意 §1–§7 冻结范围及 §7.4 已知缺口；并授权进入 **Limited Pilot**（WP-TEP-17 已完成，可接真实用户写回）。

| 角色 | 确认项摘要 | 姓名 | 日期 | 签名 |
|------|------------|------|------|------|
| **产品负责人** | Phase 0 范围、收费 SKU、试点指标、对外边界 | | | |
| **后端/架构负责人** | 契约、写回/幂等/STALE、TEP/Canonical authority、WP-TEP-17 | | | |
| **Mobile/Web 消费方** | BFF 结构、`intervention-tep-*` 交互、Executability 展示 | | | |

**签后动作：** 更新 [TEP-PHASE0-STATUS.md](./TEP-PHASE0-STATUS.md) §1.3 为 `Production Candidate — Limited Pilot`。

---

## 9. 变更日志

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-07-13 | 1.0.4 | WP-TEP-17 ✅；401-CONCURRENT；§5.4 分布式并发；SIGNOFF-CHECKLIST |
| 2026-07-12 | 1.0.3 | 签字语义澄清；§7.4 已知缺口；签后 Limited Pilot；WP-TEP-17 |
| 2026-07-12 | 1.0.2 | BFF 文档与代码路径对齐 |
| 2026-07-12 | 1.0.1 | IS-CERT-401/402 staging PG 通过；404/405 mock 完成 |
| 2026-07-12 | 1.0.0 | 初版冻结草案 — Functional Complete → Production Hardening |
