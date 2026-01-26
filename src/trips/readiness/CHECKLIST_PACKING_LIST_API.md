# 准备清单与打包清单 API 接口文档

## 概述

本文档描述了准备清单（Checklist）和打包清单（Packing List）相关的所有 API 接口。这两个功能帮助用户：
- **准备清单**：管理旅行前的准备事项（签证、保险、证件等）
- **打包清单**：管理旅行时需要携带的物品

> 📖 **数据来源说明**：这两个接口的数据来源于 **Readiness Pack（准备度包）** 系统。详细说明请参考 [数据来源文档](./DATA_SOURCE.md)。  
> 📋 **接口区别说明**：准备清单和打包清单接口的区别和适用场景，请参考 [接口对比文档](./CHECKLIST_VS_PACKING_LIST.md)。

## 基础信息

- **基础路径**: `/api/readiness`
- **响应格式**: 统一使用标准响应格式
  ```json
  {
    "success": true,
    "data": { ... },
    "error": null
  }
  ```

---

## 一、准备清单接口

### 1. 获取个性化准备清单

获取适配行程的准备事项清单，按 blocker/must/should/optional 分类。

**接口**: `GET /api/readiness/personalized-checklist`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| tripId | string | 是 | 行程ID (UUID) | `d125c30f-44ab-4a9e-9970-b899fccdc3d8` |
| lang | enum | 否 | 语言：`en` 或 `zh`，默认 `en` | `zh` |

**请求示例**:

```http
GET /api/readiness/personalized-checklist?tripId=d125c30f-44ab-4a9e-9970-b899fccdc3d8&lang=zh
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tripId": "d125c30f-44ab-4a9e-9970-b899fccdc3d8",
    "checklist": {
      "blocker": [
        {
          "message": "需要办理冰岛签证",
          "tasks": [
            "访问冰岛大使馆官网申请签证",
            "准备护照和行程单"
          ],
          "deadline": null,
          "channel": null
        }
      ],
      "must": [
        {
          "message": "购买旅行保险，需覆盖高风险活动",
          "tasks": [
            "选择覆盖高风险活动的保险",
            "确认保险覆盖冰岛户外活动"
          ],
          "deadline": null,
          "channel": null
        }
      ],
      "should": [
        {
          "message": "准备适合寒冷天气的装备",
          "tasks": [
            "准备保暖衣物",
            "准备防水装备"
          ],
          "deadline": null,
          "channel": null
        }
      ],
      "optional": [
        {
          "message": "学习基本的冰岛语短语",
          "tasks": [],
          "deadline": null,
          "channel": null
        }
      ]
    },
    "summary": {
      "totalBlockers": 1,
      "totalMust": 3,
      "totalShould": 5,
      "totalOptional": 2
    }
  },
  "error": null
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| tripId | string | 行程ID |
| checklist.blocker | array | 阻塞项列表（必须解决才能继续） |
| checklist.must | array | 必须项列表（强烈建议完成） |
| checklist.should | array | 建议项列表（建议完成） |
| checklist.optional | array | 可选项列表（可选完成） |
| checklist.*[].message | string | 事项描述 |
| checklist.*[].tasks | array | 任务列表 |
| checklist.*[].deadline | string\|null | 截止时间（ISO 8601，当前为 null） |
| checklist.*[].channel | string\|null | 办理渠道（当前为 null） |
| summary.totalBlockers | number | 阻塞项总数 |
| summary.totalMust | number | 必须项总数 |
| summary.totalShould | number | 建议项总数 |
| summary.totalOptional | number | 可选项总数 |

**错误响应**:

- `400`: 请求参数错误（缺少 tripId）
- `404`: 行程不存在
- `500`: 服务器内部错误

---

### 2. 获取检查清单勾选状态

获取用户已勾选的准备清单项状态。

**接口**: `GET /api/readiness/trip/:tripId/checklist/status`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程ID (UUID) |

**请求示例**:

```http
GET /api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/checklist/status
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "checkedItems": [
      "must-item-1",
      "must-item-2",
      "must-item-5"
    ],
    "lastUpdated": "2024-01-15T10:30:00Z"
  },
  "error": null
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| checkedItems | array | 已勾选的 finding item ID 列表 |
| lastUpdated | string | 最后更新时间（ISO 8601 格式） |

---

