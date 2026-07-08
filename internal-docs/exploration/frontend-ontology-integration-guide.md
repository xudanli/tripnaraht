# Exploration 前端接入指南 — Travel Ontology / Issues / Travel Context

**Audience:** C 端前端（Hub ① 探索 + 可靠性闭环）  
**复制即用 Client：** `src/trips/exploration/dto/frontend-exploration-api-client.ts`  
**Helpers：** `frontend-exploration-api.helpers.ts`  
**Travel Context Client：** `src/travel-context/client/travel-context-api-client.ts`  
**后端 SSOT：** [EXPLORATION_API.md](../../src/trips/exploration/EXPLORATION_API.md)

---

## 0. 一句话心智模型

```text
用户在条件页填写的信息
  → materialize / PATCH 条件 / 选路 时写入后端 Ontology 事实
  → check / issues 只读 Snapshot 投影成「问题卡片」
  → 前端不需要自己算 BLOCK 规则
```

**前端只做三件事：**

1. **写条件** — `POST /scenarios`、`PATCH .../conditions`（车辆、保险、取车时间）
2. **跑检查** — `POST .../check` → 读 `issues`
3. **展示问题** — 按 `issueId` 前缀区分来源，按 `blockerIssueCount` 判断能否继续

**当前 MVP 不接支付**（`fetchPaymentCatalog` / deposit 等 Sprint 4B 接口忽略即可）。

---

## 1. 页面 ↔ API 对照

| 页面 | 主要 API | Ontology 相关 |
|------|----------|---------------|
| 条件页 | `GET /conditions/catalog`、`PATCH .../conditions` | 写入 insurance / rental / vehicle 事实 |
| 原则页 | `PUT .../principles`（内部 materialize） | 触发 entry eligibility ingest |
| 路线对比 / 选路 | `POST .../selections` | 写入路线段 + 车辆能力事实 |
| 检查页 | `POST .../check`、`GET .../issues` | **读** ontology issues |
| 决策页 | `GET .../issues/:id/options`、`POST .../decisions/...` | ontology issue 暂无 repair options（见 §5） |
| Agent / 全景 | Travel Context `views/exploration` | 读 `ontologyConstraints` 摘要 |

---

## 2. 条件页 — 要写哪些字段

### 2.1 拉 catalog（渲染表单选项）

```http
GET /api/exploration/conditions/catalog?destinationCode=IS
```

```typescript
const catalog = await fetchConditionsCatalog(token, 'IS');
// catalog.vehicleTypes      → 车辆下拉
// catalog.insuranceTiers    → 保险档位下拉（NEW）
// catalog.budgetPresets     → 预算参考
```

### 2.2 创建 Scenario

```typescript
await startExplorationFromHub(token, {
  destinationCodes: ['IS'],
  dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
  travelers: [{ type: 'ADULT' }, { type: 'ADULT' }],
  mobilityContext: { vehicleType: '2WD_COMPACT_SUV' },
  insuranceContext: { coverageTier: 'STANDARD' },
  rentalContext: {
    pickupLocation: 'KEF',
    pickupTimeLocal: '10:00',           // HH:mm，行程首日取车
    afterHoursPickupConfirmed: false,
  },
});
```

研究协议模式仍可用 `researchProtocolId: 'iceland-discovery-v1'`（协议内已有 vehicle / insurance / rental 默认值）。

### 2.3 修改条件（物化后、选路前）

```typescript
await patchScenarioConditions(token, scenarioId, {
  mobilityContext: { vehicleType: '4WD_SUV' },
  insuranceContext: { coverageTier: 'FULL' },
  rentalContext: { pickupTimeLocal: '23:30' }, // 晚于 18:00 → 可能触发取车窗口冲突
});
```

**注意：** PATCH 成功后若 `tripSynced: true`，后端已同步 Trip 并重写 Ontology 事实；若改了车辆/日期，看 `candidatesStatus` 是否为 `STALE`，需 regenerate。

### 2.4 字段 → 后端行为（给 UI 文案用）

