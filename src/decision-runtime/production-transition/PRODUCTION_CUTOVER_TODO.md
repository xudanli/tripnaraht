# Canonical Runtime 生产切换 — 待办报告

> **运行时产物目录（gitignored）：** `artifacts/production-cutover/`  
> **操作手册：** [PRODUCTION_CUTOVER.md](./PRODUCTION_CUTOVER.md)  
> **维护窗口：** `scripts/decision-runtime/CUTOVER_MAINTENANCE_WINDOW.md`

**最后更新：** 2026-07-02

---

## 一、当前状态摘要

| 维度 | Devbox 演练 | 生产 |
|------|-------------|------|
| 工程代码 | ✅ 完成 | 待部署 |
| 历史 reconcile | ✅ 17 条 | 生产库独立核对 |
| DB Probe 全 0 | ✅ 演练 | 维护窗口内重跑 |
| Clearance `ready=true` | ✅ 演练 | 须独立产物 |
| 队列证据 | ⚠️ devbox `not-applicable` | 须 `queue-query:` |
| DB 快照 | ⚠️ devbox rehearsal id | 须真实 `snapshotId` |
| verify / smoke / post-gate | ✅ 演练 | 切换后重跑 |

**Devbox 演练结论：** GO（演练）。**生产正式 GO：** 待第四节 checklist 全部完成。

---

## 二、工程侧（已完成）

- [x] 两阶段门禁（pre-cutover / post-restart）
- [x] Inflight classify + reconcile（保留 `recordStatus`，`cutoverReconciliation.executable=false`）
- [x] DB Probe v2 + SQL 包（`scripts/decision-runtime/sql/cutover-inflight/`）
- [x] Clearance + Overlay  auditable 证据校验
- [x] Authorization / Executor / Decision Center 运行时硬阻断
- [x] Manifest / Preflight / Verify / Smoke / Probation 脚本
- [x] `OPTIMIZATION_STRATEGY_MODE=LEGACY` → `legacy-frozen` provider（verify `optimizationAuthority` 检查）

**保护期内禁止：** Lex Authority、全量 Constraint Default On、自动 Replanning Execute、Objective/Constraint 语义调整、Legacy 删除、DB 结构迁移、新编排入口。

---

## 三、切换目标姿态

| 配置项 | 目标值 |
|--------|--------|
| `DECISION_RUNTIME_MODE` | `CANONICAL` |
| `CURRENT_AUTHORITY` | `CANONICAL` |
| `CANONICAL_ROLLOUT` | `ON` |
| `OPTIMIZATION_STRATEGY_MODE` | `LEGACY_FROZEN`（capabilities 显示 `LEGACY`，authority=`legacy-frozen`） |
| `LEX_ROLE` | `SHADOW_ONLY` |
| `CONSTRAINT_GATEWAY_MODE` | `ON_FOR_SELECTED` |
| `REPLANNING_TRIGGER_POLICY_ENABLED` | `false` |
| `EFFECTIVE_PLAN_WRITE_GUARD` | `true` |

含义：Canonical 接管治理与执行链；legacy-frozen 继续正式选方案；Lex 陪跑；Constraint 仅已选范围；Monitoring 不自动改行程；Legacy 保留紧急回退。

---

## 四、生产执行 Checklist

### A. 部署前

- [ ] 合并并部署含 Cutover 代码的 commit / 镜像
- [ ] 确认生产 migration 已全部 apply
- [ ] 记录 `gitCommit`、`imageDigest` 供 Manifest 使用

### B. 维护窗口 + Inflight

- [ ] 暂停：authorize / execute / rollback / Effective Plan commit / materialize / 写库 benchmark·smoke
- [ ] 等待 **≥ 1 个最长任务处理周期**

```bash
export DATABASE_URL="<生产库>"
export CUTOVER_OPERATOR="<operator>"

npm run production-cutover:inflight-db-probe
```

**必须全 0：**

`activeDecisionRuns`, `pendingAuthorizations`, `orphanAuthorizations`, `activeExecutions`, `activeRollbacks`, `unresolvedPartialFailures`, `activeWriteLeases`, `effectivePlanWritesLast5Minutes`, `planVersionsCreatedLast5Minutes`, `executeRequestsLast5Minutes`

- [ ] 队列控制台确认 `pendingQueueWriteJobs = 0`（claimed-unacked / retry / delayed / rollback / materialize / DLQ）
- [ ] 复制 scaffold → `artifacts/production-cutover/inflight-overlay.json`，补齐 **真实** 队列证据：