### 3. 更新检查清单勾选状态

批量保存用户勾选的准备清单项状态，支持跨设备同步。

**接口**: `PUT /api/readiness/trip/:tripId/checklist/status`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程ID (UUID) |

**请求体**:

```json
{
  "checkedItems": [
    "must-item-1",
    "must-item-2",
    "must-item-5"
  ]
}
```

**请求示例**:

```http
PUT /readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/checklist/status
Content-Type: application/json

{
  "checkedItems": ["must-item-1", "must-item-2"]
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "updated": 2,
    "checkedItems": [
      "must-item-1",
      "must-item-2"
    ]
  },
  "error": null
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| checkedItems | array | 已勾选的 finding item ID 列表 |
| updated | number | 更新的项数量 |

**错误响应**:

- `400`: 请求参数错误
- `404`: 行程不存在
- `500`: 服务器内部错误

---

## 二、打包清单接口

### 1. 生成打包清单

根据准备度检查结果生成个性化的打包清单。

**接口**: `POST /api/readiness/trip/:tripId/packing-list/generate`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程ID (UUID) |

**请求体**:

```json
{
  "includeOptional": false,
  "categories": ["clothing", "gear", "documents"],
  "customItems": [
    {
      "name": "充电宝",
      "category": "electronics",
      "quantity": 1,
      "note": "20000mAh"
    }
  ],
  "season": "summer",
  "route": "south_coast",
  "userType": "first_timer",
  "activities": ["hiking", "hot_spring"],
  "vehicleType": "suv_4wd",
  "specialNeeds": [],
  "useTemplate": true
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| includeOptional | boolean | 否 | 是否包含可选物品（默认 false） |
| categories | array | 否 | 指定类别：`clothing`, `gear`, `documents`, `electronics`, `food`, `medical`, `other` |
| customItems | array | 否 | 用户自定义物品列表 |
| customItems[].name | string | 是 | 物品名称 |
| customItems[].category | enum | 是 | 类别 |
| customItems[].quantity | number | 否 | 数量 |
| customItems[].note | string | 否 | 备注 |
| **season** | enum | 否 | **🆕 季节**：`summer`(6-8月), `transition`(5月/9月), `winter`(11-3月)。如果不提供，会根据行程开始日期自动推断 |
| **route** | enum | 否 | **🆕 路线类型**：`golden_circle`, `south_coast`, `snaefellsnes`, `full_ring_road`, `westfjords`, `highlands`, `custom` |
| **userType** | enum | 否 | **🆕 用户类型**：`first_timer`, `photographer`, `adventurer`, `family_with_kids`, `budget_backpacker`, `cultural_explorer`, `luxury_traveler` |
| **activities** | array | 否 | **🆕 计划的活动**：`hiking`, `glacier_trekking`, `ice_caving`, `whale_watching`, `photography`, `hot_spring`, `glacier_vehicle`, `camping` |
| **vehicleType** | enum | 否 | **🆕 租车类型**：`compact_car`, `sedan`, `suv_2wd`, `suv_4wd`, `campervan` |
| **specialNeeds** | array | 否 | **🆕 特殊需求**：`baby`, `elderly`, `pet`, `disabilities`, `vegetarian` |
| **useTemplate** | boolean | 否 | **🆕 是否使用模板数据生成**（默认 true，如果提供了 season 等参数）。如果为 false，则使用原有的准备度检查结果生成 |

**请求示例**:

```http
POST /api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list/generate
Content-Type: application/json

{
  "includeOptional": false,
  "customItems": [
    {
      "name": "充电宝",
      "category": "electronics",
      "quantity": 1
    }
  ]
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tripId": "d125c30f-44ab-4a9e-9970-b899fccdc3d8",
    "generatedAt": "2024-01-15T10:45:00Z",
    "items": [
      {
        "id": "item-1",
        "name": "分层保暖衣物",
        "category": "clothing",
        "quantity": 3,
        "unit": "套",
        "priority": "must",
        "reason": "冰岛冬季户外温度低，天气多变",
        "sourceFindingId": "must-iceland-winter-clothing",
        "checked": false,
        "note": null
      },
      {
        "id": "item-2",
        "name": "防水外套",
        "category": "gear",
        "quantity": 1,
        "priority": "must",
        "reason": "冰岛多雨，需要防水装备",
        "sourceFindingId": "must-iceland-rain-gear",
        "checked": false,
        "note": null
      },
      {
        "id": "item-custom-1",
        "name": "充电宝",
        "category": "electronics",
        "quantity": 1,
        "priority": "must",
        "checked": false,
        "note": "20000mAh"
      }
    ],
    "summary": {
      "totalItems": 15,
      "byCategory": {
        "clothing": 5,
        "gear": 4,
        "documents": 3,
        "electronics": 2,
        "other": 1
      },
      "checkedItems": 0
    }
  },
  "error": null
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| tripId | string | 行程ID |
| generatedAt | string | 生成时间（ISO 8601 格式） |
| items | array | 打包清单项列表 |
| items[].id | string | 物品ID |
| items[].name | string | 物品名称 |
| items[].category | enum | 类别 |
| items[].quantity | number | 数量 |
| items[].unit | string | 单位（可选） |
| items[].priority | enum | 优先级：`must`, `should`, `optional` |
| items[].reason | string | 为什么需要这个物品 |
| items[].sourceFindingId | string | 来源的 finding ID（如果有） |
| items[].checked | boolean | 是否已勾选（用户标记为已打包） |
| items[].note | string | 备注 |
| summary.totalItems | number | 总物品数 |
| summary.byCategory | object | 按类别统计 |
| summary.checkedItems | number | 已勾选物品数 |

**错误响应**:

- `400`: 请求参数错误
- `404`: 行程不存在
- `500`: 服务器内部错误

---

### 2. 获取打包清单

获取行程的打包清单（如果已生成）。

**接口**: `GET /api/readiness/trip/:tripId/packing-list`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程ID (UUID) |

**请求示例**:

```http
GET /api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tripId": "d125c30f-44ab-4a9e-9970-b899fccdc3d8",
    "items": [
      {
        "id": "item-1",
        "name": "分层保暖衣物",
        "category": "clothing",
        "quantity": 3,
        "priority": "must",
        "checked": false
      }
    ],
    "summary": {
      "totalItems": 15,
      "byCategory": {
        "clothing": 5,
        "gear": 4
      },
      "checkedItems": 2
    },
    "lastGeneratedAt": "2024-01-15T10:45:00Z"
  },
  "error": null
}
```

**字段说明**:

与生成接口的响应格式相同，但包含 `lastGeneratedAt` 字段表示最后生成时间。

**错误响应**:

- `404`: 行程不存在或打包清单未生成
- `500`: 服务器内部错误

---

### 3. 更新打包清单项状态

更新打包清单项的勾选状态、数量或备注。

**接口**: `PUT /api/readiness/trip/:tripId/packing-list/items/:itemId`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程ID (UUID) |
| itemId | string | 是 | 打包清单项 ID |

**请求体**:

```json
{
  "checked": true,
  "quantity": 2,
  "note": "已准备"
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| checked | boolean | 否 | 是否已勾选 |
| quantity | number | 否 | 更新数量 |
| note | string | 否 | 更新备注 |

**请求示例**:

```http
PUT /api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list/items/item-1
Content-Type: application/json

{
  "checked": true,
  "quantity": 2,
  "note": "已准备"
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "itemId": "item-1",
    "updated": true
  },
  "error": null
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| itemId | string | 物品ID |
| updated | boolean | 是否已更新 |

**错误响应**:

- `400`: 请求参数错误
- `404`: 行程或物品不存在
- `500`: 服务器内部错误

---

## 三、打包清单辅助接口

### 1. 获取打包顺序步骤

获取推荐的打包顺序步骤，帮助用户有序打包。

**接口**: `GET /api/readiness/packing-order-steps`

**请求示例**:

```http
GET /api/readiness/packing-order-steps
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
    ...
  },
  "error": null
}
```

---

### 2. 获取出发前检查清单

获取出发前24小时的最终检查清单。

**接口**: `GET /api/readiness/pre-departure-checklist`

**请求示例**:

```http
GET /api/readiness/pre-departure-checklist
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
      ...
    ],
    "3_hours_before": [
      "☐ 所有设备充电：手机、充电宝、相机电池",
      "☐ 衣物最后确认：都带了吗？试穿过吗？",
      ...
    ],
    "30_minutes_before": [
      "☐ 护照随身携带：放在易取位置，不要装行李箱",
      "☐ 手机开启离线地图：提前下载冰岛地图",
      ...
    ],
    "critical_items_absolute_must_have": [
      "✅ 护照",
      "✅ 驾照+国际驾照",
      "✅ 信用卡x2",
      ...
    ]
  },
  "error": null
}
```

---

## 四、使用示例

### 示例 1: 获取准备清单

```bash
curl -X GET "http://localhost:3000/api/readiness/personalized-checklist?tripId=d125c30f-44ab-4a9e-9970-b899fccdc3d8&lang=zh"
```

### 示例 2: 更新准备清单勾选状态

```bash
curl -X PUT "http://localhost:3000/api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/checklist/status" \
  -H "Content-Type: application/json" \
  -d '{
    "checkedItems": ["must-item-1", "must-item-2"]
  }'
