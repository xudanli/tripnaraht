# Hotel Direct API 前端接口文档

**服务名称**: Hotel Direct API  
**Base URL**: `/api/hotel`  
**认证**: 需要 JWT Bearer Token（所有接口都需要用户认证）  
**数据源**: Google Places API（酒店类别）

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
curl http://localhost:3000/api/hotel/health \
  -H "Authorization: Bearer {access_token}"
```

**响应**:
```json
{
  "success": true,
  "available": true
}
```

### 2. 搜索酒店

```bash
curl -X POST http://localhost:3000/api/hotel/search \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "纽约市中心酒店",
    "location": {
      "lat": 40.7128,
      "lng": -74.0060
    },
    "radius": 10000,
    "minRating": 4.0
  }'
```

### 3. 智能推荐酒店

```bash
curl -X POST http://localhost:3000/api/hotel/recommend \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "lat": 40.7128,
      "lng": -74.0060
    },
    "checkIn": "2026-02-15",
    "checkOut": "2026-02-20",
    "guests": 2
  }'
```

---

## 📡 API 端点

### 基础端点

#### 1. 检查服务状态

**端点**: `GET /api/hotel/health`

**描述**: 检查 Hotel 服务是否可用

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
curl http://localhost:3000/api/hotel/health \
  -H "Authorization: Bearer {access_token}"
```

---

#### 2. 搜索酒店

**端点**: `POST /api/hotel/search`

**描述**: 搜索酒店，支持自然语言查询和多维度过滤

**认证**: 需要 Bearer Token

**请求体**:
```typescript
interface SearchHotelsRequest {
  query?: string; // 自然语言查询，如 "纽约市中心酒店"
  location?: {
    lat: number;
    lng: number;
  };
  radius?: number; // 搜索半径（米），默认 10000
  type?: string; // 酒店类型，如 "lodging"
  priceLevel?: 1 | 2 | 3 | 4; // 价格等级（1=便宜，4=昂贵）
  minRating?: number; // 最低评分（0-5）
  checkIn?: string; // 入住日期（YYYY-MM-DD）
  checkOut?: string; // 退房日期（YYYY-MM-DD）
  guests?: number; // 入住人数
  language?: string; // 语言代码，默认 'en'
}
```

**响应**:
```typescript
interface SearchHotelsResponse {
  success: boolean;
  results: HotelDetails[];
  totalResults?: number;
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/hotel/search \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "luxury hotel",
    "location": {
      "lat": 40.7128,
      "lng": -74.0060
    },
    "radius": 10000,
    "minRating": 4.0,
    "priceLevel": 3
  }'
```

**响应示例**:
```json
{
  "success": true,
  "results": [
    {
      "placeId": "ChIJ...",
      "name": "The Plaza Hotel",
      "address": "768 5th Ave, New York, NY 10019",
      "location": {
        "lat": 40.7648,
        "lng": -73.9748
      },
      "rating": 4.5,
      "userRatingsTotal": 1234,
      "priceLevel": 4,
      "types": ["lodging", "point_of_interest", "establishment"],
      "amenities": ["lodging"]
    }
  ],
  "totalResults": 1
}
```

---

#### 3. 获取酒店详情

**端点**: `GET /api/hotel/details/:placeId`

**描述**: 获取酒店的详细信息，包括评分、设施、照片、评价等

**认证**: 需要 Bearer Token

**路径参数**:
- `placeId` (string): Google Places place_id

**查询参数**:
- `language` (string, 可选): 语言代码，默认 'en'

**响应**:
```typescript
interface HotelDetailsResponse {
  success: boolean;
  hotel: HotelDetails;
}
```

**示例**:
```bash
curl http://localhost:3000/api/hotel/details/ChIJ... \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json"
```

