# 打包清单 - 用户端接口文档

## 📋 概述

本文档描述了打包清单相关的**用户端接口**，供前端应用使用。这些接口用于生成、获取和管理用户的打包清单。

**基础路径**: `/api/readiness`

> ⚠️ **重要**: 所有接口都需要 `/api` 前缀！

---

## 📦 一、生成打包清单

### 1.1 生成打包清单

**接口**: `POST /api/readiness/trip/:tripId/packing-list/generate`

**描述**: 根据行程信息和用户参数生成个性化的打包清单。支持两种模式：
- **模板模式**（推荐）：基于打包清单模板数据生成，支持季节、路线、用户类型等个性化定制
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
| specialNeeds | string[] | 否 | 特殊需求 | [] |
| useTemplate | boolean | 否 | 是否使用模板数据生成，默认 true | true |
| includeOptional | boolean | 否 | 是否包含可选物品（原有模式），默认 false | false |
| categories | string[] | 否 | 指定类别筛选 | ["clothing", "gear"] |
| customItems | object[] | 否 | 用户自定义物品 | 见下方说明 |

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

**租车类型枚举值**:
- `compact_car`: 紧凑型车
- `sedan`: 轿车
- `suv_2wd`: 两驱SUV
- `suv_4wd`: 四驱SUV
- `campervan`: 房车

**自定义物品格式**:
```json
{
  "name": "充电宝",
  "category": "electronics",
  "quantity": 1,
  "note": "20000mAh"
}
```

**请求示例**（模板模式）:
```bash
curl -X POST "http://localhost:3000/api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "season": "summer",
    "route": "south_coast",
    "userType": "first_timer",
    "activities": ["hiking", "hot_spring"],
    "useTemplate": true
  }'
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
        "id": "item-1769441749446-0.31329955087871775",
        "name": "护照、驾照、信用卡",
        "category": "documents",
        "quantity": 1,
        "unit": null,
        "priority": "must",
        "reason": "必须携带的证件",
        "checked": false,
        "note": null
      },
      {
        "id": "item-1769441749446-0.4567890123456789",
        "name": "防水冲锋衣（最重要！）",
        "category": "clothing",
        "quantity": 1,
        "unit": "件",
        "priority": "must",
        "reason": "冰岛天气多变，防水必备",
        "checked": false,
        "note": null
      }
    ],
    "summary": {
      "totalItems": 25,
      "checkedItems": 0,
      "byCategory": {
        "documents": 2,
        "clothing": 3,
        "gear": 2,
        "electronics": 2,
        "medical": 1,
        "food": 1,
        "other": 14
      }
    }
  },
  "error": null
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| tripId | string | 行程ID |
| generatedAt | string (ISO 8601) | 生成时间 |
| items | array | 打包清单项列表 |
| items[].id | string | 物品ID |
| items[].name | string | 物品名称 |
| items[].category | enum | 类别：clothing/gear/documents/electronics/food/medical/other |
| items[].quantity | number | 数量 |
| items[].unit | string | 单位（如：件、套、个） |
| items[].priority | enum | 优先级：must/should/optional |
| items[].reason | string | 为什么需要这个物品 |
| items[].checked | boolean | 是否已勾选 |
| items[].note | string | 备注 |
| summary | object | 摘要信息 |
| summary.totalItems | number | 总物品数 |
| summary.checkedItems | number | 已勾选物品数 |
| summary.byCategory | object | 按类别统计 |

---

## 📥 二、获取打包清单

### 2.1 获取打包清单

**接口**: `GET /api/readiness/trip/:tripId/packing-list`

**描述**: 获取行程的打包清单（如果已生成）。

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string (UUID) | 是 | 行程ID |

**请求示例**:
```bash
curl -X GET "http://localhost:3000/api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tripId": "d125c30f-44ab-4a9e-9970-b899fccdc3d8",
    "items": [
      {
        "id": "43d34841-9b84-40fa-a393-6724aa48944a",
        "name": "美丽奴袜子-5",
        "category": "clothing",
        "quantity": 4,
        "unit": null,
        "priority": "must",
        "reason": null,
        "checked": false,
        "note": null
      }
    ],
    "summary": {
      "totalItems": 27,
      "checkedItems": 0,
      "byCategory": {
        "clothing": 6,
        "documents": 2,
        "gear": 4,
        "electronics": 2,
        "medical": 1,
        "food": 1,
        "other": 11
      }
    },
    "lastGeneratedAt": "2026-01-26T15:35:49.497Z"
  },
  "error": null
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| tripId | string | 行程ID |
| items | array | 打包清单项列表（格式同生成接口） |
| summary | object | 摘要信息（格式同生成接口） |
| lastGeneratedAt | string (ISO 8601) | 最后生成时间 |

