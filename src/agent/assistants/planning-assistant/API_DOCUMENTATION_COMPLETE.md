# Planning Assistant V2 API 完整接口文档

**版本**: 2.1.0  
**最后更新**: 2026-02-08  
**基础路径**: `/api/agent/planning-assistant/v2`  
**状态**: ✅ **生产就绪**

---

## 📋 目录

- [快速开始](#快速开始)
- [最新更新](#最新更新)
- [认证和授权](#认证和授权)
- [速率限制](#速率限制)
- [接口列表](#接口列表)
- [错误处理](#错误处理)
- [使用示例](#使用示例)
- [Swagger 文档](#swagger-文档)

---

## 🆕 最新更新 (v2.1.0)

### 2026-02-08 更新

#### ✨ 新增功能

1. **智能对话接口增强**
   - `POST /chat` 接口响应新增 `recommendations` 字段
   - `POST /chat` 接口响应新增 `plans` 字段
   - 当智能路由到推荐或方案生成接口时，响应中会包含完整的数据列表
   - 解决了"目的地推荐没显示具体信息"的问题

2. **语言自适应响应**
   - 新增 `reply` 和 `replyCN` 字段
   - 根据用户输入语言自动选择主要回复语言
   - 中文输入返回中文回复，英文输入返回英文回复

3. **路线模板数据整合**
   - 推荐引擎现在使用路线模板（RouteTemplate）数据
   - 推荐结果包含更丰富的路线规划信息
   - 数据源优先级：内置数据 > 路线方向数据 > ReadinessPack 数据

4. **会话状态自动保存**
   - 智能路由到业务接口时，会话状态会自动保存
   - 解决了会话状态查询返回 404 的问题

5. **酒店搜索功能**
   - `POST /chat` 接口新增 `hotel` 路由目标
   - 支持通过自然语言搜索酒店（如："冰岛酒店"、"搜索酒店"）
   - 响应中新增 `hotels` 字段，包含酒店详细信息
   - **默认排除 Airbnb**：搜索结果自动过滤掉 Airbnb 房源
   - 支持地理编码：自动将目的地名称转换为坐标进行搜索

6. **🆕 MCP 服务自然语言调用（完整支持）**
   - **所有 14 个 MCP 服务**都支持通过自然语言调用
   - 新增路由目标：`airbnb`、`accommodation`、`restaurant`、`weather`、`search`、`flight`、`rail`、`translate`、`currency`、`image`
   - 智能路由系统：自动识别用户意图并路由到相应的 MCP 服务
   - 参数自动提取：自动从自然语言中提取目的地、位置、日期、语言、货币等参数
   - 地理编码支持：自动将地名转换为坐标
   - 完善的错误处理和降级机制

**支持的 MCP 服务自然语言调用**:
- ✅ Hotel Direct API - "推荐酒店"
- ✅ Airbnb MCP - "推荐 Airbnb"、"找民宿"
- ✅ Accommodation - "推荐住宿"（酒店+Airbnb）
- ✅ Restaurant Direct API - "推荐餐厅"、"附近有什么好吃的"
- ✅ Weather Direct API - "天气怎么样"、"查天气"
- ✅ Exa MCP - "搜索冰岛信息"、"网上搜索"
- ✅ Amadeus MCP - "搜索航班"、"查机票"
- ✅ Rail MCP - "查询从巴黎到伦敦的火车"
- ✅ Translation Direct API - "翻译一下"、"这是什么意思"
- ✅ Currency Direct API - "100美元换人民币"、"汇率"
- ✅ Image Direct API - "找图片"、"图片搜索"

#### 🔧 修复

1. 修复了智能路由时会话状态未保存的问题
2. 修复了推荐数据未包含在响应中的问题
3. 修复了语言检测和响应语言不一致的问题
4. 修复了推荐引擎国家代码映射错误（iceland -> IS）
5. 🆕 修复了路由目标类型定义不完整的问题
6. 🆕 修复了 null 检查问题

#### 📝 文档更新

- 更新了响应字段说明（新增所有 MCP 服务的响应字段）
- 添加了前端使用建议（支持所有路由目标）
- 更新了响应示例
- 🆕 添加了完整的 MCP 服务自然语言调用指南
- 🆕 更新了路由目标类型定义

---

## 🚀 快速开始

### 基础 URL

```
开发环境: http://localhost:3000/api/agent/planning-assistant/v2
生产环境: https://api.tripnara.com/api/agent/planning-assistant/v2
```

### 认证方式

大部分接口需要 JWT Bearer Token 认证：

```bash
curl -X GET "https://api.tripnara.com/api/agent/planning-assistant/v2/sessions/session-id" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 公开接口

以下接口无需认证即可访问：
- `POST /sessions` - 创建会话
- `GET /recommendations` - 获取推荐
- `POST /chat` - 智能对话

---

## 🔐 认证和授权

### 认证方式

**JWT Bearer Token**

在请求头中添加：
```
Authorization: Bearer <your-jwt-token>
```

### 公开接口 vs 受保护接口

#### ✅ 公开接口（无需认证）

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 创建会话 | POST | `/sessions` | 允许新用户快速开始 |
| 获取推荐 | GET | `/recommendations` | 公开信息，不涉及用户数据 |
| 智能对话 | POST | `/chat` | 主要入口，应该易于访问 |

#### 🔒 受保护接口（需要认证）

所有其他接口都需要 JWT 认证，并且会验证资源所有权：

| 接口类型 | 说明 |
|---------|------|
| 会话管理 | 验证会话是否属于当前用户 |
| 方案操作 | 验证方案是否属于当前用户 |
| 行程操作 | 验证行程是否属于当前用户（通过 TripCollaborator 或 metadata.userId） |

### 错误响应

**401 Unauthorized** - 未认证或 Token 无效：
```json
{
  "success": false,
  "errorCode": "401",
  "message": "Unauthorized",
  "messageCN": "未认证"
}
```

**403 Forbidden** - 无权限访问资源：
```json
{
  "success": false,
  "errorCode": "2003",
  "message": "Access denied",
  "messageCN": "无权访问此会话",
  "details": {
    "sessionId": "session-id"
  }
}
```

---

## ⚡ 速率限制

所有接口都配置了速率限制，防止 API 滥用。

### 限流规则

#### 公开接口

| 接口 | 限流规则 | 说明 |
|------|---------|------|
| `POST /sessions` | 10 次/分钟 | 防止频繁创建会话 |
| `GET /recommendations` | 20 次/分钟 | 推荐查询限流 |
| `POST /chat` | 30 次/分钟 | 对话接口限流（LLM 调用成本高） |

#### 受保护接口

| 接口 | 限流规则 | 说明 |
|------|---------|------|
| `GET /sessions/:sessionId` | 100 次/分钟 | 查询接口限流较宽松 |
| `DELETE /sessions/:sessionId` | 10 次/分钟 | 删除操作限流 |
| `GET /sessions/:sessionId/history` | 60 次/分钟 | 历史查询限流 |
| `POST /plans/generate` | 10 次/分钟 | 方案生成（同步，LLM 调用） |
| `POST /plans/generate-async` | 20 次/分钟 | 方案生成（异步） |
| `GET /plans/generate/:taskId` | 60 次/分钟 | 任务状态查询 |
| `GET /plans/compare` | 20 次/分钟 | 方案对比（计算密集型） |
| `POST /plans/:planId/optimize` | 10 次/分钟 | 方案优化（LLM 调用） |
| `POST /plans/:planId/confirm` | 10 次/分钟 | 确认方案（数据库操作） |
| `POST /trips/:tripId/optimize` | 10 次/分钟 | 优化行程（LLM 调用） |
| `POST /trips/:tripId/refine` | 10 次/分钟 | 细化行程（LLM 调用） |
| `GET /trips/:tripId/suggestions` | 30 次/分钟 | 获取建议（查询接口） |

### 限流响应

**429 Too Many Requests** - 超过速率限制：
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

响应头包含限流信息：
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640000000
```

---

## 📡 接口列表

### 1. 会话管理

#### 1.1 创建会话

**端点**: `POST /sessions`

**说明**: 创建一个新的旅行规划对话会话。

**认证**: ✅ 公开接口，无需认证

**速率限制**: 10 次/分钟

**请求体**:
```json
{
  "userId": "user_123456"  // 可选，用户ID
}
```

**响应** (201):
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**示例**:
```bash
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/sessions" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_123456"}'
```

---

#### 1.2 获取会话状态

**端点**: `GET /sessions/:sessionId`

**说明**: 获取会话的完整状态，包括偏好、推荐、方案等。

**认证**: 🔒 需要认证 + 资源所有权验证

**速率限制**: 100 次/分钟

**路径参数**:
- `sessionId` (string, required) - 会话ID

**响应** (200):
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user_123456",
  "phase": "planning",
  "preferences": {
    "destination": "Iceland",
    "budget": 50000,
    "duration": 7,
    "travelers": { "adults": 2, "children": 0 }
  },
  "recommendations": [...],
  "planCandidates": [...],
  "selectedPlanId": "plan_123",
  "confirmedTripId": "trip_456",
  "createdAt": "2026-02-08T10:00:00Z",
  "updatedAt": "2026-02-08T10:30:00Z"
}
```

**示例**:
```bash
curl -X GET "https://api.tripnara.com/api/agent/planning-assistant/v2/sessions/session-id" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### 1.3 删除会话

**端点**: `DELETE /sessions/:sessionId`

**说明**: 删除指定的会话。

**认证**: 🔒 需要认证 + 资源所有权验证

**速率限制**: 10 次/分钟

**路径参数**:
- `sessionId` (string, required) - 会话ID

**响应** (200):
```json
{
  "success": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

#### 1.4 获取对话历史

**端点**: `GET /sessions/:sessionId/history`

**说明**: 获取会话的对话历史记录。

**认证**: 🔒 需要认证 + 资源所有权验证

**速率限制**: 60 次/分钟

**路径参数**:
- `sessionId` (string, required) - 会话ID

**查询参数**:
- `limit` (number, optional) - 返回记录数，默认 50
- `offset` (number, optional) - 偏移量，默认 0

**响应** (200):
```json
{
  "messages": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "我想去冰岛旅行",
      "timestamp": "2026-02-08T10:00:00Z"
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "content": "太好了！冰岛是一个绝佳的旅行目的地...",
      "timestamp": "2026-02-08T10:00:05Z"
    }
  ],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

---

### 2. 对话接口（主要入口）

#### 2.1 智能对话

**端点**: `POST /chat`

**说明**: 智能对话接口，支持自然语言理解、多轮对话、上下文感知和智能路由。这是**主要入口**，推荐优先使用。

**认证**: ✅ 公开接口，无需认证（但建议提供 userId）

**速率限制**: 30 次/分钟

**请求体**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "我想去冰岛旅行，预算5万，7天",
  "userId": "user_123456",  // 可选，但建议提供
  "language": "zh"  // 可选，en 或 zh
}
```

**响应** (200):
```json
{
  "message": "I found 2 destination recommendations for you.",
  "messageCN": "我为您找到了2个目的地推荐。",
  "reply": "我为您找到了2个目的地推荐。",
  "replyCN": "我为您找到了2个目的地推荐。",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "phase": "RECOMMENDING",
  "routing": {
    "target": "recommendations",
    "reason": "Routed to recommendations",
    "params": {
      "destination": "冰岛",
      "filters": { "countryCode": "IS" }
    }
  },
  "recommendations": [
    {
      "id": "route_direction_1",
      "countryCode": "IS",
      "name": "Iceland",
      "nameCN": "冰岛",
      "description": "Land of fire and ice with stunning natural landscapes",
      "descriptionCN": "冰与火之国，拥有令人惊叹的自然景观",
      "highlights": ["nature", "aurora", "adventure", "photography"],
      "highlightsCN": ["自然风光", "极光", "冒险", "摄影"],
      "matchScore": 95,
      "matchReasons": ["符合您的预算", "适合7天旅行"],
      "matchReasonsCN": ["符合您的预算", "适合7天旅行"],
      "estimatedBudget": {
        "min": 4000,
        "max": 8000,
        "currency": "USD"
      },
      "bestSeasons": ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Jun", "Jul", "Aug"],
      "imageUrl": null,
      "tags": ["nature", "aurora", "adventure", "photography"]
    },
    {
      "id": "iceland",
      "countryCode": "IS",
      "name": "Iceland",
      "nameCN": "冰岛",
      "description": "A land of fire and ice...",
      "descriptionCN": "冰与火之地...",
      "highlights": ["Northern Lights", "Geysers", "Glaciers"],
      "highlightsCN": ["极光", "间歇泉", "冰川"],
      "matchScore": 92,
      "matchReasons": ["热门目的地", "自然风光"],
      "matchReasonsCN": ["热门目的地", "自然风光"],
      "estimatedBudget": {
        "min": 40000,
        "max": 60000,
        "currency": "CNY"
      },
      "bestSeasons": ["夏季", "秋季"],
      "imageUrl": "https://example.com/iceland.jpg",
      "tags": ["自然", "冒险", "摄影"]
    }
  ]
}
```

**注意**: 
- 推荐数据可能来自多个数据源（内置数据、路线模板、数据库）
- ID 格式为 `route_direction_${id}` 的推荐来自路线模板数据
- 推荐列表已按匹配分数排序

**响应字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | ✅ | 英文回复（始终提供） |
| `messageCN` | string | ✅ | 中文回复（始终提供） |
| `reply` | string | ❌ | **主要回复消息**（根据用户输入语言自动选择：中文输入返回中文，英文输入返回英文） |
| `replyCN` | string | ❌ | 中文回复（始终提供，与 `reply` 配合使用） |
| `phase` | string | ✅ | 当前对话阶段（INITIAL/RECOMMENDING/COMPARING_PLANS等） |
| `sessionId` | string | ❌ | 会话ID |
| `routing` | object | ❌ | 智能路由信息（当路由到业务接口时包含） |
| `routing.target` | string | - | 目标接口：`recommendations` / `generate` / `compare` / `hotel` / `airbnb` / `accommodation` / `restaurant` / `flight` / `rail` / `weather` / `search` / `translate` / `currency` / `image` / `chat` |
| `routing.reason` | string | - | 路由原因说明 |
| `routing.params` | object | - | 从用户消息中提取的参数 |
| `recommendations` | array | ❌ | **目的地推荐列表**（当 `routing.target === "recommendations"` 时包含） |
| `plans` | array | ❌ | **方案候选列表**（当 `routing.target === "generate"` 时包含） |
| `hotels` | array | ❌ | **酒店列表**（当 `routing.target === "hotel"` 时包含） |
| `airbnbListings` | array | ❌ | **Airbnb 房源列表**（当 `routing.target === "airbnb"` 时包含） |
| `restaurants` | array | ❌ | **餐厅列表**（当 `routing.target === "restaurant"` 时包含） |
| `weather` | object | ❌ | **天气信息**（当 `routing.target === "weather"` 时包含） |
| `searchResults` | array | ❌ | **搜索结果**（当 `routing.target === "search"` 时包含） |
| `flights` | array | ❌ | **航班列表**（当 `routing.target === "flight"` 时包含） |
| `railRoutes` | array | ❌ | **铁路路线列表**（当 `routing.target === "rail"` 时包含） |
| `translation` | object | ❌ | **翻译结果**（当 `routing.target === "translate"` 时包含） |
| `currencyConversion` | object | ❌ | **货币转换结果**（当 `routing.target === "currency"` 时包含） |
| `images` | array | ❌ | **图片列表**（当 `routing.target === "image"` 时包含） |
| `suggestedActions` | array | ❌ | 建议操作列表 |

**推荐数据字段** (`recommendations` 数组中的对象):

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 推荐ID（可能是 `route_direction_${id}` 格式，表示来自路线模板） |
| `countryCode` | string | 国家代码（如 "IS"） |
| `name` | string | 英文名称 |
| `nameCN` | string | 中文名称 |
| `description` | string | 英文描述 |
| `descriptionCN` | string | 中文描述 |
| `highlights` | string[] | 亮点（英文） |
| `highlightsCN` | string[] | 亮点（中文） |
| `matchScore` | number | 匹配分数（0-100） |
| `matchReasons` | string[] | 匹配原因（英文） |
| `matchReasonsCN` | string[] | 匹配原因（中文） |
| `estimatedBudget` | object | 预估预算 `{min: number, max: number, currency: string}` |
| `bestSeasons` | string[] | 最佳季节 |
| `imageUrl` | string | 图片URL（可选） |
| `tags` | string[] | 标签列表 |

**方案数据字段** (`plans` 数组中的对象):

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 方案ID |
| `name` | string | 方案名称（英文） |
| `nameCN` | string | 方案名称（中文） |
| `destination` | string | 目的地 |
| `duration` | number | 天数 |
| `estimatedBudget` | object | 预估预算 |
| `pace` | string | 节奏：`relaxed` / `moderate` / `intensive` |
| `suitability` | object | 适合度评分 |

**酒店数据字段** (`hotels` 数组中的对象):

| 字段 | 类型 | 说明 |
|------|------|------|
| `placeId` | string | Google Places place_id |
| `name` | string | 酒店名称 |
| `address` | string | 地址 |
| `location` | object | 位置信息 `{lat: number, lng: number}` |
| `rating` | number | 评分（0-5） |
| `userRatingsTotal` | number | 评价总数 |
| `priceLevel` | number | 价格等级（1-4，1=便宜，4=昂贵） |
| `types` | string[] | 类型列表 |
| `openingHours` | object | 营业时间 `{openNow: boolean, weekdayText?: string[]}` |
| `photos` | array | 照片列表 `[{photoReference: string, width: number, height: number}]` |
| `phoneNumber` | string | 电话号码 |
| `website` | string | 网站URL |
| `reviews` | array | 评价列表 |
| `amenities` | string[] | 设施列表 |
| `roomTypes` | string[] | 房型列表 |

**注意**: 
- 酒店搜索结果**默认排除 Airbnb**（通过名称、地址、类型过滤）
- 如果用户消息中包含目的地名称（如"冰岛酒店"），系统会自动进行地理编码
- 搜索结果按评分和相关性排序，最多返回 10 个结果

**前端使用建议**: 

1. **显示回复消息**：
   ```javascript
   // 优先使用 reply 字段（自动适配语言）
   const displayMessage = response.reply || 
     (userLanguage === 'zh' ? response.messageCN : response.message);
   ```

2. **显示推荐数据**（重要）：
   ```javascript
   if (response.routing?.target === 'recommendations' && response.recommendations) {
     // 显示推荐列表
     response.recommendations.forEach(rec => {
       console.log(`${rec.nameCN} (${rec.countryCode}) - 匹配度: ${rec.matchScore}`);
     });
   }
   ```

3. **显示方案数据**：
   ```javascript
   if (response.routing?.target === 'generate' && response.plans) {
     // 显示方案列表
     response.plans.forEach(plan => {
       console.log(`${plan.nameCN} - ${plan.duration}天`);
     });
   }
   ```

4. **显示酒店数据**：
   ```javascript
   if (response.routing?.target === 'hotel' && response.hotels) {
     // 显示酒店列表
     response.hotels.forEach(hotel => {
       console.log(`${hotel.name} - 评分: ${hotel.rating}/5`);
       console.log(`地址: ${hotel.address}`);
       console.log(`价格等级: ${hotel.priceLevel || 'N/A'}`);
     });
   }
   ```

5. **检查路由类型**（支持所有 MCP 服务）：
   ```javascript
   switch (response.routing?.target) {
     case 'recommendations':
       // 显示推荐卡片
       break;
     case 'generate':
       // 显示方案卡片
       break;
     case 'compare':
       // 显示对比结果
       break;
     case 'hotel':
       // 显示酒店列表（已排除 Airbnb）
       break;
     case 'airbnb':
       // 显示 Airbnb 房源列表
       break;
     case 'accommodation':
       // 显示住宿列表（酒店 + Airbnb）
       break;
     case 'restaurant':
       // 显示餐厅列表
       break;
     case 'weather':
       // 显示天气信息
       break;
     case 'search':
       // 显示搜索结果
       break;
     case 'flight':
       // 显示航班列表
       break;
     case 'rail':
       // 显示铁路路线列表
       break;
     case 'translate':
       // 显示翻译结果
       break;
     case 'currency':
       // 显示货币转换结果
       break;
     case 'image':
       // 显示图片列表
       break;
     default:
       // 显示普通对话回复
   }
   ```

**示例 1: 目的地推荐**:
```bash
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id",
    "message": "我想去冰岛旅行",
    "userId": "user_123456"
  }'
```

**示例 2: 酒店搜索（排除 Airbnb）**:
```bash
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id",
    "message": "冰岛酒店",
    "userId": "user_123456",
    "language": "zh"
  }'
```

**响应示例（酒店搜索）**:
```json
{
  "message": "I found 5 hotels for you (excluding Airbnb).",
  "messageCN": "我为您找到了5家酒店（已排除Airbnb）。",
  "reply": "我为您找到了5家酒店（已排除Airbnb）。",
  "replyCN": "我为您找到了5家酒店（已排除Airbnb）。",
  "sessionId": "session-id",
  "phase": "RECOMMENDING",
  "routing": {
    "target": "hotel",
    "reason": "User wants to search for hotels",
    "reasonCN": "用户想要搜索酒店",
    "params": {
      "destination": "冰岛",
      "excludeAirbnb": true
    }
  },
  "hotels": [
    {
      "placeId": "ChIJ...",
      "name": "Hotel Reykjavik Centrum",
      "address": "Aðalstræti 16, 101 Reykjavík, Iceland",
      "location": {
        "lat": 64.1466,
        "lng": -21.9426
      },
      "rating": 4.2,
      "userRatingsTotal": 1234,
      "priceLevel": 3,
      "types": ["lodging", "point_of_interest", "establishment"],
      "phoneNumber": "+354 123 4567",
      "website": "https://example.com/hotel",
      "amenities": ["lodging"]
    }
  ]
}
```

---

## 🆕 MCP 服务自然语言调用指南

### 概述

Planning Assistant V2 支持通过自然语言调用所有 MCP 服务。用户只需用简单的自然语言表达需求，系统会自动识别意图并调用相应的 MCP 服务。

### 支持的路由目标

| 路由目标 | MCP 服务 | 示例输入 | 响应字段 |
|---------|---------|---------|---------|
| `hotel` | Hotel Direct API | "推荐酒店"、"找酒店"、"冰岛酒店" | `hotels` |
| `airbnb` | Airbnb MCP | "推荐 Airbnb"、"找民宿"、"短租" | `airbnbListings` |
| `accommodation` | Hotel + Airbnb | "推荐住宿"、"找住处" | `hotels` + `airbnbListings` |
| `restaurant` | Restaurant Direct API | "推荐餐厅"、"附近有什么好吃的" | `restaurants` |
| `weather` | Weather Direct API | "天气怎么样"、"查天气"、"天气预报" | `weather` |
| `search` | Exa MCP | "搜索冰岛信息"、"查一下"、"网上搜索" | `searchResults` |
| `flight` | Amadeus MCP | "搜索航班"、"查机票"、"航班查询" | `flights` |
| `rail` | Rail MCP | "火车票"、"铁路查询"、"查询从巴黎到伦敦的火车" | `railRoutes` |
| `translate` | Translation Direct API | "翻译一下"、"这是什么意思"、"翻译成中文" | `translation` |
| `currency` | Currency Direct API | "汇率"、"货币转换"、"100美元换人民币" | `currencyConversion` |
| `image` | Image Direct API | "找图片"、"图片搜索"、"看看图片" | `images` |

### 使用示例

#### 示例 1: Airbnb 搜索

**请求**:
```bash
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id",
    "message": "推荐 Airbnb 房源",
    "userId": "user_123456",
    "language": "zh"
  }'
```

**响应**:
```json
{
  "message": "I found 10 Airbnb listings for you.",
  "messageCN": "我为您找到了10个Airbnb房源。",
  "reply": "我为您找到了10个Airbnb房源。",
  "replyCN": "我为您找到了10个Airbnb房源。",
  "sessionId": "session-id",
  "phase": "RECOMMENDING",
  "routing": {
    "target": "airbnb",
    "reason": "User wants Airbnb listings",
    "reasonCN": "用户想要搜索 Airbnb/民宿"
  },
  "airbnbListings": [
    {
      "id": "listing_1",
      "name": "Cozy Apartment in Reykjavik",
      "location": {
        "lat": 64.1466,
        "lng": -21.9426
      },
      "price": {
        "amount": 150,
        "currency": "USD"
      }
    }
  ]
}
```

#### 示例 2: 餐厅搜索

**请求**:
```bash
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id",
    "message": "附近有什么好吃的",
    "userId": "user_123456",
    "language": "zh"
  }'
```

**响应**:
```json
{
  "message": "I found 8 restaurants for you.",
  "messageCN": "我为您找到了8家餐厅。",
  "reply": "我为您找到了8家餐厅。",
  "replyCN": "我为您找到了8家餐厅。",
  "sessionId": "session-id",
  "phase": "RECOMMENDING",
  "routing": {
    "target": "restaurant",
    "reason": "User wants to search for restaurants",
    "reasonCN": "用户想要搜索餐厅"
  },
  "restaurants": [
    {
      "placeId": "ChIJ...",
      "name": "Restaurant Name",
      "address": "123 Main St",
      "location": {
        "lat": 64.1466,
        "lng": -21.9426
      },
      "rating": 4.5,
      "userRatingsTotal": 500,
      "priceLevel": 2
    }
  ]
}
```

#### 示例 3: 天气查询

**请求**:
```bash
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id",
    "message": "冰岛天气怎么样",
    "userId": "user_123456",
    "language": "zh"
  }'
