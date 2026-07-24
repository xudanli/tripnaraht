# 冰岛自驾 TEP — Web P1 对接说明

**受众：** Plan Studio / Web 前端  
**范围：** P1 — 自驾约束编辑 + Schedule 节点弹性 + 与 P0 诊断联动  
**前置：** [TEP-SELF-DRIVE-WEB-P0-INTEGRATION.md](./TEP-SELF-DRIVE-WEB-P0-INTEGRATION.md)（必须先完成 P0 读模型）  
**约束能力白名单：** [CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md](../product/CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md)（P1 写入须对齐 Constraint/TEP 双源）  
**下一步：** [TEP-SELF-DRIVE-WEB-P2-INTEGRATION.md](./TEP-SELF-DRIVE-WEB-P2-INTEGRATION.md)（行中执行页）  
**Base URL：** `{host}/api`

---

## 1. P1 交付定义

| 做 | 不做 |
|----|------|
| **自驾设置**表单（车型、夜驾、驾驶经验、单日上限） | 重写 constraints 全量编辑器 |
| 活动/住宿 **弹性标签** 写入 | SDR-102/103 UI |
| Schedule **按日角标**（读 P0 `executability`） | 规划期 TEP 写回 |
| 保存后 **validate → executability refresh** | 新建独立「规则配置」页 |

**依赖 P0：** 任何 P1 写操作成功后，都应刷新 `GET /executability?refresh=true`，让用户看到 `profile` / `repairPreviews` / `planningDecisionProblems` 变化。

---

## 2. P1 接口清单

| # | 方法 | 路径 | 用途 |
|---|------|------|------|
| W1 | PUT | `/trips/{tripId}` | 写入 `metadata`（车型、夜驾、驾驶经验）— **自驾 Profile 主路径** |
| W2 | PUT | `/trips/{tripId}/intent` | 写入 `pacingConfig`（含扩展字段 `maxDailyDriveMinutes` / `noNightDriving`） |
| W3 | PATCH | `/trips/{tripId}/constraints/{constraintId}` | Legacy 统一约束（如 `c_no_night_drive`）— 可选 |
| W4 | PATCH | `/itinerary-items/{itemId}` | 写入活动 `_tep` 弹性（`note` JSON） |
| W5 | GET | `/trips/{tripId}/schedule-timeline` | ScheduleTab 聚合（P1 角标仍来自 executability） |
| R1 | POST | `/trips/{tripId}/feasibility-report/validate` | 写后校验 |
| R2 | GET | `/trips/{tripId}/executability?refresh=true` | 写后刷新 TEP（P0） |
| R3 | PATCH | `/trips/{tripId}/constraints/confirm` | 约束确认（与 P0 门控联动） |

---

## 3. 模块 A — 自驾设置（SelfDriveSettings）

### 3.1 读：从哪展示当前值

**主接口：** `GET /executability` → `data.profile`

```typescript
interface SelfDriveProfileView {
  vehicle: {
    vehicleType: '2WD' | '4WD' | 'AWD' | 'CAMPERVAN' | 'OTHER';
    vehicleSource: string; // EXPLORATION | TRIP_METADATA | USER_DECLARED | PACK_DEFAULT ...
  };
  drivingPolicy: {
    nightDrivingAllowed: boolean;
    nightDrivingPreference: 'AVOID' | 'ALLOW_WITH_CAUTION' | 'ALLOW';
    maxDailyDriveMinutes?: number;
  };
  drivers: Array<{
    driverId: string;
    experienceLevel: 'NOVICE_ABROAD' | 'INTERMEDIATE' | 'EXPERIENCED';
  }>;
}
```

**辅助：** `GET /trips/{tripId}` → `data.metadata` / `data.pacingConfig`（编辑表单初始值）

**提示文案：**

| `vehicle.vehicleSource` | UI 提示 |
|-------------------------|---------|
| `PACK_DEFAULT` | 「当前按默认 2WD 评估，请确认租车车型」 |
| `USER_DECLARED` / `TRIP_METADATA` | 无额外提示 |
| `EXPLORATION` | 「来自探索条件」 |