| 字段 | 用户看到什么 | 后端 Ontology 效果 |
|------|--------------|-------------------|
| `mobilityContext.vehicleType` | 2WD / 4WD | `RentalVehicle` drivetrain；2WD 默认合同禁止 F 路 |
| `insuranceContext.coverageTier` | 基础 / 标准 / 全险 / 尚未确认 | `InsurancePolicy` 覆盖/除外条款 |
| `rentalContext.pickupTimeLocal` | 首日几点取车 | 合成 `Flight.scheduledArrival`，与柜台 08–18 比对 |
| `rentalContext.afterHoursPickupConfirmed` | 是否已确认夜间取车 | `rental.afterHoursPickupConfirmed` |
| 选路 `remote-highlands-south` + 2WD | （选路后 check） | F208 能力 vs 2WD → 车辆/合同 BLOCK |
| 选路 `depth-south-coast` | （选路后 check） | 涉水路段 + 标准保险 → 保险 WARNING |

---

## 3. 可靠性闭环 — check / issues

### 3.1 跑检查

```typescript
const result = await runFeasibilityCheck(token, scenarioId);
if (result.mode === 'sync') {
  const { job, issues } = result;
  // job.result.verdictStatus
  // job.result.blockerIssueCount   ← 全量 BLOCK 数（可信）
  // job.result.ontologyIssueCount  ← Ontology 问题数
  // issues.displayedIssues         ← 按 displayPolicy 截断后的卡片（可能只有 1 条）
}
```

异步模式：`result.mode === 'async'` → `waitForCheckJob(token, jobId)`。

### 3.2 Issues 响应结构

```typescript
interface IssuesView {
  displayedIssues: ConsumerIssue[];  // 当前页展示（研究协议 maxIssues=1）
  totalIssueCount: number;
  gatewayIssueCount?: number;        // Decision Gateway 队列
  unresolvedPoiIssueCount?: number;  // CPRE 待确认 POI
  ontologyIssueCount?: number;       // Ontology Snapshot（NEW）
  blockerIssueCount?: number;        // 全量 BLOCK，不受截断（NEW · 判断能否继续用这个）
  displayPolicy: { maxIssues: number; preferredSeverity: string };
}
```

### 3.3 问题卡片 — 来源识别（复制 helpers）

```typescript
import {
  isOntologyConsumerIssue,
  isCprePoiConsumerIssue,
  getExplorationIssueSourceKind,
  formatExplorationIssuesSummary,
} from './frontend-exploration-api.helpers';

for (const issue of issues.displayedIssues) {
  if (isOntologyConsumerIssue(issue)) {
    // issue.issueId === 'ontology:VEHICLE_CAPABILITY_MISMATCH'
    // Badge 建议：「行程约束」
  } else if (isCprePoiConsumerIssue(issue)) {
    // issueId 前缀 cpre-poi-
    // Badge：「待确认地点」
  } else {
    // Gateway 决策队列问题 → 可走 repair options
  }
}

// 页眉摘要示例：「共 3 项 · 2 项阻断 · 1 项本体约束」
formatExplorationIssuesSummary(issues);
```

### 3.4 常见 Ontology issueId → UI 建议

| issueId | severity | 用户话术方向 |
|---------|----------|--------------|
| `ontology:VEHICLE_CAPABILITY_MISMATCH` | BLOCK | 当前车辆无法走所选高地/F 路段 |
| `ontology:RENTAL_CONTRACT_ROAD_PROHIBITION` | BLOCK | 租车合同禁止进入该类道路 |
| `ontology:ENTRY_ELIGIBILITY_UNKNOWN` | BLOCK | 入境/签证状态未确认 |
| `ontology:VISA_STATUS_UNCONFIRMED` | VERIFY | 需补充签证证据 |
| `ontology:INSURANCE_WATER_CROSSING_GAP` | CONFLICT | 保险涉水保障未确认 |
| `ontology:INSURANCE_UNDERCARRIAGE_UNKNOWN` | VERIFY | 底盘保障未确认 |
| `ontology:RENTAL_PICKUP_WINDOW_CONFLICT` | BLOCK | 到达时间晚于柜台营业 |
| `ontology:AFTER_HOURS_PICKUP_UNCONFIRMED` | CONFLICT | 未确认夜间取车安排 |

### 3.5 决策 / 修复（重要限制）

