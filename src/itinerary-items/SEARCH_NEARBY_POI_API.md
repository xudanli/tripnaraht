# 基于行程项搜索附近POI接口文档

## 📋 概述

本接口用于基于行程项搜索附近的POI（景点、餐厅、住宿、加油站、休息点等）。支持基于行程项ID自动获取坐标，或直接提供坐标进行搜索。

## 🎯 接口信息

- **URL**: `GET /api/itinerary-items/nearby-poi`
- **方法**: `GET`
- **认证**: 公开接口（无需认证）

## 📝 请求参数

### 查询参数

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| itemId | string (UUID) | 否* | 行程项ID（如果提供则使用行程项的坐标） | `"f3626ff1-7a9b-46d9-8b8b-7f53a14583b1"` |
| lat | number | 否* | 纬度（如果未提供 itemId，则必须提供） | `64.2556` |
| lng | number | 否* | 经度（如果未提供 itemId，则必须提供） | `-21.1294` |
| radius | number | 否 | 搜索半径（米），默认5000米 | `5000` |
| categories | string[] | 否 | 要搜索的POI类别（可多选，用逗号分隔），默认搜索所有类别 | `"ATTRACTION,RESTAURANT"` |
| minRating | number | 否 | 最小评分（0-5） | `4.0` |
| openNow | boolean | 否 | 是否只返回当前营业的地点（仅对餐厅有效） | `true` |
| limit | number | 否 | 返回结果数量限制，默认20 | `20` |

**注意**: `itemId` 和 `lat/lng` 至少需要提供一组。

### POI类别（categories）

| 类别值 | 说明 | 数据源 |
|--------|------|--------|
| `ATTRACTION` | 景点 | 数据库（Place表） |
| `RESTAURANT` | 餐厅 | 数据库（Place表） |
| `HOTEL` | 住宿 | 数据库（Place表） |
| `GAS_STATION` | 加油站 | Google Places API |
| `REST_AREA` | 休息点 | Google Places API |

## 📤 响应格式

### 成功响应

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "nameCN": "蓝湖",
      "nameEN": "Blue Lagoon",
      "category": "ATTRACTION",
      "address": "240 Grindavík, Iceland",
      "rating": 4.5,
      "lat": 63.8804,
      "lng": -22.4495,
      "distanceMeters": 1234,
      "openingHours": {
        "open": "09:00",
        "close": "22:00",
        "openNow": true
      },
      "metadata": {
        "placeId": "ChIJ...",
        "types": ["spa", "tourist_attraction"],
        "priceLevel": 3
      }
    }
  ]
}
```

### 响应字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | number | 地点ID |
| nameCN | string | 中文名称 |
| nameEN | string | 英文名称（可选） |
| category | string | 类别（ATTRACTION, RESTAURANT, HOTEL, TRANSIT_HUB等） |
| address | string | 地址（可选） |
| rating | number | 评分（0-5，可选） |
| lat | number | 纬度 |
| lng | number | 经度 |
| distanceMeters | number | 距离（米） |
| openingHours | object | 营业时间信息（可选） |
| openingHours.open | string | 开始时间（HH:mm格式） |
| openingHours.close | string | 结束时间（HH:mm格式） |
| openingHours.openNow | boolean | 是否当前营业 |
| metadata | object | 其他元数据（可选） |

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "必须提供 itemId 或 lat/lng 坐标"
  }
}
```

## 📚 使用示例

### 示例 1: 基于行程项ID搜索

```bash
curl -X GET "http://localhost:3000/api/itinerary-items/nearby-poi?itemId=f3626ff1-7a9b-46d9-8b8b-7f53a14583b1&categories=ATTRACTION,RESTAURANT&radius=3000" \
  -H "Content-Type: application/json"
```

### 示例 2: 基于坐标搜索

```bash
curl -X GET "http://localhost:3000/api/itinerary-items/nearby-poi?lat=64.2556&lng=-21.1294&categories=GAS_STATION,REST_AREA&radius=10000" \
  -H "Content-Type: application/json"
```

### 示例 3: 搜索附近餐厅（仅营业中）

```bash
curl -X GET "http://localhost:3000/api/itinerary-items/nearby-poi?itemId=f3626ff1-7a9b-46d9-8b8b-7f53a14583b1&categories=RESTAURANT&openNow=true&minRating=4.0" \
  -H "Content-Type: application/json"
```

### 示例 4: 搜索所有类型的POI

```bash
curl -X GET "http://localhost:3000/api/itinerary-items/nearby-poi?lat=64.2556&lng=-21.1294&radius=5000&limit=30" \
  -H "Content-Type: application/json"
```

## 🔍 搜索逻辑

1. **坐标获取**:
   - 如果提供了 `itemId`，从行程项的关联 Place 中提取坐标
   - 如果提供了 `lat/lng`，直接使用提供的坐标

