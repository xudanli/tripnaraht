# 路线模板 API 接口文档

## 概述

路线模板（Route Template）是基于路线方向（Route Direction）创建的行程模板，定义了特定天数的每日计划、节奏偏好等信息。本文档描述了路线模板相关的所有 API 接口。

## 基础信息

- **基础路径**: `/route-directions/templates`
- **响应格式**: 统一使用标准响应格式
  ```json
  {
    "success": true,
    "data": { ... },
    "error": null
  }
  ```

## 数据模型

### RouteTemplateData 接口

```typescript
interface RouteTemplateData {
  routeDirectionId: number;        // 路线方向ID（必填）
  durationDays: number;             // 行程天数（必填）
  name?: string;                    // 模板名称（可选）
  nameCN?: string;                  // 中文名称（可选）
  nameEN?: string;                  // 英文名称（可选）
  dayPlans: DayPlan[];              // 每日计划数组（必填）
  defaultPacePreference?: 'RELAX' | 'BALANCED' | 'CHALLENGE';  // 默认节奏偏好（可选）
  metadata?: Record<string, any>;   // 元数据（可选）
}
```

### DayPlan 接口

```typescript
interface DayPlan {
  day: number;                      // 第几天（从1开始，必填）
  theme?: string;                   // 主题（可选）
  maxIntensity?: string;             // 强度上限：LIGHT/MODERATE/INTENSE（可选）
  maxElevationM?: number;           // 最大海拔（米，可选）
  requiredNodes?: string[];         // 必须节点（Place UUID 或名称，可选，向后兼容）
  optionalActivities?: string[];    // 可选活动类型（可选）
  pois?: DayPlanPoi[];              // 具体的POI列表（可选，用于维护具体的POI信息）
  [key: string]: any;               // 允许其他扩展字段
}
```

### DayPlanPoi 接口

```typescript
interface DayPlanPoi {
  id?: number;                      // POI ID（可选，如果已关联到数据库中的Place）
  uuid?: string;                    // POI UUID（可选，如果已关联到数据库中的Place）
  nameCN: string;                   // POI 中文名称（必填）
  nameEN?: string;                  // POI 英文名称（可选）
  category?: string;                // POI 类别（可选）
  address?: string;                 // POI 地址（可选）
  rating?: number;                  // POI 评分（可选，0-5）
  description?: string;             // POI 描述（可选）
  required?: boolean;               // 是否为必游POI（默认false）
  order?: number;                   // POI 顺序（用于排序，可选）
  durationMinutes?: number;         // 预计停留时间（分钟，可选）
  metadata?: Record<string, any>;   // 其他元数据（可选）
}
```

### 数据库字段

路线模板在数据库中的完整字段包括：

- `id`: 主键（自增）
- `uuid`: 唯一标识符
- `routeDirectionId`: 关联的路线方向ID
- `durationDays`: 行程天数
- `name`: 模板名称
- `nameCN`: 中文名称
- `nameEN`: 英文名称
- `dayPlans`: 每日计划（JSONB）
- `defaultPacePreference`: 默认节奏偏好
- `metadata`: 元数据（JSONB）
- `isActive`: 是否激活（默认 true）
- `createdAt`: 创建时间
- `updatedAt`: 更新时间

---

## API 接口

### POI 管理接口

#### 1. 向路线模板添加 POI

**接口**: `POST /route-directions/templates/:id/pois`

**描述**: 向指定路线的指定日期添加 POI。POI 会自动添加到 `dayPlans[day].pois` 数组中，并更新 `RouteDirection` 的 `signaturePois.examples`。

**路径参数**:
- `id` (number): 路线模板 ID

**请求体**:
```json
{
  "day": 1,                    // 第几天（从 1 开始）
  "poiId": 12345,              // POI ID（Place 表的 id）
  "required": false,           // 是否为必游 POI（可选，默认 false）
  "order": 1,                  // POI 顺序（可选，用于排序）
  "durationMinutes": 120       // 预计停留时间（分钟，可选）
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "xxx",
    "routeDirectionId": 1,
    "durationDays": 7,
    "dayPlans": [
      {
        "day": 1,
        "pois": [
          {
            "id": 12345,
            "uuid": "550e8400-e29b-41d4-a716-446655440000",
            "nameCN": "蓝湖温泉",
            "nameEN": "Blue Lagoon",
            "category": "ATTRACTION",
            "required": false,
            "order": 1,
            "durationMinutes": 120
          }
        ]
      }
    ]
  }
}
```