**响应示例**:
```json
{
  "success": true,
  "hotel": {
    "placeId": "ChIJ...",
    "name": "The Plaza Hotel",
    "address": "768 5th Ave, New York, NY 10019",
    "location": {
      "lat": 40.7648,
      "lng": -73.9748
    },
    "rating": 4.5,
    "userRatingsTotal": 1234,
    "priceLevel": 4,
    "types": ["lodging", "point_of_interest", "establishment"],
    "openingHours": {
      "openNow": true,
      "weekdayText": [
        "Monday: Open 24 hours",
        "Tuesday: Open 24 hours",
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
    "phoneNumber": "+1 212-759-3000",
    "website": "https://www.theplazany.com",
    "reviews": [
      {
        "authorName": "John Doe",
        "rating": 5,
        "text": "Excellent hotel with great service!",
        "time": 1640995200
      }
    ],
    "amenities": ["lodging"]
  }
}
```

---

#### 4. 附近搜索酒店

**端点**: `GET /api/hotel/nearby`

**描述**: 基于位置坐标搜索附近的酒店

**认证**: 需要 Bearer Token

**查询参数**:
- `lat` (number, 必需): 纬度
- `lng` (number, 必需): 经度
- `radius` (number, 可选): 搜索半径（米），默认 10000
- `type` (string, 可选): 酒店类型，如 "lodging"
- `keyword` (string, 可选): 关键词，如 "luxury", "boutique"
- `priceLevel` (number, 可选): 价格等级（1-4）
- `minRating` (number, 可选): 最低评分（0-5）
- `language` (string, 可选): 语言代码，默认 'en'

**响应**:
```typescript
interface NearbySearchResponse {
  success: boolean;
  results: HotelDetails[];
  count: number;
}
```

**示例**:
```bash
curl "http://localhost:3000/api/hotel/nearby?lat=40.7128&lng=-74.0060&radius=10000&minRating=4.0" \
  -H "Authorization: Bearer {access_token}"
```

---

#### 5. 获取用户酒店偏好

**端点**: `GET /api/hotel/preferences`

**描述**: 获取当前用户的酒店偏好设置

**认证**: 需要 Bearer Token（自动从 token 中获取 userId）

**响应**:
```typescript
interface UserPreferencesResponse {
  success: boolean;
  preferences: {
    hotelType: string[];
    priceRange: string; // 'low', 'medium', 'high', 'very_high'
    amenities: string[];
    favoriteHotels: string[]; // Array of place IDs
  };
}
```

**示例**:
```bash
curl http://localhost:3000/api/hotel/preferences \
  -H "Authorization: Bearer {access_token}"
```

**响应示例**:
```json
{
  "success": true,
  "preferences": {
    "hotelType": ["luxury", "boutique"],
    "priceRange": "high",
    "amenities": ["wifi", "pool", "gym"],
    "favoriteHotels": ["ChIJ...", "ChIJ..."]
  }
}
```

---

#### 6. 保存用户酒店偏好

**端点**: `POST /api/hotel/preferences`

**描述**: 保存或更新用户的酒店偏好设置

**认证**: 需要 Bearer Token（自动从 token 中获取 userId）

**请求体**:
```typescript
interface SavePreferencesRequest {
  hotelType?: string[];
  priceRange?: string; // 'low', 'medium', 'high', 'very_high'
  amenities?: string[];
  favoriteHotels?: string[]; // Array of place IDs
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
curl -X POST http://localhost:3000/api/hotel/preferences \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "hotelType": ["luxury", "boutique"],
    "priceRange": "high",
    "amenities": ["wifi", "pool"]
  }'
```

---

#### 7. 智能推荐酒店

**端点**: `POST /api/hotel/recommend`

**描述**: 基于用户偏好和上下文（位置、入住日期、人数）智能推荐酒店

**认证**: 需要 Bearer Token（自动从 token 中获取 userId）

**请求体**:
```typescript
interface RecommendHotelsRequest {
  location: {
    lat: number;
    lng: number;
  };
  checkIn?: string; // YYYY-MM-DD
  checkOut?: string; // YYYY-MM-DD
  guests?: number;
  radius?: number; // 搜索半径（米），默认 10000
}
```

