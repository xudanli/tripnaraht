# Slice 3 —「我晚了」Native 前端对接说明（中文）

**状态：** Slice 3 Native E2E **PASS**（2026-07-12 证据归档）；待三方 Operational Sign-off  
**Feature flag：** `CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE=1`

---

## 1. 功能概述

用户在**当前活动**仍滞留在 POI 时，通过「我晚了」上报延误。后端评估**能否在下一站 `lastEntryAt` 前到达**：

- **仍可行** → `status: NO_ACTION`，展示提示，**不**打开决策卡
- **不可行** → `status: RECORDED` + `problemId`，跳转 **行程调整建议**（decision-queue）

---

## 2. UI 文案（直接可用）

### 2.1 「我晚了」弹窗

| 元素 | 文案 |
|------|------|
| 标题 | 我晚了 |
| 关闭 | 关闭 |
| 说明 | 请选择实际情况，系统将重新评估后续行程。 |
| 选项 · 仍在当前地点 | 仍在当前地点 |
| 选项 · +15 分钟 | 晚了 15 分钟 |
| 选项 · +30 分钟 | 晚了 30 分钟 |
| 选项 · +45 分钟 | 晚了 45 分钟 |
| 提交中 | 正在评估… |
| 网络错误 | 上报失败，请稍后重试 |

### 2.2 提交结果 Toast

| `status` | Toast 文案 | 后续动作 |
|----------|------------|----------|
| `NO_ACTION` | 按当前延误，后续行程仍可执行，无需调整 | 关闭弹窗，**不**跳转 |
| `RECORDED` | 后续行程可能赶不上，请查看调整建议 | 关闭弹窗 → 打开决策卡 / `decision-queue` |
| 401 | 请先登录 | — |
| 403 | 你不是该行程成员 | — |
| 404 | 活动不存在或不属于本行程 | — |

### 2.3 决策卡（行程调整建议）

| 元素 | 数据来源 |
|------|----------|
| 页面标题 | 行程调整建议 |
| 副标题 | `{tripName} · Day {n} · 旅行中` |
| 发生了什么 | `decision-queue` item.`headline` / `explanation` |
| 影响范围 | item.`impact`（例：`影响：POI A、POI B`） |
| 受影响行程项列表 | item.`affectedActivities[]` → `{ activityId, title, dayIndex? }` |
| 严重度标签 | `severity` → BLOCK=`紧急` / CONFLICT=`需调整` |
| 推荐方案 | `recommendation.title` |
| 可选方案列表 | `repairOptions[]`（hydrate 时返回；或 `GET .../decision-problems/:problemId/options`） |
| 方案时间证据（全卡） | item.`scheduleContext` → `projectedEtaLabel` / `nextLastEntryAtLabel` / `slipMinutes` |
| 方案标题 / 说明 | `repairOptions[].title` / `summary`（**已含 POI 名**，勿再用裸 `optionId` 映射） |
| 方案得失 | `repairOptions[].preserves` / `sacrifices` |
| 方案变更预览 | `repairOptions[].changePreview` → `remove` / `add` / `shortenMinutes` |
| 查看其他方案 | `actions.viewAlternatives` |
| 确认按钮 | 确认候选 {candidateId} |
| 保留原计划 | `actions.keepOriginal` 可用时展示 |

**语义标识：** `semanticCapability = EXECUTION_SCHEDULE_INFEASIBLE`（L2 列表项可据此过滤）

#### 2.3.1 `repairOptions` 字段（Slice 3.1 — 方案可读性）

`GET /api/trips/{tripId}/decision-queue/{problemId}` hydrate 后，每个方案示例：