**错误响应**:
- `404`: 路线模板或 POI 不存在
- `400`: POI 已存在或参数错误

**使用示例**:
```bash
curl -X POST http://localhost:3000/route-directions/templates/1/pois \
  -H "Content-Type: application/json" \
  -d '{
    "day": 1,
    "poiId": 12345,
    "required": true,
    "order": 1,
    "durationMinutes": 180
  }'
```

#### 2. 从路线模板移除 POI

**接口**: `DELETE /route-directions/templates/:id/pois`

**描述**: 从指定路线的指定日期移除 POI。可以通过 `poiId`、`poiUuid` 或 `index` 指定要移除的 POI。

**路径参数**:
- `id` (number): 路线模板 ID

**请求体**:
```json
{
  "day": 1,                    // 第几天（从 1 开始）
  "poiId": 12345               // 方式1: 通过 POI ID 移除
}
```

或者：

```json
{
  "day": 1,
  "poiUuid": "550e8400-e29b-41d4-a716-446655440000"  // 方式2: 通过 POI UUID 移除
}
```

或者：

```json
{
  "day": 1,
  "index": 0                    // 方式3: 通过索引移除（从 0 开始）
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "template": {
      "id": 1,
      "dayPlans": [
        {
          "day": 1,
          "pois": []  // POI 已被移除
        }
      ]
    },
    "removedPoi": {
      "id": 12345,
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "nameCN": "蓝湖温泉",
      "nameEN": "Blue Lagoon"
    }
  }
}
```

**错误响应**:
- `404`: 路线模板或 POI 不存在
- `400`: 参数错误（必须提供 poiId、poiUuid 或 index 之一）

**使用示例**:
```bash
# 通过 ID 移除
curl -X DELETE http://localhost:3000/route-directions/templates/1/pois \
  -H "Content-Type: application/json" \
  -d '{
    "day": 1,
    "poiId": 12345
  }'

# 通过 UUID 移除
curl -X DELETE http://localhost:3000/route-directions/templates/1/pois \
  -H "Content-Type: application/json" \
  -d '{
    "day": 1,
    "poiUuid": "550e8400-e29b-41d4-a716-446655440000"
  }'

# 通过索引移除
curl -X DELETE http://localhost:3000/route-directions/templates/1/pois \
  -H "Content-Type: application/json" \
  -d '{
    "day": 1,
    "index": 0
  }'
```

---

## API 接口

### 1. 创建路线模板

创建基于路线方向的行程模板。

**接口**: `POST /route-directions/templates`

**请求体**:

```json
{
  "routeDirectionId": 1,
  "durationDays": 7,
  "nameCN": "经典7日游",
  "nameEN": "Classic 7-Day Tour",
  "dayPlans": [
    {
      "day": 1,
      "theme": "适应日",
      "maxIntensity": "LIGHT",
      "maxElevationM": 3000,
      "requiredNodes": ["lodge_uuid_1"]
    },
    {
      "day": 2,
      "theme": "探索日",
      "maxIntensity": "MODERATE",
      "maxElevationM": 3500
    },
    {
      "day": 3,
      "theme": "挑战日",
      "maxIntensity": "INTENSE",
      "maxElevationM": 4000,
      "requiredNodes": ["peak_uuid_1"]
    }
  ],
  "defaultPacePreference": "BALANCED",
  "metadata": {
    "difficulty": "moderate",
    "bestSeason": "spring"
  },
  "isActive": true
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| routeDirectionId | number | 是 | 路线方向ID，必须存在 |
| durationDays | number | 是 | 行程天数（如 3, 5, 7, 10） |
| name | string | 否 | 模板名称 |
| nameCN | string | 否 | 中文名称 |
| nameEN | string | 否 | 英文名称 |
| dayPlans | DayPlan[] | 是 | 每日计划数组，长度应等于 durationDays |
| defaultPacePreference | enum | 否 | 默认节奏偏好：RELAX/BALANCED/CHALLENGE |
| metadata | object | 否 | 元数据，可存储任意键值对 |
| isActive | boolean | 否 | 是否激活，默认 true |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "routeDirectionId": 1,
    "durationDays": 7,
    "nameCN": "经典7日游",
    "nameEN": "Classic 7-Day Tour",
    "dayPlans": [
      {
        "day": 1,
        "theme": "适应日",
        "maxIntensity": "LIGHT",
        "maxElevationM": 3000,
        "requiredNodes": ["lodge_uuid_1"]
      }
    ],
    "defaultPacePreference": "BALANCED",
    "metadata": {
      "difficulty": "moderate",
      "bestSeason": "spring"
    },
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "routeDirection": {
      "id": 1,
      "nameCN": "南岛湖区+山口+徒步",
      "countryCode": "NZ"
    }
  },
  "error": null
}
```

