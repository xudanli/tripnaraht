# 路线模块 CRUD 接口文档

本文档列出了路线模块（Route Directions）的所有增删改查接口。

## 基础路径

所有接口的基础路径为：`/route-directions`

## 1. 路线方向（RouteDirection）CRUD 接口

### 1.1 创建路线方向

**接口：** `POST /route-directions`

**描述：** 创建新的路线方向

**请求体：** `CreateRouteDirectionDto`

**响应：** 返回创建的路线方向对象

**示例：**
```json
{
  "countryCode": "IS",
  "name": "Iceland Ring Road",
  "nameCN": "冰岛环岛公路",
  "nameEN": "Iceland Ring Road",
  "description": "环绕冰岛一周的经典路线",
  "tags": ["scenic", "road-trip"],
  "regions": ["South", "North"],
  "entryHubs": ["Reykjavik"],
  "isActive": true
}
```

### 1.2 查询路线方向列表

**接口：** `GET /route-directions`

**描述：** 根据条件查询路线方向列表

**查询参数：**
- `countryCode` (可选): 国家代码
- `tag` (可选): 单个标签
- `tags` (可选): 标签数组
- `isActive` (可选): 是否激活（布尔值）
- `month` (可选): 月份（1-12），用于季节性筛选

**响应：** 返回路线方向数组

**示例：**
```
GET /route-directions?countryCode=IS&tags=scenic,road-trip&isActive=true
```

### 1.3 根据ID获取路线方向

**接口：** `GET /route-directions/:id`

**描述：** 根据ID获取单个路线方向的详细信息

**路径参数：**
- `id`: 路线方向ID（数字）

**响应：** 返回路线方向对象

**示例：**
```
GET /route-directions/1
```

### 1.4 根据UUID获取路线方向

**接口：** `GET /route-directions/uuid/:uuid`

**描述：** 根据UUID获取路线方向

**路径参数：**
- `uuid`: 路线方向UUID（字符串）

**响应：** 返回路线方向对象

**示例：**
```
GET /route-directions/uuid/550e8400-e29b-41d4-a716-446655440000
```

### 1.5 更新路线方向

**接口：** `PUT /route-directions/:id`

**描述：** 更新路线方向信息

**路径参数：**
- `id`: 路线方向ID（数字）

**请求体：** `UpdateRouteDirectionDto`（所有字段可选）

**响应：** 返回更新后的路线方向对象

**示例：**
```json
PUT /route-directions/1
{
  "nameCN": "冰岛环岛公路（更新）",
  "description": "更新后的描述",
  "isActive": true
}
```

### 1.6 删除路线方向

**接口：** `DELETE /route-directions/:id`

**描述：** 软删除路线方向（设置 `isActive = false`）

**路径参数：**
- `id`: 路线方向ID（数字）

**响应：** 返回成功消息

**示例：**
```
DELETE /route-directions/1
```

### 1.7 根据国家获取路线方向

**接口：** `GET /route-directions/by-country/:countryCode`

**描述：** 用于 Agent 路由，根据国家代码获取可用的路线方向

**路径参数：**
- `countryCode`: 国家代码

**查询参数：**
- `tags` (可选): 标签数组
- `month` (可选): 月份（1-12）
- `limit` (可选): 返回数量限制

**响应：** 返回路线方向数组

**示例：**
```
GET /route-directions/by-country/IS?tags=scenic&month=7&limit=10
```

## 2. 路线模板（RouteTemplate）CRUD 接口

### 2.1 创建路线模板

**接口：** `POST /route-directions/templates`

**描述：** 创建基于路线方向的行程模板

**请求体：** `CreateRouteTemplateDto`

**响应：** 返回创建的路线模板对象

