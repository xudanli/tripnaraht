# 徒步路线接口文档

## 概述

本文档整理了所有与徒步（Hiking）相关的 API 接口。徒步路线通过 `tags` 字段中的 `"徒步"` 标签进行标识和筛选。这些接口可用于查询、获取和管理徒步相关的路线方向（Route Direction）和路线模板（Route Template）。

## 基础信息

- **基础路径**: `/route-directions`
- **响应格式**: 统一使用标准响应格式
  ```json
  {
    "success": true,
    "data": { ... },
    "error": null
  }
  ```

## 徒步标签说明

徒步相关的路线方向使用以下标签标识：
- `"徒步"` - 中文标签，用于标识徒步路线
- 可与其他标签组合使用，如：`["徒步", "摄影"]`、`["徒步", "湖区"]` 等

## 数据模型

### RouteDirection 徒步路线数据结构

```typescript
interface RouteDirection {
  id: number;
  uuid: string;
  countryCode: string;              // 国家代码（如：NZ, NP, CN_XZ）
  name: string;                     // 路线标识（如：NZ_SOUTH_ISLAND_LAKES_AND_PASSES）
  nameCN: string;                   // 中文名称（如：南岛湖区+山口+徒步）
  nameEN?: string;                  // 英文名称
  description?: string;             // 路线描述
  tags: string[];                   // 标签数组，包含 "徒步"
  regions: string[];                // 地理区域列表
  entryHubs: string[];              // 入口枢纽
  seasonality?: {                   // 季节性信息
    bestMonths?: number[];          // 最佳月份（1-12）
    avoidMonths?: number[];         // 避免月份
  };
  constraints?: {                   // 徒步约束条件
    maxElevationM?: number;         // 最大海拔（米）
    maxDailyAscentM?: number;       // 最大日爬升（米）
    maxSlope?: number;              // 最大坡度
    requiresPermit?: boolean;        // 是否需要许可
    requiresGuide?: boolean;         // 是否需要向导
    rapidAscentForbidden?: boolean; // 是否禁止快速爬升
  };
  riskProfile?: {                   // 风险画像
    altitudeSickness?: boolean;     // 高反风险
    roadClosure?: boolean;          // 封路风险
    ferryDependent?: boolean;       // 依赖渡轮
    weatherWindow?: boolean;        // 天气窗口
    weatherWindowMonths?: number[]; // 天气窗口月份
  };
  signaturePois?: {                 // 代表性 POI
    types?: string[];
    examples?: string[];
  };
  itinerarySkeleton?: {            // 行程骨架
    dayThemes?: string[];           // 每日主题
    dailyPace?: string;             // 每日节奏
    restDaysRequired?: number[];    // 需要休息的日期
  };
  isActive: boolean;                // 是否激活
  createdAt: string;                // 创建时间
  updatedAt: string;                // 更新时间
}
```

---

## API 接口

### 1. 查询徒步路线方向

根据条件查询包含徒步标签的路线方向列表。

**接口**: `GET /route-directions`

**查询参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `countryCode` | string | 否 | 国家代码（如：NZ, NP, CN_XZ） |
| `tag` | string | 否 | 单个标签，使用 `"徒步"` 筛选徒步路线 |
| `tags` | string[] | 否 | 标签数组，可传入 `["徒步"]` 或 `["徒步", "摄影"]` |
| `isActive` | boolean | 否 | 是否只返回激活的路线（默认 true） |
| `month` | number | 否 | 月份（1-12），用于季节性筛选 |

**请求示例**:

```http
# 查询所有徒步路线
GET /route-directions?tag=徒步

# 查询新西兰的徒步路线
GET /route-directions?countryCode=NZ&tag=徒步

# 查询1月份适合的徒步+摄影路线
GET /route-directions?tags=徒步,摄影&month=1

# 查询尼泊尔的徒步路线
GET /route-directions?countryCode=NP&tag=徒步
```

