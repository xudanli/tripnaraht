# Trip Prerequisites API

> P2 — 共享事实 SSOT：同一 prerequisite 双投影至出发准备与可执行性  
> @see `internal-docs/product/PRODUCT_READINESS_MODEL.md` §6

## GET `/api/trips/:tripId/prerequisites`

只读聚合 POI Access 预约/确认、体验底线确认等 **跨域前置条件**。

### Response schema

`tripnara.trip_prerequisites@v1`

```json
{
  "schema": "tripnara.trip_prerequisites@v1",
  "tripId": "...",
  "calculatedAt": "2026-07-08T12:00:00.000Z",
  "prerequisites": [
    {
      "id": "prereq:poi-access:{tripItemId}:poi_access_reservation_required",
      "tripId": "...",
      "kind": "poi_access_reservation",
      "title": "确认预约：Landmannalaugar",
      "status": "UNCONFIRMED",
      "relatedActivity": { "tripItemId": "...", "dayNumber": 4, "poiName": "..." },
      "source": { "system": "poi_access", "feasibilityIssueId": "poi-access:..." },
      "projections": {
        "departurePrep": {
          "findingItemId": "prereq:poi-access:...",
          "level": "must",
          "category": "activities_bookings"
        },
        "feasibility": {
          "issueId": "poi-access:...",
          "issueKind": "poi_access_reservation_required"
        }
      }
    }
  ],
  "summary": { "total": 1, "open": 1, "confirmed": 0, "notApplicable": 0 },
  "links": {
    "feasibilityReport": "/api/trips/{id}/feasibility-report",
    "departurePreparation": "/api/readiness/trip/{id}",
    "departureGate": "/api/trips/{id}/departure-gate"
  }
}
```

### Dual projection

| 面 | 消费方 | 字段 |
|----|--------|------|
| 可执行证明 | `feasibility-report.issues[]` | `prerequisiteId` |
| 出发准备 | Pack 树形 findings / departure-gate | `id` = `prerequisiteId` |

Checklist / `not_applicable` marks 使用 `prerequisiteId` 作为 `findingId`。

### 模块

- Types: `src/trips/prerequisites/types/trip-prerequisite.types.ts`
- Service: `src/trips/prerequisites/services/trip-prerequisite.service.ts`

### 后续

- Pack 签证/permit 纳入 prerequisite（当前仍仅 Pack 出发准备项）
- 用户手动创建 prerequisite（`source.system: manual`）
