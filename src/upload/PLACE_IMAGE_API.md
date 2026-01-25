# 景点图片接口文档（前端）

## 一、批量获取 Unsplash 图片

### 接口信息
- **端点**: `POST /api/places/images/batch`
- **认证**: 无需认证（公开接口）

### 请求参数

**请求体**:
```typescript
{
  places: Array<{
    placeId?: string;        // 可选：地点 ID
    placeName: string;        // 必填：地点名称（中文或英文）
    placeNameEn?: string;    // 可选：地点英文名称（优先用于搜索）
    country?: string;         // 可选：国家名称（如 "Japan", "Iceland"）
    category?: string;        // 可选：地点类别
  }>
}
```

**category 可选值**:
- Prisma 格式: `ATTRACTION`, `RESTAURANT`, `SHOPPING`, `HOTEL`
- 图片搜索格式: `landmark`, `nature`, `restaurant`, `hotel`, `temple`, `museum`, `park`, `beach`, `mountain`

**限制**:
- `places` 数组长度：1-20 个
- API 速率限制：50 次/小时
- 结果缓存 24 小时

### 响应数据

**成功响应**:
```typescript
{
  success: true;
  results: Array<{
    placeId?: string;
    placeName: string;
    photo: {
      id: string;
      width: number;
      height: number;
      color: string;              // HEX 颜色值
      blurHash: string;            // 用于占位符
      description: string | null;
      altDescription: string | null;
      urls: {
        raw: string;               // 原始图片（最高质量）
        full: string;               // 全尺寸
        regular: string;            // 常规尺寸（1080px 宽）
        small: string;              // 小尺寸（400px 宽）
        thumb: string;              // 缩略图（200px 宽）
      };
      user: {
        name: string;              // 摄影师名称
        username: string;
        link: string;               // 摄影师主页
      };
      attribution: {
        photographerName: string;
        photographerUrl: string;
        unsplashUrl: string;
      };
    } | null;
    cached: boolean;               // 是否来自缓存
    error?: string;                // 错误信息（如果失败）
  }>;
  stats: {
    total: number;                 // 请求总数
    found: number;                 // 成功获取数
    cached: number;                // 缓存命中数
    failed: number;                // 失败数
  };
  processingTimeMs: number;        // 处理耗时（毫秒）
}
```

**错误响应**:
```typescript
{
  success: false;
  message: string;
}
```

### 请求示例

```javascript
// JavaScript/Fetch
const response = await fetch('/api/places/images/batch', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    places: [
      {
        placeName: '富士山',
        placeNameEn: 'Mount Fuji',
        country: 'Japan',
        category: 'mountain',
      },
      {
        placeName: '浅草寺',
        placeNameEn: 'Sensoji Temple',
        country: 'Japan',
        category: 'temple',
      },
    ],
  }),
});

const result = await response.json();
```

---

## 二、删除景点图片

### 接口信息
- **端点**: `DELETE /api/upload/place/:placeId/images`
- **认证**: 无需认证（公开接口）

### 请求参数

**路径参数**:
- `placeId` (number, 必填): 景点 ID

**查询参数**（二选一）:
- `key` (string, 可选): 图片的 OSS key，例如 `places/381041/abc.jpg`
- `index` (number, 可选): 图片在列表中的索引（从 0 开始）

**注意**: 必须提供 `key` 或 `index` 其中一个参数

### 响应数据

**成功响应**:
```typescript
{
  success: true;
  data: {
    placeId: number;
    placeName: string;
    deletedImage: {
      url: string;
      key?: string;                // 仅上传的图片有 key
      caption?: string;
    };
    remainingImages: number;        // 剩余图片数量
    totalImages: number;           // 总图片数量（删除后）
  };
}
```

**错误响应**:
```typescript
{
  success: false;
  message: string;                 // 错误信息
}
```

### 请求示例

```javascript
// 通过 key 删除
const response1 = await fetch(
  `/api/upload/place/381041/images?key=${encodeURIComponent('places/381041/abc.jpg')}`,
  { method: 'DELETE' }
);

// 通过索引删除（删除第一张图片）
const response2 = await fetch(
  `/api/upload/place/381041/images?index=0`,
  { method: 'DELETE' }
);

const result = await response1.json();
```

---

## 三、获取景点图片列表（参考）

### 接口信息
- **端点**: `GET /api/upload/place/:placeId/images`
- **认证**: 无需认证（公开接口）

### 请求参数

**路径参数**:
- `placeId` (number, 必填): 景点 ID

### 响应数据

```typescript
{
  success: true;
  data: {
    placeId: number;
    placeName: string;
    images: Array<{
      url: string;
      key?: string;                // 仅上传的图片有 key
      caption?: string;
      source: 'upload' | 'unsplash' | 'external';
      isPrimary: boolean;
      uploadedAt?: string;         // ISO 格式时间
    }>;
    count: number;
  };
}
```

---

## 四、重要提示