```json
{
  "optionId": "cand_substitute_next",
  "title": "改去「Exec Slip Canary POI C (Substitute)」",
  "summary": "替换「Exec Slip Canary POI B (Timed)」；预计 16:18 抵达，备选点最后入场 18:00，预计可赶上",
  "preserves": ["保留今日后续行程结构", "尽量守住核心体验意图"],
  "sacrifices": ["不再前往「Exec Slip Canary POI B (Timed)」"],
  "canApply": true,
  "scheduleContext": {
    "projectedEtaLabel": "16:18",
    "nextLastEntryAtLabel": "16:00",
    "slipMinutes": 45,
    "travelDurationMinutes": 128,
    "timezone": "Atlantic/Reykjavik"
  },
  "changePreview": {
    "remove": {
      "activityId": "...777632",
      "title": "Exec Slip Canary POI B (Timed)",
      "lastEntryAtLabel": "16:00"
    },
    "add": {
      "activityId": "...777633",
      "title": "Exec Slip Canary POI C (Substitute)",
      "lastEntryAtLabel": "18:00"
    }
  }
}
```

| `optionId` | 预期 `title` 模式 | `changePreview` |
|------------|-------------------|-----------------|
| `cand_remove_next` | `跳过「{下一站名}」` | 仅 `remove` |
| `cand_substitute_next` | `改去「{备选 POI 名}」` | `remove` + `add` |
| `cand_shorten_stay` | `缩短当前停留 {N} 分钟` | `shortenMinutes` + `remove`（当前站） |

**iOS 渲染建议：**

1. 卡片顶部展示 `scheduleContext`：`预计 {projectedEtaLabel} 抵达 · 原站最后入场 {nextLastEntryAtLabel} · 延误 {slipMinutes} 分钟`
2. 方案列表用 `title` + `summary`，辅以 `changePreview` 做 before/after 行
3. **勿**仅用本地「启用备选方案 / 跳过下一站」覆盖 `title`（会与后端 POI 名不一致）

---

## 3. 关键实现规则（必读）

### 3.1 `activityId` — 必须是「当前要离开的活动」

`activityId` = **用户此刻仍所在、即将离开** 的 itinerary item，**不是**下一站。

| 场景 | 正确 activityId | 错误示例 |
|------|-----------------|----------|
| 在 POI A 还没走，评估能否赶上 POI B | Activity A | Activity B（下一站） |
| 在 POI B 还没走，评估能否赶上 POI C | Activity B | Activity C |

Canary 标准 drill：在 **POI A** 点「我晚了」，传 Activity A 的 id。

### 3.2 `observedAt` — 快捷选项**不能**用 `new Date()`

后端用 `observedAt` 与 **`plannedDepartAt`（计划离开时间）** 算延误分钟数，并推算预计到达时间。

```typescript
// ❌ 错误 — 未来行程日会导致 slip=0，永远 NO_ACTION
observedAt: new Date().toISOString()

// ✅ 正确 — 计划离开时间 + 用户选择的延迟
observedAt: addMinutes(plannedDepartAt, delayMinutes).toISOString()
```

**`plannedDepartAt` 取值优先级：**

1. 行程 metadata `rfc001ExecutionActivityContext.byActivityId[activityId].plannedDepartAt`
2. 否则用 itinerary item 的 `endTime`（ISO 字符串）
3. 再否则 `startTime`

**`stillAtPoi`：** 用户选「仍在当前地点」或任意「晚了 N 分钟」且人还在 POI → `true`；已离开 POI → `false`（一般 Slice 3 场景为 `true`）。

### 3.3 参考实现

```typescript
import { addMinutes, parseISO } from 'date-fns';

interface LateOption {
  label: string;
  delayMinutes: number; // 0 = 仍在当前地点（按实际离开时刻）
}

const LATE_OPTIONS: LateOption[] = [
  { label: '仍在当前地点', delayMinutes: 0 },
  { label: '晚了 15 分钟', delayMinutes: 15 },
  { label: '晚了 30 分钟', delayMinutes: 30 },
  { label: '晚了 45 分钟', delayMinutes: 45 },
];

function buildDepartureSlipBody(
  activityId: string,
  plannedDepartAt: string,
  option: LateOption,
) {
  const base = parseISO(plannedDepartAt);
  const observedAt =
    option.delayMinutes === 0
      ? new Date().toISOString() // 仅「仍在当前地点」可用当前时刻
      : addMinutes(base, option.delayMinutes).toISOString();

  return {
    activityId,
    observedAt,
    stillAtPoi: true,
    source: 'USER_REPORT' as const,
  };
}
```