### 3.2 写：推荐路径 `PUT /trips/{tripId}`

`metadata` **深合并**，不会覆盖其它键（如 `explorationInput`）。

```http
PUT /api/trips/{tripId}
Content-Type: application/json
Authorization: Bearer <token>
```

```json
{
  "metadata": {
    "vehicleDeclaredByUser": true,
    "constraints": {
      "vehicle_type": "4WD",
      "noNightDrive": {
        "enabled": true
      },
      "maxDailyDriveMinutes": 480
    },
    "driverExperienceLevel": "INTERMEDIATE"
  }
}
```

| 表单字段 | 写入路径 | TEP 消费 |
|----------|----------|----------|
| 车型 | `metadata.constraints.vehicle_type` | `2WD` `4WD` `AWD` `CAMPERVAN` | SDR-001 |
| 用户已确认车型 | `metadata.vehicleDeclaredByUser: true` | → `vehicleSource: USER_DECLARED` |
| 尽量避免夜驾 | `metadata.constraints.noNightDrive.enabled: true` | SDR-202 |
| 单日驾驶上限（分钟） | `metadata.constraints.maxDailyDriveMinutes` | SDR-101 |
| 驾驶经验 | `metadata.driverExperienceLevel` | 负荷等效加成 |

**双源对齐（P0 工程债）：** 约束引擎 `c_max_daily_drive` 读 `metadata.constraints.maxDailyDrivingHours`（**小时**）；TEP 读 **分钟**。Compiler 落地前，保存单日上限时 **建议同时写** `maxDailyDriveMinutes` 与 `maxDailyDrivingHours = minutes / 60`，或改 `PATCH c_max_daily_drive` 与 P1 表单同一入口。见 [CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md](../product/CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md) §3。

**车型枚举（写入）：** `2WD` | `4WD` | `AWD` | `CAMPERVAN`（与 TEP 归一化一致，勿传 `2WD_COMPACT_SUV` 到 metadata 路径）

### 3.3 写：补充路径 `PUT /trips/{tripId}/intent`

用于与现有「意图/节奏」面板共存；`pacingConfig` 会强制 `travelMode: DRIVING`。

```json
{
  "pacingConfig": {
    "travelMode": "DRIVING",
    "noNightDriving": true,
    "maxDailyDriveMinutes": 480
  }
}
```

> `UpdateIntentRequestDto` 未在 Swagger 列出 `noNightDriving`，但服务端 `spread` 合并 pacingConfig，**JSON 可写入**。写后 `constraintsVersion` +1，需重新 confirm。

**响应含约束快照：**

```typescript
{
  success: true,
  data: {
    trip: { ... },
    constraints: {
      constraintsVersion: number;
      constraintsConfirmedAt: string | null;
      constraintsConfirmedBy: string | null;
    }
  }
}
```

### 3.4 写：可选 Legacy 约束 API

若 Plan Studio 已有 **统一约束编辑器**，可复用：

```http
PATCH /api/trips/{tripId}/constraints/c_no_night_drive
```

```json
{
  "status": "ACTIVE",
  "value": { "maxMinutesAfterSunset": 0 },
  "constraintsVersion": 3
}
```

详见 [TRAVEL_DECISION_CONTRACT_FRONTEND_API.md](../../src/trips/trip-constraint-solver/TRAVEL_DECISION_CONTRACT_FRONTEND_API.md)。

**TEP 与 Legacy 关系：** 两条路径都可影响夜驾；**优先用 3.2 metadata 路径**（与 `SelfDriveProfile` resolver 直接对齐）。

### 3.5 UI 布局建议

放在现有 **约束面板** 内新增分组「自驾执行设置」（不要替代 budget/travelers/time_range 四卡）：

