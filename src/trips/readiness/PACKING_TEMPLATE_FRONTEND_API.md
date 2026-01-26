# 打包清单模板 - 前端用户接口文档

## 概述

本文档描述了打包清单相关的**前端用户接口**，供用户端应用使用。这些接口用于生成、获取和管理用户的打包清单。

**基础路径**: `/api/readiness`

> ⚠️ **重要**: 所有接口都需要 `/api` 前缀！

---

## 一、生成打包清单

### 1.1 生成打包清单

**接口**: `POST /api/readiness/trip/:tripId/packing-list/generate`

**描述**: 根据行程信息和用户参数生成个性化的打包清单。支持两种模式：
- **模板模式**（推荐）：基于 `packing-checklist-template.json` 和 `packing-guide.json` 生成
- **原有模式**：基于 Readiness Pack 规则引擎生成

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string (UUID) | 是 | 行程ID |

**请求体参数**:

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| season | enum | 否 | 季节：summer/transition/winter | "summer" |
| route | enum | 否 | 路线类型 | "south_coast" |
| userType | enum | 否 | 用户类型 | "first_timer" |
| activities | string[] | 否 | 计划的活动 | ["hiking", "hot_spring"] |
| vehicleType | enum | 否 | 租车类型 | "suv_4wd" |
| useTemplate | boolean | 否 | 是否使用模板数据生成，默认 true | true |

**季节枚举值**:
- `summer`: 夏季（6-8月）
- `transition`: 过渡季（5月、9月）
- `winter`: 冬季（11-3月）

**路线类型枚举值**:
- `golden_circle`: 黄金圈
- `south_coast`: 南海岸
- `snaefellsnes`: 斯奈山半岛
- `full_ring_road`: 环岛公路
- `westfjords`: 西峡湾
- `highlands`: 高地
- `custom`: 自定义

**用户类型枚举值**:
- `first_timer`: 首次旅行者
- `photographer`: 摄影师
- `adventurer`: 冒险者
- `family_with_kids`: 带孩子的家庭
- `budget_backpacker`: 预算背包客
- `cultural_explorer`: 文化探索者
- `luxury_traveler`: 豪华旅行者

**请求示例**（模板模式）:
```json
POST /api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list/generate
{
  "season": "summer",
  "route": "south_coast",
  "userType": "first_timer",
  "activities": ["hiking", "hot_spring"],
  "useTemplate": true
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tripId": "d125c30f-44ab-4a9e-9970-b899fccdc3d8",
    "generatedAt": "2026-01-26T10:00:00.000Z",
    "items": [
      {
        "id": "item-1",
        "name": "硬壳冲锋衣",
        "category": "clothing",
        "quantity": 1,
        "unit": "件",
        "priority": "must",
        "checked": false
      }
    ],
    "summary": {
      "totalItems": 25,
      "checkedItems": 0
    }
  },
  "error": null
}
```

---

## 二、获取打包清单

### 2.1 获取打包清单

**接口**: `GET /api/readiness/trip/:tripId/packing-list`

**描述**: 获取行程的打包清单（如果已生成）。

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string (UUID) | 是 | 行程ID |

**请求示例**:
```http
GET /api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list
```

---

## 三、更新打包清单项

### 3.1 更新打包清单项状态

**接口**: `PUT /api/readiness/trip/:tripId/packing-list/items/:itemId`

**描述**: 更新打包清单项的勾选状态、数量或备注。

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string (UUID) | 是 | 行程ID |
| itemId | string | 是 | 打包清单项ID |

**请求体**:

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| checked | boolean | 否 | 是否已勾选 | true |
| quantity | number | 否 | 更新数量 | 2 |
| note | string | 否 | 更新备注 | "已准备" |

**请求示例**:
```json
PUT /api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list/items/item-1
{
  "checked": true,
  "quantity": 1,
  "note": "已购买"
}
```

---

## 四、打包清单辅助接口

### 4.1 获取打包顺序步骤

**接口**: `GET /api/readiness/packing-order-steps`

**描述**: 获取推荐的打包顺序步骤，帮助用户有序打包。

**请求示例**:
```http
GET /api/readiness/packing-order-steps
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "description": "按照以下顺序打包，确保不遗漏重要物品",
    "steps": [
      {
        "step": 1,
        "title": "准备证件和重要文件",
        "items": ["护照", "签证", "机票"],
        "tips": "将证件放在随身包中"
      }
    ]
  },
  "error": null
}
```

---

### 4.2 获取出发前检查清单

**接口**: `GET /api/readiness/pre-departure-checklist`

**描述**: 获取出发前24小时的最终检查清单。

**请求示例**:
```http
GET /api/readiness/pre-departure-checklist
```

---

## 五、使用建议

### 5.1 推荐使用模板模式

**适用场景**:
- 冰岛旅行（模板数据主要针对冰岛）
- 需要详细的打包清单
- 需要根据季节、路线、用户类型个性化定制

**参数建议**:
```json
{
  "season": "summer",
  "userType": "first_timer",
  "activities": ["hiking", "hot_spring"],
  "route": "south_coast",
  "useTemplate": true
}
```

### 5.2 使用原有模式

**适用场景**:
- 其他目的地（模板数据主要针对冰岛）
- 需要基于规则引擎的动态评估

**参数建议**:
```json
{
  "useTemplate": false,
  "includeOptional": false
}
```

---

## 六、错误响应

所有接口在出错时返回统一格式：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

**常见错误码**:

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| NOT_FOUND | 404 | 行程或资源不存在 |
| VALIDATION_ERROR | 400 | 请求参数验证失败 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

---

## 七、注意事项

1. **接口前缀**: 所有接口都需要 `/api` 前缀
2. **参数验证**: 季节、路线、用户类型等参数需要符合枚举值
3. **自动推断**: 如果未提供季节，系统会根据行程日期自动推断
4. **模板数据**: 模板数据主要针对冰岛，其他目的地建议使用原有模式
5. **数据持久化**: 生成的打包清单会保存到数据库，可以随时获取和更新

---

## 八、相关文档

- [打包清单增强改造说明](./PACKING_LIST_ENHANCEMENT.md)
- [打包清单模板数据库存储](./PACKING_TEMPLATE_DATABASE.md)
- [准备清单与打包清单API](./CHECKLIST_PACKING_LIST_API.md)