> **注意：** 「仍在当前地点」用 `now()` 仅当**行程日 = 今天**且用户确实还在 POI 时合理。未来日期 Canary / 预排行程，应使用真实观测时间或禁用该选项。

---

## 4. API

### 4.1 上报延误

```
POST /api/trips/:tripId/execution/departure-slip
Authorization: Bearer {jwt}
Content-Type: application/json
Idempotency-Key: {optional}   // 可选，防重复提交
```

**Request**

```json
{
  "activityId": "c0c77777-7777-4777-8777-777777777631",
  "observedAt": "2026-07-12T13:45:00.000Z",
  "stillAtPoi": true,
  "source": "USER_REPORT"
}
```

**Response — 不可行（需调整）**

```json
{
  "success": true,
  "data": {
    "observationId": "obs_xxx",
    "status": "RECORDED",
    "problemId": "problem_exec_slip_...",
    "runId": "run_..."
  }
}
```

**Response — 仍可行**

```json
{
  "success": true,
  "data": {
    "observationId": "obs_xxx",
    "status": "NO_ACTION"
  }
}
```

### 4.2 读取决策卡

```
GET /api/trips/:tripId/decision-queue
```

`RECORDED` 后：

1. 用返回的 `problemId` 在 queue 中定位 item，或
2. `GET /api/trips/:tripId/decision-queue/:problemId`

**`problemId` 对齐：** 多次「我晚了」上报时，unified queue 按 `instanceKey` 合并，**应展示最新 slip 的 `problemId`**（与 POST 返回一致）。若 Native 看到 404，可短轮询 queue 或取最新 open `problem_exec_slip_*` 项（Native 已做 fallback；后端已修复 merge 优先最新 id）。

### 4.3 确认方案

```
POST /api/trips/:tripId/decision-queue/:problemId/accept-recommended
Body: {
  "actionId": "cand_substitute_next",
  "acknowledgement": [
    "我确认在了解阻断原因后仍执行该方案",
    "我已了解该决策对行程的影响与约束说明",
    "我确认已知悉相关风险并自愿承担决策后果"
  ]
}
```

**`acknowledgement`：** BLOCK 类决策（Execution Slip）必填。可从 submit 响应的 `requiredAcknowledgements` 读取；Native 确认前展示勾选框。

**`actionId` 取值：** 可选方案列表里任意一个 **allowed** 的候选 id（如 `cand_remove_next`、`cand_substitute_next`、`cand_shorten_stay`），不限于推荐项。

**后端 drill（reset 后）：**

```bash
EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-pre-signoff-setup.ts --reset
BASE_URL=http://localhost:3002 EXEC_SLIP_DRILL_ALLOW_PROD=1 bash scripts/execution-slip-preflight.sh
BASE_URL=http://localhost:3002 EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/execution-slip-accept-recommended-smoke.ts --action=cand_substitute_next
```

**禁止：** 调用 legacy `execution-advisory/.../apply`（W-01 开启时返回 `WRITE_CHAIN_BLOCKED`）。

---

## 5. 前端类型与 Client

复制到 Native 工程：

- `src/trips/travel-status/dto/frontend-travel-status-api.types.ts`
- `src/trips/travel-status/dto/frontend-travel-status-api-client.ts`

新增类型：`DepartureSlipRequest` / `DepartureSlipResponse`  
新增方法：`travelStatusApi.recordDepartureSlip(tripId, body)`

---

## 6. Canary 联调数据

| 字段 | 值 |
|------|-----|
| tripId | `c0c77777-7777-4777-8777-777777777777` |
| 用户 | `exec-slip-canary@tripnara.dev` |
| Activity A（在此上报） | `...777631`，计划离开 `2026-07-12T13:00:00Z` |
| Activity B（下一站，lastEntry 16:00） | `...777632` |
| Substitute C | `...777633` |

