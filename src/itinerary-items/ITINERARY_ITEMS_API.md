# 行程项（Itinerary Items）API 文档

## 概述

行程项 API 用于管理行程中的各个活动、用餐、休息和交通等项。**更新行程项时间时，系统会根据实际距离和交通方式自动计算旅行时间，并智能调整后续行程项的时间。**

## 基础信息

- **Base URL**: `/itinerary-items`
- **认证**: 需要用户认证（根据项目配置）
- **响应格式**: 统一响应格式（`successResponse` / `errorResponse`）

---

## 1. 更新行程项（智能时间调整）

### 接口信息

- **URL**: `PATCH /itinerary-items/:id`
- **方法**: `PATCH`
- **描述**: 更新行程项信息。**如果更新了开始时间，系统会根据实际距离和交通方式自动计算旅行时间，并智能调整后续行程项的时间。**

### 路径参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string (UUID) | 是 | 行程项 ID |

### 请求体（UpdateItineraryItemDto）

所有字段都是可选的，只需要传递需要更新的字段。

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| tripDayId | string (UUID) | 否 | 行程日期 ID | `"d0f6ab6c-0e94-491b-954c-bb0355e797cf"` |
| placeId | number | 否 | 地点 ID | `1` |
| trailId | number | 否 | 徒步路线 ID | `1` |
| type | enum | 否 | 行程项类型 | `"ACTIVITY"` |
| startTime | string (ISO 8601) | 否 | **开始时间（更新此字段会触发智能时间调整）** | `"2024-05-01T10:00:00.000Z"` |
| endTime | string (ISO 8601) | 否 | 结束时间 | `"2024-05-01T12:00:00.000Z"` |
| note | string | 否 | 备注信息 | `"记得穿和服拍照"` |

#### 行程项类型（ItemType）

- `ACTIVITY`: 游玩活动
- `REST`: 休息/咖啡
- `MEAL_ANCHOR`: 必吃大餐（需要订位）
- `MEAL_FLOATING`: 随便吃吃
- `TRANSIT`: 交通移动

### 智能时间调整功能说明

当更新 `startTime` 时，系统会执行以下智能调整：

1. **获取位置信息**
   - 获取前一个行程项的位置（如果存在）
   - 获取当前行程项的位置

2. **选择交通方式**
   - 距离 < 2km：步行（WALKING）
   - 距离 2-50km：驾车（DRIVING）
   - 距离 > 50km：公共交通（TRANSIT）

3. **计算旅行时间**
   - 使用高德地图 API（国内）或 Google Routes API（海外）
   - 计算实际的旅行时间（分钟）

4. **调整后续行程项**
   - 自动调整当天后续所有行程项的时间
   - 保持每个行程项的原有时长
   - 在行程项之间添加 15 分钟的缓冲时间

5. **时间校验**
   - 如果用户指定的时间早于计算出的时间超过 30 分钟，会返回警告错误
   - 重新校验营业时间（如果关联了地点）

### 请求示例

#### 示例 1: 只更新开始时间（触发智能调整）

```bash
curl -X PATCH "https://api.example.com/itinerary-items/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "startTime": "2024-05-01T10:30:00.000Z"
  }'
```

#### 示例 2: 同时更新开始和结束时间

```bash
curl -X PATCH "https://api.example.com/itinerary-items/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "startTime": "2024-05-01T10:30:00.000Z",
    "endTime": "2024-05-01T12:30:00.000Z"
  }'
```

#### 示例 3: 更新地点和备注

```bash
curl -X PATCH "https://api.example.com/itinerary-items/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "placeId": 123,
    "note": "记得带充电宝"
  }'
```

### 响应示例

#### 成功响应

```json
{
  "success": true,
  "data": {
    "id": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "tripDayId": "d0f6ab6c-0e94-491b-954c-bb0355e797cf",
    "placeId": 1,
    "type": "ACTIVITY",
    "startTime": "2024-05-01T10:30:00.000Z",
    "endTime": "2024-05-01T12:30:00.000Z",
    "note": "记得带充电宝",
    "Place": {
      "id": 1,
      "nameCN": "故宫博物院",
      "nameEN": "Forbidden City",
      "location": {
        "lat": 39.9163,
        "lng": 116.3972
      },
      "City": {
        "id": 1,
        "nameCN": "北京",
        "nameEN": "Beijing"
      }
    },
    "TripDay": {
      "id": "d0f6ab6c-0e94-491b-954c-bb0355e797cf",
      "date": "2024-05-01T00:00:00.000Z"
    }
  }
}
```

#### 错误响应 - 时间不合理

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "时间可能不合理：根据实际距离（5.2km）和交通方式（DRIVING），预计需要 15 分钟，建议开始时间不早于 10:45"
  }
}
```

#### 错误响应 - 营业时间冲突

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "时间冲突警告：故宫博物院 在指定时间可能未营业 (营业时间: 08:30-17:00)"
  }
}
```