```

**响应**:
```json
{
  "message": "Weather in 冰岛: sunny, 15°C.",
  "messageCN": "冰岛的天气：晴天，温度 15°C。",
  "reply": "冰岛的天气：晴天，温度 15°C。",
  "replyCN": "冰岛的天气：晴天，温度 15°C。",
  "sessionId": "session-id",
  "phase": "RECOMMENDING",
  "routing": {
    "target": "weather",
    "reason": "User wants weather information",
    "reasonCN": "用户想要查询天气"
  },
  "weather": {
    "condition": "sunny",
    "temperature": 15,
    "humidity": 60,
    "windSpeed": 10
  }
}
```

#### 示例 4: Web 搜索

**请求**:
```bash
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id",
    "message": "搜索冰岛旅游攻略",
    "userId": "user_123456",
    "language": "zh"
  }'
```

**响应**:
```json
{
  "message": "I found 10 search results for you.",
  "messageCN": "我为您找到了10条相关信息。",
  "reply": "我为您找到了10条相关信息。",
  "replyCN": "我为您找到了10条相关信息。",
  "sessionId": "session-id",
  "phase": "RECOMMENDING",
  "routing": {
    "target": "search",
    "reason": "User wants web search",
    "reasonCN": "用户想要搜索信息"
  },
  "searchResults": [
    {
      "title": "Iceland Travel Guide",
      "url": "https://example.com/iceland-guide",
      "snippet": "Complete guide to traveling in Iceland..."
    }
  ]
}
```

#### 示例 5: 铁路查询

**请求**:
```bash
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id",
    "message": "查询从巴黎到伦敦的火车",
    "userId": "user_123456",
    "language": "zh"
  }'