**预期结果**

| observedAt | 预期 status |
|------------|-------------|
| `2026-07-12T13:10:00Z`（+10min） | `NO_ACTION` |
| `2026-07-12T13:35:00Z`（+35min） | `RECORDED` |
| `2026-07-12T13:45:00Z`（+45min） | `RECORDED` |

---

## 7. 验收清单

| # | 项 | 预期 |
|---|-----|------|
| 1 | 在 Activity A 选「晚 45 分钟」 | `RECORDED` + 决策卡 |
| 2 | 在 Activity A 选「晚 10 分钟」 | `NO_ACTION` + Toast |
| 3 | `observedAt` 使用 plannedDepart + N | 非 `new Date()` 硬编码 |
| 4 | 决策卡展示三方案 | shorten / remove / substitute |
| 5 | 确认后 effective plan 变更 | PlanVersion 更新 |
| 6 | 不在 Activity B 误测 A→B 场景 | activityId = 当前活动 |

---

## 8. 本地 Harness

```bash
CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE=1 npm test -- execution-slip-last-entry.harness.spec.ts
CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE=1 npm test -- execution-slip-assessor.util.spec.ts
```

---

## 9. iOS 实现检查点

> Native E2E 签收用。Slice 3 为 **Mobile BFF + Canonical Trips API 混用**。  
> **联调操作清单：** `.docs/execution-slip-native-integration-checklist.md`  
> **证据模板：** `.docs/execution-slip-native-e2e-TEMPLATE.json`（归档副本 → `internal-docs/operations/evidence/`）

### 9.1 API 路由分工

| 步骤 | 路径 | 说明 |
|------|------|------|
| 读当前活动 | `GET /api/mobile/trips/{tripId}/context-snapshot` | 取 `execution.currentActivityID`、`contextVersion`、`planVersion` |
| 读计划离开时间 | `GET /api/mobile/trips/{tripId}/today-itinerary` | 取当前 item 的 `endTime`（见 §3.2） |
| 上报「我晚了」 | `POST /api/trips/{tripId}/execution/departure-slip` | **无 Mobile BFF**，必须走 canonical |
| 读决策卡详情 | `GET /api/trips/{tripId}/decision-queue/{problemId}` | 含 `repairOptions`、`requiredAcknowledgements` |
| 确认方案 | `POST /api/trips/{tripId}/decision-queue/{problemId}/accept-recommended` | BLOCK 必填 `acknowledgement` |
| 写后刷新 | `GET /api/mobile/trips/{tripId}/context-snapshot` | 比对 `contextVersion` / `planVersion` |

> **禁止：** `POST /api/mobile/trips/{tripId}/decisions/{decisionId}/accept` — 该 BFF **不传** `acknowledgement`，Execution Slip（BLOCK）确认会失败。Slice 3 确认必须走 canonical `accept-recommended`。

### 9.2 建议模块结构

```
ExecutionSlipCoordinator          // 编排整条链路
├── ExecutionSlipRequestBuilder   // activityId + observedAt 计算（§3.2）
├── TravelStatusAPI               // canonical：departure-slip / decision-queue / accept
└── MobileExecutionAPI            // mobile BFF：context-snapshot / today-itinerary
```

### 9.3 主流程：逐步调用 + 断言

#### Step 0 — 进入行中，拿上下文

```
GET /api/mobile/trips/{tripId}/context-snapshot
```

| 断言 | 预期 |
|------|------|
| `data.lifecycle` | `"traveling"` |
| `data.execution.currentActivityID` | Canary = Activity A（`...777631`） |
| 记下 | `contextVersion`、`planVersion`（写后对比） |

#### Step 1 — 解析 `plannedDepartAt`

```
GET /api/mobile/trips/{tripId}/today-itinerary
```

在 items 中找 `id == currentActivityID`：

