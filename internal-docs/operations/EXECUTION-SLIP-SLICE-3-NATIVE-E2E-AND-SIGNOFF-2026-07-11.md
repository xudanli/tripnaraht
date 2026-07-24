# Slice 3 — Native E2E 与三方 Sign-off 执行令

**日期：** 2026-07-11  
**状态：** **唯一主线** — 完成 Native E2E + 三方 Operational Sign-off  
**Slice 4：** **FROZEN** — 不得启动 Runtime / 场景 / Primary SSO

> 本文可直接转发项目组。Slice 3 **未 CLOSED 前**，禁止任何 Slice 4 实现工作。

---

## 当前正式状态（SSOT）

| 状态行 | 值 |
|--------|-----|
| Slice 3 Canonical Runtime Engineering Closure | **PASS** |
| Slice 3 Backend Integration Closure | **PASS** |
| Slice 3 End-to-End Product Integration Closure | **PASS** |
| Slice 3 Operational Closure | **PENDING** |
| Slice 3 Production Canary GO | **NOT YET ELIGIBLE** |
| **Slice 3 = CLOSED** | **否**（待三方签字 + 截图补传） |

> 用语：**Production Canary GO**（非全量 Production Cutover）。

---

## 立即执行顺序

### 1. Native 最小 E2E

完成两个入口：

| 入口 | 说明 |
|------|------|
| **「我晚了」** | Activity A 上报 departure-slip |
| **Canonical 决策卡** | decision-queue 展示 + 确认方案 |

#### 完整链路（必须全部 PASS）

```
用户点击「我晚了」
  → POST /api/trips/:tripId/execution/departure-slip
  → Canonical Problem（EXECUTION_SCHEDULE_INFEASIBLE）
  → 3 个 Repair Candidate（shorten / remove / substitute）
  → 用户确认（accept-recommended + actionId）
  → W-01 唯一写入
  → 新 PlanVersion effective
  → Revalidation PASS
  → Problem RESOLVED
  → Native 卡片消失
```

#### 必补测矩阵

| # | 场景 | 预期 |
|---|------|------|
| 1 | 重复点击「我晚了」 | 不重复写入（Idempotency-Key / observation 去重） |
| 2 | 用户取消 / 关闭弹窗 | 不写入 PlanVersion |
| 3 | UNKNOWN（无 lastEntryAt） | 不误判 infeasible、不打开 BLOCK 卡 |
| 4 | 网络失败 | 可重试，无脏写 |
| 5 | 已 RESOLVED 的 problem | 不重复展示 |
| 6 | Legacy advisory | **不参与**正式写入（`legacyWriteInvocations = 0`） |

#### Native 关键实现（Frontend）

- `observedAt = plannedDepartAt + delayMinutes`，**禁止** `new Date()` 硬编码（未来行程日）
- `activityId` = **当前要离开的活动**（Canary：Activity A `...777631`）
- `NO_ACTION` → Toast「仍可执行」；`RECORDED` → 跳转决策卡
- 可选方案 `actionId` 均可提交（含 `cand_substitute_next`）
- 渲染 `affectedActivities[]` 展示受影响行程项名称

**Handoff：** `src/trips/guardian-decision-core/EXECUTION_SLIP_FRONTEND_HANDOFF.md`

---

### 2. 保存 Native E2E 证据

**已归档（2026-07-12）：**

| 产物 | 路径 |
|------|------|
| JSON 证据（工作副本） | `.docs/execution-slip-native-e2e-2026-07-12.json` |
| JSON 证据（归档） | `internal-docs/operations/evidence/execution-slip-native-e2e-2026-07-12.json` |
| 截图目录 | `internal-docs/operations/evidence/execution-slip-native-e2e-screenshots/`（**PNG 待补传**） |

完成后至少输出：

| 产物 | 路径 |
|------|------|
| JSON 证据 | `internal-docs/operations/evidence/execution-slip-native-e2e-2026-07-xx.json` |
| 截图目录 | `internal-docs/operations/evidence/execution-slip-native-e2e-screenshots/` |
| 录屏（可选但推荐） | `internal-docs/operations/evidence/execution-slip-native-e2e-recording.mp4` |

**JSON 必含字段：**

- `tripId` / `problemId` / `decisionId`（= problemId）
- `oldPlanVersionId` / `newPlanVersionId`
- `selectedActionId` / `runId` / `observationId`
- `revalidation`（status / message）
- `legacyWriteInvocations`（必须为 0）
- `idempotency`（first / replay 结果）
- `checks[]`（必补测矩阵 6 项）
- `screenshots[]` / `recordingPath`
- `commitSha` / `testedAt` / `tester`

**模板：** `internal-docs/operations/evidence/execution-slip-native-e2e-TEMPLATE.json`

---

### 3. 完成三方 Sign-off

#### Engineering

| 项 | 要求 |
|----|------|
| Runtime | PASS |
| Harness | 14/14 |
| Staging A/B/C | PASS |
| Native E2E | PASS + 证据归档 |
| W-01 | 唯一写入路径 |
| Revalidation | PASS |
| TypeScript | slice 相关 0 errors |
| Legacy write | = 0 |

