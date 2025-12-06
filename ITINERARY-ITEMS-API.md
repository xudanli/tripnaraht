# 📅 Itinerary Items API 文档

## ✅ 已完成实现

### 功能概述

`POST /itinerary-items` 接口用于在指定日期添加行程项（活动、用餐、休息、交通等）。接口包含智能校验逻辑，确保用户不会在关门时间安排活动。

## 🎯 核心特性

### 1. 基础逻辑校验
- ✅ 结束时间必须晚于开始时间
- ✅ 日期格式验证

### 2. 智能营业时间校验
- ✅ 自动检查地点在指定时间是否营业
- ✅ 支持跨午夜营业时间（如 18:00-02:00）
- ✅ 时区感知（使用地点所在时区）
- ✅ 仅对 ACTIVITY 和 MEAL_ANCHOR 类型进行校验

### 3. 数据完整性
- ✅ 验证 TripDay 是否存在
- ✅ 验证 Place 是否存在
- ✅ 返回完整的关联数据（Place、TripDay、Trip）

## 📋 API 端点

### POST /itinerary-items

创建新的行程项。

**请求体**：
```json
{
  "tripDayId": "d0f6ab6c-0e94-491b-954c-bb0355e797cf",
  "placeId": 1,
  "type": "ACTIVITY",
  "startTime": "2024-05-01T10:00:00.000Z",
  "endTime": "2024-05-01T12:00:00.000Z",
  "note": "记得穿和服拍照"
}
```

**成功响应** (201)：
```json
{
  "id": "uuid-xxxx",
  "tripDayId": "d0f6ab6c-0e94-491b-954c-bb0355e797cf",
  "placeId": 1,
  "type": "ACTIVITY",
  "startTime": "2024-05-01T10:00:00.000Z",
  "endTime": "2024-05-01T12:00:00.000Z",
  "note": "记得穿和服拍照",
  "place": {
    "id": 1,
    "name": "浅草寺",
    // ... 完整的地点信息
  },
  "tripDay": {
    // ... TripDay 信息
  }
}
```

**错误响应** (400)：
```json
{
  "statusCode": 400,
  "message": "时间冲突警告：浅草寺 在 2024-05-01 星期三 03:00 可能未营业 (营业时间: 09:00-18:00)",
  "error": "Bad Request"
}
```

### GET /itinerary-items

获取所有行程项，或筛选指定 TripDay 的行程项。

**查询参数**：
- `tripDayId` (可选): 筛选指定 TripDay 的行程项

**示例**：
```
GET /itinerary-items?tripDayId=d0f6ab6c-0e94-491b-954c-bb0355e797cf
```

### GET /itinerary-items/:id

获取单个行程项详情。

### PATCH /itinerary-items/:id

更新行程项。如果更新了时间，系统会重新校验营业时间。

### DELETE /itinerary-items/:id

删除行程项。

## 🔍 智能校验逻辑

### 校验流程

1. **基础校验**
   - 验证日期格式
   - 检查结束时间 > 开始时间

2. **TripDay 验证**
   - 检查 TripDay 是否存在

3. **营业时间校验**（仅对 ACTIVITY 和 MEAL_ANCHOR）
   - 如果关联了 Place，获取地点的营业时间
   - 使用 `OpeningHoursUtil.isOpenAt()` 检查开始时间是否在营业时间内
   - 如果不在营业时间，抛出 400 错误

### 校验规则

| 类型 | 是否需要校验营业时间 |
|------|---------------------|
| ACTIVITY | ✅ 是 |
| MEAL_ANCHOR | ✅ 是 |
| MEAL_FLOATING | ❌ 否 |
| REST | ❌ 否 |
| TRANSIT | ❌ 否 |

## 🧪 测试示例

### 1. 正常情况（营业时间内）

```bash
curl -X POST http://localhost:3000/itinerary-items \
  -H "Content-Type: application/json" \
  -d '{
    "tripDayId": "day-uuid",
    "placeId": 1,
    "type": "ACTIVITY",
    "startTime": "2024-05-01T10:00:00.000Z",
    "endTime": "2024-05-01T12:00:00.000Z",
    "note": "记得穿和服拍照"
  }'
```

**预期**：✅ 201 成功创建

### 2. 测试智能校验（关门时间）

```bash
curl -X POST http://localhost:3000/itinerary-items \
  -H "Content-Type: application/json" \
  -d '{
    "tripDayId": "day-uuid",
    "placeId": 1,
    "type": "ACTIVITY",
    "startTime": "2024-05-01T03:00:00.000Z",
    "endTime": "2024-05-01T04:00:00.000Z"
  }'
```

**预期**：❌ 400 错误，提示"时间冲突警告"

### 3. 测试逻辑校验（结束时间早于开始时间）

```bash
curl -X POST http://localhost:3000/itinerary-items \
  -H "Content-Type: application/json" \
  -d '{
    "tripDayId": "day-uuid",
    "placeId": 1,
    "type": "ACTIVITY",
    "startTime": "2024-05-01T12:00:00.000Z",
    "endTime": "2024-05-01T10:00:00.000Z"
  }'
```

**预期**：❌ 400 错误，提示"结束时间必须晚于开始时间"

## 📚 相关工具类

### OpeningHoursUtil

新增方法：

- `isOpenAt(hoursStr, checkDate, timezone)`: 检查指定时间点是否营业
- `getHoursForDate(metadata, checkDate, timezone)`: 获取指定日期的营业时间

## 🎨 使用场景

### 场景 1: 添加景点活动

```typescript
// 用户选择：10:00-12:00 参观浅草寺
// 系统检查：浅草寺营业时间 09:00-18:00
// 结果：✅ 通过，创建成功
```

### 场景 2: 添加必吃大餐

```typescript
// 用户选择：19:00-21:00 在米其林餐厅用餐
// 系统检查：餐厅营业时间 18:00-22:00
// 结果：✅ 通过，创建成功
```

### 场景 3: 时间冲突

```typescript
// 用户选择：03:00-04:00 参观浅草寺
// 系统检查：浅草寺营业时间 09:00-18:00
// 结果：❌ 拒绝，返回 400 错误
```

## 🔧 配置说明

### 时区处理

- 系统使用地点元数据中的 `timezone` 字段
- 如果没有，默认使用 `Atlantic/Reykjavik`（冰岛时区）
- 所有时间比较都在地点当地时区进行

### 营业时间格式

支持格式：
- `"09:00-18:00"` - 标准格式
- `"18:00-02:00"` - 跨午夜格式
- `"Closed"` - 不营业
- `"24 Hours"` - 24 小时营业

## 📝 注意事项

1. **性能考虑**：营业时间校验需要查询数据库，但查询已优化
2. **时区准确性**：确保地点的 `metadata.timezone` 正确设置
3. **跨午夜处理**：系统已正确处理跨午夜的营业时间
4. **可选校验**：REST、TRANSIT、MEAL_FLOATING 类型不校验营业时间

## 🚀 下一步

- [ ] 添加时间段校验（检查整个时间段是否都在营业时间内）
- [ ] 添加冲突检测（检查与其他行程项的时间重叠）
- [ ] 添加推荐时间建议（如果时间冲突，建议可用的时间段）

