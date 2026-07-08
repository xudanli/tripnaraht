# 执行阶段 · 前端接入说明

**后端仓库：** 本文档供前端仓库 `/dashboard/execute` 联调使用。  
**Global prefix：** `/api`  
**统一响应：** `{ success: boolean, data?: T, error?: { code, message } }`

---

## 1. Plan B 应用（T-04）

### API

```
POST /api/trips/:tripId/in-trip/execution-advisory/recommendations/:recommendationId/apply
```

### 请求体

```typescript
interface ApplyExecutionRecommendationRequest {
  confirm: true;
  clientTimestamp?: string; // ISO 8601
}
```

### 响应体

```typescript
interface ApplyExecutionRecommendationResponse {
  applied: boolean;
  executionAdvisory: TripExecutionAdvisoryDto;
  scheduleMutations: Array<{
    type: 'SHORTEN_STAY' | 'SKIP_ITEM' | 'REPLACE_ITEM';
    itemId: string;
    deltaMinutes?: number;
  }>;
  updatedSchedule: {
    date: string;
    schedule: {
      items: Array<{
        placeId: number | string;
        placeName: string;
        startTime: string;
        endTime: string;
        status?: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
      }>;
    };
  };
}
```

### 错误码

| code | 场景 | 前端处理 |
|------|------|----------|
| `RECOMMENDATION_NOT_FOUND` | id 无效 | toast + 重新 GET advisory |
| `RECOMMENDATION_EXPIRED` | validUntil 已过 | 重新 GET advisory 后展示新方案 |
| `RECOMMENDATION_NO_OP` | actionType=keep | 不调用 apply；按钮 disabled 或隐藏 |
| `WRITE_CHAIN_BLOCKED` | 决策写链开启（`EFFECTIVE_PLAN_WRITE_CHAIN=1` 或 production） | `handleWriteChainBlockedError` → 决策空间 |
| *(成功)* | 写链关闭（dev 默认） | `applied: true` + 刷新 advisory / schedule |

**写链开关：** dev 默认直写可用；开启写链后 shorten/skip/replace 均返回 `WRITE_CHAIN_BLOCKED`（replace 在无 env radar 替代方案时亦同）。

### `src/api/trip-constraint-solver.ts` 建议

```typescript
export async function applyExecutionRecommendation(
  tripId: string,
  recommendationId: string,
  body: { confirm: true; clientTimestamp?: string },
) {
  const res = await apiClient.post<ApplyExecutionRecommendationResponse>(
    `/trips/${tripId}/in-trip/execution-advisory/recommendations/${recommendationId}/apply`,
    body,
  );
  if (!res.success) throw new ApiError(res.error);
  return res.data;
}
```

### `ExecuteDecisionSidebar.onApplyPlan` 接入示例

```typescript
async function onApplyPlan(plan: ExecutionRecommendationDto) {
  if (plan.actionType === 'keep') {
    toast.info('当前方案为保持原计划，无需应用');
    return;
  }

  try {
    const result = await applyExecutionRecommendation(tripId, plan.id, {
      confirm: true,
      clientTimestamp: new Date().toISOString(),
    });

    // 立即刷新右栏 / 顶栏（无需等 30s 轮询）
    queryClient.setQueryData(
      executionAdvisoryKeys.detail(tripId),
      result.executionAdvisory,
    );

    // 同步当日时间线
    if (result.updatedSchedule?.date) {
      queryClient.setQueryData(
        scheduleKeys.day(tripId, result.updatedSchedule.date),
        result.updatedSchedule,
      );
    }

    toast.success('方案已应用，行程已更新');
  } catch (e) {
    if (handleWriteChainBlockedError(e)) return;
    if (e.code === 'RECOMMENDATION_EXPIRED') {
      toast.warning('建议已过期，正在刷新…');
      await refetchExecutionAdvisory();
      return;
    }
    toast.error(e.message ?? '应用失败');
  }
}
```

---

## 2. 地点关键证据（T-05）

### API

```
GET /api/places/:placeId/evidence?date=YYYY-MM-DD&includeWeather=true&includeTraffic=true
```

### 响应 SSOT

对齐 `src/types/place-evidence.ts` → `PlaceEvidenceResponse`

**增强点（2026-07-07）：**

- `date` 参数驱动 `OpeningHoursUtil.getHoursForDate`（非仅 today）
- `businessHours.exceptions` 按 `date` 过滤
- 有 PostGIS 坐标时优先 Open-Meteo 逐日预报（含 `wind.speed` m/s）
- 无实时预报时降级 `Place.metadata.weather`

### `loadPlaceEvidence` 示例

```typescript
export async function loadPlaceEvidence(placeId: number, date?: string) {
  const res = await placesApi.getEvidence(placeId, {
    date: date ?? format(new Date(), 'yyyy-MM-dd'),
    includeWeather: true,
    includeTraffic: true,
  });
  if (!res.success) {
    if (res.error?.code === 'NOT_FOUND') {
      return { empty: true, message: '暂无该地点证据' };
    }
    throw new ApiError(res.error);
  }
  return res.data;
}
```

**空态：** 404 时展示明确文案，勿静默忽略。

---

## 3. 读模型轮询（T-01 / T-02）