```

**响应**:
```json
{
  "message": "I found 3 rail routes from 巴黎 to 伦敦.",
  "messageCN": "我为您找到了3条从巴黎到伦敦的铁路路线。",
  "reply": "我为您找到了3条从巴黎到伦敦的铁路路线。",
  "replyCN": "我为您找到了3条从巴黎到伦敦的铁路路线。",
  "sessionId": "session-id",
  "phase": "RECOMMENDING",
  "routing": {
    "target": "rail",
    "reason": "User wants to search for rail routes",
    "reasonCN": "用户想要查询铁路"
  },
  "railRoutes": [
    {
      "origin": "Paris",
      "destination": "London",
      "duration": "2h 16m",
      "price": {
        "amount": 50,
        "currency": "EUR"
      }
    }
  ]
}
```

#### 示例 6: 翻译服务

**请求**:
```bash
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id",
    "message": "翻译一下 Hello World",
    "userId": "user_123456",
    "language": "zh"
  }'
```

**响应**:
```json
{
  "message": "Translation: 你好世界",
  "messageCN": "翻译结果：你好世界",
  "reply": "翻译结果：你好世界",
  "replyCN": "翻译结果：你好世界",
  "sessionId": "session-id",
  "phase": "RECOMMENDING",
  "routing": {
    "target": "translate",
    "reason": "User wants translation",
    "reasonCN": "用户想要翻译"
  },
  "translation": {
    "text": "你好世界",
    "source": "en",
    "target": "zh"
  }
}
```

#### 示例 7: 货币转换

**请求**:
```bash
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id",
    "message": "100美元换人民币",
    "userId": "user_123456",
    "language": "zh"
  }'
