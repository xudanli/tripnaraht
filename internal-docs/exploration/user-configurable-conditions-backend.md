# Exploration 用户可配置旅行条件 — 后端实现说明

**Audience:** 前端 `features/exploration` 联调  
**API SSOT:** [EXPLORATION_API.md](../../src/trips/exploration/EXPLORATION_API.md)

---

## 模式分流

| 模式 | 触发 | 行为 |
|------|------|------|
| **Consumer** | POST 不传 `researchProtocolId` 且 `EXPLORATION_CONSUMER_MVP_ENABLED=1` | 以 body 为准，`lockedFields: []` |
| **Research** | POST 传 `researchProtocolId` | protocol `lockedFields` 覆盖 body |
| **Legacy 研究** | 未传 protocol 且 `RESEARCH_PROTOCOL_ENABLED=1` 且 Consumer MVP 未开 | 自动 `iceland-discovery-v1` |

---

## P0 已交付

### POST `/api/exploration/scenarios`

- `researchProtocolId` **可选**
- Consumer：必填并校验 `destinationCodes`、`dateRange`、`travelers`；`budget` / `mobilityContext.vehicleType` 可选
- `vehicleType` 枚举：`2WD_COMPACT_SUV` | `4WD_SUV`
- 响应新增：`lockedFields`、`scenario`（条件快照）、`researchProtocolId`

### GET `/api/exploration/scenarios/:id`

- 返回 `sessionId`、`lockedFields`、`scenario`（条件视图）、`materializationStatus`

---

## P1 已交付

### GET `/api/exploration/conditions/catalog?destinationCode=IS`

车辆类型、预算预设、支持的目的地列表。

### PATCH `/api/exploration/scenarios/:id/conditions`

- **DRAFT** — 可改未锁定字段
- **MATERIALIZED 且未选路** — 可改；同步 Trip shell + invalidate DRAFT 候选
- 已选路 → 409 `ROUTE_ALREADY_SELECTED`
- 不可修改 `lockedFields` 中的字段 → 400
- 响应含：`tripSynced`、`candidatesInvalidated`、`candidatesStatus`

---

## 前端对接

```typescript
import {
  fetchConditionsCatalog,
  startExplorationFromHub,
  fetchScenarioDetail,
  patchScenarioConditions,
} from '@/features/exploration/api/client';

// Consumer：用户填完条件再创建
const created = await startExplorationFromHub(token, {
  destinationCodes: ['IS'],
  dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
  travelers: [{ type: 'ADULT' }, { type: 'ADULT' }],
  budget: { currency: 'USD', min: 3000, max: 4000 },
  mobilityContext: { vehicleType: '4WD_SUV' },
});
// created.lockedFields === []
// created.scenario.mobilityContext.vehicleType === '4WD_SUV'

// Research：只传 protocol
await startExplorationFromHub(token, { researchProtocolId: 'iceland-discovery-v1' });

// 条件页回显
const detail = await fetchScenarioDetail(token, scenarioId);
// detail.lockedFields → 禁用表单项
```

---

## 联调验收

1. `VITE_EXPLORATION_USER_CONDITIONS=1` → 改 `4WD_SUV` → POST 无 protocol → `lockedFields=[]`，GET 一致  
2. `VITE_EXPLORATION_RESEARCH_MODE=1` → POST 带 protocol → `lockedFields` 含五字段，body 被覆盖为 protocol 默认值  
3. PATCH 在 DRAFT 可改未锁定字段；物化后未选路可 PATCH 并 sync Trip  
4. 原则/条件变更后 `candidatesStatus=STALE` → `POST .../candidates/regenerate`

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `EXPLORATION_CONSUMER_MVP_ENABLED=1` | 允许无 protocol Consumer 创建 |
| `RESEARCH_PROTOCOL_ENABLED=1` | Legacy：无 protocol 时强制冰岛研究（Consumer MVP 未开时） |