**响应示例**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "uuid": "xxx-xxx-xxx",
      "countryCode": "NZ",
      "name": "NZ_SOUTH_ISLAND_LAKES_AND_PASSES",
      "nameCN": "南岛湖区+山口+徒步",
      "nameEN": "South Island Lakes and Passes",
      "tags": ["徒步", "摄影", "湖区"],
      "regions": ["NZ_QT", "NZ_WN"],
      "entryHubs": ["Queenstown Airport"],
      "seasonality": {
        "bestMonths": [12, 1, 2, 3],
        "avoidMonths": [6, 7, 8]
      },
      "constraints": {
        "maxElevationM": 2000,
        "maxDailyAscentM": 800
      },
      "riskProfile": {
        "roadClosure": true,
        "weatherWindow": true
      },
      "isActive": true
    }
  ],
  "error": null
}
```

---

### 2. 根据国家获取徒步路线（Agent 专用）

用于 Agent 路由，根据国家代码获取可用的徒步路线方向。

**接口**: `GET /route-directions/by-country/:countryCode`

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `countryCode` | string | 是 | 国家代码（如：NZ, NP, CN_XZ） |

**查询参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `tags` | string[] | 否 | 标签数组，传入 `["徒步"]` 筛选徒步路线 |
| `month` | number | 否 | 月份（1-12） |
| `limit` | number | 否 | 返回数量限制 |

**请求示例**:

```http
# 获取新西兰的徒步路线（Top 5）
GET /route-directions/by-country/NZ?tags=徒步&month=1&limit=5

# 获取尼泊尔的徒步+摄影路线
GET /route-directions/by-country/NP?tags=徒步,摄影&month=10&limit=3
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "active": [
      {
        "id": 1,
        "nameCN": "南岛湖区+山口+徒步",
        "tags": ["徒步", "摄影", "湖区"],
        ...
      }
    ],
    "deprecated": []
  },
  "error": null
}
```

---

### 3. 获取徒步路线详情

根据 ID 或 UUID 获取徒步路线的详细信息。

**接口**: `GET /route-directions/:id`

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | number | 是 | 路线方向 ID |

**请求示例**:

```http
GET /route-directions/1
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "xxx-xxx-xxx",
    "countryCode": "NZ",
    "name": "NZ_SOUTH_ISLAND_LAKES_AND_PASSES",
    "nameCN": "南岛湖区+山口+徒步",
    "tags": ["徒步", "摄影", "湖区"],
    "constraints": {
      "maxElevationM": 2000,
      "maxDailyAscentM": 800,
      "requiresPermit": false
    },
    "riskProfile": {
      "roadClosure": true,
      "weatherWindow": true
    },
    ...
  },
  "error": null
}
```

**接口**: `GET /route-directions/uuid/:uuid`

根据 UUID 获取路线详情，参数和响应格式同上。

---

### 4. 获取徒步路线卡片

获取用于前端展示的徒步路线卡片信息。

**接口**: `GET /route-directions/cards`

**查询参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `countryCode` | string | 是 | 国家代码 |
| `tags` | string[] | 否 | 标签数组，传入 `["徒步"]` 筛选 |
| `month` | number | 否 | 月份（1-12） |
| `preferences` | string[] | 否 | 用户偏好标签 |
| `pace` | string | 否 | 节奏偏好：relaxed/moderate/intense |
| `riskTolerance` | string | 否 | 风险承受度：low/medium/high |

**请求示例**:

```http
GET /route-directions/cards?countryCode=NZ&tags=徒步&month=1&preferences=徒步,摄影&pace=moderate
```

**响应示例**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "nameCN": "南岛湖区+山口+徒步",
      "tags": ["徒步", "摄影", "湖区"],
      "countryCode": "NZ",
      "summary": "适合徒步和摄影爱好者的经典路线",
      "bestMonths": [12, 1, 2, 3],
      "constraints": {
        "maxElevationM": 2000,
        "maxDailyAscentM": 800
      }
    }
  ],
  "error": null
}
```

**接口**: `GET /route-directions/:id/card`

获取单个路线方向的卡片信息。

---

### 5. 获取徒步路线交互列表（前端卡片切换）

返回徒步路线卡片、匹配分数、解释和 whyNotOthers，用于前端卡片切换功能。