```

**响应**:
```json
{
  "message": "100 USD = 720 CNY",
  "messageCN": "100 USD = 720 CNY",
  "reply": "100 USD = 720 CNY",
  "replyCN": "100 USD = 720 CNY",
  "sessionId": "session-id",
  "phase": "RECOMMENDING",
  "routing": {
    "target": "currency",
    "reason": "User wants currency conversion",
    "reasonCN": "用户想要货币转换"
  },
  "currencyConversion": {
    "result": 720,
    "from": "USD",
    "to": "CNY",
    "rate": 7.2
  }
}
```

#### 示例 8: 住宿搜索（酒店 + Airbnb）

**请求**:
```bash
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id",
    "message": "推荐住宿",
    "userId": "user_123456",
    "language": "zh"
  }'
```

**响应**:
```json
{
  "message": "I found 5 hotels and 10 Airbnb listings, 15 total accommodations.",
  "messageCN": "我为您找到了5家酒店和10个Airbnb房源，共15个住宿选择。",
  "reply": "我为您找到了5家酒店和10个Airbnb房源，共15个住宿选择。",
  "replyCN": "我为您找到了5家酒店和10个Airbnb房源，共15个住宿选择。",
  "sessionId": "session-id",
  "phase": "RECOMMENDING",
  "routing": {
    "target": "accommodation",
    "reason": "User wants accommodation (hotels + Airbnb)",
    "reasonCN": "用户想要搜索住宿（包括酒店和 Airbnb）"
  },
  "hotels": [...],
  "airbnbListings": [...]
}
```

### 智能路由说明

系统使用两层路由策略：

1. **LLM 路由**（优先）: 使用 LLM 分析用户意图，置信度 > 0.7 时使用
2. **关键词路由**（回退）: 当 LLM 路由置信度较低时，使用关键词匹配

### 参数自动提取

系统会自动从自然语言中提取以下参数：

- `destination`: 目的地
- `location`: 位置坐标（lat, lng）
- `origin`: 出发地（铁路/航班查询）
- `date`: 日期（格式：YYYY-MM-DD）
- `query`: 搜索查询
- `sourceLanguage` / `targetLanguage`: 翻译语言
- `fromCurrency` / `toCurrency`: 货币类型
- `amount`: 金额

### 地理编码支持

当用户提供目的地名称但没有坐标时，系统会自动使用 Google Maps Direct API 进行地理编码，将地名转换为坐标进行搜索。

### 错误处理

- **服务不可用**: 如果 MCP 服务不可用，系统会自动回退到通用对话接口
- **参数缺失**: 如果缺少必要参数，系统会返回友好的错误提示
- **OAuth 认证**: 如果 Rail MCP 等服务需要 OAuth 认证但未配置，会返回认证提示

---

### 3. 业务操作（快捷方式）

#### 3.1 获取目的地推荐

**端点**: `GET /recommendations`

**说明**: 获取目的地推荐，支持自然语言参数和结构化参数。

**认证**: ✅ 公开接口，无需认证

**速率限制**: 20 次/分钟

**查询参数**:
- `q` (string, optional) - 自然语言描述，例如："我想去一个安静的海边城市"
- `budget` (number, optional) - 预算（CNY）
- `duration` (number, optional) - 旅行天数
- `travelers` (number, optional) - 旅行人数
- `interests` (string[], optional) - 兴趣标签
- `language` (string, optional) - 语言，en 或 zh

**响应** (200):
```json
{
  "recommendations": [
    {
      "id": "route_direction_1",
      "countryCode": "IS",
      "name": "Iceland",
      "nameCN": "冰岛",
      "description": "Land of fire and ice with stunning natural landscapes",
      "descriptionCN": "冰与火之国，拥有令人惊叹的自然景观",
      "highlights": ["nature", "aurora", "adventure", "photography"],
      "highlightsCN": ["自然风光", "极光", "冒险", "摄影"],
      "matchScore": 95,
      "matchReasons": ["符合您的预算", "适合7天旅行"],
      "matchReasonsCN": ["符合您的预算", "适合7天旅行"],
      "estimatedBudget": {
        "min": 4000,
        "max": 8000,
        "currency": "USD"
      },
      "bestSeasons": ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
      "tags": ["nature", "aurora", "adventure", "photography"]
    }
  ],
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "preferencesUsed": {},
  "generatedAt": "2026-02-08T10:30:00Z"
}
```

**注意**: 
- 推荐数据现在包含来自路线模板的丰富信息
- `id` 字段可能以 `route_direction_` 开头，表示来自路线方向数据
- 推荐已按匹配分数排序

**示例**:
```bash
# 使用自然语言参数
curl -X GET "https://api.tripnara.com/api/agent/planning-assistant/v2/recommendations?q=我想去一个安静的海边城市&budget=50000"

