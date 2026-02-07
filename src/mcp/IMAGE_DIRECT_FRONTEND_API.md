# Image Direct API 前端接口文档

**服务名称**: Image Direct API  
**Base URL**: `/api/image`  
**认证**: 需要 JWT Bearer Token（所有接口都需要用户认证）  
**数据源**: Pexels API（优先）和 Unsplash API（备选）

---

## 📋 目录

1. [快速开始](#快速开始)
2. [API 端点](#api-端点)
3. [数据模型](#数据模型)
4. [错误处理](#错误处理)
5. [使用示例](#使用示例)
6. [用户偏好功能](#用户偏好功能)

---

## 🚀 快速开始

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/image/health \
  -H "Authorization: Bearer {access_token}"
```

**响应**:
```json
{
  "success": true,
  "available": true
}
```

### 2. 搜索图片

```bash
curl -X POST http://localhost:3000/api/image/search \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "nature landscape",
    "perPage": 10
  }'
```

### 3. 智能推荐图片（基于用户偏好）

```bash
curl -X POST http://localhost:3000/api/image/recommend \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "travel",
    "perPage": 15
  }'
```

---

## 📡 API 端点

### 基础端点

#### 1. 检查服务状态

**端点**: `GET /api/image/health`

**描述**: 检查 Image 服务是否可用

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
curl http://localhost:3000/api/image/health \
  -H "Authorization: Bearer {access_token}"
```

---

#### 2. 搜索图片

**端点**: `POST /api/image/search`

**描述**: 根据关键词搜索图片

**认证**: 需要 Bearer Token

**请求体**:
```typescript
interface ImageSearchRequest {
  query: string;                    // 搜索关键词（必填）
  perPage?: number;                // 每页数量（1-80，默认 15）
  page?: number;                    // 页码（默认 1）
  orientation?: 'landscape' | 'portrait' | 'square';  // 图片方向
  size?: 'large' | 'medium' | 'small';               // 图片尺寸
  color?: string;                   // 颜色过滤（hex color，如 '#FF0000'）
  locale?: string;                  // 语言代码（如 'en-US', 'pt-BR'）
}
```

**响应**:
```typescript
interface ImageSearchResponse {
  success: boolean;
  page: number;
  perPage: number;
  totalResults: number;
  totalPages: number;
  photos: ImageDetails[];
}
```

**示例**:

基本搜索:
```bash
curl -X POST http://localhost:3000/api/image/search \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mountain sunset"
  }'
```

带过滤条件的搜索:
```bash
curl -X POST http://localhost:3000/api/image/search \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "ocean",
    "perPage": 20,
    "orientation": "landscape",
    "color": "#0066CC"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "page": 1,
  "perPage": 15,
  "totalResults": 5000,
  "totalPages": 334,
  "photos": [
    {
      "id": 1234567,
      "width": 4000,
      "height": 3000,
      "url": "https://www.pexels.com/photo/...",
      "photographer": "John Doe",
      "photographerUrl": "https://www.pexels.com/@johndoe",
      "photographerId": 12345,
      "avgColor": "#0066CC",
      "src": {
        "original": "https://images.pexels.com/photos/...",
        "large2x": "https://images.pexels.com/photos/...",
        "large": "https://images.pexels.com/photos/...",
        "medium": "https://images.pexels.com/photos/...",
        "small": "https://images.pexels.com/photos/...",
        "portrait": "https://images.pexels.com/photos/...",
        "landscape": "https://images.pexels.com/photos/...",
        "tiny": "https://images.pexels.com/photos/..."
      },
      "liked": false,
      "alt": "Beautiful ocean view"
    }
  ]
}
```

---

#### 3. 获取图片详情

**端点**: `GET /api/image/details/:photoId`

**描述**: 根据图片 ID 获取详细信息

**认证**: 需要 Bearer Token

**查询参数**:
- `source` (可选): 图片来源，`'pexels'` 或 `'unsplash'`（默认: `'pexels'`）

**响应**:
```typescript
interface ImageDetailsResponse {
  success: boolean;
  photo: ImageDetails;
}
```

**示例**:
```bash
curl http://localhost:3000/api/image/details/1234567?source=pexels \
  -H "Authorization: Bearer {access_token}"
```

---

#### 4. 获取推荐图片

**端点**: `GET /api/image/curated`

**描述**: 获取精选的高质量图片

**认证**: 需要 Bearer Token

**查询参数**:
- `perPage` (可选): 每页数量（默认 15）
- `page` (可选): 页码（默认 1）

**响应**:
```typescript
interface CuratedImagesResponse {
  success: boolean;
  page: number;
  perPage: number;
  totalResults: number;
  totalPages: number;
  photos: ImageDetails[];
}
```

**示例**:
```bash
curl "http://localhost:3000/api/image/curated?perPage=10&page=1" \
  -H "Authorization: Bearer {access_token}"
```

---

### 用户偏好端点

#### 5. 获取用户图片偏好设置

**端点**: `GET /api/image/preferences`

**描述**: 获取当前用户的图片偏好设置

**认证**: 需要 Bearer Token（自动从 token 中获取用户 ID）

**响应**:
```typescript
interface UserImagePreferencesResponse {
  success: boolean;
  preferences: {
    preferredStyles: string[];        // 偏好风格（如 ["nature", "urban"]）
    preferredColors: string[];       // 偏好颜色（hex colors）
    preferredOrientations: string[]; // 偏好方向（如 ["landscape", "portrait"]）
    favoriteImages: number[];        // 收藏的图片 ID 列表
  };
}
```

**示例**:
```bash
curl http://localhost:3000/api/image/preferences \
  -H "Authorization: Bearer {access_token}"
```

**响应示例**:
```json
{
  "success": true,
  "preferences": {
    "preferredStyles": ["nature", "travel"],
    "preferredColors": ["#0066CC", "#FF6600"],
    "preferredOrientations": ["landscape"],
    "favoriteImages": [1234567, 2345678]
  }
}
```

---

#### 6. 保存用户图片偏好设置

**端点**: `POST /api/image/preferences`

**描述**: 保存当前用户的图片偏好设置

**认证**: 需要 Bearer Token（自动从 token 中获取用户 ID）

**请求体**:
```typescript
interface SaveImagePreferencesRequest {
  preferredStyles?: string[];        // 偏好风格
  preferredColors?: string[];        // 偏好颜色（hex colors）
  preferredOrientations?: string[]; // 偏好方向
  favoriteImages?: number[];         // 收藏的图片 ID 列表
}
```

**响应**:
```typescript
interface SaveImagePreferencesResponse {
  success: boolean;
  message: string;
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/image/preferences \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "preferredStyles": ["nature", "travel"],
    "preferredColors": ["#0066CC"],
    "preferredOrientations": ["landscape"],
    "favoriteImages": [1234567]
  }'
```

---

#### 7. 智能推荐图片（基于用户偏好）

**端点**: `POST /api/image/recommend`

**描述**: 智能推荐图片，自动使用用户的偏好设置

**认证**: 需要 Bearer Token（自动从 token 中获取用户 ID）

**请求体**:
```typescript
interface RecommendImagesRequest {
  query?: string;      // 搜索关键词（可选，不提供则使用默认）
  perPage?: number;    // 每页数量（默认 15）
  page?: number;       // 页码（默认 1）
}
```

**响应**:
```typescript
interface RecommendImagesResponse {
  success: boolean;
  page: number;
  perPage: number;
  totalResults: number;
  totalPages: number;
  photos: ImageDetails[];
}
```

**示例**:
```bash
curl -X POST http://localhost:3000/api/image/recommend \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "travel",
    "perPage": 15
  }'
```

---

## 📊 数据模型

### ImageDetails

```typescript
interface ImageDetails {
  id: number;                    // 图片 ID
  width: number;                 // 宽度（像素）
  height: number;                // 高度（像素）
  url: string;                   // 图片页面 URL
  photographer: string;          // 摄影师姓名
  photographerUrl: string;      // 摄影师主页 URL
  photographerId: number;        // 摄影师 ID
  avgColor: string;             // 平均颜色（hex，如 '#0066CC'）
  src: {
    original: string;           // 原始尺寸
    large2x: string;           // 大尺寸（2x）
    large: string;             // 大尺寸
    medium: string;            // 中等尺寸
    small: string;             // 小尺寸
    portrait: string;          // 纵向尺寸
    landscape: string;         // 横向尺寸
    tiny: string;              // 缩略图
  };
  liked: boolean;               // 是否已收藏
  alt: string;                 // 图片描述/替代文本
}
```

### ImagePreferences

```typescript
interface ImagePreferences {
  preferredStyles: string[];        // 偏好风格关键词
  preferredColors: string[];       // 偏好颜色（hex）
  preferredOrientations: string[]; // 偏好方向
  favoriteImages: number[];        // 收藏的图片 ID 列表
}
```

---

## ⚠️ 错误处理

所有接口在发生错误时都会返回以下格式：

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;      // 错误代码（如 'IMAGE_ERROR', 'IMAGE_NOT_FOUND'）
    message: string;   // 错误消息
  };
}
```

**常见错误**:

1. **服务不可用** (`IMAGE_ERROR`)
   - 原因: Pexels API Key 或 Unsplash API Key 未配置或无效
   - HTTP 状态码: 500

2. **图片未找到** (`IMAGE_NOT_FOUND`)
   - 原因: 提供的图片 ID 不存在
   - HTTP 状态码: 404

3. **认证失败** (`UNAUTHORIZED`)
   - 原因: JWT Token 无效或过期
   - HTTP 状态码: 401

4. **API 配额限制** (`IMAGE_ERROR`)
   - 原因: API 请求次数超过限制
   - HTTP 状态码: 429

---

## 💡 使用示例

### 示例 1: 搜索旅游相关图片

```typescript
async function searchTravelImages(query: string) {
  const response = await fetch('/api/image/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      perPage: 20,
      orientation: 'landscape',
    }),
  });

  const data = await response.json();
  if (data.success) {
    return data.photos;
  } else {
    throw new Error(data.error.message);
  }
}