```typescript
useQuery({
  queryKey: executionAdvisoryKeys.detail(tripId),
  queryFn: () => tripConstraintSolverApi.getExecutionAdvisory(tripId),
  enabled: trip?.status === 'TRAVELING' && inTripExecutionEnabled,
  refetchInterval: 30_000,
});
```

**causalInsight Tier-3 规则：**

- `advisory.causalInsight.causalStory.chain.length >= 3` → 不拉 `GET .../causal-trace`
- 仅 `linkedProblemId` 无 chain → 懒拉 Tier-3

---

## 4. nextStop 导航（T-03）

```
GET /api/trips/:tripId/state
GET /api/trips/:tripId/state?now=2026-07-16T10:00:00Z   // 可选，覆盖「当前时刻」
```

**TRAVELING 行程：** 即使服务器日历日不在行程日期内，也会按行中逻辑日（`resolveTripDayNumber`）fallback 到对应 `TripDay`，并返回带 `Place.latitude/longitude` 的 `nextStop`。前端**无需**再传 `?now=` 才能导航。

```typescript
const { data: state } = useTripState(tripId);
const lat = state?.nextStop?.Place?.latitude;
const lng = state?.nextStop?.Place?.longitude;
const eta = state?.nextStop?.estimatedArrivalTime ?? state?.eta;
```

`estimatedArrivalTime` 已叠加 `metadata.inTripDelayMinutes`。

---

## 5. 联调检查清单

- [ ] Live 右栏 Plan B 来自 `recommendations[]`，非 `DEFAULT_PLANS`
- [ ] 「应用此方案」调用 POST apply，成功后刷新 advisory + schedule
- [ ] 因果链 Tab 有 `chain[]` 时不请求 causal-trace
- [ ] 下一步卡片 `latitude/longitude` 非空，Maps 导航可用
- [ ] 证据面板 404 有空态；冰岛场景顶栏可展示 `evidence.weatherWindow.wind.speed`

---

## 6. 后端联调脚本（本仓库）

**前置：** 服务运行在 `:3000`，`.env` 中 `IN_TRIP_EXECUTION_ENABLED=true`

```bash
# 注入强风演示数据（首次）
npm run seed:execute-strong-wind -- 1ae5cd8b-84ba-457d-9e0b-50ac3813a104 --wind-mps=22

# MVP：T-01 ~ T-05 + apply shorten/keep
npm run test:execute-phase-mvp

# Legacy：T-06 ~ T-08 Neptune
npm run test:execute-phase-legacy

# 全部
npm run test:execute-phase
```

**环境变量：**

| 变量 | 默认 | 说明 |
|------|------|------|
| `TRIP_ID` | `1ae5cd8b-...` | 冰岛 TRAVELING 演示行程 |
| `STATE_NOW` | *(可选)* `2026-07-16T10:00:00Z` | 仅用于显式覆盖 state 时刻；fallback 用例不依赖 |
| `TEST_WRITE_CHAIN` | `1` | 在写链开启的服务上验证 `WRITE_CHAIN_BLOCKED` |
| `PLACE_ID` | 从 nextStop 推断 | place evidence |

**2026-07-07 联调结果摘要：**

| 分组 | 接口 | 状态 |
|------|------|------|
| MVP | execution-advisory / state / place evidence / apply | ✅ |
| Legacy | execute (status/remind/change/fallback) | ✅ |
| Legacy | fallback preview + apply-fallback | ✅（需同进程先 fallback 预热缓存） |
| Legacy | reorder | ✅（已修复 DTO whitelist 导致 dayId 丢失） |

---

## 7. P2 — 团队对讲（非 MVP 阻塞）

Execute 页「团队对讲 / 距离 / 离线消息」接口契约见：

**[`src/trips/in-trip-execution/IN_TRIP_COMMS_API.md`](../in-trip-execution/IN_TRIP_COMMS_API.md)**

| 能力 | 方法 | 路径 |
|------|------|------|
| 消息同步 | `POST` | `/trips/:tripId/in-trip/comms/sync` |
| 历史拉取 | `GET` | `/trips/:tripId/in-trip/comms?since=` |
| 成员距离 | `GET` | `/trips/:tripId/in-trip/comms/peers` |
| 位置心跳 | `POST` | `/trips/:tripId/in-trip/comms/peers/heartbeat` |
| 语音转写（可选） | `POST` | `/trips/:tripId/in-trip/comms/transcribe` |
| AI 摘要（可选） | `GET` | `/trips/:tripId/in-trip/comms/summary` |

**实现状态：** P2.0 + P2.2 已落地（含 transcribe / summary）；WebSocket 待 P2.1。

**真机蓝牙 PTT（Capacitor）：** 近场对讲走 BLE / Multipeer / Nearby + 原生后台，**不依赖后端**；有网时用 `comms/sync` 同步文字即可。详见 [`IN_TRIP_COMMS_API.md`](../in-trip-execution/IN_TRIP_COMMS_API.md) §0.1、§8.2。

| 套壳 MVP | 后端是否必须 |
|----------|--------------|
| BLE Central 扫描 + 连接写入 | 否 |
| 按住对讲音频（原生插件） | 否 |
| 有网后多端看历史 | 是 → `POST comms/sync` |
| 距离展示 | 可选 → `peers/heartbeat` |