---

## ✏️ 三、更新打包清单项

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
```bash
curl -X PUT "http://localhost:3000/api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list/items/43d34841-9b84-40fa-a393-6724aa48944a" \
  -H "Content-Type: application/json" \
  -d '{
    "checked": true,
    "quantity": 2,
    "note": "已购买，准备中"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "itemId": "43d34841-9b84-40fa-a393-6724aa48944a",
    "updated": true
  },
  "error": null
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| itemId | string | 物品ID |
| updated | boolean | 是否更新成功 |

---

## 🎯 四、打包清单辅助接口

### 4.1 获取打包顺序步骤

**接口**: `GET /api/readiness/packing-order-steps`

**描述**: 获取推荐的打包顺序步骤，帮助用户有序打包。

**请求示例**:
```bash
curl -X GET "http://localhost:3000/api/readiness/packing-order-steps"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "description": "推荐打包顺序，防止遗漏和最大化空间",
    "step_1": {
      "name": "收集所有物品",
      "items": "将清单上的所有物品堆到床上或地板上",
      "why": "确保没有遗漏"
    },
    "step_2": {
      "name": "分类整理",
      "categories": [
        "文件和贵重物品（最优先）",
        "电子设备和充电器",
        "衣物（分为外层、中层、基础层）",
        "卫生护理（防水分装）",
        "杂物和配件",
        "零食"
      ],
      "why": "便于快速找到关键物品"
    },
    "step_3": {
      "name": "打包关键物品（随身）",
      "items": [
        "护照、驾照、信用卡",
        "保险证明",
        "机票",
        "紧急联系方式"
      ],
      "container": "小防水袋，放在登山包前口袋或背包最上层",
      "why": "丢失无法替代，需要快速访问"
    }
  },
  "error": null
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| description | string | 打包顺序说明 |
| step_N | object | 第N步的详细信息 |
| step_N.name | string | 步骤名称 |
| step_N.items | string/array | 物品列表或说明 |
| step_N.categories | array | 分类列表（如果有） |
| step_N.container | string | 容器建议（如果有） |
| step_N.why | string | 为什么这样做 |

---

### 4.2 获取出发前检查清单

**接口**: `GET /api/readiness/pre-departure-checklist`

**描述**: 获取出发前24小时的最终检查清单。