# 使用结构化参数
curl -X GET "https://api.tripnara.com/api/agent/planning-assistant/v2/recommendations?budget=50000&duration=7&travelers=2"
```

---

#### 3.2 生成方案（同步）

**端点**: `POST /plans/generate`

**说明**: 同步生成旅行方案，返回生成的方案列表。

**认证**: 🔒 需要认证

**速率限制**: 10 次/分钟

**请求体**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "destination": "Iceland",
  "duration": 7,
  "budget": 50000,
  "travelers": { "adults": 2, "children": 0 },
  "preferences": {
    "pace": "moderate",
    "interests": ["nature", "photography"]
  },
  "userId": "user_123456"  // 可选，如果未提供会使用认证用户ID
}
```

**响应** (200):
```json
{
  "plans": [
    {
      "id": "plan_1",
      "name": "经典冰岛环岛之旅",
      "nameCN": "经典冰岛环岛之旅",
      "destination": "Iceland",
      "duration": 7,
      "estimatedBudget": {
        "total": 45000,
        "breakdown": {
          "accommodation": 20000,
          "transportation": 15000,
          "activities": 10000
        }
      },
      "pace": "moderate",
      "suitability": {
        "score": 92,
        "reasons": ["符合预算", "节奏适中"]
      }
    }
  ],
  "generatedAt": "2026-02-08T10:30:00Z",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

#### 3.3 生成方案（异步）

**端点**: `POST /plans/generate-async`

**说明**: 异步生成旅行方案，返回任务ID，可通过任务ID查询生成状态。

**认证**: 🔒 需要认证

**速率限制**: 20 次/分钟

**请求体**: 同同步生成方案

**响应** (202):
```json
{
  "taskId": "task_123456",
  "status": "pending",
  "createdAt": "2026-02-08T10:30:00Z"
}
```

---

#### 3.4 查询生成任务状态

**端点**: `GET /plans/generate/:taskId`

**说明**: 查询异步生成任务的状态和结果。

**认证**: 🔒 需要认证 + 资源所有权验证

**速率限制**: 60 次/分钟

**路径参数**:
- `taskId` (string, required) - 任务ID

**响应** (200):
```json
{
  "taskId": "task_123456",
  "status": "completed",
  "progress": 100,
  "result": {
    "plans": [...]
  },
  "error": null,
  "createdAt": "2026-02-08T10:30:00Z",
  "updatedAt": "2026-02-08T10:35:00Z",
  "completedAt": "2026-02-08T10:35:00Z"
}
```

---

#### 3.5 对比方案

**端点**: `GET /plans/compare`

**说明**: 对比多个方案的差异。

**认证**: 🔒 需要认证 + 资源所有权验证（通过 sessionId）

**速率限制**: 20 次/分钟

**查询参数**:
- `planIds` (string, required) - 方案ID列表，逗号分隔，例如："plan_1,plan_2"
- `compareFields` (string, optional) - 对比维度，逗号分隔，例如："budget,duration,pace"
- `sessionId` (string, optional) - 会话ID
- `language` (string, optional) - 语言，en 或 zh

**响应** (200):
```json
{
  "plans": [
    {
      "id": "plan_1",
      "name": "经典冰岛环岛之旅",
      "scores": {
        "budget": 45000,
        "duration": 7,
        "pace": 2,
        "suitability": 92
      }
    }
  ],
  "dimensions": ["budget", "duration", "pace", "suitability"],
  "differences": [
    {
      "field": "budget",
      "plan1Value": 45000,
      "plan2Value": 50000,
      "impact": "medium",
      "description": "Budget difference: 5,000",
      "descriptionCN": "预算差异：5,000"
    }
  ],
  "recommendation": {
    "bestBudget": "plan_1",
    "bestRoute": "plan_2",
    "summary": "Plan comparison completed...",
    "summaryCN": "方案对比完成..."
  }
}
```

**示例**:
```bash
curl -X GET "https://api.tripnara.com/api/agent/planning-assistant/v2/plans/compare?planIds=plan_1,plan_2&sessionId=session-id" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### 3.6 优化方案