```

### 示例 3: 生成打包清单（使用模板）

```bash
curl -X POST "http://localhost:3000/api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "season": "summer",
    "route": "south_coast",
    "userType": "first_timer",
    "activities": ["hiking", "hot_spring"],
    "durationDays": 3,
    "customItems": [
      {
        "name": "充电宝",
        "category": "electronics",
        "quantity": 1
      }
    ]
  }'
```

### 示例 3.1: 生成打包清单（使用原有逻辑）

```bash
curl -X POST "http://localhost:3000/api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "useTemplate": false,
    "includeOptional": false,
    "customItems": [
      {
        "name": "充电宝",
        "category": "electronics",
        "quantity": 1
      }
    ]
  }'
```

### 示例 4: 获取打包清单

```bash
curl -X GET "http://localhost:3000/api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list"
```

### 示例 5: 更新打包清单项

```bash
curl -X PUT "http://localhost:3000/api/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8/packing-list/items/item-1" \
  -H "Content-Type: application/json" \
  -d '{
    "checked": true,
    "quantity": 2
  }'
```

### 示例 6: 获取打包顺序步骤

```bash
curl -X GET "http://localhost:3000/api/readiness/packing-order-steps"
```

### 示例 7: 获取出发前检查清单

```bash
curl -X GET "http://localhost:3000/api/readiness/pre-departure-checklist"
```

---

## 五、数据模型

### 准备清单项

```typescript
interface ChecklistItem {
  message: string;        // 事项描述
  tasks: string[];        // 任务列表
  deadline: string | null; // 截止时间（当前为 null）
  channel: string | null;  // 办理渠道（当前为 null）
}
```

### 打包清单项

```typescript
interface PackingListItem {
  id: string;                    // 物品ID
  name: string;                  // 物品名称
  category: 'clothing' | 'gear' | 'documents' | 'electronics' | 'food' | 'medical' | 'other';
  quantity: number;              // 数量
  unit?: string;                // 单位
  priority: 'must' | 'should' | 'optional';
  reason?: string;              // 为什么需要这个物品
  sourceFindingId?: string;      // 来源的 finding ID
  checked: boolean;             // 是否已勾选
  note?: string;                // 备注
}
```

---

## 六、注意事项

1. **准备清单优先级**:
   - **blocker**: 阻塞项，必须解决才能继续
   - **must**: 必须项，强烈建议完成
   - **should**: 建议项，建议完成
   - **optional**: 可选项，可选完成

2. **打包清单类别**:
   - `clothing`: 衣物
   - `gear`: 装备
   - `documents`: 证件
   - `electronics`: 电子产品
   - `food`: 食物
   - `medical`: 医疗用品
   - `other`: 其他

3. **数据同步**:
   - 准备清单和打包清单的勾选状态会保存到数据库
   - 支持跨设备同步
   - 使用 `tripId` 作为唯一标识

4. **生成时机**:
   - 准备清单：基于行程信息自动生成
   - 打包清单：需要调用生成接口才会创建

---

## 七、相关接口

- [准备度检查 API](./READINESS_API.md) - 准备度检查相关接口
- [行程管理 API](../trips/README.md) - 行程管理相关接口

---

## 八、更新日志

- **2026-01-26**: 
  - 🆕 增强打包清单生成接口，支持基于模板数据生成（季节、路线、用户类型等参数）
  - 🆕 新增打包顺序步骤接口
  - 🆕 新增出发前检查清单接口
  - 初始版本，包含准备清单和打包清单接口
