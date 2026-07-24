# 行程详情 · 活动 Tab 收藏 API

> **版本**: 1.0.0  
> **Base**: `/api/trips/:tripId/activity-favorites`  
> **状态**: 已实现 · 待 migration 部署  
> **关联 UI**: `TripDetailActivitiesTab`（Heart 收藏）  
> **关联文档**: [TRIP_DETAIL_TAB_FRONTEND.md](./TRIP_DETAIL_TAB_FRONTEND.md)

**最后更新**: 2026-07-02

---

## 1. 概述

活动 Tab 原先收藏（Heart）为纯前端状态。本模块提供 **按用户 + 行程** 持久化收藏，支持：

| 目标 | 说明 |
|------|------|
| `itineraryItemId` | 行程内 `ACTIVITY` 类型项 |
| `placeId` | 独立 POI（尚未加入行程时也可收藏） |

---

## 2. 鉴权

与 `trip_files` / `trip_wish` 一致：生产需登录；Service 层校验行程成员；非生产无 token 时使用 `anonymous-dev-user`。

---

## 3. 数据模型 `trip_activity_favorites`

| 字段 | 说明 |
|------|------|
| `trip_id` | 行程 ID |
| `user_id` | 收藏用户 |
| `target_key` | `item:{itineraryItemId}` 或 `place:{placeId}` |
| `itinerary_item_id` | 可选冗余 |
| `place_id` | 可选冗余 |

Migration: `prisma/migrations/20260702140000_trip_activity_favorites`

---

## 4. 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/trips/:tripId/activity-favorites` | 当前用户收藏列表 |
| POST | `/trips/:tripId/activity-favorites` | 设置/取消收藏 |

### 4.1 GET 响应

```typescript
interface ActivityFavoritesListResponse {
  tripId: string;
  userId: string;
  favorites: Array<{
    targetKey: string;
    itineraryItemId?: string | null;
    placeId?: number | null;
    favoritedAt: string;
  }>;
  itineraryItemIds: string[];  // 便捷字段
  placeIds: number[];
  total: number;
}
```

### 4.2 POST 请求

```typescript
interface SetActivityFavoriteRequest {
  itineraryItemId?: string;  // 与 placeId 二选一
  placeId?: number;
  favorited: boolean;        // true 收藏，false 取消
}
```

POST 响应在操作结果基础上 **返回更新后的完整收藏列表**（同 GET 字段 + `favorited` / `targetKey`）。

### 示例

```bash
curl -s "http://localhost:3000/api/trips/{tripId}/activity-favorites"

curl -s -X POST "http://localhost:3000/api/trips/{tripId}/activity-favorites" \
  -H "Content-Type: application/json" \
  -d '{"itineraryItemId":"{itemId}","favorited":true}'
```

---

## 5. 前端对接

```typescript
import { tripActivityFavoritesApi } from '@/api/trip-detail-tab-client';

const { itineraryItemIds } = await tripActivityFavoritesApi.list(tripId);

await tripActivityFavoritesApi.setFavorite(tripId, {
  itineraryItemId: item.id,
  favorited: true,
});
```

---

## 6. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-07-02 | 初版 GET/POST 收藏 CRUD |