**示例：**
```json
{
  "routeDirectionId": 1,
  "durationDays": 7,
  "name": "7天冰岛环岛",
  "nameCN": "7天冰岛环岛",
  "dayPlans": [
    {
      "day": 1,
      "theme": "雷克雅未克探索",
      "requiredNodes": [],
      "pois": [
        {
          "nameCN": "雷克雅未克大教堂",
          "nameEN": "Hallgrímskirkja",
          "category": "ATTRACTION",
          "address": "Hallgrímstorg 101, 101 Reykjavík, Iceland",
          "rating": 4.5,
          "required": true,
          "order": 1,
          "durationMinutes": 60
        },
        {
          "id": 12345,
          "uuid": "550e8400-e29b-41d4-a716-446655440000",
          "nameCN": "蓝湖温泉",
          "nameEN": "Blue Lagoon",
          "category": "ATTRACTION",
          "required": true,
          "order": 2,
          "durationMinutes": 180
        }
      ]
    },
    {
      "day": 2,
      "theme": "黄金圈探索",
      "pois": [
        {
          "nameCN": "盖歇尔间歇泉",
          "nameEN": "Geysir",
          "category": "ATTRACTION",
          "required": true,
          "order": 1,
          "durationMinutes": 45
        }
      ]
    }
  ],
  "defaultPacePreference": "BALANCED",
  "isActive": true
}
```

### 2.2 查询路线模板列表

**接口：** `GET /route-directions/templates`

**描述：** 根据条件查询路线模板列表

**查询参数：**
- `routeDirectionId` (可选): 路线方向ID
- `durationDays` (可选): 天数
- `isActive` (可选): 是否激活
- `limit` (可选): 返回数量限制
- `offset` (可选): 偏移量

**响应：** 返回路线模板数组

**示例：**
```
GET /route-directions/templates?routeDirectionId=1&durationDays=7&isActive=true
```

### 2.3 根据ID获取路线模板

**接口：** `GET /route-directions/templates/:id`

**描述：** 根据ID获取单个路线模板的详细信息

**路径参数：**
- `id`: 路线模板ID（数字）

**响应：** 返回路线模板对象（包含关联的路线方向）

**示例：**
```
GET /route-directions/templates/1
```

### 2.4 更新路线模板

**接口：** `PUT /route-directions/templates/:id`

**描述：** 更新路线模板信息

**路径参数：**
- `id`: 路线模板ID（数字）

**请求体：** `UpdateRouteTemplateDto`（所有字段可选）

**响应：** 返回更新后的路线模板对象

**示例：**
```json
PUT /route-directions/templates/1
{
  "nameCN": "7天冰岛环岛（更新）",
  "durationDays": 8,
  "isActive": true
}
```

### 2.5 删除路线模板

**接口：** `DELETE /route-directions/templates/:id`

**描述：** 软删除路线模板（设置 `isActive = false`）

**路径参数：**
- `id`: 路线模板ID（数字）

**响应：** 返回成功消息

**示例：**
```
DELETE /route-directions/templates/1
```

### 2.5.1 物理删除路线模板

**接口：** `DELETE /route-directions/templates/:id/hard`

**描述：** 物理删除路线模板，从数据库中彻底删除记录（不可恢复）

**路径参数：**
- `id`: 路线模板ID（数字）

**响应：** 返回成功消息

**示例：**
```
DELETE /route-directions/templates/1/hard
```

**注意事项：**
- 物理删除操作不可恢复，请确保在删除前已备份重要数据
- 删除后，该路线模板的所有关联数据也将被删除（根据数据库外键约束）

### 2.6 使用模板创建行程

**接口：** `POST /route-directions/templates/:id/create-trip`

**描述：** 从路线模板生成可执行行程（对应工作台的"使用模板"按钮）

**路径参数：**
- `id`: 路线模板ID（数字）

**请求体：** `CreateTripFromRouteTemplateDto`

**响应：** 返回创建的行程对象

**示例：**
```json
{
  "destination": "IS",
  "startDate": "2025-07-01",
  "endDate": "2025-07-07",
  "totalBudget": 50000,
  "pacePreference": "BALANCED",
  "intensity": "balanced",
  "transport": "car"
}
```