**接口**: `GET /route-directions/interactions`

**查询参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `countryCode` | string | 是 | 国家代码 |
| `month` | number | 否 | 月份（1-12） |
| `preferences` | string[] | 否 | 偏好标签（如：`["徒步", "摄影"]`） |
| `pace` | string | 否 | 节奏偏好：relaxed/moderate/intense |
| `riskTolerance` | string | 否 | 风险承受度：low/medium/high |

**请求示例**:

```http
GET /route-directions/interactions?countryCode=NZ&month=1&preferences=徒步,摄影&pace=moderate&riskTolerance=medium
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "directions": [
      {
        "direction": {
          "id": 1,
          "nameCN": "南岛湖区+山口+徒步",
          "tags": ["徒步", "摄影", "湖区"],
          ...
        },
        "score": 85,
        "scoreBreakdown": {
          "tagMatch": {
            "score": 90,
            "weight": 0.4,
            "matchedTags": ["徒步", "摄影"]
          },
          "seasonality": {
            "score": 100,
            "weight": 0.3,
            "isBestMonth": true,
            "month": 1
          },
          "pace": {
            "score": 80,
            "weight": 0.2,
            "compatible": true
          },
          "risk": {
            "score": 70,
            "weight": 0.1,
            "compatible": true
          }
        },
        "explanation": "这条路线特别适合徒步、摄影爱好者。1月是这条路线的最佳旅行时间。路线节奏与您的偏好高度匹配。",
        "whyNotOthers": [
          {
            "routeId": 2,
            "reason": "该路线在1月不是最佳季节"
          }
        ]
      }
    ],
    "countryCode": "NZ",
    "month": 1,
    "preferences": ["徒步", "摄影"]
  },
  "error": null
}
```

---

### 6. 获取徒步路线说明卡

获取可解释、可对外讲、可运营的徒步路线说明卡。

**接口**: `GET /route-directions/:id/explainer`

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | number | 是 | 路线方向 ID |

**请求示例**:

```http
GET /route-directions/1/explainer
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "title": "南岛湖区+山口+徒步",
    "summary": "适合徒步和摄影爱好者的经典路线",
    "highlights": [
      "最佳季节：12月-3月",
      "最大海拔：2000米",
      "日爬升限制：800米"
    ],
    "constraints": {
      "maxElevationM": 2000,
      "maxDailyAscentM": 800
    },
    "risks": [
      "冬季可能封路",
      "需要关注天气窗口"
    ],
    "recommendations": [
      "建议携带防滑装备",
      "提前查看天气预报"
    ]
  },
  "error": null
}
```

**接口**: `GET /route-directions/explainers?countryCode=NZ`

获取指定国家的所有路线方向说明卡列表。

---

### 7. 创建徒步路线方向（管理接口）

创建新的徒步路线方向。

**接口**: `POST /route-directions`

**请求体**:

```json
{
  "countryCode": "NZ",
  "name": "NZ_SOUTH_ISLAND_LAKES_AND_PASSES",
  "nameCN": "南岛湖区+山口+徒步",
  "nameEN": "South Island Lakes and Passes",
  "description": "适合徒步和摄影爱好者的经典路线",
  "tags": ["徒步", "摄影", "湖区"],
  "regions": ["NZ_QT", "NZ_WN"],
  "entryHubs": ["Queenstown Airport"],
  "seasonality": {
    "bestMonths": [12, 1, 2, 3],
    "avoidMonths": [6, 7, 8]
  },
  "constraints": {
    "maxElevationM": 2000,
    "maxDailyAscentM": 800,
    "requiresPermit": false,
    "requiresGuide": false,
    "rapidAscentForbidden": true
  },
  "riskProfile": {
    "altitudeSickness": false,
    "roadClosure": true,
    "ferryDependent": false,
    "weatherWindow": true,
    "weatherWindowMonths": [6, 7, 8]
  },
  "signaturePois": {
    "types": ["mountain_pass", "lake", "viewpoint"],
    "examples": ["Milford Sound", "Queenstown"]
  },
  "itinerarySkeleton": {
    "dayThemes": ["适应日", "探索日", "深度体验"],
    "dailyPace": "MODERATE",
    "restDaysRequired": [3, 6]
  },
  "isActive": true
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "xxx-xxx-xxx",
    ...
  },
  "error": null
}
```