```typescript
// ✅ Gateway / CPRE POI 问题 — 有 repair flow
await fetchRepairOptions(token, scenarioId, issueId);
await submitDecision(...);
await applyDecision(...);

// ⚠️ Ontology 问题（issueId 以 ontology: 开头）
// 当前无独立 repair API — 引导用户回条件页改车辆/保险/取车时间，或换路线后 revalidate
if (isOntologyConsumerIssue(issue)) {
  // CTA: 「调整旅行条件」→ patchScenarioConditions
  // 或: 「更换路线」→ 重新 selections + check
}
```

### 3.6 Revalidate 判断是否通过

```typescript
const { revalidation, issues } = await revalidate(token, scenarioId);
// revalidation.status === 'PASSED' | 'FAILED'
// 后端依据 issues.blockerIssueCount > 0，不是 totalIssueCount
```

---

## 4. Travel Context（Agent / 全景侧栏）

探索场景 **`contextId === scenarioId`**（materialize 后）。

```typescript
import { fetchTravelContextView } from '@/travel-context/client/travel-context-api-client';

// 探索视图 — Ontology 摘要
const { data } = await fetchTravelContextView<TravelContextExplorationView>(
  token,
  scenarioId,
  'exploration',
);
// data.planExecutability
// data.ontologyConstraints?.blockerCount / codes[]
// data.ontologyIssueCount
// data.ontologyBlockerCount

// 可行性视图
const feasibility = await fetchTravelContextView<TravelContextFeasibilityView>(
  token,
  scenarioId,
  'feasibility',
);
```

或使用 Provider 预取：

```typescript
createTravelContextProvider({
  contextId: scenarioId,
  token,
  prefetchViews: ['exploration', 'feasibility'],
});
```

---

## 5. 推荐 UI 状态机（检查页）

```text
POST /check
  ├─ job.result.blockerIssueCount === 0  → 绿色「当前未发现阻断问题」
  └─ job.result.blockerIssueCount > 0
       ├─ ontologyIssueCount > 0 && gatewayIssueCount === 0
       │    → 提示「请调整旅行条件或路线」（diagnosis 可能为 ONTOLOGY_CONSTRAINT_BLOCK）
       ├─ unresolvedPoiIssueCount > 0
       │    → 「请先确认地点」
       └─ gatewayIssueCount > 0
            → 进入决策修复流
```

**不要**用 `displayedIssues.length` 或 `totalIssueCount` 单独判断能否继续 — 研究协议 `displayPolicy.maxIssues = 1` 会截断。

---

## 6. 冰岛 Demo 走通路径（联调）

1. 创建 IS scenario，`2WD` + `STANDARD` 保险 + 取车 `10:00`
2. materialize → principles → candidates → 选 **`remote-highlands-south`**
3. `POST .../check`
4. 期望 `issues` 含 `ontology:VEHICLE_CAPABILITY_MISMATCH` 或 `ontology:RENTAL_CONTRACT_ROAD_PROHIBITION`
5. 改 `patchScenarioConditions` → `4WD_SUV` → `revalidate` → `blockerIssueCount` 应下降

**取车冲突 Demo：** `rentalContext.pickupTimeLocal: '23:30'` → 期望 `ontology:RENTAL_PICKUP_WINDOW_CONFLICT`。

---

## 7. 环境依赖（联调前确认）

| 变量 | 必需 |
|------|------|
| `DECISION_GATEWAY_UNIFIED=1` | ✅ 可靠性闭环 |
| `EXPLORATION_CONSUMER_MVP_ENABLED=1` | ✅ Consumer 条件页 |
| `RESEARCH_PAYMENT_*` / Stripe | ❌ MVP 不接 |

---

## 8. 文件清单（复制到前端工程）

| 文件 | 用途 |
|------|------|
| `frontend-exploration-api-client.ts` | 全部 REST 调用 |
| `frontend-exploration-api.types.ts` | TS 类型 |
| `frontend-exploration-api.helpers.ts` | issue 来源 / 摘要文案 |
| `travel-context-api-client.ts` | RFC-003 views |
| `travel-context-api.types.ts` | `TravelContextExplorationView` 等 |

更完整页面流见 [frontend-integration-guide.md](./frontend-integration-guide.md)。