```
约束摘要 (constraints-summary)
├── 日期 / 预算 / 成员  （已有）
└── 自驾执行设置  （P1 新增）
      ├── 车型 [2WD|4WD|AWD|房车]
      ├── [ ] 尽量避免夜间驾驶
      ├── 单日驾驶上限（可选，分钟）
      └── 驾驶经验 [新手|中级|老手]
      [保存] → PUT /trips → validate → executability refresh
```

### 3.6 保存后刷新

```typescript
async function saveSelfDriveSettings(tripId: string, token: string, body: PutTripMetadataBody) {
  await fetch(`${API}/trips/${tripId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await fetch(`${API}/trips/${tripId}/feasibility-report/validate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return fetchExecutability(tripId, { refresh: true, token }); // P0 封装
}
```

保存成功后：

1. `constraints-summary` 的 `constraintsVersion` 可能 +1 → `isVersionConfirmed` 变 false  
2. P0 状态条 / `repairPreviews` / `planningDecisionProblems` 应更新  
3. 若之前已 confirm，提示用户「约束已变更，请重新确认」

### 3.7 规划期 DecisionProblem（`planningDecisionProblems[]`）

**何时有值：** `repairPreviews.length > 0`（通常 `assessment.status === 'REQUIRES_REPAIR'`）。

**与 `repairPreviews` 的关系：**

| 字段 | 用途 |
|------|------|
| `repairPreviews[]` | P0 最小卡片：单选项模拟效果（loadTier / statusAfter / description） |
| `planningDecisionProblems[]` | P1 完整决策卡：**reason + impact + options[]**（对齐行中 adjustment-queue 语义） |

**类型（裁剪）：**

```typescript
interface PlanningTepDecisionProblem {
  problemId: string;              // tep_planning:{tripId}:{ruleId}:{dayRef}
  phase: 'PLANNING';
  triggerRuleIds: string[];       // 如 ['SDR-101']
  reason: string;                 // 规则 explanation
  impact: {
    summary: string;
    loadTierBefore?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    loadTierAfter?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    statusBefore: ExecutabilityStatus;
    statusAfter: ExecutabilityStatus;
    affectedRefs: string[];
    minutesReleased?: number;
  };
  options: Array<{
    optionId: string;             // 写回时 intervention-tep-{optionId}
    action: 'REMOVE' | 'REPLACE' | 'SHIFT' | 'REROUTE';
    label: string;
    description: string;
    targetRefs: string[];
    recommended: boolean;
    replacementPoiId?: string;    // REPLACE 预计算 POI
  }>;
  recommendedOptionId?: string;
}
```

**UI 建议：**

- 一问题一卡（按 `problemId`）；卡内列出 `options[]`，默认高亮 `recommendedOptionId`
- 卡头展示 `reason`；卡体展示 `impact.summary` + 负荷/状态变化
- P1 **仍只读**；规划期写回调 P2 `intervention-tep-*` accept（与 P0 一致）

**curl 抽检：**

```bash
curl -s "$API/trips/$TRIP_ID/executability?refresh=true" -H "Authorization: Bearer $TOKEN" \
  | jq '.data.planningDecisionProblems'
```

---

## 4. 模块 B — 活动/住宿弹性（Schedule 节点）

### 4.1 为什么写 `note` 而不是单独 TEP API

TEP 投影器从 **`ItineraryItem.note`** 解析 `_tep` 命名空间（过渡方案，契约见工程文档 §11.2）。

```http
PATCH /api/itinerary-items/{itemId}
Content-Type: application/json
```

### 4.2 `note` JSON 结构（冻结）

```typescript
interface ItineraryItemNoteJson {
  userNote?: string;   // 用户可见备注，纯文本
  _tep: {
    schemaVersion: '1.0';
    importance?: 'MANDATORY' | 'RECOMMENDED' | 'OPTIONAL';
    flexibility?: 'FIXED' | 'MOVABLE' | 'REPLACEABLE' | 'REMOVABLE';
    weatherSensitive?: boolean;
    weatherFallbackPoiId?: string;   // REPLACE 预计算 POI（高级）
    latestArrival?: string;          // 住宿：最晚到店 HH:mm 或 ISO
    routeSegmentId?: string;         // 可选，路段绑定
    mustDo?: boolean;
  };
}
```

**示例 — 可选可删景点：**

```json
{
  "note": "{\"userNote\":\"黑沙滩停留\",\"_tep\":{\"schemaVersion\":\"1.0\",\"importance\":\"OPTIONAL\",\"flexibility\":\"REMOVABLE\"}}"
}
```

**示例 — 固定预约活动：**

```json
{
  "note": "{\"_tep\":{\"schemaVersion\":\"1.0\",\"importance\":\"MANDATORY\",\"flexibility\":\"FIXED\"}}",
  "startTime": "2026-07-15T16:00:00.000Z",
  "endTime": "2026-07-15T17:30:00.000Z"
}
```

**示例 — 天气敏感 + 预计算备选：**

```json
{
  "note": "{\"userNote\":\"冰川徒步\",\"_tep\":{\"schemaVersion\":\"1.0\",\"importance\":\"RECOMMENDED\",\"flexibility\":\"REPLACEABLE\",\"weatherSensitive\":true,\"weatherFallbackPoiId\":\"poi_indoor_museum\"}}"
}
```

**示例 — 酒店最晚到店：**

```json
{
  "note": "{\"_tep\":{\"schemaVersion\":\"1.0\",\"importance\":\"MANDATORY\",\"flexibility\":\"FIXED\",\"latestArrival\":\"22:00\"}}"
}
```

### 4.3 前端辅助函数

```typescript
const TEP_NOTE_VERSION = '1.0' as const;

export function buildTepItemNote(input: {
  userNote?: string;
  importance?: 'MANDATORY' | 'RECOMMENDED' | 'OPTIONAL';
  flexibility?: 'FIXED' | 'MOVABLE' | 'REPLACEABLE' | 'REMOVABLE';
  weatherSensitive?: boolean;
  weatherFallbackPoiId?: string;
  latestArrival?: string;
}): string {
  const payload: Record<string, unknown> = {
    _tep: {
      schemaVersion: TEP_NOTE_VERSION,
      ...(input.importance ? { importance: input.importance } : {}),
      ...(input.flexibility ? { flexibility: input.flexibility } : {}),
      ...(input.weatherSensitive ? { weatherSensitive: true } : {}),
      ...(input.weatherFallbackPoiId ? { weatherFallbackPoiId: input.weatherFallbackPoiId } : {}),
      ...(input.latestArrival ? { latestArrival: input.latestArrival } : {}),
    },
  };
  if (input.userNote?.trim()) payload.userNote = input.userNote.trim();
  return JSON.stringify(payload);
}

/** 解析现有 note 供编辑表单回填 */
export function parseTepItemNoteForForm(note?: string | null) {
  if (!note?.trim()) return { userNote: '', tep: {} };
  if (!note.trim().startsWith('{')) return { userNote: note, tep: {} };
  try {
    const raw = JSON.parse(note) as { userNote?: string; _tep?: Record<string, unknown> };
    return { userNote: raw.userNote ?? '', tep: raw._tep ?? {} };
  } catch {
    return { userNote: note, tep: {}, degraded: true };
  }
}
```

### 4.4 用户向标签 ↔ TEP 映射

在 **活动编辑抽屉** 增加「行程弹性」区（单选或组合）：

| 用户选项 | importance | flexibility |
|----------|------------|-------------|
| 必去 · 固定预约 | MANDATORY | FIXED |
| 必去 · 时间可挪 | MANDATORY | MOVABLE |
| 推荐 · 可删 | RECOMMENDED | REMOVABLE |
| 可选 · 可替换 | OPTIONAL | REPLACEABLE |
| 天气敏感 | + `weatherSensitive: true` | — |

**默认（未写 `_tep` 时后端启发式）：**

| 条件 | 默认 |
|------|------|
| 有预约 / BOOKED | MANDATORY + FIXED |
| 当晚唯一住宿 | MANDATORY + FIXED |
| 普通景点 | RECOMMENDED + REMOVABLE |
| 餐厅 | OPTIONAL + REPLACEABLE |

用户显式保存 `_tep` 后 **覆盖**启发式。

### 4.5 保存后刷新

```typescript
async function saveItemTepTags(itemId: string, token: string, patch: {
  note: string;
  startTime?: string;
  endTime?: string;
}) {
  await fetch(`${API}/itinerary-items/${itemId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  // 由 Schedule 容器统一触发 trip 级 refresh
}
```

Schedule 容器在任意 item PATCH 成功后：

```
POST feasibility-report/validate → GET executability?refresh=true
```

预期变化：

- `dailyDrivePlans[].activities[].flexibility` 更新  
- `repairPreviews` 可能新增/减少可删节点  
- SDR-301「无弹性节点」类 finding 可能消失  

---

## 5. 模块 C — Schedule 按日角标（读增强）

不新增接口；在 **P0 按日卡** 逻辑上，把角标挂到 `schedule-timeline` 的 day header。

```typescript
// 已有
const timeline = await fetchScheduleTimeline(tripId);
const exec = await fetchExecutability(tripId);

// dayIndex 与 timeline.days[].dayIndex 对齐（1-based）
function riskBadgeForDay(dayIndex: number, exec: TripExecutabilityView) {
  const plan = exec.dailyDrivePlans.find((d) => d.dayIndex === dayIndex);
  const findings = exec.assessment.findings.filter((f) =>
    f.affectedRefs.some((r) => r === `day_${dayIndex}` || r.includes(`day_${dayIndex}`)),
  );
  const maxSeverity = findings.reduce((m, f) => Math.max(m, SEVERITY_WEIGHT[f.severity]), 0);
  return { plan, findings, maxSeverity };
}
```

| Day header 展示 | 来源 |
|-----------------|------|
| `HIGH` / `EXTREME` 负荷 | 当日 findings / ruleResults |
| ⚠ 最脆弱 | P0 `isVulnerableDay` |
| 弹性 0 | `plan.activities` 无 REMOVABLE/REPLACEABLE |
| 天气敏感 n | count `weatherSensitive` |

点击角标 → 展开 P0 `DayRiskCard` 或滚到诊断区。

---

## 6. 约束确认联动（P0 + P1）

```typescript
async function confirmPlanningConstraints(tripId: string, token: string) {
  const summary = await fetchConstraintsSummary(tripId, token);
  const res = await fetch(`${API}/trips/${tripId}/constraints/confirm`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ constraintsVersion: summary.constraintsVersion }),
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error?.code); // CONSTRAINTS_NOT_READY | CONSTRAINTS_STALE
  return body.data;
}
```

**确认行程按钮（完整门控）：**

```typescript
const [summary, exec] = await Promise.all([
  fetchConstraintsSummary(tripId, token),
  fetchExecutability(tripId, { token }),
]);