---

### 8. 更新徒步路线方向（管理接口）

更新徒步路线方向信息。

**接口**: `PUT /route-directions/:id`

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | number | 是 | 路线方向 ID |

**请求体**: 同创建接口，所有字段可选。

---

### 9. 删除徒步路线方向（管理接口）

软删除徒步路线方向（设置 isActive = false）。

**接口**: `DELETE /route-directions/:id`

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | number | 是 | 路线方向 ID |

---

### 10. 创建徒步路线模板

创建基于徒步路线方向的行程模板。

**接口**: `POST /route-directions/templates`

**请求体**:

```json
{
  "routeDirectionId": 1,
  "durationDays": 7,
  "nameCN": "经典7日徒步游",
  "nameEN": "Classic 7-Day Hiking Tour",
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
      "theme": "休息日",
      "maxIntensity": "LIGHT",
      "requiredNodes": ["rest_point_uuid"]
    }
  ],
  "defaultPacePreference": "BALANCED"
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "xxx-xxx-xxx",
    "routeDirectionId": 1,
    "durationDays": 7,
    ...
  },
  "error": null
}
```

---

## 徒步路线示例

### 新西兰 (NZ)

- **NZ_SOUTH_ISLAND_LAKES_AND_PASSES**: 南岛湖区+山口+徒步
  - 标签：`["徒步", "摄影", "湖区"]`
  - 最佳季节：12月-3月
  - 最大海拔：2000米

### 尼泊尔 (NP)

- **NP_EBC_CLASSIC**: EBC 经典徒步线
  - 标签：`["徒步", "高海拔"]`
  - 最佳季节：10月-11月，3月-5月
  - 最大海拔：5500米+
  - 需要许可：是

- **NP_ANNAPURNA_BASE_CAMP**: 安娜普尔纳大本营
  - 标签：`["徒步", "山区"]`
  - 最佳季节：10月-11月，3月-5月
  - 最大海拔：4130米

### 西藏 (CN_XZ)

- **CN_XZ_EBC_GATE**: 定日-珠峰入口
  - 标签：`["徒步", "高海拔"]`
  - 最佳季节：5月-10月
  - 最大海拔：5200米+
  - 高反风险：是

---

## 使用场景

### 场景 1: 用户搜索徒步路线

```http
# 用户输入：目的地=新西兰，偏好=徒步，月份=1月
GET /route-directions/interactions?countryCode=NZ&month=1&preferences=徒步&pace=moderate
```

### 场景 2: Agent 路由选择

```http
# Agent 需要为新西兰选择徒步路线
GET /route-directions/by-country/NZ?tags=徒步&month=1&limit=3
```

### 场景 3: 获取路线详情

```http
# 用户点击某个徒步路线卡片，获取详细信息
GET /route-directions/1
GET /route-directions/1/card
GET /route-directions/1/explainer
```

---

## 错误处理

所有接口统一返回标准错误格式：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "路线方向不存在"
  }
}
```

常见错误码：
- `NOT_FOUND`: 资源不存在
- `INTERNAL_ERROR`: 服务器内部错误
- `VALIDATION_ERROR`: 参数验证失败

---

## 注意事项

1. **标签筛选**：使用 `tag=徒步` 或 `tags=["徒步"]` 来筛选徒步路线
2. **季节性**：建议结合 `month` 参数进行季节性筛选，获取最佳季节的路线
3. **约束条件**：注意查看 `constraints` 字段，了解海拔、爬升等限制
4. **风险提示**：关注 `riskProfile` 字段，特别是高反、封路等风险
5. **组合标签**：可以组合多个标签，如 `tags=徒步,摄影` 来获取更精确的结果

---

## 相关文档

- [路线方向 API 文档](./README.md)
- [路线模板 API 文档](./ROUTE_TEMPLATE_API.md)
- [准备度检查 API 文档](../trips/readiness/READINESS_API.md)