1. metadata `rfc001ExecutionActivityContext.byActivityId[activityId].plannedDepartAt`
2. 否则 item `endTime`（ISO）
3. 再否则 `startTime`

| 断言 | 预期 |
|------|------|
| Canary `plannedDepartAt` | `2026-07-12T13:00:00.000Z` |
| `activityId` | ≠ `nextActivityID`（不能误用下一站 B） |

#### Step 2 — 弹窗提交 departure-slip

```
POST /api/trips/{tripId}/execution/departure-slip
Authorization: Bearer {jwt}
Idempotency-Key: {UUID}   // 建议每次弹窗提交生成
```

请求体构建见 §3.3。按选项断言：

| 选项 | observedAt | 预期 |
|------|-----------|------|
| 晚 10 分钟 | `2026-07-12T13:10:00Z` | `NO_ACTION`，无 `problemId` |
| 晚 35 分钟 | `2026-07-12T13:35:00Z` | `RECORDED` + `problemId` |
| 晚 45 分钟 | `2026-07-12T13:45:00Z` | `RECORDED` + `problemId` |

UI 断言：

- `NO_ACTION` → Toast「按当前延误，后续行程仍可执行，无需调整」，关弹窗，**不**跳转
- `RECORDED` → Toast「后续行程可能赶不上，请查看调整建议」→ 打开决策卡

#### Step 3 — 拉决策卡（`RECORDED` 后）

优先：

```
GET /api/trips/{tripId}/decision-queue/{problemId}
```

`problemId` 用 POST 返回值。若 404，短轮询（≤3 次，间隔 500ms）：

```
GET /api/trips/{tripId}/decision-queue
```

取最新 open 且 `problemId` 前缀为 `problem_exec_slip_` 的项。

| 断言 | 预期 |
|------|------|
| `severity` | `BLOCK` → UI 标签「紧急」 |
| `affectedActivities` | ≥1 项，含下一站名称 |
| `repairOptions` | 3 项：`cand_shorten_stay` / `cand_remove_next` / `cand_substitute_next` |
| `scheduleContext` | 含 `projectedEtaLabel`、`nextLastEntryAtLabel`、`slipMinutes` |
| `repairOptions[].title` | 含具体 POI 名（非 `候选 cand_*`） |
| `repairOptions[].changePreview` | substitute 含 `add.title`（备选 POI） |
| `requiredAcknowledgements` | ≥3 条（确认前展示勾选框） |
| `actions.acceptRecommended.enabled` | `true` |

#### Step 4 — 勾选确认 + 提交方案

```
POST /api/trips/{tripId}/decision-queue/{problemId}/accept-recommended
```

```json
{
  "actionId": "cand_substitute_next",
  "acknowledgement": [
    "我确认在了解阻断原因后仍执行该方案",
    "我已了解该决策对行程的影响与约束说明",
    "我确认已知悉相关风险并自愿承担决策后果"
  ]
}
```

`actionId` 可取 `repairOptions[]` 中任意 **allowed** 候选，不限推荐项。`acknowledgement` 亦可从 item.`requiredAcknowledgements` 读取。

| 断言 | 预期 |
|------|------|
| HTTP / `success` | 200 + `true` |
| `data.apply.revalidation.status` | `PASS`（或约定等价态） |
| 缺 `acknowledgement` | 400，UI 提示补勾 |

#### Step 5 — 写后刷新，验证闭环

```
GET /api/mobile/trips/{tripId}/context-snapshot
GET /api/trips/{tripId}/decision-queue
```

| 断言 | 预期 |
|------|------|
| `contextVersion` | 递增 |
| `planVersion` | 变更（记入证据 JSON） |
| 该 `problemId` | queue 中不再 open |
| Native 决策卡 | dismiss |

### 9.4 必补测矩阵