**端点**: `POST /plans/:planId/optimize`

**说明**: 优化现有方案，根据优化要求调整方案参数。

**认证**: 🔒 需要认证 + 资源所有权验证（通过 sessionId）

**速率限制**: 10 次/分钟

**路径参数**:
- `planId` (string, required) - 方案ID

**请求体**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "optimizationType": "budget",
  "requirements": {
    "reduceBudget": 5000,
    "slowerPace": true
  }
}
```

**响应** (200):
```json
{
  "plans": [
    {
      "id": "plan_optimized_1",
      "name": "优化后的冰岛环岛之旅",
      "estimatedBudget": {
        "total": 40000
      },
      "pace": "relaxed"
    }
  ],
  "generatedAt": "2026-02-08T11:00:00Z",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

#### 3.7 确认方案

**端点**: `POST /plans/:planId/confirm`

**说明**: 确认方案并创建行程。

**认证**: 🔒 需要认证

**速率限制**: 10 次/分钟

**路径参数**:
- `planId` (string, required) - 方案ID

**请求体**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user_123456",  // 可选，如果未提供会使用认证用户ID
  "saveToCalendar": false,
  "sendReminders": false
}
```

**响应** (200):
```json
{
  "success": true,
  "tripId": "trip_789"
}
```

---

### 4. 行程操作

#### 4.1 优化已创建行程

**端点**: `POST /trips/:tripId/optimize`

**说明**: 优化已创建的行程，调整预算、节奏等。

**认证**: 🔒 需要认证 + 资源所有权验证

**速率限制**: 10 次/分钟

**路径参数**:
- `tripId` (string, required) - 行程ID

**请求体**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "optimizationType": "budget",
  "requirements": {
    "reduceBudget": 5000
  }
}
```