const canConfirm =
  summary.allReady &&
  summary.isVersionConfirmed !== false && // 或用户刚 confirm 完
  exec.ui.canCommit;
```

---

## 7. 页面布局（P0 + P1）

```
Plan Studio
├── ExecutabilityStrip + Findings + DayRisk + RepairPreview   [P0]
├── 约束摘要 constraints-summary                            [已有]
│     └── 自驾执行设置 SelfDriveSettings                     [P1-A]
├── ScheduleTab (schedule-timeline)                         [已有]
│     ├── DayHeader + riskBadge                             [P1-C]
│     └── ItemDrawer + TepFlexibilityTags                   [P1-B]
└── planning-conflicts                                      [已有，保留]
```

---

## 8. 类型汇总（P1 新增）

```typescript
/** PUT /trips/{id} body 片段 */
interface PutTripSelfDriveMetadata {
  metadata: {
    vehicleDeclaredByUser?: boolean;
    driverExperienceLevel?: 'NOVICE_ABROAD' | 'INTERMEDIATE' | 'EXPERIENCED';
    constraints?: {
      vehicle_type?: '2WD' | '4WD' | 'AWD' | 'CAMPERVAN';
      noNightDrive?: { enabled?: boolean; maxMinutesAfterSunset?: number };
      maxDailyDriveMinutes?: number;
    };
  };
}

