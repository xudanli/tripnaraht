# TEP Local Repair — 分布式写回并发门禁（WP-TEP-17）

**状态：** ✅ 已实现（2026-07-13）· **认证：** mock + staging PG IS-CERT-401/401-CONCURRENT/402 通过  
**关联：** [TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md](./TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md) §2.2

---

## 1. 问题陈述

`TepLocalRepairApplyService.applyRecoveryOption` 当前防护：

| 层 | 实现 | 多实例有效？ |
|----|------|-------------|
| 进程内 dedupe | `inflightApplies: Map<string, Promise>` | ❌ 仅单进程 |
| 幂等 replay | `planVersionStore.getExecution` → `trip.metadata.rfc001PlanVersionExecutions` | ✅ 事后；竞态窗口存在 |
| STALE 门控 | `assertTepRepairOptionFresh(basePlanVersionId)` | ✅ 版本过期拒绝 |
| 物化回滚 | `rollbackMaterialization` on failure | ✅ 单请求内 |

**竞态窗口：** 实例 A、B 同时 `getExecution` 为空 → 各创建 `plan_*_tep_*` 子版本 → 可能双 effective 提升或双物化。

IS-CERT-401 PG 在**单进程**下验证幂等；**未**覆盖多实例并发。

---

## 2. 目标

同一 `(tripId, optionId)` 在任意实例数下：

1. **至多一次**有效写回副作用（一个 repair 子 PlanVersion 成为 effective）
2. 并发第二个请求：**等待**或 **replay** 第一个结果，不重复物化
3. `basePlanVersionId` 过期 → `STALE_REPAIR_OPTION`（已有）
4. 物化失败 → 可重试；不留下脏 effective

---

## 3. 推荐三层门禁（不单独依赖 Redis）

```
┌─────────────────────────────────────────────────────────┐
│ L1 应用层：tripId+optionId 事务 advisory lock           │
├─────────────────────────────────────────────────────────┤
│ L2 数据库：幂等记录唯一约束（先于写回插入）              │
├─────────────────────────────────────────────────────────┤
│ L3 事务内：读 effective → STALE 校验 → 写版本 → 物化    │
└─────────────────────────────────────────────────────────┘
```

### L1 — PostgreSQL 事务 advisory lock

复用项目既有模式 [`trip-advisory-lock.util.ts`](../../src/decision-runtime/monitoring/assertion-promotion/trip-advisory-lock.util.ts)：

```sql
SELECT pg_advisory_xact_lock(hashtext(tripId || ':' || optionId))
```

- **事务绑定**（`xact_lock`）：commit/rollback 自动释放
- 锁粒度：`tripId + optionId`（不同 option 可并行；同 option 串行）

保留进程内 `inflightApplies` 作为 L0 同实例优化（可选）。

### L2 — 数据库唯一约束

**方案 A（推荐）：** 新表 `tep_repair_execution`

```prisma
model TepRepairExecution {
  id             String   @id @default(uuid())
  tripId         String   @map("trip_id")
  optionId       String   @map("option_id")
  idempotencyKey String   @unique @map("idempotency_key")
  planVersionId  String?  @map("plan_version_id")
  decisionId     String?  @map("decision_id")
  status         String   // PENDING | APPLIED | FAILED
  createdAt      DateTime @default(now())
  appliedAt      DateTime?

  @@unique([tripId, optionId, status]) // 仅当 status=APPLIED 时需业务层保证单 APPLIED
  @@index([tripId])
}
```

**插入流程：**

1. 事务开始 → L1 加锁
2. `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` 或先 `SELECT`
3. 若已有 `APPLIED` → 直接 replay
4. 若 `PENDING`（另一事务进行中）→ 短轮询或返回 `REPAIR_IN_PROGRESS`（409，客户端重试）
5. 成功物化后 `status = APPLIED`，写 `planVersionId`

**方案 B（过渡）：** 在 `trip.metadata` 写前用 `SELECT ... FOR UPDATE` 锁 trip 行 + 乐观 `metadataVersion` 字段；无独立唯一约束，弱于方案 A。

**决策：** Limited Pilot 前落 **方案 A**；`trip.metadata` executions 块保留作读模型兼容，以表为准。

### L3 — 事务内版本校验

在锁内顺序：

1. `getEffectivePlanVersionId(tripId)`
2. `assertTepRepairOptionFresh({ basePlanVersionId, currentEffectivePlanVersionId })`
3. `upsert` PENDING PlanVersion
4. `applyPlanOperations`
5. `setEffective`（仅当物化成功）
6. `recordExecution`（表 + metadata 双写，过渡期）
7. `executability.refresh`

`setEffective` 前再次确认 effective 未被其他 repair 改变（可选二次 STALE）。

---

## 4. 失败与重试语义

| 状态 | 客户端行为 |
|------|------------|
| `APPLIED` + 同 idempotencyKey | 200 + `idempotentReplay: true` |
| `PENDING` > N 秒 | 409 `REPAIR_IN_PROGRESS`；客户端退避重试 |
| 物化失败 | `FAILED` 记录；effective 不变；可重新 accept |
| `STALE_REPAIR_OPTION` | 刷新 adjustment-queue 后重试 |

---

## 5. 认证要求

| Case | 验证 |
|------|------|
| IS-CERT-401-CONCURRENT | 两实例/两并行请求 → 单 PlanVersion + 一次物化 |
| IS-CERT-401 | 回归：串行幂等 replay 不变 |
| IS-CERT-402 | STALE 在锁内仍生效 |

**运行：** 扩展 `is-cert-writeback-pg.harness.ts` 或新 `is-cert-401-concurrent-pg.e2e.spec.ts`。

---

## 6. 实现落点（已完成）

| 文件 | 变更 |
|------|------|
| `prisma/schema.prisma` + `20260713100000_tep_repair_execution` | `TepRepairExecution` 模型 |
| `src/trips/tep/services/tep-repair-execution.store.ts` | claim / complete / replay |
| `src/trips/tep/utils/tep-repair-advisory-lock.util.ts` | `withTepRepairAdvisoryLock(tripId, optionId, fn)` |
| `src/trips/tep/services/tep-local-repair-apply.service.ts` | L1–L3 包裹；L0 inflight 保留 |

---

## 7. 非目标（本 WP）

- Redis 分布式锁作为主方案
- SDR-102 / 103
- 全自动重规划

---

## 8. 完成定义

- [x] Prisma 迁移 + staging 验证（`20260713100000_tep_repair_execution`）
- [x] `tep-local-repair-apply` 接入三层门禁（L0 inflight + L1 advisory lock + L2 `tep_repair_executions`）
- [x] IS-CERT-401-CONCURRENT PG 通过（staging 2026-07-13）
- [x] Playbook §2.2 勾选完成
- [ ] STATUS 发布阶梯更新为可试点（**待 WP-TEP-16 三方签字** — [SIGNOFF-CHECKLIST](./TEP-PHASE0-SIGNOFF-CHECKLIST.md)）
