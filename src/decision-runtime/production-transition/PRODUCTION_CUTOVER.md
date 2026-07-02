# Production Cutover — 正式切换操作手册

> **切换的是：** Legacy Runtime → Canonical Decision Runtime（治理链）  
> **不切换：** legacy-frozen → Lex Authority

## 两阶段门禁（避免循环依赖）

切换前系统**必然仍是 Legacy** — preflight 不要求 `runtime-posture-live = PASS`。

### A. Pre-cutover Gate（应用配置**前**）

```bash
npm run production-cutover:inflight-clearance
# 确认 ready=true 后：
CUTOVER_INFLIGHT_CLEAR_CONFIRMED=1

CUTOVER_DB_SNAPSHOT_CONFIRMED=1 \
CUTOVER_DB_SNAPSHOT_ID=<snapshotId> \
CUTOVER_DB_SNAPSHOT_STATUS=available \
npm run production-cutover:manifest

CUTOVER_DB_SNAPSHOT_CONFIRMED=1 \
CUTOVER_INFLIGHT_CLEAR_CONFIRMED=1 \
npm run production-cutover:preflight
```

预期输出：

- `preCutoverReady = true`
- `runtimePosture = EXPECTED_LEGACY_BEFORE_CUTOVER`
- `cutoverComplete = false`

**不计入失败：** 当前运行时尚未是 Canonical。

### B. Post-restart Gate（重启**后**）

```bash
npm run production-cutover:verify-runtime
npm run production-cutover:smoke
npm run production-cutover:preflight -- --stage post-restart
```

预期输出：

- `cutoverComplete = true`
- `probationStarted = true`（锚点 = verify-runtime PASS + smoke PASS）

## 正式操作顺序

> **生产待办清单：** [PRODUCTION_CUTOVER_TODO.md](./PRODUCTION_CUTOVER_TODO.md)

| Step | 动作 |
|------|------|
| 0 | DB 快照 `status=available`，记入 manifest |
| 1 | 短维护窗口 — 暂停新 Effective Plan 写入 |
| 2 | `npm run production-cutover:inflight-clearance` → `inflight-clearance.json` |
| 3 | Pre-cutover preflight 全绿 |
| 4 | `npm run production-cutover:manifest` |
| 5 | `source production-cutover.env` + restart |
| 6 | `npm run production-cutover:verify-runtime` |
| 7 | `npm run production-cutover:smoke` → 通过后解除维护窗口 |
| 8 | `npm run production-probation:status`（7 天） |

## Inflight 清空（维护窗口后）

详见 `scripts/decision-runtime/CUTOVER_MAINTENANCE_WINDOW.md`

### 0. 分类 + Reconcile（维护窗口之前）

```bash
CUTOVER_OPERATOR=<you> npm run production-cutover:inflight-classify

npm run production-cutover:inflight-reconcile -- --dry-run --scope authorizations
CUTOVER_OPERATOR=<you> npm run production-cutover:inflight-reconcile -- --apply --scope authorizations

npm run production-cutover:inflight-reconcile -- --dry-run --scope stale-test-proposals
CUTOVER_OPERATOR=<you> npm run production-cutover:inflight-reconcile -- --apply --scope stale-test-proposals
```

语义（**不使用 REJECTED_BY_USER**）— `recordStatus` 保留，`cutoverReconciliation.executable=false`：

| 记录 | status | reason |
|------|--------|--------|
| 陈旧 AUTHORIZED | EXPIRED | STALE_AUTHORIZATION_BEFORE_RUNTIME_CUTOVER |
| Orphan | INVALID_ORPHANED | ORPHANED_AUTHORIZATION_MISSING_DECISION_RUN |
| 测试 PROPOSED | CANCELLED_TEST_DATA | TEST_DATA_CLEANUP_BEFORE_RUNTIME_CUTOVER |

### 1. 短维护窗口

暂停：新 execute、authorize→execute、rollback、materialize、写数据 benchmark/smoke。  
等待 ≥ 1 个最长任务处理周期。

### 2. 查询真实状态（四组）

| 组 | 来源 | 字段 |
|----|------|------|
| A | PostgreSQL | decision runs / auth / executor / rollback / leases |
| B | 队列控制台 | `pendingQueueWriteJobs` |
| C | 5 分钟窗口 | effective writes / plan versions / execute requests |
| D | PAUSED 人工 | `pausedDecisionRunsAcknowledged` |

```bash
CUTOVER_OPERATOR=<you> npm run production-cutover:inflight-db-probe
# → inflight-db-probe.json + inflight-overlay.scaffold.json
# 补全 Group B 后复制为 inflight-overlay.json
CUTOVER_OPERATOR=<you> npm run production-cutover:inflight-clearance
```

SQL 查询包：`scripts/decision-runtime/sql/cutover-inflight/*.sql`

**只有 `ready: true`** 才允许 `CUTOVER_INFLIGHT_CLEAR_CONFIRMED=1`。

Overlay 证据最低要求（不接受 `source: "manual"`）：

```json
{
  "value": 0,
  "source": "postgresql",
  "checkedAt": "2026-07-02T12:00:00Z",
  "checkedBy": "operator-name",
  "evidence": "sql:active-decision-runs-v1"
}
```

**不可 overlay 掩盖：** `unresolvedPartialFailures` / `activeRollbacks` / `activeExecutions` / `activeWriteLeases` / `pendingQueueWriteJobs` 必须先真实归零。

原则：**不是证明 DB 没有 RUNNING，而是证明此刻没有任何仍可能修改 Effective Plan 的工作。**

## Go / No-Go

| 门禁 | Go |
|------|-----|
| DB Snapshot | available |
| Inflight | 全部为 0，`ready=true` |
| Preflight pre-cutover | `preCutoverReady=true` |
| Runtime posture | 重启后 Canonical（verify-runtime） |
| Smoke | 全部 PASS |
| Legacy fallback | 可立即启用 |

任一不满足 → **NO-GO**

## 硬回退

```bash
npm run rollback-tier-a:legacy
# restart
```

## 7 天保护期

保护期锚点 = **verify-runtime PASS + smoke PASS**，不是重启时间。

冻结：Objective / Lex 层级 / Constraint 严重度 / Auth 规则 / Snapshot 语义 / Effective Plan 模型。

不开：Lex Authority、Constraint 全量 DEFAULT_ON、Monitoring 自动执行、删 Legacy。

## Cutover 当天不做

不改 Objective / Constraint 严重度 / Lex Authority / 全量 Constraint / 自动重规划 / 删 Legacy / DB 结构变更 / 正式 Calibration。