| # | 操作 | 断言 |
|---|------|------|
| 1 | 同一 `Idempotency-Key` 重复提交 | 相同 `observationId`，不新建 problem |
| 2 | 打开弹窗后点「关闭」 | 无 POST；`planVersion` 不变 |
| 3 | 断网后重试 | 可重试；成功前 `planVersion` 不变 |
| 4 | 确认并 RESOLVED 后 | 不再展示 `problem_exec_slip_*` |
| 5 | 无 `lastEntryAt` 的活动 | 不误开 BLOCK 卡 |
| 6 | 全程 | 不调 legacy `execution-advisory/.../apply` |

### 9.5 推荐签收 Drill 顺序

```
1. reset Canary（§6 或后端 scripts/prod-canary-execution-slip-pre-signoff-setup.ts --reset）
2. 登录 exec-slip-canary@tripnara.dev，进入 Canary 行程
3. 场景 A：晚 45min → RECORDED → 决策卡 → substitute → 确认 → 卡片消失
4. reset → 场景 B：晚 10min → NO_ACTION → 仅 Toast
5. reset → 场景 C：晚 45min → 关弹窗不提交 → planVersion 不变
6. reset → 场景 D：同 Idempotency-Key 连点两次 → 去重
```

### 9.6 Swift 网络层参考

```swift
// 上报 — canonical only
func recordDepartureSlip(
    tripId: String,
    body: DepartureSlipRequest,
    idempotencyKey: String
) async throws -> DepartureSlipResponse {
    var request = URLRequest(
        url: baseURL.appendingPathComponent("/api/trips/\(tripId)/execution/departure-slip")
    )
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
    request.httpBody = try JSONEncoder().encode(body)
    return try await decodeApiResponse(request)
}

// 决策卡 — canonical
func getDecisionItem(tripId: String, problemId: String) async throws -> ConsumerDecisionItem {
    var request = URLRequest(
        url: baseURL.appendingPathComponent("/api/trips/\(tripId)/decision-queue/\(problemId)")
    )
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    return try await decodeApiResponse(request)
}

// 确认 — 必须 canonical，勿用 mobile /decisions/accept
func acceptRecommended(
    tripId: String,
    problemId: String,
    actionId: String,
    acknowledgement: [String]
) async throws -> AcceptRecommendedResponse {
    var request = URLRequest(
        url: baseURL.appendingPathComponent(
            "/api/trips/\(tripId)/decision-queue/\(problemId)/accept-recommended"
        )
    )
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let body = AcceptRecommendedRequest(actionId: actionId, acknowledgement: acknowledgement)
    request.httpBody = try JSONEncoder().encode(body)
    return try await decodeApiResponse(request)
}
```

`observedAt` 构建与 §3.3 `buildDepartureSlipBody` 一致。

### 9.7 iOS 待新增 UI / 逻辑

当前 Mobile BFF `execution-overview.quickActions` **尚无**「我晚了」入口，Native 需新增：

1. **入口**：行中页快捷操作或当前活动卡片
2. **弹窗**：§2.1 四选项 + 提交中 / 网络错误态
3. **请求构建器**：`plannedDepartAt + delayMinutes`（§3.2，核心）
4. **决策卡页**：接 canonical decision-queue（`repairOptions` + `requiredAcknowledgements`）
5. **确认流**：canonical `accept-recommended`（非 mobile `decisions/accept`）

### 9.8 签收证据

| 产物 | 路径 |
|------|------|
| 联调清单 | `.docs/execution-slip-native-integration-checklist.md` |
| 证据模板 | `.docs/execution-slip-native-e2e-TEMPLATE.json` |
| 填写后 JSON | `.docs/execution-slip-native-e2e-2026-07-xx.json` |
| 截图 | `.docs/execution-slip-native-e2e-screenshots/` |
| 归档副本 | `internal-docs/operations/evidence/execution-slip-native-e2e-2026-07-xx.json` |

**联调前必做：** `EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-pre-signoff-setup.ts --reset`，然后 Re-run App。

**签收 Drill：** 场景 A（晚 45min → 决策卡 → 勾选 → 确认）+ 场景 B（晚 10min → 仅 Toast）。`checks[]` 六项全 `pass: true`；`legacyWriteInvocations: 0`。