**错误响应**:

- `404`: 路线方向不存在
- `400`: 请求参数验证失败
- `500`: 服务器内部错误

---

### 2. 查询路线模板列表

根据条件查询路线模板列表。

**接口**: `GET /route-directions/templates`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| routeDirectionId | number | 否 | 按路线方向ID筛选 |
| durationDays | number | 否 | 按行程天数筛选 |
| isActive | boolean | 否 | 按激活状态筛选 |
| limit | number | 否 | 返回数量限制 |
| offset | number | 否 | 偏移量（用于分页） |

**请求示例**:

```http
GET /route-directions/templates?routeDirectionId=1&durationDays=7&isActive=true&limit=10&offset=0
```

**响应示例**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "routeDirectionId": 1,
      "durationDays": 7,
      "nameCN": "经典7日游",
      "dayPlans": [...],
      "defaultPacePreference": "BALANCED",
      "isActive": true,
      "routeDirection": {
        "id": 1,
        "nameCN": "南岛湖区+山口+徒步"
      }
    }
  ],
  "error": null
}
```

---

### 3. 获取路线模板详情

根据 ID 获取路线模板的详细信息。

**接口**: `GET /route-directions/templates/:id`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 路线模板ID |

**请求示例**:

```http
GET /route-directions/templates/1
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "routeDirectionId": 1,
    "durationDays": 7,
    "nameCN": "经典7日游",
    "nameEN": "Classic 7-Day Tour",
    "dayPlans": [
      {
        "day": 1,
        "theme": "适应日",
        "maxIntensity": "LIGHT",
        "maxElevationM": 3000,
        "requiredNodes": ["lodge_uuid_1"]
      },
      {
        "day": 2,
        "theme": "探索日",
        "maxIntensity": "MODERATE",
        "maxElevationM": 3500
      }
    ],
    "defaultPacePreference": "BALANCED",
    "metadata": {
      "difficulty": "moderate"
    },
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "routeDirection": {
      "id": 1,
      "nameCN": "南岛湖区+山口+徒步",
      "countryCode": "NZ",
      "tags": ["徒步", "摄影"]
    }
  },
  "error": null
}
```

**错误响应**:

- `404`: 路线模板不存在
- `500`: 服务器内部错误

---

### 4. 更新路线模板

更新路线模板的信息。

**接口**: `PUT /route-directions/templates/:id`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 路线模板ID |

**请求体**:

所有字段均为可选，只更新提供的字段。

```json
{
  "nameCN": "更新后的名称",
  "dayPlans": [
    {
      "day": 1,
      "theme": "新的主题",
      "maxIntensity": "MODERATE"
    }
  ],
  "defaultPacePreference": "CHALLENGE",
  "isActive": false
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| routeDirectionId | number | 否 | 路线方向ID（如果更新，会验证是否存在） |
| durationDays | number | 否 | 行程天数 |
| name | string | 否 | 模板名称 |
| nameCN | string | 否 | 中文名称 |
| nameEN | string | 否 | 英文名称 |
| dayPlans | DayPlan[] | 否 | 每日计划数组 |
| defaultPacePreference | enum | 否 | 默认节奏偏好 |
| metadata | object | 否 | 元数据 |
| isActive | boolean | 否 | 是否激活 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "routeDirectionId": 1,
    "durationDays": 7,
    "nameCN": "更新后的名称",
    "dayPlans": [...],
    "defaultPacePreference": "CHALLENGE",
    "isActive": false,
    "updatedAt": "2024-01-02T00:00:00.000Z",
    "routeDirection": { ... }
  },
  "error": null
}
```

**错误响应**:

- `404`: 路线模板不存在或路线方向不存在
- `400`: 请求参数验证失败
- `500`: 服务器内部错误

---

### 5. 删除路线模板

软删除路线模板（设置 `isActive = false`）。

**接口**: `DELETE /route-directions/templates/:id`

**描述**: 软删除路线模板（设置 `isActive = false`），数据仍保留在数据库中

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 路线模板ID |

**请求示例**:

```http
DELETE /route-directions/templates/1
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "message": "Route template deleted successfully"
  },
  "error": null
}
```

**错误响应**:

- `404`: 路线模板不存在
- `500`: 服务器内部错误

---

### 5.6 物理删除路线模板

**接口**: `DELETE /route-directions/templates/:id/hard`

**描述**: 物理删除路线模板，从数据库中彻底删除记录（不可恢复）。请谨慎使用此接口。

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 路线模板ID |

**请求示例**:

```http
DELETE /route-directions/templates/1/hard
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "message": "Route template hard deleted successfully"
  },
  "error": null
}
```

**错误响应**:

- `404`: 路线模板不存在
- `500`: 服务器内部错误

**注意事项**:
- 物理删除操作不可恢复，请确保在删除前已备份重要数据
- 删除后，该路线模板的所有关联数据也将被删除（根据数据库外键约束）

---

## 使用示例

### 示例 1: 创建并查询路线模板

```bash
# 1. 创建路线模板
curl -X POST http://localhost:3000/route-directions/templates \
  -H "Content-Type: application/json" \
  -d '{
    "routeDirectionId": 1,
    "durationDays": 7,
    "nameCN": "经典7日游",
    "dayPlans": [
      {"day": 1, "theme": "适应日", "maxIntensity": "LIGHT"},
      {"day": 2, "theme": "探索日", "maxIntensity": "MODERATE"}
    ],
    "defaultPacePreference": "BALANCED"
  }'

