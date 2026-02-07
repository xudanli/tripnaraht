# Restaurant Direct API 前端接口文档

**服务名称**: Restaurant Direct API  
**Base URL**: `/api/restaurant`  
**认证**: 需要 JWT Bearer Token（所有接口都需要用户认证）  
**数据源**: Google Places API（餐饮类别）

---

## 📋 目录

1. [快速开始](#快速开始)
2. [API 端点](#api-端点)
3. [数据模型](#数据模型)
4. [错误处理](#错误处理)
5. [使用示例](#使用示例)
6. [AI 推荐功能](#ai-推荐功能)

---

## 🚀 快速开始

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/restaurant/health \
  -H "Authorization: Bearer {access_token}"
```

**响应**:
```json
{
  "success": true,
  "available": true
}
```

### 2. 搜索餐厅

```bash
curl -X POST http://localhost:3000/api/restaurant/search \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "附近好吃的意大利餐厅",
    "location": {
      "lat": 40.7128,
      "lng": -74.0060
    },
    "radius": 5000,
    "minRating": 4.0
  }'
```

### 3. 智能推荐餐厅

```bash
curl -X POST http://localhost:3000/api/restaurant/recommend \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "lat": 40.7128,
      "lng": -74.0060
    },
    "radius": 5000
  }'
```

---

## 📡 API 端点

### 基础端点

#### 1. 检查服务状态

**端点**: `GET /api/restaurant/health`

**描述**: 检查 Restaurant 服务是否可用

**认证**: 需要 Bearer Token

**响应**:
```typescript
interface HealthResponse {
  success: boolean;
  available: boolean;
}
```

**示例**:
```bash
curl http://localhost:3000/api/restaurant/health \
  -H "Authorization: Bearer {access_token}"
```

---

#### 2. 搜索餐厅

**端点**: `POST /api/restaurant/search`

**描述**: 搜索餐厅，支持自然语言查询和多维度过滤

**认证**: 需要 Bearer Token

**请求体**:
```typescript
interface SearchRestaurantsRequest {
  query?: string; // 自然语言查询，如 "附近好吃的意大利餐厅"
  location?: {
    lat: number;
    lng: number;
  };
  radius?: number; // 搜索半径（米），默认 5000
  type?: string; // 餐厅类型，如 "restaurant", "cafe", "bar"
  priceLevel?: 1 | 2 | 3 | 4; // 价格等级（1=便宜，4=昂贵）
  minRating?: number; // 最低评分（0-5）
  openNow?: boolean; // 是否现在营业
  language?: string; // 语言代码，默认 'en'
}
```

**响应**:
```typescript
interface SearchRestaurantsResponse {
  success: boolean;
  results: RestaurantDetails[];
  totalResults?: number;
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/restaurant/search \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "italian restaurant",
    "location": {
      "lat": 40.7128,
      "lng": -74.0060
    },
    "radius": 5000,
    "minRating": 4.0,
    "priceLevel": 2
  }'
```

**响应示例**:
```json
{
  "success": true,
  "results": [
    {
      "placeId": "ChIJ...",
      "name": "Trattoria Bella",
      "address": "123 Main St, New York, NY 10001",
      "location": {
        "lat": 40.7128,
        "lng": -74.0060
      },
      "rating": 4.5,
      "userRatingsTotal": 234,
      "priceLevel": 2,
      "types": ["restaurant", "food", "point_of_interest"],
      "openingHours": {
        "openNow": true
      },
      "cuisine": ["italian", "restaurant"]
    }
  ],
  "totalResults": 1
}
```

---

#### 3. 获取餐厅详情

**端点**: `GET /api/restaurant/details/:placeId`

**描述**: 获取餐厅的详细信息，包括评分、营业时间、照片、评价等

**认证**: 需要 Bearer Token

**路径参数**:
- `placeId` (string): Google Places place_id

**查询参数**:
- `language` (string, 可选): 语言代码，默认 'en'

**响应**:
```typescript
interface RestaurantDetailsResponse {
  success: boolean;
  restaurant: RestaurantDetails;
}
```

**示例**:
```bash
curl http://localhost:3000/api/restaurant/details/ChIJ... \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json"
```

**响应示例**:
```json
{
  "success": true,
  "restaurant": {
    "placeId": "ChIJ...",
    "name": "Trattoria Bella",
    "address": "123 Main St, New York, NY 10001",
    "location": {
      "lat": 40.7128,
      "lng": -74.0060
    },
    "rating": 4.5,
    "userRatingsTotal": 234,
    "priceLevel": 2,
    "types": ["restaurant", "food", "point_of_interest"],
    "openingHours": {
      "openNow": true,
      "weekdayText": [
        "Monday: 11:00 AM – 10:00 PM",
        "Tuesday: 11:00 AM – 10:00 PM",
        "..."
      ]
    },
    "photos": [
      {
        "photoReference": "CmRa...",
        "width": 4000,
        "height": 3000
      }
    ],
    "phoneNumber": "+1 212-555-1234",
    "website": "https://trattoriabella.com",
    "reviews": [
      {
        "authorName": "John Doe",
        "rating": 5,
        "text": "Excellent food and service!",
        "time": 1640995200
      }
    ],
    "cuisine": ["italian", "restaurant"]
  }
}
```

---

#### 4. 附近搜索餐厅

**端点**: `GET /api/restaurant/nearby`

**描述**: 基于位置坐标搜索附近的餐厅

**认证**: 需要 Bearer Token

**查询参数**:
- `lat` (number, 必需): 纬度
- `lng` (number, 必需): 经度
- `radius` (number, 可选): 搜索半径（米），默认 5000
- `type` (string, 可选): 餐厅类型，如 "restaurant", "cafe", "bar"
- `keyword` (string, 可选): 关键词，如 "italian", "pizza"
- `priceLevel` (number, 可选): 价格等级（1-4）
- `minRating` (number, 可选): 最低评分（0-5）
- `openNow` (boolean, 可选): 是否现在营业
- `language` (string, 可选): 语言代码，默认 'en'

**响应**:
```typescript
interface NearbySearchResponse {
  success: boolean;
  results: RestaurantDetails[];
  count: number;
}
```

**示例**:
```bash
curl "http://localhost:3000/api/restaurant/nearby?lat=40.7128&lng=-74.0060&radius=5000&minRating=4.0&openNow=true" \
  -H "Authorization: Bearer {access_token}"
```

---

#### 5. 获取用户餐厅偏好

**端点**: `GET /api/restaurant/preferences`

**描述**: 获取当前用户的餐厅偏好设置

**认证**: 需要 Bearer Token（自动从 token 中获取 userId）

**响应**:
```typescript
interface UserPreferencesResponse {
  success: boolean;
  preferences: {
    cuisine: string[];
    priceRange: string; // 'low', 'medium', 'high', 'very_high'
    dietaryRestrictions: string[];
    favoriteRestaurants: string[]; // Array of place IDs
  };
}
```

**示例**:
```bash
curl http://localhost:3000/api/restaurant/preferences \
  -H "Authorization: Bearer {access_token}"
```

**响应示例**:
```json
{
  "success": true,
  "preferences": {
    "cuisine": ["italian", "japanese", "chinese"],
    "priceRange": "medium",
    "dietaryRestrictions": ["vegetarian"],
    "favoriteRestaurants": ["ChIJ...", "ChIJ..."]
  }
}
```

---

#### 6. 保存用户餐厅偏好

**端点**: `POST /api/restaurant/preferences`

**描述**: 保存或更新用户的餐厅偏好设置

**认证**: 需要 Bearer Token（自动从 token 中获取 userId）

**请求体**:
```typescript
interface SavePreferencesRequest {
  cuisine?: string[];
  priceRange?: string; // 'low', 'medium', 'high', 'very_high'
  dietaryRestrictions?: string[];
  favoriteRestaurants?: string[]; // Array of place IDs
}
```

**响应**:
```typescript
interface SavePreferencesResponse {
  success: boolean;
  message: string;
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/restaurant/preferences \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "cuisine": ["italian", "japanese"],
    "priceRange": "medium",
    "dietaryRestrictions": ["vegetarian"]
  }'
```

---

#### 7. 智能推荐餐厅

**端点**: `POST /api/restaurant/recommend`

**描述**: 基于用户偏好和上下文（位置、时间、预算）智能推荐餐厅

**认证**: 需要 Bearer Token（自动从 token 中获取 userId）

**请求体**:
```typescript
interface RecommendRestaurantsRequest {
  location: {
    lat: number;
    lng: number;
  };
  time?: string; // ISO 8601 date string
  budget?: number;
  radius?: number; // 搜索半径（米），默认 5000
}
```

**响应**:
```typescript
interface RecommendRestaurantsResponse {
  success: boolean;
  recommendations: RestaurantDetails[];
  count: number;
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/restaurant/recommend \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "lat": 40.7128,
      "lng": -74.0060
    },
    "radius": 5000,
    "time": "2026-02-07T19:00:00Z"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "recommendations": [
    {
      "placeId": "ChIJ...",
      "name": "Trattoria Bella",
      "address": "123 Main St, New York, NY 10001",
      "location": {
        "lat": 40.7128,
        "lng": -74.0060
      },
      "rating": 4.5,
      "userRatingsTotal": 234,
      "priceLevel": 2,
      "types": ["restaurant", "food", "point_of_interest"],
      "openingHours": {
        "openNow": true
      },
      "cuisine": ["italian", "restaurant"]
    }
  ],
  "count": 1
}
```

---

## 📊 数据模型

### RestaurantDetails

```typescript
interface RestaurantDetails {
  placeId: string; // Google Places place_id
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  rating?: number; // 0-5
  userRatingsTotal?: number;
  priceLevel?: number; // 1-4 (1=便宜，4=昂贵)
  types?: string[]; // 餐厅类型数组
  openingHours?: {
    openNow: boolean;
    weekdayText?: string[]; // 营业时间文本
  };
  photos?: Array<{
    photoReference: string;
    width: number;
    height: number;
  }>;
  phoneNumber?: string;
  website?: string;
  reviews?: Array<{
    authorName: string;
    rating: number;
    text: string;
    time: number; // Unix timestamp
  }>;
  cuisine?: string[]; // 菜系类型
  dietaryRestrictions?: string[]; // 饮食限制
}
```

---

## ⚠️ 错误处理

### 错误响应格式

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
```

### 常见错误代码

| 错误代码 | HTTP 状态码 | 描述 |
|---------|-----------|------|
| `RESTAURANT_ERROR` | 500 | 通用错误 |
| `RESTAURANT_NOT_FOUND` | 404 | 餐厅未找到 |
| `INVALID_PARAMS` | 400 | 无效的参数 |
| `UNAUTHORIZED` | 401 | 未认证 |

### 错误示例

```json
{
  "success": false,
  "error": {
    "code": "RESTAURANT_ERROR",
    "message": "Google Places API Key not configured"
  }
}
```

---

## 💡 使用示例

### TypeScript 示例

```typescript
// 搜索餐厅
async function searchRestaurants(accessToken: string) {
  const response = await fetch('http://localhost:3000/api/restaurant/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: '附近好吃的意大利餐厅',
      location: {
        lat: 40.7128,
        lng: -74.0060,
      },
      radius: 5000,
      minRating: 4.0,
    }),
  });

  const data = await response.json();
  return data.results;
}

// 获取餐厅详情
async function getRestaurantDetails(accessToken: string, placeId: string) {
  const response = await fetch(
    `http://localhost:3000/api/restaurant/details/${placeId}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();
  return data.restaurant;
}

// 智能推荐
async function recommendRestaurants(accessToken: string, location: { lat: number; lng: number }) {
  const response = await fetch('http://localhost:3000/api/restaurant/recommend', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      location,
      radius: 5000,
    }),
  });

  const data = await response.json();
  return data.recommendations;
}
```

---

## 🤖 AI 推荐功能

### 推荐算法说明

`/api/restaurant/recommend` 端点使用智能推荐算法，综合考虑以下因素：

1. **用户偏好**:
   - 菜系偏好（cuisine）
   - 价格范围（priceRange）
   - 饮食限制（dietaryRestrictions）
   - 历史收藏（favoriteRestaurants）

2. **上下文信息**:
   - 当前位置（location）
   - 当前时间（time）- 用于判断是否营业
   - 预算（budget）

3. **餐厅质量**:
   - 评分（rating）- 默认推荐 4.0 分以上
   - 评价数量（userRatingsTotal）

### 使用建议

1. **首次使用**: 用户可以先设置偏好（`POST /api/restaurant/preferences`），然后使用推荐功能
2. **动态推荐**: 根据行程位置和时间动态推荐餐厅
3. **个性化**: 系统会学习用户偏好，推荐越来越精准

---

## 🔒 安全说明

1. **认证**: 所有接口都需要 JWT Bearer Token 认证
2. **用户隔离**: 用户偏好和推荐结果都是用户级别的，不会泄露其他用户信息
3. **API Key**: Google Places API Key 存储在服务器端，不会暴露给客户端

---

## 📚 相关文档

- [Google Places API 文档](https://developers.google.com/maps/documentation/places/web-service)
- [Restaurant Direct API 集成文档](./RESTAURANT_DIRECT_API.md)
- [MCP API 文档索引](./MCP_API_DOCUMENTATION_INDEX.md)

---

**最后更新**: 2026-02-07
