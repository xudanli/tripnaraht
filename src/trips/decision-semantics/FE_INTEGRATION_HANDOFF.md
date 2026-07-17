# Unified Decision — 前端联调 Handoff

**日期：** 2026-06-30（DecisionCase 增量：2026-07-15）  
**后端基线：** RFC-002 Gateway + Canonical L2（道路 / 天气 / 日负荷） + DecisionCase publish  
**完整 API 文档：** [UNIFIED_DECISION_FRONTEND_INTEGRATION.md](./UNIFIED_DECISION_FRONTEND_INTEGRATION.md)  
**DecisionCase 契约：** [DECISION_CASE_BACKEND_HANDOFF.md](../../decision-runtime/decision-cases/DECISION_CASE_BACKEND_HANDOFF.md)  
**六层 ↔ 前端读法：** [DECISION_RUNTIME_MATURITY.md §11](../../decision-runtime/DECISION_RUNTIME_MATURITY.md#11-前端与决策中心如何读六层)

---

## 0. DecisionCase（后端先行 · FE 可不改架构）

| 接口 | 用途 |
|------|------|
| `GET decision-problems` | 队列 SSOT；IS 自驾会合并车型/保险 BLOCKING case（带 `decisionCase` 字段） |
| `GET decision-opportunities` | 未过门槛机会；**不进**决策空间 |
| `POST …/decision-opportunities/:id/publish` | 「加入比较」升级 |
| apply `writeChain=CONSTRAINT_WRITEBACK` | 写回车型/保险约束并 re-validate |

详见 DecisionCase handoff。

---


## 1. 环境

### 本地

```bash
# 后端
cp .env.unified-decision-frontend.example  # 追加到 .env 后 npm run dev
npm run decision-center:unified-env-check    # 7/7 绿

# 前端
VITE_DECISION_GATEWAY_UNIFIED=1
VITE_API_BASE=http://localhost:3000/api   # 按你们 repo 实际变量名
```

### Staging Secret（运维）

```bash
DECISION_GATEWAY_UNIFIED=1
CANONICAL_ROAD_SEGMENT_UNAVAILABLE=1
CANONICAL_WEATHER_ACTIVITY_PROHIBITED=1
CANONICAL_EXCESSIVE_DAILY_LOAD=1
RFC001_SHADOW_MODE=0
DECISION_PACK_RUNTIME=1
DECISION_PACK_RULES=1
```

---

## 2. 固定 Fixture

| 用途 | tripId | 说明 |
|------|--------|------|
| **冰岛联调（主）** | `3e4a1058-9218-467f-988a-c18008a14385` | 7 日冰岛；含 Legacy + Canonical |
| 通用 Decision Center | `807b3c54-4793-4006-a66d-67e79faa6fc2` | 旧 staging QA 默认 |

### 2.1 Canonical L2 — 日负荷（已在本机造好，可直接联调）

| 字段 | 值 |
|------|-----|
| `problemId` | `problem_load_3e4a1058_1782831128596` |
| `semanticCapability` | `EXCESSIVE_DAILY_LOAD` |
| `flow` | `CANONICAL_L2` |
| `leadingPersona` | `DRDRE` |
| `decisionId`（evaluate 后） | `dec_problem_load_3e4a1058_1782831128596_1782831146665` |
| `recordStatus` | `PROPOSED` → authorize 后 → execute |
| `planVersion.status` | `PENDING_AUTHORIZATION` |
| **authorize choice** | `cand_split_day` |
| 影响 | 第 5 日驾驶 ~32h（超阈值） |

> 同 trip 还有一条未 evaluate 的：`problem_load_3e4a1058_1782830457468`（供 FE 测「生成方案」按钮）。

### 2.2 Legacy V1.5 示例（同 trip）

| problemId | title | flow |
|-----------|-------|------|
| `dp_id:coverage-gap:1` | 第6天 · 红沙滩 | `LEGACY_V15` |
| `dp_id:issue-finding-2` | 冰岛 紧急电话 | `LEGACY_V15` |

### 2.3 Canonical L2 — F208 道路关闭（本机注入）

```bash
npm run decision-center:simulate-f208
# 可选：npm run decision-center:simulate-f208 <tripId> <driveItemId>
```

| 字段 | 值（最近一次注入） |
|------|-------------------|
| `problemId` | `problem_road_F208_3e4a1058_1782836724265` |
| `flow` | `CANONICAL_L2` |
| `leadingPersona` | `ABU` |
| **impactScopeView** | `templateKey: impact.road_close.affects_arrangements` |
| `narrative.params` | `subjectId: F208`, `status: CLOSED`, `arrangementLabels: ["红沙滩"]` |
| evaluate 后 options | `cand_a`, `cand_b`, `cand_c`（3 路绕路/替代） |

> 本 fixture 行程较 sparse（第 6 天仅 1 个 POI），`downstreamCount=0`；完整「酒店入住 + 晚餐预约」连锁需同日多安排行程。绑定写入 `trip.metadata.rfc001IcelandRoadBindings`。

```bash
PROB=problem_road_F208_3e4a1058_1782836724265
curl -s "$BASE/trips/$TRIP/decision-problems/$PROB" | jq '.data.data.impactScopeView.narrative'
curl -s -X POST "$BASE/trips/$TRIP/decision-problems/$PROB/evaluate" | jq '.data.impactScopeView,.data.comparisonView.headline'
```

---

## 3. curl 速查（本地 `BASE=http://localhost:3000/api`）

```bash
TRIP=3e4a1058-9218-467f-988a-c18008a14385
BASE=http://localhost:3000/api
# Staging: BASE=https://<staging-host>/api  AUTH="Authorization: Bearer <jwt>"
```

### 3.1 读模型（FE-UD-1）

```bash
curl -s "$BASE/trips/$TRIP/decision-center" | jq '.data.schemaId,.data.activePacks.layers[].packId,.data.canonical.problems|length'

curl -s "$BASE/trips/$TRIP/decision-problems" | jq '.data.meta,.data.items[]|{problemId,flow,semanticCapability,status,title}'

curl -s "$BASE/trips/$TRIP/decision-problems/problem_load_3e4a1058_1782831128596" | jq '.data.flow,.data.route.resolution,.data.data.leadingPersona'
```

### 3.2 造 Canonical 问题（QA / 重置用）

```bash
# 日负荷 — Dr.Dre Slice
curl -s -X POST "$BASE/trips/$TRIP/daily-load/scan" \
  -H 'Content-Type: application/json' \
  -d '{"runFull":true}' | jq '.data.overloaded,.data.problem.problemId'

# 天气 — Abu Slice（本 fixture day6 可能 changed:false，换有户外活动的 day）
curl -s -X POST "$BASE/trips/$TRIP/weather-hazard/poll" \
  -H 'Content-Type: application/json' \
  -d '{"dayIndex":3,"runFull":true}' | jq '.data.changed,.data.problem'
```

### 3.3 Canonical L2 写路径（FE-UD-5 日负荷）

```bash
PROB=problem_load_3e4a1058_1782831128596

# Step 1 — evaluate（含 comparisonView + impactScopeView.narrative）
curl -s -X POST "$BASE/trips/$TRIP/decision-problems/$PROB/evaluate" | jq '.data | {comparison: .comparisonView.headline, impact: .impactScopeView.narrative}'

DEC=dec_problem_load_3e4a1058_1782831128596_1782831146665   # 上一步返回；若重新 evaluate 会变

# Step 2 — authorize
curl -s -X POST "$BASE/trips/$TRIP/decisions/$DEC/authorize" \
  -H 'Content-Type: application/json' \
  -d '{"choice":"cand_split_day"}' | jq '.data'

# Step 3 — execute
curl -s -X POST "$BASE/trips/$TRIP/decisions/$DEC/execute" \
  -H 'Idempotency-Key: pv:'"$TRIP"':'"$DEC" | jq '.data'
```

### 3.4 Legacy V1.5（FE 兼容路径）

```bash
PROB=dp_id:coverage-gap:1

curl -s "$BASE/trips/$TRIP/decision-problems/$PROB" | jq '.data.flow,.data.data.status'

curl -s "$BASE/trips/$TRIP/decision-problems/$PROB/options" | jq '.data.data.options[].id'

# apply 见 DECISION_CENTER_FE_MVP_INTEGRATION.md
```

### 3.5 AI 决策委员会（规划页）

```bash
curl -s "$BASE/trips/$TRIP/persona-alerts?phase=planning&audience=user&limit=10" \
  | jq '.data[]|{persona,severity,title,explanation}'
```

**本 fixture 实测（2026-06-30）：**

| persona | severity | 摘要 |
|---------|----------|------|
| `ABU` | warning | 冰岛紧急电话 112 |
| `DR_DRE` | info | 第 6 天红沙滩缺路线/营业时间验证 |

Neptune 无独立 alert 时默认展示「可接受」（见 UNIFIED 文档 AI 委员会章节）。

---

## 4. 前端分支逻辑（必实现）

```typescript
const item = listItem; // from GET decision-problems

if (item.flow === 'CANONICAL_L2') {
  // evaluate → authorize → execute
  // 禁止 POST /decisions（Legacy apply）
} else {
  // LEGACY_V15: options → preview → POST decisions → poll
}
```

**L2 phase helper：** `classifyCanonicalL2Phase()` —  
`src/decision-runtime/gateway/frontend/canonical-decision-l2-state-machine.util.ts`

**类型 SSOT：** `src/generated/unified-decision-contracts/index.ts`

---

## 5. 建议 PR 顺序

| PR | 验收 |
|----|------|
| FE-UD-1 | 列表见 `flow` 标签；`decision-center.activePacks` 可展示 |
| FE-UD-2 | 道路 L2（`cand_a`）— 需有 road close 问题或另造 |
| FE-UD-3 | 天气 poll + `cand_indoor` |
| FE-UD-4 | canonical/legacy 去重列表 |
| FE-UD-5 | 用本文 §2.1 `problemId` 跑通 split_day 三步 |
| FE-Committee | `persona-alerts` 三人格卡片 + badge 映射 |

---

## 6. 后端验证命令

```bash
npm run rfc002:fe-readiness
npm run decision-center:unified-qa -- 3e4a1058-9218-467f-988a-c18008a14385 http://localhost:3000/api
npm run decision-center:staging-qa -- 3e4a1058-9218-467f-988a-c18008a14385
```

---

## 7. 已知限制

- 冰岛 fixture **weather poll day6** 可能 `changed: false`；换 `dayIndex` 或等有户外 POI 的天。
- Legacy 问题 **options 可能为空**（如 coverage-gap）；不影响 Canonical L2 联调。
- `decisionId` 每次 **重新 evaluate 会变**；联调时用 decision-center 最新 `record.decisionId`。
- **`EXCESSIVE_DAILY_LOAD` 同天去重**（2026-06-30）：重复 `daily-load/scan` 不再刷多条同天卡片；读模型按 day 保留 1 条（优先有 PROPOSED record 的）。
- Staging 需单独跑 smoke；提供 `AUTH_TOKEN` + staging URL 后可执行：  
  `AUTH_TOKEN=… npm run decision-center:unified-qa -- $TRIP https://…/api`

---

## 8. impactScopeView — 影响范围（价值 ①）

**不要只显示「F208 道路关闭」。** Canonical L2 返回结构化 **`impactScopeView`**（`schemaId: tripnara.impact_scope@v1`），文案由前端 i18n 渲染：

| 字段 | 用途 |
|------|------|
| `narrative.templateKey` | i18n 模板键，如 `impact.road_close.affects_arrangements` |
| `narrative.params` | `primaryDayIndex` / `dayIndexes` — **1-based**，与 problem title 同天 |
| options | `executionCapability`: `DIRECT` 可一键 execute；`GUIDED_MANUAL`（如 `cand_split_day`）需手动步骤 |
| `chain[]` | 触发 → 路线 → 行程项 → `consequenceKind`（无后端硬编码中文） |
| `arrangements[]` | 来自 Place/note 的 `label` + `arrangementKind` + `isDirect` |
| `trigger` | `capability` + `subjectKind` + `subjectId` + `status` |

**FE 示例（zh）：**

```typescript
// impact.road_close.affects_arrangements
// params: { subjectId: 'F208', status: 'CLOSED', dayIndexes: [3], arrangementLabels: ['红沙滩', 'Black Beach Suites', ...] }
t('impact.road_close.affects_arrangements', {
  road: params.subjectId,
  day: params.dayIndexes[0],
  count: params.arrangementCount,
  names: formatList(params.arrangementLabels),
})
// → 「这次 F208 道路关闭将影响第 3 天的 3 个安排：红沙滩、Black Beach Suites 和 Fish & Chips Vík。」
```

```bash
curl -s "$BASE/trips/$TRIP/decision-problems/$PROB" | jq '.data.data.impactScopeView.narrative // .data.impactScopeView.narrative'
curl -s -X POST "$BASE/trips/$TRIP/decision-problems/$PROB/evaluate" | jq '.data.impactScopeView.narrative'
```

Legacy V1.5 仍用 `affectedScopeDisplay`。
