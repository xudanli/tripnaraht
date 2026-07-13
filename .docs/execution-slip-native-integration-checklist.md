# Execution Slip — Native 联调签收清单

**状态：** Slice 3 Native E2E **PASS**（证据 [`execution-slip-native-e2e-2026-07-12.json`](./execution-slip-native-e2e-2026-07-12.json)）；待三方 Operational Sign-off  
**详细契约：** [`src/trips/guardian-decision-core/EXECUTION_SLIP_FRONTEND_HANDOFF.md`](../src/trips/guardian-decision-core/EXECUTION_SLIP_FRONTEND_HANDOFF.md) §9

---

## 0. 联调前（必做）

### 0.1 后端环境

- [ ] **iOS Base URL 指向 3002**（`tripnara-api`），**勿用 3000**（3000 为 24h 观测 `collector-ingest`，与行程 API 无关）
- [ ] Devbox 示例：`http://<devbox-ip>:3002/api`（当前 devbox 内网 IP 以 `hostname -I` 为准）
- [ ] 后端 3002 已开 `CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE=1`
- [ ] App 指向该环境（staging / dev canary）

### 0.2 后端 reset（每次 Drill 前必跑）

```bash
EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-pre-signoff-setup.ts --reset
```

可选：后端自检 preflight

```bash
BASE_URL=http://localhost:3002 EXEC_SLIP_DRILL_ALLOW_PROD=1 bash scripts/execution-slip-preflight.sh
```

### 0.3 Canary 常量

| 字段 | 值 |
|------|-----|
| 账号 | `exec-slip-canary@tripnara.dev` |
| tripId | `c0c77777-7777-4777-8777-777777777777` |
| Activity A（上报点） | `c0c77777-7777-4777-8777-777777777631` |
| plannedDepartAt | `2026-07-12T13:00:00.000Z` |

### 0.4 Re-run App

- [ ] 杀掉 App 进程后冷启动（或 Cmd+R 全量重启）
- [ ] 重新登录 `exec-slip-canary@tripnara.dev`
- [ ] 进入上述 Canary 行程行中页

---

## 1. 场景 A — 晚 45min → 决策卡 → 勾选 → 确认

**目的：** 验证完整链路 `RECORDED → decision-queue → accept-recommended → PlanVersion 更新`

| 步骤 | 操作 | 断言 |
|------|------|------|
| A1 | 确认当前活动为 Activity A | `context-snapshot.execution.currentActivityID == ...777631` |
| A2 | 点「我晚了」→ 选「晚了 45 分钟」→ 提交 | POST `departure-slip` |
| A3 | 检查请求体 | `activityId` = Activity A；`observedAt` = `plannedDepartAt + 45min`（**非** `Date()`） |
| A4 | 检查响应 | `status == "RECORDED"`，有 `problemId`、`observationId` |
| A5 | UI | Toast「后续行程可能赶不上，请查看调整建议」→ 打开决策卡 |
| A6 | 决策卡内容 | `severity` = BLOCK；3 个 `repairOptions`（shorten / remove / substitute）；`requiredAcknowledgements` ≥ 3 |
| A6b | 方案可读性 | 有 `scheduleContext`（预计抵达 / 最后入场 / 延误分钟）；`cand_remove_next.title` 含下一站 POI 名；`cand_substitute_next` 含 `changePreview.add.title`（备选 POI 名） |
| A7 | 勾选全部确认项 → 选方案（如 substitute）→ 确认 | POST canonical `accept-recommended`（**非** mobile `decisions/accept`） |
| A8 | 确认响应 | `success == true`；`revalidation.status == "PASS"` |
| A9 | 刷新 | `planVersion` 变更；决策卡消失；queue 无该 `problemId` |

**截图：** 弹窗 → 决策卡（三方案 + 勾选）→ 确认成功 → 卡片消失

记下证据字段：`observationId`、`problemId`、`runId`、`oldPlanVersionId`、`newPlanVersionId`、`selectedActionId`

---

## 2. 场景 B — 晚 10min → 仅 Toast

**reset 后**再跑（§0.2）。

| 步骤 | 操作 | 断言 |
|------|------|------|
| B1 | 点「我晚了」→ 选等效 +10min 选项（无 +10 则用「仍在当前地点」且 Canary 观测时间对应 +10min 语义） | — |
| B2 | 检查请求体 | `observedAt` ≈ `2026-07-12T13:10:00Z`（plannedDepart + 10min） |
| B3 | 检查响应 | `status == "NO_ACTION"`，**无** `problemId` |
| B4 | UI | Toast「按当前延误，后续行程仍可执行，无需调整」；关弹窗；**不**跳转决策卡 |
| B5 | 刷新 | `planVersion` **不变**；adjustment-queue 无新增 slip 项 |

---

## 3. 填证据 JSON

复制模板并填写（**已完成**）：

```
.docs/execution-slip-native-e2e-TEMPLATE.json
→ .docs/execution-slip-native-e2e-2026-07-12.json  ✅
→ internal-docs/operations/evidence/execution-slip-native-e2e-2026-07-12.json  ✅
```

**`checks[]` 六项必须全部 `"pass": true`：**

| id | 场景 |
|----|------|
| `E2E-FULL-CHAIN` | 场景 A 全链路 |
| `E2E-NO-ACTION-TOAST` | 场景 B 仅 Toast |
| `E2E-OBSERVED-AT-CORRECT` | `observedAt` = plannedDepart + N |
| `E2E-THREE-REPAIR-OPTIONS` | 决策卡三方案 |
| `E2E-PLAN-VERSION-UPDATED` | 确认后 PlanVersion 变更 |
| `E2E-ACTIVITY-ID-CURRENT` | `activityId` = 当前活动 A |

另填：`legacyWriteInvocations: 0`、`commitSha`、`testedAt`、`tester`、`screenshots[]`

归档副本（可选）：`internal-docs/operations/evidence/execution-slip-native-e2e-2026-07-xx.json`

---

## 4. 签收判定

| 条件 | 状态 |
|------|------|
| 场景 A | **PASS** |
| 场景 B | **PASS** |
| 场景 C（关弹窗不提交） | **PASS** |
| 场景 D（Idempotency 去重） | **PASS** |
| 证据 JSON | **PASS** — [`.docs/execution-slip-native-e2e-2026-07-12.json`](./execution-slip-native-e2e-2026-07-12.json)（归档副本 → `internal-docs/operations/evidence/`） |
| 截图 | **待补传** ≥ 4 张至 `internal-docs/operations/evidence/execution-slip-native-e2e-screenshots/` |

**End-to-End Product Integration Closure = PASS。** 三方 Operational Sign-off 完成前勿宣称 **Slice 3 = CLOSED**。详见 `internal-docs/operations/EXECUTION-SLIP-SLICE-3-NATIVE-E2E-AND-SIGNOFF-2026-07-11.md`。

---

## 5. 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| **「决策方案未就绪」** | `POST departure-slip` 返回 `RECORDED` 后，立即 `GET decision-queue/:problemId` 命中 **10s 读模型缓存**（行中页先拉过 queue 时必现） | **后端已修**：`departure-slip` 成功后 `invalidateCache`。重启 Nest 后再测。iOS 兜底：404 时改拉 `GET decision-queue` 取最新 `problem_exec_slip_*` |
| 永远 `NO_ACTION` | `observedAt` 误用 `Date()`；或传了下一站 `activityId` | 见 §3.2 |
| 确认 400 | 走了 mobile `decisions/accept` 且缺 `acknowledgement` | 改 canonical `accept-recommended` |
| reset 后仍脏数据 | reset 脚本未 exit 0 | 重跑 §0.2 |