**响应** (200):
```json
{
  "success": true,
  "tripId": "trip_789"
}
```

---

#### 4.2 细化行程

**端点**: `POST /trips/:tripId/refine`

**说明**: 细化行程，安排每日具体活动、餐厅、交通。

**认证**: 🔒 需要认证 + 资源所有权验证

**速率限制**: 10 次/分钟

**路径参数**:
- `tripId` (string, required) - 行程ID

**请求体**:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "days": [1, 2, 3],  // 可选，要细化的天数（1-based）
  "includeRestaurants": true,
  "includeTransportation": true
}
```

**响应** (200):
```json
{
  "success": true,
  "tripId": "trip_789"
}
```

---

#### 4.3 获取优化建议

**端点**: `GET /trips/:tripId/suggestions`

**说明**: 获取行程的优化建议。

**认证**: 🔒 需要认证 + 资源所有权验证

**速率限制**: 30 次/分钟

**路径参数**:
- `tripId` (string, required) - 行程ID

**响应** (200):
```json
{
  "suggestions": [
    {
      "type": "optimize_route",
      "priority": "high",
      "title": "优化路线",
      "titleCN": "优化路线",
      "description": "建议调整路线以减少交通时间",
      "descriptionCN": "建议调整路线以减少交通时间",
      "impact": {
        "timeSaved": 2,
        "costSaved": 1000
      }
    }
  ],
  "tripId": "trip_789"
}
```

---

## ⚠️ 错误处理

### 错误响应格式

所有错误响应都遵循统一格式：

```json
{
  "success": false,
  "errorCode": "2003",
  "message": "Access denied",
  "messageCN": "无权访问此会话",
  "details": {
    "sessionId": "session-id"
  }
}
```

### 常见错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| 2003 | 403 | 无权访问此会话 |
| 2004 | 403 | 无权删除此会话 |
| 2005 | 403 | 无权访问此会话的对话历史 |
| 2006 | 403 | 无权访问此会话的方案 |
| 2007 | 403 | 无权优化此会话的方案 |
| 3002 | 400 | 方案ID必填 |
| 3003 | 400 | 至少需要2个方案ID进行对比 |
| 3005 | 400 | 未找到可对比的方案 |
| 3006 | 404 | 方案不存在 |
| 4002 | 404 | 行程不存在 |
| 4003 | 400 | 行程ID必填 |
| 4004 | 403 | 无权访问此行程 |
| 4005 | 403 | 无权优化此行程 |
| 4006 | 403 | 无权细化此行程 |
| 401 | 401 | 未认证 |
| 429 | 429 | 超过速率限制 |

---

## 📚 Swagger 文档

访问 Swagger UI 查看完整的 API 文档：

```
开发环境: http://localhost:3000/api-docs
```

在 Swagger UI 中：
1. 点击右上角的 "Authorize" 按钮
2. 输入 JWT Token: `Bearer YOUR_JWT_TOKEN`
3. 点击 "Authorize" 确认
4. 现在可以测试所有受保护的接口

---

## 💻 前端集成示例

### React/TypeScript 示例

```typescript
interface ChatResponse {
  message: string;
  messageCN: string;
  reply?: string;
  replyCN?: string;
  phase: string;
  sessionId?: string;
  routing?: {
    target: 'recommendations' | 'generate' | 'compare' | 'chat';
    reason: string;
    params?: Record<string, any>;
  };
  recommendations?: Array<{
    id: string;
    countryCode: string;
    name: string;
    nameCN: string;
    description: string;
    descriptionCN: string;
    highlights: string[];
    highlightsCN: string[];
    matchScore: number;
    matchReasons: string[];
    matchReasonsCN: string[];
    estimatedBudget: {
      min: number;
      max: number;
      currency: string;
    };
    bestSeasons: string[];
    tags: string[];
  }>;
  plans?: Array<{
    id: string;
    name: string;
    nameCN: string;
    destination: string;
    duration: number;
    estimatedBudget: any;
    pace: string;
    suitability: any;
  }>;
}

