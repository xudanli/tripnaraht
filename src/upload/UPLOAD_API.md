# 图片上传 API 文档

## 概述

图片上传服务基于阿里云 OSS 实现，支持单张/批量上传，并可直接关联到景点(Place)。

**Base URL**: `/api/upload`

---

## 配置

在 `.env` 文件中配置阿里云 OSS：

```bash
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_ACCESS_KEY_ID=your_access_key_id
ALIYUN_OSS_ACCESS_KEY_SECRET=your_access_key_secret
ALIYUN_OSS_BUCKET=your_bucket_name
ALIYUN_OSS_CDN_DOMAIN=your_cdn_domain  # 可选，用于 CDN 加速
```

---

## 接口列表

### 1. 检查服务状态

检查 OSS 上传服务是否可用。

**请求**
```
GET /api/upload/status
```

**响应**
```json
{
  "available": true,
  "message": "OSS 服务正常"
}
```

| 字段 | 类型 | 说明 |
|-----|------|-----|
| available | boolean | 服务是否可用 |
| message | string | 状态信息 |

**cURL 示例**
```bash
curl http://localhost:3000/api/upload/status
```

---

### 2. 上传单张图片

上传一张图片到 OSS。

**请求**
```
POST /api/upload/image
Content-Type: multipart/form-data
```

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|-----|
| file | File | 是 | 图片文件 (最大 10MB) |
| folder | string | 否 | 存储目录，默认 `places` |

**响应**
```json
{
  "success": true,
  "data": {
    "url": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/places/abc123.jpg",
    "key": "places/abc123.jpg"
  }
}
```

**cURL 示例**
```bash
curl -X POST http://localhost:3000/api/upload/image \
  -F "file=@/path/to/photo.jpg" \
  -F "folder=landscapes"
```

---

### 3. 批量上传图片

一次上传多张图片（最多10张）。

**请求**
```
POST /api/upload/images
Content-Type: multipart/form-data
```

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|-----|
| files | File[] | 是 | 图片文件数组 (每张最大 10MB) |
| folder | string | 否 | 存储目录，默认 `places` |

**响应**
```json
{
  "success": true,
  "data": [
    {
      "url": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/places/abc123.jpg",
      "key": "places/abc123.jpg"
    },
    {
      "url": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/places/def456.jpg",
      "key": "places/def456.jpg"
    }
  ],
  "count": 2
}
```

**cURL 示例**
```bash
curl -X POST http://localhost:3000/api/upload/images \
  -F "files=@photo1.jpg" \
  -F "files=@photo2.jpg" \
  -F "files=@photo3.jpg" \
  -F "folder=attractions"
```

---

### 4. 为景点上传图片

上传图片并自动关联到指定景点的 `metadata.images` 字段。

**请求**
```
POST /api/upload/place/:placeId/images
Content-Type: multipart/form-data
```

**路径参数**

| 参数 | 类型 | 说明 |
|-----|------|-----|
| placeId | number | 景点 ID |

**表单参数**

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|-----|
| files | File[] | 是 | 图片文件数组 |
| captions | string | 否 | JSON 格式的图片说明数组 |

**响应**
```json
{
  "success": true,
  "data": {
    "placeId": 381041,
    "placeName": "冰河湖",
    "newImages": [
      {
        "url": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/places/381041/abc.jpg",
        "key": "places/381041/abc.jpg",
        "caption": "冰河湖日落",
        "source": "upload",
        "isPrimary": true,
        "uploadedAt": "2026-01-25T08:30:00.000Z"
      }
    ],
    "totalImages": 3
  }
}
```

**cURL 示例**
```bash
curl -X POST http://localhost:3000/api/upload/place/381041/images \
  -F "files=@sunset.jpg" \
  -F "files=@panorama.jpg" \
  -F 'captions=["冰河湖日落", "全景图"]'
```

**说明**
- 图片存储在 `places/{placeId}/` 目录下
- 第一张上传的图片会被标记为 `isPrimary: true`（如果景点还没有图片）
- 图片信息会追加到现有 `metadata.images` 数组中

---

### 5. 获取景点图片列表

获取指定景点的所有图片。

**请求**
```
GET /api/upload/place/:placeId/images
```

**路径参数**

| 参数 | 类型 | 说明 |
|-----|------|-----|
| placeId | number | 景点 ID |

**响应**
```json
{
  "success": true,
  "data": {
    "placeId": 381041,
    "placeName": "冰河湖",
    "images": [
      {
        "url": "https://images.unsplash.com/photo-1504893524553-b855bce32c67?w=1200",
        "source": "unsplash",
        "caption": "冰河湖冰山",
        "isPrimary": true
      },
      {
        "url": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/places/381041/abc.jpg",
        "key": "places/381041/abc.jpg",
        "caption": "冰河湖日落",
        "source": "upload",
        "isPrimary": false,
        "uploadedAt": "2026-01-25T08:30:00.000Z"
      }
    ],
    "count": 2
  }
}
```

**cURL 示例**
```bash
curl http://localhost:3000/api/upload/place/381041/images
```

---

## 图片数据结构

存储在 `Place.metadata.images` 中的图片对象：

```typescript
interface PlaceImage {
  url: string;          // 图片 URL
  key?: string;         // OSS 存储 key（仅上传的图片有）
  caption?: string;     // 图片说明
  source: 'upload' | 'unsplash' | 'external';  // 来源
  isPrimary: boolean;   // 是否为主图
  uploadedAt?: string;  // 上传时间（ISO 格式）
}
```

---

## 错误响应

| 状态码 | 说明 |
|-------|-----|
| 400 | 请求参数错误（无文件、文件类型错误、景点不存在） |
| 413 | 文件大小超过限制 (10MB) |
| 500 | 服务器错误（OSS 上传失败等） |

**错误响应示例**
```json
{
  "statusCode": 400,
  "message": "只允许上传图片文件",
  "error": "Bad Request"
}
```

---

## 支持的图片格式

- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)

---

## 前端集成示例

### JavaScript/Fetch
```javascript
// 为景点上传图片
async function uploadPlaceImages(placeId, files, captions) {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  if (captions) {
    formData.append('captions', JSON.stringify(captions));
  }

  const response = await fetch(`/api/upload/place/${placeId}/images`, {
    method: 'POST',
    body: formData,
  });

  return response.json();
}
```

### React + Axios
```jsx
import axios from 'axios';

const uploadImages = async (placeId, files, captions) => {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  formData.append('captions', JSON.stringify(captions));

  const { data } = await axios.post(
    `/api/upload/place/${placeId}/images`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );

  return data;
};
```

---

## Swagger 文档

启动服务后访问：
```
http://localhost:3000/api/docs#/Upload
```