**请求示例**:
```bash
curl -X GET "http://localhost:3000/api/readiness/pre-departure-checklist"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "description": "出发前24小时最后确认清单",
    "1_day_before": [
      "☐ 护照检查：有效期？签证贴好？做好复印件？",
      "☐ 机票检查：打印或截图？离线保存？",
      "☐ 租车确认：接车时间和地点明确？",
      "☐ 住宿确认：第一晚地址和联系方式记好？",
      "☐ 天气预报：查看冰岛未来一周天气",
      "☐ 路况查询：检查road.is，是否有道路关闭",
      "☐ 应用下载：SafeTravel, Road.is, 112 Iceland"
    ],
    "3_hours_before": [
      "☐ 所有设备充电：手机、充电宝、相机电池",
      "☐ 衣物最后确认：都带了吗？试穿过吗？",
      "☐ 文件最后检查：护照、驾照、信用卡都有吗？",
      "☐ 药物确认：处方药够量吗？有英文说明吗？",
      "☐ 行李称重：是否超过限制？",
      "☐ 重要物品随身：护照、钱包、手机、充电宝"
    ],
    "critical_items_absolute_must_have": [
      "✅ 护照",
      "✅ 驾照+国际驾照",
      "✅ 信用卡x2",
      "✅ 防水冲锋衣",
      "✅ 防水登山靴"
    ]
  },
  "error": null
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| description | string | 检查清单说明 |
| 1_day_before | array | 1天前需要检查的事项 |
| 3_hours_before | array | 3小时前需要检查的事项 |
| critical_items_absolute_must_have | array | 绝对必须携带的物品 |

---

## 💡 五、使用建议

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

**典型流程**:
1. 用户创建行程后，调用生成接口
2. 系统根据行程日期自动推断季节（如果未提供）
3. 用户可以选择路线、用户类型、活动等参数
4. 系统生成个性化打包清单
5. 用户可以随时获取、更新清单项状态

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

### 5.3 自定义物品

如果需要添加自定义物品，可以在生成时通过 `customItems` 参数添加：

```json
{
  "season": "summer",
  "useTemplate": true,
  "customItems": [
    {
      "name": "充电宝",
      "category": "electronics",
      "quantity": 1,
      "note": "20000mAh"
    },
    {
      "name": "特殊药品",
      "category": "medical",
      "quantity": 1,
      "note": "处方药"
    }
  ]
}
```

---

## ❌ 六、错误响应

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

**错误示例**:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "行程 ID d125c30f-44ab-4a9e-9970-b899fccdc3d8 不存在"
  }
}
```

---

## ⚠️ 七、注意事项

1. **接口前缀**: 所有接口都需要 `/api` 前缀
2. **参数验证**: 季节、路线、用户类型等参数需要符合枚举值
3. **自动推断**: 如果未提供季节，系统会根据行程日期自动推断
4. **模板数据**: 模板数据主要针对冰岛，其他目的地建议使用原有模式
5. **数据持久化**: 生成的打包清单会保存到数据库，可以随时获取和更新
6. **重复生成**: 重复调用生成接口会覆盖之前的清单
7. **物品ID**: 物品ID由系统生成，用于更新操作

---

## 📚 八、完整示例

### 8.1 完整流程示例

```javascript
// 1. 生成打包清单
const generateResponse = await fetch('/api/readiness/trip/xxx/packing-list/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    season: 'summer',
    route: 'south_coast',
    userType: 'first_timer',
    activities: ['hiking', 'hot_spring'],
    useTemplate: true
  })
});

const generateData = await generateResponse.json();
console.log('生成成功，共', generateData.data.summary.totalItems, '项');

// 2. 获取打包清单
const getResponse = await fetch('/api/readiness/trip/xxx/packing-list');
const getData = await getResponse.json();
console.log('当前清单:', getData.data.items);

// 3. 更新物品状态
const itemId = getData.data.items[0].id;
await fetch(`/api/readiness/trip/xxx/packing-list/items/${itemId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    checked: true,
    note: '已准备'
  })
});

// 4. 获取打包顺序步骤
const stepsResponse = await fetch('/api/readiness/packing-order-steps');
const stepsData = await stepsResponse.json();
console.log('打包步骤:', stepsData.data);

// 5. 获取出发前检查清单
const checklistResponse = await fetch('/api/readiness/pre-departure-checklist');
const checklistData = await checklistResponse.json();
console.log('出发前检查:', checklistData.data);
```

---

## 🔗 九、相关文档

- [打包清单增强改造说明](./PACKING_LIST_ENHANCEMENT.md)
- [打包清单模板数据库存储](./PACKING_TEMPLATE_DATABASE.md)
- [准备清单与打包清单API](./CHECKLIST_PACKING_LIST_API.md)
- [打包清单模板前端接口文档](./PACKING_TEMPLATE_FRONTEND_API.md)

---

## 📝 十、更新日志

- **2026-01-26**: 创建用户端接口文档
- 支持模板模式和原有模式
- 支持自定义物品
- 支持打包顺序步骤和出发前检查清单

---

**文档版本**: 1.0.0  
**最后更新**: 2026-01-26