# 2. 查询该路线方向的所有模板
curl "http://localhost:3000/route-directions/templates?routeDirectionId=1"

# 3. 获取模板详情
curl "http://localhost:3000/route-directions/templates/1"
```

### 示例 2: 更新路线模板

```bash
# 更新模板的节奏偏好
curl -X PUT http://localhost:3000/route-directions/templates/1 \
  -H "Content-Type: application/json" \
  -d '{
    "defaultPacePreference": "CHALLENGE",
    "isActive": true
  }'
```

### 示例 3: 查询特定天数的模板

```bash
# 查询7天行程的模板
curl "http://localhost:3000/route-directions/templates?durationDays=7&isActive=true"
```

---

## 注意事项

1. **路线方向关联**: 创建或更新模板时，`routeDirectionId` 必须指向一个存在的路线方向。

2. **每日计划数量**: `dayPlans` 数组的长度建议与 `durationDays` 一致，但系统不做强制校验。

3. **软删除**: 删除操作是软删除，只设置 `isActive = false`，不会物理删除数据。

4. **节奏偏好**: `defaultPacePreference` 的可选值为：
   - `RELAX`: 轻松节奏
   - `BALANCED`: 平衡节奏
   - `CHALLENGE`: 挑战节奏

5. **强度等级**: `maxIntensity` 的可选值为：
   - `LIGHT`: 轻度
   - `MODERATE`: 中度
   - `INTENSE`: 高强度

6. **扩展字段**: `DayPlan` 接口支持扩展字段，可以在 `dayPlans` 中添加自定义字段。

---

## 相关接口

- [路线方向 API](./README.md) - 路线方向相关接口
- [行程规划 API](../trips/README.md) - 行程规划相关接口

---

### 6. 使用模板创建行程

从路线模板生成可执行行程（对应工作台的"使用模板"按钮）。

**接口**: `POST /route-directions/templates/:id/create-trip`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 路线模板ID |

**请求体**:

```json
{
  "destination": "IS",
  "startDate": "2024-06-01",
  "endDate": "2024-06-07",
  "totalBudget": 50000,
  "pacePreference": "BALANCED",
  "intensity": "balanced",
  "transport": "car",
  "travelers": [
    {
      "type": "ADULT",
      "mobilityTag": "ACTIVE_SENIOR"
    }
  ],
  "constraints": {
    "withElderly": true,
    "earlyRiser": false,
    "dietaryRestrictions": ["vegetarian"],
    "avoidCategories": ["nightlife"]
  }
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| destination | string | 是 | 目的地国家代码（ISO 3166-1 alpha-2） |
| startDate | string | 是 | 开始日期（ISO 8601） |
| endDate | string | 是 | 结束日期（ISO 8601） |
| totalBudget | number | 否 | 总预算（元） |
| pacePreference | enum | 否 | 节奏偏好：RELAXED/BALANCED/CHALLENGE（覆盖模板默认值） |
| intensity | enum | 否 | 强度偏好：relaxed/balanced/intense |
| transport | enum | 否 | 交通方式：walk/transit/car |
| travelers | array | 否 | 旅行者列表 |
| travelers[].type | enum | 是 | 旅行者类型：ADULT/ELDERLY/CHILD |
| travelers[].mobilityTag | enum | 是 | 行动能力标签：IRON_LEGS/ACTIVE_SENIOR/CITY_POTATO/LIMITED |
| constraints | object | 否 | 约束条件 |
| constraints.withChildren | boolean | 否 | 是否有儿童 |
| constraints.withElderly | boolean | 否 | 是否有老人 |
| constraints.earlyRiser | boolean | 否 | 是否早起 |
| constraints.dietaryRestrictions | string[] | 否 | 饮食限制 |
| constraints.avoidCategories | string[] | 否 | 避免的类别 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "trip": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "destination": "IS",
      "startDate": "2024-06-01T00:00:00.000Z",
      "endDate": "2024-06-07T00:00:00.000Z",
      "totalBudget": 50000,
      "status": "PLANNING",
      "pacingConfig": {
        "pacePreference": "BALANCED",
        "intensity": "balanced",
        "transport": "car"
      },
      "budgetConfig": {
        "totalBudget": 50000,
        "currency": "CNY"
      }
    },
    "generatedItems": [
      {
        "day": 1,
        "date": "2024-06-01",
        "items": [
          {
            "placeId": 123,
            "type": "ACTIVITY",
            "startTime": "2024-06-01T09:00:00.000Z",
            "endTime": "2024-06-01T12:00:00.000Z",
            "note": "根据模板主题\"冰川探索\"选择",
            "reason": "根据模板主题\"冰川探索\"选择"
          },
          {
            "placeId": 456,
            "type": "MEAL_ANCHOR",
            "startTime": "2024-06-01T12:00:00.000Z",
            "endTime": "2024-06-01T14:00:00.000Z",
            "note": "午餐推荐",
            "reason": "午餐推荐"
          }
        ]
      }
    ],
    "stats": {
      "totalDays": 7,
      "totalItems": 25,
      "placesMatched": 23,
      "placesMissing": 2
    },
    "warnings": [
      "2 required places could not be matched"
    ]
  },
  "error": null
}
```

**错误响应**:

- `404`: 路线模板不存在或目的地没有地点数据
- `400`: 请求参数验证失败
- `500`: 服务器内部错误

**业务逻辑**:

1. **读取模板**: 获取路线模板详情和 `dayPlans`
2. **匹配地点**: 根据模板的 `routeDirection.countryCode` 和 `dayPlans` 从 place 表检索候选地点
3. **LLM 编排**: 使用 LLM 从候选中选择合适的地点，生成每日行程
4. **创建行程**: 创建 Trip、TripDay 和 ItineraryItem 记录
5. **验证**: 验证所有 placeId 存在于数据库，校验营业时间和距离

---

## 更新日志

- **2024-01-01**: 初始版本，包含创建、查询、更新、删除接口
- **2024-01-02**: 新增使用模板创建行程接口