### Unsplash 图片归属要求

使用 Unsplash 图片时，**必须**展示归属信息：

```html
<p>
  Photo by 
  <a href="{photo.attribution.photographerUrl}">
    {photo.attribution.photographerName}
  </a> 
  on 
  <a href="{photo.attribution.unsplashUrl}">Unsplash</a>
</p>
```

### 图片删除说明

1. 删除景点图片时，如果图片有 `key`（上传的图片），会同时从 OSS 删除文件
2. 删除主图后，系统会自动将第一张图片设为主图
3. 删除操作会从景点的 `metadata.images` 中移除对应记录

---

## 五、保存 Unsplash 图片到数据库

### 接口信息
- **端点**: `POST /api/places/images/save`
- **认证**: 无需认证（公开接口）

### 功能说明
将从批量图片接口获取的 Unsplash 图片**下载并上传到 OSS**，然后保存到指定地点的 `metadata.images` 中，实现持久化存储。

**重要**：
- 图片会从 Unsplash 下载并上传到阿里云 OSS
- 保存的是 OSS 的 URL，而不是 Unsplash 的 URL
- 需要配置 OSS 环境变量才能使用此功能

### 请求参数

**请求体**:
```typescript
{
  placeId: number;              // 必填：地点 ID（数据库中的 Place.id）
  photo: UnsplashPhotoDto;      // 必填：Unsplash 图片数据（从批量接口返回）
  isPrimary?: boolean;          // 可选：是否设为主图（默认 false）
}
```

### 响应数据

**成功响应**:
```typescript
{
  success: true;
  placeId: number;
  placeName: string;
  savedImage: {
    url: string;                // OSS 图片 URL（从 Unsplash 下载并上传后）
    caption: string;             // 图片描述
    source: 'unsplash';          // 图片来源
    isPrimary: boolean;          // 是否为主图
    savedAt: string;             // 保存时间（ISO 格式）
    attribution: {               // Unsplash 归属信息
      photographerName: string;
      photographerUrl: string;
      unsplashUrl: string;
    };
  };
  totalImages: number;           // 地点总图片数
}
```

### 使用流程

1. **获取图片**：调用批量图片接口获取 Unsplash 图片
2. **保存图片**：将获取到的图片数据保存到数据库

```javascript
// 步骤 1: 获取图片
const imageResponse = await fetch('/api/places/images/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    places: [
      { placeName: 'Akureyri', placeNameEn: 'Akureyri', country: 'Iceland', category: 'landmark' }
    ]
  })
});

const imageData = await imageResponse.json();
const photo = imageData.results[0].photo;

if (photo) {
  // 步骤 2: 保存图片到数据库
  const saveResponse = await fetch('/api/places/images/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      placeId: 123,  // 替换为实际的地点 ID
      photo: photo,
      isPrimary: true  // 如果这是第一张图片，设为 true
    })
  });

  const saveResult = await saveResponse.json();
  console.log('图片已保存:', saveResult);
}
```

### 注意事项

1. **OSS 配置**：需要配置阿里云 OSS 环境变量才能使用此功能
   ```bash
   ALIYUN_OSS_REGION=oss-cn-hangzhou
   ALIYUN_OSS_ACCESS_KEY_ID=your_access_key_id
   ALIYUN_OSS_ACCESS_KEY_SECRET=your_access_key_secret
   ALIYUN_OSS_BUCKET=your_bucket_name
   ALIYUN_OSS_CDN_DOMAIN=your_cdn_domain  # 可选
   ```

2. **图片存储**：图片会从 Unsplash 下载并上传到 OSS，保存的是 OSS URL
3. **归属信息**：保存的图片包含 Unsplash 归属信息，使用时必须展示
4. **图片格式**：保存的格式与上传接口保持一致，便于统一管理
5. **主图设置**：如果地点没有其他图片，会自动设为主图
6. **数据存储**：图片信息存储在 `Place.metadata.images` 数组中
7. **删除支持**：保存的图片包含 `key` 字段，可以通过上传接口的删除功能删除

---

## 六、完整使用示例

```typescript
// 1. 批量获取图片
async function getBatchPlaceImages(places) {
  const response = await fetch('/api/places/images/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ places }),
  });
  return response.json();
}

// 2. 删除景点图片（通过 key）
async function deletePlaceImageByKey(placeId, key) {
  const response = await fetch(
    `/api/upload/place/${placeId}/images?key=${encodeURIComponent(key)}`,
    { method: 'DELETE' }
  );
  return response.json();
}

// 3. 删除景点图片（通过索引）
async function deletePlaceImageByIndex(placeId, index) {
  const response = await fetch(
    `/api/upload/place/${placeId}/images?index=${index}`,
    { method: 'DELETE' }
  );
  return response.json();
}

// 4. 获取景点图片列表
async function getPlaceImages(placeId) {
  const response = await fetch(`/api/upload/place/${placeId}/images`);
  return response.json();
}
```