2. **数据源**:
   - **数据库类别**（ATTRACTION, RESTAURANT, HOTEL）: 从本地 Place 数据库搜索
   - **Google Places类别**（GAS_STATION, REST_AREA）: 调用 Google Places API

3. **过滤和排序**:
   - 应用 `minRating` 过滤（如果提供）
   - 应用 `openNow` 过滤（仅对餐厅有效）
   - 按距离排序（从近到远）
   - 限制返回数量（`limit` 参数）

## ⚠️ 注意事项

1. **坐标要求**: 行程项必须关联了 Place，且 Place 必须有坐标信息
2. **Google Places API**: 加油站和休息点搜索需要配置 `GOOGLE_MAPS_API_KEY` 环境变量
3. **性能**: 如果同时搜索多个类别，可能会调用多个API，响应时间可能较长
4. **距离计算**: 使用 Haversine 公式计算球面距离（单位：米）

## 🐛 故障排除

### 问题 1: "必须提供 itemId 或 lat/lng 坐标"

**原因**: 没有提供足够的参数

**解决**: 提供 `itemId` 或同时提供 `lat` 和 `lng`

### 问题 2: "行程项的地点没有坐标信息"

**原因**: 行程项关联的 Place 没有坐标数据

**解决**: 检查 Place 的 `location` 字段或 `metadata` 中是否包含坐标

### 问题 3: 加油站和休息点搜索返回空结果

**原因**: Google Places API 未配置或不可用

**解决**: 
- 检查 `GOOGLE_MAPS_API_KEY` 环境变量
- 确认 Google Places API 已启用
- 检查 API 配额是否充足

## 🔄 响应数据说明

### 坐标字段
返回的每个POI都包含以下坐标字段：
- `lat`: 纬度（number）
- `lng`: 经度（number）

**注意**: 当前实现只返回 `lat` 和 `lng` 字段。如果需要其他格式的坐标字段，可以在后续版本中添加。

### 距离信息
- `distanceMeters`: 从搜索中心点到POI的距离（米），使用Haversine公式计算

### 营业时间
- `openingHours.open`: 开始时间（HH:mm格式）
- `openingHours.close`: 结束时间（HH:mm格式）
- `openingHours.openNow`: 是否当前营业（仅当提供`openNow`参数时）

### 元数据
- 数据库POI: 包含完整的`metadata`字段
- Google Places POI: 包含`placeId`、`types`、`priceLevel`等信息

## 📊 性能考虑

1. **数据库搜索**: 使用PostGIS空间索引，性能较好
2. **Google Places API**: 需要网络请求，可能有延迟
3. **并发搜索**: 多个类别会并行搜索，总响应时间取决于最慢的请求
4. **结果限制**: 默认限制20个结果，可通过`limit`参数调整（最大50）

## 🎨 前端集成示例

### JavaScript/TypeScript

```typescript
// 基于行程项ID搜索
async function searchNearbyPoi(itemId: string, categories: string[] = ['ATTRACTION']) {
  const params = new URLSearchParams({
    itemId,
    categories: categories.join(','),
    radius: '5000',
    limit: '20',
  });
  
  const response = await fetch(`http://localhost:3000/api/itinerary-items/nearby-poi?${params}`);
  const result = await response.json();
  
  if (result.success) {
    return result.data; // NearbyPoiResultDto[]
  } else {
    throw new Error(result.error.message);
  }
}

// 使用示例
const pois = await searchNearbyPoi('item-id-123', ['ATTRACTION', 'RESTAURANT']);
pois.forEach(poi => {
  console.log(`${poi.nameCN} - ${poi.distanceMeters}m`);
});
```

### React Hook 示例

```typescript
import { useState, useEffect } from 'react';

function useNearbyPoi(itemId?: string, lat?: number, lng?: number, categories?: string[]) {
  const [pois, setPois] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!itemId && (!lat || !lng)) return;

    setLoading(true);
    const params = new URLSearchParams();
    if (itemId) params.append('itemId', itemId);
    if (lat) params.append('lat', lat.toString());
    if (lng) params.append('lng', lng.toString());
    if (categories) params.append('categories', categories.join(','));
    params.append('radius', '5000');
    params.append('limit', '20');

    fetch(`http://localhost:3000/api/itinerary-items/nearby-poi?${params}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPois(data.data);
        } else {
          setError(data.error.message);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [itemId, lat, lng, categories]);

  return { pois, loading, error };
}
```

## 📚 相关文档

- [行程项 API 文档](./ITINERARY_ITEMS_API.md)
- [行程项坐标字段测试](./COORDINATES_FIELD_TEST.md)
- [实现总结](./SEARCH_NEARBY_POI_IMPLEMENTATION_SUMMARY.md)
- [Places API 文档](../places/README.md)