/** PATCH /itinerary-items/{id} */
interface PatchItineraryItemTep {
  note?: string;
  startTime?: string;
  endTime?: string;
  cascadeMode?: 'auto' | 'none';
}
```

---

## 9. curl 自测

```bash
TOKEN="<jwt>"
TRIP="<uuid>"
BASE="http://127.0.0.1:3002/api"
ITEM="<itinerary-item-uuid>"

# 写车型
curl -s -X PUT "$BASE/trips/$TRIP" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"metadata":{"vehicleDeclaredByUser":true,"constraints":{"vehicle_type":"4WD","noNightDrive":{"enabled":true}}}}' \
  | jq '.success'

# 写活动弹性
NOTE='{"userNote":"测试","_tep":{"schemaVersion":"1.0","importance":"OPTIONAL","flexibility":"REMOVABLE"}}'
curl -s -X PATCH "$BASE/itinerary-items/$ITEM" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg n "$NOTE" '{note: $n}')" \
  | jq '.success'

# 刷新 TEP
curl -s "$BASE/trips/$TRIP/executability?refresh=true" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data | {profile: .profile.vehicle, previews: .repairPreviews}'
```

---

## 10. P1 验收清单

### 自驾设置

- [ ] 表单展示 `executability.profile` 当前值
- [ ] `PACK_DEFAULT` 时展示「请确认车型」提示
- [ ] 保存走 `PUT /trips` metadata 深合并
- [ ] 保存后 validate + executability refresh
- [ ] 变更后 constraints 确认态清除有提示

### 活动弹性

- [ ] 编辑抽屉有「弹性」用户向选项
- [ ] 保存写 `note` JSON `_tep` 命名空间
- [ ] 保留 `userNote` 不覆盖用户备注
- [ ] 保存后 repairPreviews / 按日弹性计数变化可观测

### Schedule 角标

- [ ] day header 展示 P0 风险 tier / 最脆弱标记
- [ ] 角标数据来自 executability，非前端推算 SDR

### 不做

- [ ] 规划期 `tep-repairs/accept`
- [ ] 本地计算驾驶负荷
- [ ] 替换整个 constraints-summary 为 TEP

---

## 11. 相关文档

| 文档 | 用途 |
|------|------|
| [TEP-SELF-DRIVE-WEB-P0-INTEGRATION.md](./TEP-SELF-DRIVE-WEB-P0-INTEGRATION.md) | P0 读模型 |
| [TEP-SELF-DRIVE-WEB-P2-INTEGRATION.md](./TEP-SELF-DRIVE-WEB-P2-INTEGRATION.md) | P2 行中双页 + TEP 写回 |
| [TEP-SELF-DRIVE-WEB-P3-INTEGRATION.md](./TEP-SELF-DRIVE-WEB-P3-INTEGRATION.md) | P3 总览 + Slip + 决策卡 |
| [TEP-SELF-DRIVE-FRONTEND-HANDOFF.md](./TEP-SELF-DRIVE-FRONTEND-HANDOFF.md) §2 约束体系 |
| [docs/backend-handoff-planning-constraints-p0.md](../../docs/backend-handoff-planning-constraints-p0.md) | constraints-summary / confirm |
| [docs/backend-handoff-schedule-timeline-p0.md](../../docs/backend-handoff-schedule-timeline-p0.md) | schedule-timeline |
| [src/trips/tep/utils/tep-item-note.parser.ts](../../src/trips/tep/utils/tep-item-note.parser.ts) | note 解析 SSOT |

---

## 12. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-12 | Web P1：自驾 Profile 写入 + item `_tep` + Schedule 角标 |