```json
"pendingQueueWriteJobs": {
  "value": 0,
  "source": "queue-admin-console",
  "checkedAt": "<ISO8601>",
  "checkedBy": "<operator>",
  "evidence": "queue-query:effective-plan-write-jobs-claimed-unacked"
}
```

```bash
CUTOVER_OPERATOR=<operator> npm run production-cutover:inflight-clearance
```

**硬条件：** `ready=true` · `missingOverlayEvidence=[]` · `blockers=[]`

### C. 快照 + Pre-cutover Gate

- [ ] RDS 快照 `status=available`，恢复流程已确认
- [ ] **禁止**使用 devbox rehearsal snapshot id

```bash
export CUTOVER_DB_SNAPSHOT_CONFIRMED=1
export CUTOVER_INFLIGHT_CLEAR_CONFIRMED=1
export CUTOVER_DB_SNAPSHOT_ID="<production-snapshot-id>"
export CUTOVER_DB_SNAPSHOT_STATUS=available

npm run production-cutover:preflight
```

预期：`preCutoverReady=true` · `runtimePosture=EXPECTED_LEGACY_BEFORE_CUTOVER` · `blockers=[]`

### D. Manifest + 切换

```bash
CUTOVER_OPERATOR=<operator> \
CUTOVER_DB_SNAPSHOT_ID=<production-snapshot-id> \
CUTOVER_DATABASE_IDENTIFIER=<prod-db-id> \
npm run production-cutover:manifest
```

```bash
source config/decision-runtime/production-cutover.env
# restart production backend
```

### E. 重启后三门禁

```bash
export DECISION_RUNTIME_BASE_URL=https://<prod-api>/api

npm run production-cutover:verify-runtime
npm run production-cutover:smoke
npm run production-cutover:preflight -- --stage post-restart
```

预期：`cutoverComplete=true` · `probationStarted=true`

**Smoke PASS 后唯一正确动作：**

1. 解除维护窗口
2. 保护期锚点 = verify PASS + smoke PASS 时间
3. `npm run production-probation:status` → Day 1

### F. 切换当天 + 7 天保护期

| 指标 | 目标 |
|------|------|
| Trigger bypass | 0 |
| BLOCK winner | 0 |
| Unauthorized write | 0 |
| Shadow write | 0 |
| Duplicate execute | 0 |
| Critical rollback failure | 0 |

每天：`npm run production-probation:status`

---

## 五、生产 GO 四项硬条件

| # | 条件 |
|---|------|
| 1 | `inflight-db-probe` 全部为 0 |
| 2 | `pendingQueueWriteJobs = 0`（真实 queue-query 证据） |
| 3 | `inflight-clearance ready=true` |
| 4 | DB 快照 `available` |

任一不满足 → **NO-GO**，不得切配置。不可用 overlay 掩盖非零 workload。

---

## 六、npm 脚本速查

| 脚本 | 用途 |
|------|------|
| `production-cutover:inflight-classify` | 历史记录分类 |
| `production-cutover:inflight-reconcile` | Reconcile 陈旧授权/测试 proposal |
| `production-cutover:inflight-db-probe` | DB 静默探测 + overlay scaffold |
| `production-cutover:inflight-clearance` | Inflight 清空门禁 |
| `production-cutover:preflight` | Pre / post-restart 门禁 |
| `production-cutover:manifest` | 切换前基线 manifest |
| `production-cutover:verify-runtime` | 重启后姿态验证 |
| `production-cutover:smoke` | 切换后 smoke |
| `production-cutover:dev-3000` | Devbox 演练（本地 :3000） |
| `production-probation:status` | 7 天保护期状态 |
| `rollback-tier-a:legacy` | 紧急回退 |

---

## 七、紧急回退

```bash
source config/decision-runtime/production-rollback-legacy.env
# restart backend
# 或
npm run rollback-tier-a:legacy
```

---

## 八、产物清单（运行时，gitignored）

```
artifacts/production-cutover/
├── inflight-db-probe.json
├── inflight-overlay.json
├── inflight-clearance.json
├── cutover-manifest.json
├── preflight-pre-cutover.json
├── preflight-post-restart.json
├── runtime-verify.json
├── smoke.json
├── cutover-baseline.json
└── probation.json
```

Reconcile 审计：`authorization-reconciliation.json` · `stale-test-proposal-reconciliation.json` · `inflight-record-classification.json`