#### Ops

| 项 | 要求 |
|----|------|
| Feature flag | 可关闭（`CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE=0`） |
| Seed / Rollback | 可重复执行 |
| Evidence | 完整（staging + native e2e） |
| Allowlist | 独立 Canary trip 明确，未触碰 Weather/Road |
| Metrics | shadow-metrics 可读取 |
| Staging | A/B/C 脚本可复跑 |
| Weather / Road | **未被触碰** |

#### Product / Release

| 项 | 要求 |
|----|------|
| 问题表达 | 用户能理解「晚了 → 赶不上」 |
| 未确认前 | 不改 effective plan |
| 推荐方案 | 文案正确（跳过 / 替补 / 缩短） |
| UNKNOWN / Error | 状态与 Toast 正确 |
| 成功后 | 展示 revalidation 结果 |
| 已解决 | 移出 decision queue |

**签字表：** 见 [EXECUTION-SLIP-PRODUCTION-SIGNOFF-PACK-2026-07-11.md](./EXECUTION-SLIP-PRODUCTION-SIGNOFF-PACK-2026-07-11.md) § Owner Sign-off

---

## Slice 3 关闭标准（全部 PASS 后更新）

| 状态行 | 更新为 |
|--------|--------|
| Slice 3 Canonical Runtime Engineering Closure | PASS |
| Slice 3 Backend Integration Closure | PASS |
| Slice 3 End-to-End Product Integration Closure | **PASS** |
| Slice 3 Operational Closure | **PASS** |
| Slice 3 Production Canary GO | **GO** |
| **Slice 3 = CLOSED** | **是** |

> 仍写 **Production Canary GO**，不写全量 Production Cutover。

---

## Slice 3 CLOSED 后的下一步（Slice 4）

**启动：Internal Dual-Read**（不是 Primary SSO）

```
Current Unified Queue
  +
Attention Primary Projection
  +
Comparison
```

| 约束 | 说明 |
|------|------|
| 受众 | 仅内部账号 + Canary Trip |
| 通知 | **不发** Attention 通知 |
| 队列 | **不替换**正式 decision-queue |

参考：[ADR-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md](../architecture/ADR-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md)

---

## 当前禁止事项

- 不改 Slice 4 规则
- 不新增 Slice 4 场景
- 不开启 Primary SSO
- 不做 Visible Queue Cutover
- 不发 Attention 通知
- 不做成员状态
- 不接新数据源
- 不扩新的 Runtime Slice
- 不修改 Weather / Road 冻结链路
- 不宣称「Slice 3 Complete」直至三方签字 + 证据归档

---

## Canary 联调常量

| 字段 | 值 |
|------|-----|
| tripId | `c0c77777-7777-4777-8777-777777777777` |
| user | `exec-slip-canary@tripnara.dev` |
| Activity A（上报点） | `c0c77777-7777-4777-8777-777777777631` |
| Activity B（lastEntry 16:00） | `c0c77777-7777-4777-8777-777777777632` |
| Substitute C | `c0c77777-7777-4777-8777-777777777633` |
| plannedDepart | `2026-07-12T13:00:00.000Z` |
| Scenario A (+35min) | `2026-07-12T13:35:00.000Z` → RECORDED |
| Scenario B (+10min) | `2026-07-12T13:10:00.000Z` → NO_ACTION |

**Re-seed：**

```bash
EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-pre-signoff-setup.ts --reset
BASE_URL=http://localhost:3002 EXEC_SLIP_DRILL_ALLOW_PROD=1 bash scripts/execution-slip-preflight.sh
BASE_URL=http://localhost:3002 EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/execution-slip-accept-recommended-smoke.ts
```

**Dev 环境 flags（Nest 3002，勿杀 3000 Vedur soak）：**

```bash
PORT=3002 \
CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE=1 \
RFC001_ICELAND_ROAD_CLOSE=1 \
EFFECTIVE_PLAN_WRITE_CHAIN=1 \
RFC001_ITINERARY_MATERIALIZE=1 \
npm run dev
```

---

## 相关文档

| 文档 | 用途 |
|------|------|
| [EXECUTION-SLIP-PRODUCTION-SIGNOFF-PACK-2026-07-11.md](./EXECUTION-SLIP-PRODUCTION-SIGNOFF-PACK-2026-07-11.md) | 工程/Staging 证据索引 |
| [EXECUTION_SLIP_FRONTEND_HANDOFF.md](../../src/trips/guardian-decision-core/EXECUTION_SLIP_FRONTEND_HANDOFF.md) | Native API + UI 文案 |
| [ADR-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md](../architecture/ADR-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md) | Slice 4 Dual-Read 设计 |

---

## 项目组一句话

**Slice 4 保持 FROZEN。当前唯一主线是完成 Slice 3 Native E2E 与三方 Operational Sign-off。** 请完成「我晚了」入口、Canonical 决策卡、authorize/execute、Revalidation 结果展示，并在独立 Canary Trip 上跑 Native E2E Drill。证据完成后由 Engineering、Ops、Product/Release 三方签字，正式将 Slice 3 标记为 **CLOSED**。之后再启动 Slice 4 **Internal Dual-Read**。