**响应**:
```typescript
interface RecommendHotelsResponse {
  success: boolean;
  recommendations: HotelDetails[];
  count: number;
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/hotel/recommend \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "lat": 40.7128,
      "lng": -74.0060
    },
    "checkIn": "2026-02-15",
    "checkOut": "2026-02-20",
    "guests": 2,
    "radius": 10000
  }'
```

**响应示例**:
```json
{
  "success": true,
  "recommendations": [
    {
      "placeId": "ChIJ...",
      "name": "The Plaza Hotel",
      "address": "768 5th Ave, New York, NY 10019",
      "location": {
        "lat": 40.7648,
        "lng": -73.9748
      },
      "rating": 4.5,
      "userRatingsTotal": 1234,
      "priceLevel": 4,
      "types": ["lodging", "point_of_interest"],
      "amenities": ["lodging"]
    }
  ],
  "count": 1
}
```

---

## 📊 数据模型

### HotelDetails

```typescript
interface HotelDetails {
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
  types?: string[]; // 酒店类型数组
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
  amenities?: string[]; // 酒店设施
  roomTypes?: string[]; // 房型
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
| `HOTEL_ERROR` | 500 | 通用错误 |
| `HOTEL_NOT_FOUND` | 404 | 酒店未找到 |
| `INVALID_PARAMS` | 400 | 无效的参数 |
| `UNAUTHORIZED` | 401 | 未认证 |

### 错误示例

```json
{
  "success": false,
  "error": {
    "code": "HOTEL_ERROR",
    "message": "Google Places API Key not configured"
  }
}
```

---

## 💡 使用示例

### TypeScript 示例

```typescript
// 搜索酒店
async function searchHotels(accessToken: string) {
  const response = await fetch('http://localhost:3000/api/hotel/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: '纽约市中心酒店',
      location: {
        lat: 40.7128,
        lng: -74.0060,
      },
      radius: 10000,
      minRating: 4.0,
    }),
  });

  const data = await response.json();
  return data.results;
}

// 获取酒店详情
async function getHotelDetails(accessToken: string, placeId: string) {
  const response = await fetch(
    `http://localhost:3000/api/hotel/details/${placeId}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();
  return data.hotel;
}

// 智能推荐
async function recommendHotels(
  accessToken: string,
  location: { lat: number; lng: number },
  checkIn?: string,
  checkOut?: string
) {
  const response = await fetch('http://localhost:3000/api/hotel/recommend', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      location,
      checkIn,
      checkOut,
      guests: 2,
    }),
  });

  const data = await response.json();
  return data.recommendations;
}
```

---

## 🤖 AI 推荐功能

### 推荐算法说明

`/api/hotel/recommend` 端点使用智能推荐算法，综合考虑以下因素：

1. **用户偏好**:
   - 酒店类型偏好（hotelType）
   - 价格范围（priceRange）
   - 设施偏好（amenities）
   - 历史收藏（favoriteHotels）

2. **上下文信息**:
   - 当前位置（location）
   - 入住日期（checkIn）
   - 退房日期（checkOut）
   - 入住人数（guests）

3. **酒店质量**:
   - 评分（rating）- 默认推荐 4.0 分以上
   - 评价数量（userRatingsTotal）

### 使用建议

1. **首次使用**: 用户可以先设置偏好（`POST /api/hotel/preferences`），然后使用推荐功能
2. **动态推荐**: 根据行程位置和日期动态推荐酒店
3. **个性化**: 系统会学习用户偏好，推荐越来越精准

---

## 🔒 安全说明

1. **认证**: 所有接口都需要 JWT Bearer Token 认证
2. **用户隔离**: 用户偏好和推荐结果都是用户级别的，不会泄露其他用户信息
3. **API Key**: Google Places API Key 存储在服务器端，不会暴露给客户端

---

## 📚 相关文档

- [Google Places API 文档](https://developers.google.com/maps/documentation/places/web-service)
- [Hotel Direct API 集成文档](./HOTEL_DIRECT_API.md)（待创建）
- [MCP API 文档索引](./MCP_API_DOCUMENTATION_INDEX.md)

---

**最后更新**: 2026-02-07