// 使用
const photos = await searchTravelImages('Iceland landscape');
photos.forEach(photo => {
  console.log(`${photo.photographer}: ${photo.alt}`);
  console.log(`URL: ${photo.src.large}`);
});
```

### 示例 2: 获取推荐图片

```typescript
async function getCuratedPhotos(count: number = 10) {
  const response = await fetch(`/api/image/curated?perPage=${count}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  return data.photos;
}

// 使用
const curatedPhotos = await getCuratedPhotos(15);
```

### 示例 3: 基于用户偏好推荐图片

```typescript
async function getPersonalizedRecommendations(query?: string) {
  const response = await fetch('/api/image/recommend', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: query || 'travel',
      perPage: 20,
    }),
  });

  const data = await response.json();
  return data.photos;
}

// 使用（自动应用用户偏好）
const recommendations = await getPersonalizedRecommendations('nature');
```

### 示例 4: 管理用户偏好设置

```typescript
// 获取偏好设置
async function getUserPreferences() {
  const response = await fetch('/api/image/preferences', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  return data.preferences;
}

// 保存偏好设置
async function saveUserPreferences(preferences: {
  preferredStyles?: string[];
  preferredColors?: string[];
  preferredOrientations?: string[];
  favoriteImages?: number[];
}) {
  const response = await fetch('/api/image/preferences', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preferences),
  });

  const data = await response.json();
  return data.success;
}

// 使用
const prefs = await getUserPreferences();
console.log('当前偏好:', prefs);

await saveUserPreferences({
  preferredStyles: ['nature', 'travel'],
  preferredOrientations: ['landscape'],
  favoriteImages: [1234567, 2345678],
});
```

### 示例 5: 图片展示组件

```typescript
interface ImageGalleryProps {
  photos: ImageDetails[];
}

function ImageGallery({ photos }: ImageGalleryProps) {
  return (
    <div className="image-gallery">
      {photos.map(photo => (
        <div key={photo.id} className="image-item">
          <img
            src={photo.src.medium}
            alt={photo.alt}
            loading="lazy"
          />
          <div className="image-info">
            <p>{photo.alt}</p>
            <p>
              Photo by{' '}
              <a href={photo.photographerUrl} target="_blank" rel="noopener">
                {photo.photographer}
              </a>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 🔧 用户偏好功能

Image Direct API 支持用户级别的图片偏好设置，包括：

1. **偏好风格**: 用户喜欢的图片风格关键词（如 "nature", "urban", "abstract"）
2. **偏好颜色**: 用户喜欢的颜色（hex colors）
3. **偏好方向**: 用户喜欢的图片方向（landscape, portrait, square）
4. **收藏图片**: 用户收藏的图片 ID 列表

这些设置可以通过 `/api/image/preferences` 端点管理，并在使用 `/api/image/recommend` 时自动应用。

---

## 📝 注意事项

1. **API Key 配置**: 
   - 优先使用 Pexels API（配额更高：200/hour）
   - 备选 Unsplash API（配额：50/hour）
   - 配置 `PEXELS_API_KEY` 或 `UNSPLASH_ACCESS_KEY` 环境变量

2. **图片归属**: 
   - 使用图片时请遵循 API 提供商的归属要求
   - Pexels: 需要标注摄影师和来源
   - Unsplash: 需要标注摄影师和 Unsplash

3. **图片尺寸**: 
   - 根据使用场景选择合适的尺寸（`src.small`, `src.medium`, `src.large` 等）
   - 避免在移动端使用过大尺寸的图片

4. **速率限制**: 
   - Pexels: 200 请求/小时（免费版）
   - Unsplash: 50 请求/小时（免费版）
   - 建议实现请求缓存和重试机制

5. **图片缓存**: 
   - 建议在客户端缓存图片 URL
   - 服务端已实现自动降级（Pexels 失败时使用 Unsplash）

---

## 🔗 相关文档

- [Pexels API 文档](https://www.pexels.com/api/documentation/)
- [Unsplash API 文档](https://unsplash.com/developers)
- [MCP API 文档索引](../MCP_API_DOCUMENTATION_INDEX.md)