## 3. 其他功能接口

### 3.1 批量导入国家 Pack

**接口：** `POST /route-directions/import-pack`

**描述：** 从 CountryPackSkeleton JSON 格式批量导入 RouteDirection

**请求体：** `ImportCountryPackDto`

**响应：** 返回导入结果

### 3.2 获取路线方向卡片列表

**接口：** `GET /route-directions/cards`

**描述：** 获取面向前端/LLM 的路线方向卡片

**查询参数：**
- `countryCode` (必需): 国家代码
- `month` (可选): 月份（1-12）
- `preferences` (可选): 偏好标签数组
- `pace` (可选): 节奏偏好（relaxed/moderate/intense）
- `riskTolerance` (可选): 风险承受度（low/medium/high）

**响应：** 返回路线方向卡片数组

### 3.3 获取单个路线方向卡片

**接口：** `GET /route-directions/:id/card`

**描述：** 根据ID获取路线方向卡片

**路径参数：**
- `id`: 路线方向ID（数字）

**响应：** 返回路线方向卡片对象

### 3.4 获取路线方向交互列表

**接口：** `GET /route-directions/interactions`

**描述：** 返回路线方向卡片、匹配分数、解释和whyNotOthers

**查询参数：**
- `countryCode` (必需): 国家代码
- `month` (可选): 月份（1-12）
- `preferences` (可选): 偏好标签数组
- `pace` (可选): 节奏偏好
- `riskTolerance` (可选): 风险承受度

**响应：** 返回路线方向交互列表

### 3.5 获取路线方向说明卡

**接口：** `GET /route-directions/:id/explainer`

**描述：** 获取可解释、可对外讲、可运营的路线方向说明卡

**路径参数：**
- `id`: 路线方向ID（数字）

**响应：** 返回路线方向说明卡对象

### 3.6 获取路线方向说明卡列表

**接口：** `GET /route-directions/explainers`

**描述：** 根据国家代码获取所有路线方向的说明卡

**查询参数：**
- `countryCode` (必需): 国家代码

**响应：** 返回路线方向说明卡数组

### 3.7 获取请求 trace 报告

**接口：** `GET /route-directions/observability/trace/:requestId`

**描述：** 获取指定请求的完整 trace 报告

**路径参数：**
- `requestId`: 请求ID（字符串）

**响应：** 返回 trace 报告对象

### 3.8 获取聚合 metrics

**接口：** `GET /route-directions/observability/metrics`

**描述：** 获取 RouteDirection 相关的聚合 metrics

**响应：** 返回 metrics 对象

## 4. DTO 说明

### CreateRouteDirectionDto
创建路线方向的数据传输对象，包含所有必需和可选字段。

### UpdateRouteDirectionDto
更新路线方向的数据传输对象，所有字段都是可选的。

### CreateRouteTemplateDto
创建路线模板的数据传输对象。

### UpdateRouteTemplateDto
更新路线模板的数据传输对象，所有字段都是可选的。

### QueryRouteDirectionDto
查询路线方向的查询参数DTO。

### QueryRouteTemplateDto
查询路线模板的查询参数DTO。

## 5. 响应格式

所有接口都使用统一的响应格式：

**成功响应：**
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

**错误响应：**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误消息"
  }
}
```

## 6. 注意事项

1. **软删除：** 删除操作是软删除，只是设置 `isActive = false`，不会真正删除数据。

2. **UUID vs ID：** 路线方向可以使用ID或UUID进行查询，UUID是全局唯一的标识符。

3. **关联关系：** 路线模板必须关联到一个路线方向（`routeDirectionId`）。

4. **数据验证：** 所有DTO都使用 class-validator 进行数据验证。

5. **错误处理：** 所有接口都有完善的错误处理，包括404（未找到）和500（服务器错误）。

6. **Swagger文档：** 所有接口都有Swagger API文档，可以通过 `/api` 路径访问。