async function sendChatMessage(
  sessionId: string,
  message: string,
  language: 'zh' | 'en' = 'zh'
): Promise<ChatResponse> {
  const response = await fetch('/api/agent/planning-assistant/v2/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      message,
      language,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.statusText}`);
  }

  return response.json();
}

// 使用示例
const handleChat = async () => {
  const response = await sendChatMessage(sessionId, '冰岛', 'zh');
  
  // 显示回复消息（自动适配语言）
  const displayMessage = response.reply || response.messageCN;
  console.log('回复:', displayMessage);
  
  // 检查是否有推荐数据
  if (response.routing?.target === 'recommendations' && response.recommendations) {
    console.log(`找到 ${response.recommendations.length} 个推荐:`);
    response.recommendations.forEach(rec => {
      console.log(`- ${rec.nameCN} (${rec.countryCode}): ${rec.matchScore}分`);
      console.log(`  亮点: ${rec.highlightsCN.join(', ')}`);
      console.log(`  预算: ${rec.estimatedBudget.min}-${rec.estimatedBudget.max} ${rec.estimatedBudget.currency}`);
    });
  }
  
  // 检查是否有方案数据
  if (response.routing?.target === 'generate' && response.plans) {
    console.log(`生成 ${response.plans.length} 个方案:`);
    response.plans.forEach(plan => {
      console.log(`- ${plan.nameCN}: ${plan.duration}天`);
    });
  }
};
```

### Vue 3 示例

```vue
<template>
  <div>
    <!-- 显示回复消息 -->
    <div class="message">{{ displayMessage }}</div>
    
    <!-- 显示推荐列表 -->
    <div v-if="recommendations.length > 0" class="recommendations">
      <h3>推荐目的地</h3>
      <div v-for="rec in recommendations" :key="rec.id" class="recommendation-card">
        <h4>{{ rec.nameCN }}</h4>
        <p>{{ rec.descriptionCN }}</p>
        <div>匹配度: {{ rec.matchScore }}分</div>
        <div>亮点: {{ rec.highlightsCN.join(', ') }}</div>
        <div>预算: {{ rec.estimatedBudget.min }}-{{ rec.estimatedBudget.max }} {{ rec.estimatedBudget.currency }}</div>
      </div>
    </div>
    
    <!-- 显示方案列表 -->
    <div v-if="plans.length > 0" class="plans">
      <h3>旅行方案</h3>
      <div v-for="plan in plans" :key="plan.id" class="plan-card">
        <h4>{{ plan.nameCN }}</h4>
        <div>{{ plan.duration }}天 | {{ plan.destination }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const chatResponse = ref<ChatResponse | null>(null);

const displayMessage = computed(() => {
  if (!chatResponse.value) return '';
  return chatResponse.value.reply || chatResponse.value.messageCN;
});

const recommendations = computed(() => {
  return chatResponse.value?.recommendations || [];
});

const plans = computed(() => {
  return chatResponse.value?.plans || [];
});

async function sendMessage(message: string) {
  const response = await fetch('/api/agent/planning-assistant/v2/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: sessionId.value,
      message,
      language: 'zh',
    }),
  });
  
  chatResponse.value = await response.json();
}
</script>
```

---

## 📖 使用示例

### 完整流程示例

```bash
# 1. 创建会话
SESSION_ID=$(curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/sessions" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_123456"}' | jq -r '.sessionId')

echo "会话ID: $SESSION_ID"

# 2. 发送对话消息（智能路由到推荐）
RESPONSE=$(curl -s -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/chat" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"冰岛\",
    \"userId\": \"user_123456\",
    \"language\": \"zh\"
  }")

# 检查响应中的推荐数据
echo "$RESPONSE" | jq '{
  message: .messageCN,
  phase: .phase,
  routing_target: .routing.target,
  recommendations_count: (.recommendations | length),
  first_recommendation: .recommendations[0] | {
    nameCN,
    countryCode,
    matchScore,
    highlightsCN
  }
}'

# 3. 验证会话状态（应包含推荐数据）
curl -s "https://api.tripnara.com/api/agent/planning-assistant/v2/sessions/$SESSION_ID" | jq '{
  sessionId,
  phase,
  recommendations_count: (.recommendations | length),
  messageCount
}'

# 4. 生成方案（异步）
TASK_ID=$(curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/plans/generate-async" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"destination\": \"Iceland\",
    \"duration\": 7,
    \"budget\": 50000,
    \"userId\": \"user_123456\"
  }" | jq -r '.taskId')

# 4. 查询任务状态
curl -X GET "https://api.tripnara.com/api/agent/planning-assistant/v2/plans/generate/$TASK_ID" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 5. 确认方案
curl -X POST "https://api.tripnara.com/api/agent/planning-assistant/v2/plans/plan-id/confirm" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"userId\": \"user_123456\"
  }"
```

---

## 📝 相关文档

- [身份验证实施文档](./AUTHENTICATION_IMPLEMENTATION.md)
- [速率限制策略](./RATE_LIMITING_STRATEGY.md)
- [DTO 定义文档](./API_REDESIGN_DTO_DEFINITIONS.md)
- [错误处理规范](./API_REDESIGN_ERROR_HANDLING.md)

---

**文档版本**: 2.1.0  
**最后更新**: 2026-02-08

---

## 📝 变更历史

### v2.1.0 (2026-02-08)
- ✨ 新增：`POST /chat` 响应包含 `recommendations` 和 `plans` 字段
- ✨ 新增：语言自适应响应（`reply` 和 `replyCN` 字段）
- ✨ 新增：路线模板数据整合到推荐引擎
- 🔧 修复：会话状态自动保存问题
- 🔧 修复：推荐数据未包含在响应中的问题
- 🔧 修复：语言检测和响应不一致问题

### v2.0.0 (2026-02-08)
- 🎉 初始版本发布
- ✅ 完整的认证和授权机制
- ✅ 速率限制配置
- ✅ 智能路由功能  
**维护者**: Planning Assistant Team