#### 错误响应 - 行程项不存在

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "找不到指定的行程项 (ID: f3626ff1-7a9b-46d9-8b8b-7f53a14583b1)"
  }
}
```

---

## 2. 创建行程项

### 接口信息

- **URL**: `POST /itinerary-items`
- **方法**: `POST`
- **描述**: 在指定日期添加行程项（活动、用餐、休息、交通等）。系统会自动校验营业时间和时间逻辑。

### 请求体（CreateItineraryItemDto）

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| tripDayId | string (UUID) | 是 | 行程日期 ID | `"d0f6ab6c-0e94-491b-954c-bb0355e797cf"` |
| placeId | number | 否 | 地点 ID | `1` |
| trailId | number | 否 | 徒步路线 ID | `1` |
| type | enum | 是 | 行程项类型 | `"ACTIVITY"` |
| startTime | string (ISO 8601) | 是 | 开始时间 | `"2024-05-01T10:00:00.000Z"` |
| endTime | string (ISO 8601) | 是 | 结束时间 | `"2024-05-01T12:00:00.000Z"` |
| note | string | 否 | 备注信息 | `"记得穿和服拍照"` |

### 请求示例

```bash
curl -X POST "https://api.example.com/itinerary-items" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "tripDayId": "d0f6ab6c-0e94-491b-954c-bb0355e797cf",
    "placeId": 1,
    "type": "ACTIVITY",
    "startTime": "2024-05-01T10:00:00.000Z",
    "endTime": "2024-05-01T12:00:00.000Z",
    "note": "记得带充电宝"
  }'
```

---

## 3. 获取行程项列表

### 接口信息

- **URL**: `GET /itinerary-items`
- **方法**: `GET`
- **描述**: 获取所有行程项列表，按开始时间排序

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| tripDayId | string (UUID) | 否 | 筛选指定 TripDay 的行程项 |

### 请求示例

```bash
# 获取所有行程项
curl -X GET "https://api.example.com/itinerary-items" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 获取指定日期的行程项
curl -X GET "https://api.example.com/itinerary-items?tripDayId=d0f6ab6c-0e94-491b-954c-bb0355e797cf" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 4. 获取单个行程项详情

### 接口信息

- **URL**: `GET /itinerary-items/:id`
- **方法**: `GET`
- **描述**: 根据 ID 获取完整的行程项信息，包括关联的 Place 和 TripDay

### 路径参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string (UUID) | 是 | 行程项 ID |

### 请求示例

```bash
curl -X GET "https://api.example.com/itinerary-items/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 5. 删除行程项

### 接口信息

- **URL**: `DELETE /itinerary-items/:id`
- **方法**: `DELETE`
- **描述**: 删除指定的行程项

### 路径参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string (UUID) | 是 | 行程项 ID |

### 请求示例

```bash
curl -X DELETE "https://api.example.com/itinerary-items/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `VALIDATION_ERROR` | 200 | 校验失败（时间冲突、逻辑错误等） |
| `NOT_FOUND` | 200 | 资源不存在（行程项、TripDay、Place 等） |
| `INTERNAL_ERROR` | 200 | 服务器内部错误 |

---

## 前端对接注意事项

### 1. 时间格式

- 所有时间字段使用 **ISO 8601 格式**（UTC 时间）
- 示例：`"2024-05-01T10:00:00.000Z"`

### 2. 智能时间调整

- 当更新 `startTime` 时，系统会自动调整后续行程项的时间
- 前端应该：
  - 在更新后重新获取当天的所有行程项，以获取最新的时间安排
  - 如果返回时间不合理的错误，提示用户调整时间
  - 显示系统计算出的建议时间

### 3. 错误处理

- 所有错误都通过 `errorResponse` 返回，HTTP 状态码为 200
- 需要检查响应中的 `success` 字段来判断是否成功
- 错误信息在 `error.message` 中

### 4. 示例代码（TypeScript/JavaScript）

```typescript
// 更新行程项时间（触发智能调整）
async function updateItineraryItemTime(
  itemId: string,
  newStartTime: string
) {
  try {
    const response = await fetch(`/itinerary-items/${itemId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        startTime: newStartTime,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      // 处理错误
      console.error('更新失败:', data.error.message);
      alert(data.error.message);
      return;
    }

    // 更新成功，重新获取当天的行程项以获取最新时间
    const tripDayId = data.data.TripDay.id;
    await refreshItineraryItems(tripDayId);

    return data.data;
  } catch (error) {
    console.error('请求失败:', error);
  }
}

// 重新获取当天的行程项
async function refreshItineraryItems(tripDayId: string) {
  const response = await fetch(`/itinerary-items?tripDayId=${tripDayId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await response.json();
  if (data.success) {
    // 更新前端显示的行程项列表
    updateItineraryItemsList(data.data);
  }
}
```

---

## 更新日志

### 2024-05-01
- ✅ 新增智能时间调整功能
  - 根据实际距离自动选择交通方式
  - 使用地图 API 计算实际旅行时间
  - 自动调整后续行程项的时间
  - 时间不合理时给出警告

