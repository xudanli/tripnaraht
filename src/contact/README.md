# Contact 模块

联系我们功能 API 接口实现，支持用户反馈、问题报告等场景。

## 功能特性

- ✅ 支持文本消息和多图片上传
- ✅ 支持匿名用户提交（可选认证）
- ✅ 图片自动上传到阿里云 OSS（tripnara-contact bucket）
- ✅ 文件类型和大小验证
- ✅ 限流保护（匿名用户每小时3次，已认证用户每小时10次）
- ✅ 自动邮件通知到客服邮箱
- ✅ 管理后台接口（查看、回复、状态管理）
- ✅ 完整的错误处理和响应格式

---

## API 接口

### 用户接口

#### POST /api/contact/message

发送联系消息，支持文本和图片上传。

**请求格式：** `multipart/form-data`

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| message | string | 否* | 文本消息内容 |
| images | File[] | 否* | 图片文件数组（最多5张） |

> *注意：`message` 和 `images` 至少需要提供其中一项

**约束条件：**
- 支持的图片格式：jpg, jpeg, png, gif, webp
- 单张图片最大：5MB
- 最多上传：5 张图片

**请求示例：**

```bash
# 仅发送文本消息
curl -X POST http://localhost:3000/api/contact/message \
  -F "message=发现了一个问题，希望能够修复"

# 发送文本和图片
curl -X POST http://localhost:3000/api/contact/message \
  -F "message=这是截图反馈" \
  -F "images=@/path/to/screenshot1.png" \
  -F "images=@/path/to/screenshot2.png"
```

**成功响应 (200)：**

```json
{
  "success": true,
  "data": {
    "id": "ddc5e15c-8487-43b6-8513-f4f7c2c43be5",
    "success": true,
    "message": "消息发送成功"
  }
}
```

**错误响应示例：**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "消息和图片不能同时为空"
  }
}
```

---

### 管理接口

> ⚠️ 生产环境应添加管理员权限验证

#### GET /api/contact/admin/messages

获取联系消息列表，支持分页、筛选、搜索。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| page | number | 1 | 页码 |
| limit | number | 20 | 每页数量 |
| status | string | - | 状态筛选：pending/read/replied/resolved |
| userId | string | - | 用户ID筛选 |
| search | string | - | 搜索关键词（消息内容） |

**请求示例：**

```bash
# 获取第1页，每页10条
curl "http://localhost:3000/api/contact/admin/messages?page=1&limit=10"

# 筛选待处理消息
curl "http://localhost:3000/api/contact/admin/messages?status=pending"

# 搜索包含"bug"的消息
curl "http://localhost:3000/api/contact/admin/messages?search=bug"
```

**成功响应 (200)：**

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "2af985f2-420b-4df0-8588-963bd67b805a",
        "userId": null,
        "message": "这是一条测试消息",
        "status": "pending",
        "createdAt": "2026-01-26T07:06:02.000Z",
        "updatedAt": "2026-01-26T07:06:02.000Z",
        "images": [
          {
            "id": "img-uuid",
            "filePath": "contact/6888ad9b-304e-4af7-8c22-92bb9801eb8f.png",
            "fileName": "screenshot.png",
            "fileSize": "12345",
            "mimeType": "image/png",
            "fileUrl": "https://tripnara-contact.oss-cn-hangzhou.aliyuncs.com/contact/6888ad9b-304e-4af7-8c22-92bb9801eb8f.png"
          }
        ]
      }
    ],
    "total": 25,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  }
}
```

---

#### GET /api/contact/admin/messages/:id

获取单条消息详情。

**路径参数：**

| 参数 | 类型 | 说明 |
|-----|------|------|
| id | string | 消息ID |

**请求示例：**

```bash
curl "http://localhost:3000/api/contact/admin/messages/2af985f2-420b-4df0-8588-963bd67b805a"
```

**成功响应 (200)：**

```json
{
  "success": true,
  "data": {
    "id": "2af985f2-420b-4df0-8588-963bd67b805a",
    "userId": null,
    "message": "这是一条测试消息",
    "status": "pending",
    "createdAt": "2026-01-26T07:06:02.000Z",
    "updatedAt": "2026-01-26T07:06:02.000Z",
    "images": [
      {
        "id": "img-uuid",
        "filePath": "contact/xxx.png",
        "fileName": "screenshot.png",
        "fileSize": "12345",
        "mimeType": "image/png",
        "fileUrl": "https://tripnara-contact.oss-cn-hangzhou.aliyuncs.com/contact/xxx.png"
      }
    ]
  }
}
```

---

#### PUT /api/contact/admin/messages/:id/status

更新消息状态。

**路径参数：**

| 参数 | 类型 | 说明 |
|-----|------|------|
| id | string | 消息ID |

**请求体：**

```json
{
  "status": "read"
}
```

**状态值说明：**

| 状态 | 说明 |
|-----|------|
| pending | 待处理（默认） |
| read | 已读 |
| replied | 已回复 |
| resolved | 已解决 |

**请求示例：**

```bash
curl -X PUT "http://localhost:3000/api/contact/admin/messages/xxx/status" \
  -H "Content-Type: application/json" \
  -d '{"status": "read"}'
```

---

#### POST /api/contact/admin/messages/:id/reply

回复消息（状态自动更新为 replied）。

**路径参数：**

| 参数 | 类型 | 说明 |
|-----|------|------|
| id | string | 消息ID |

**请求体：**

```json
{
  "reply": "感谢您的反馈，我们已经修复了这个问题。"
}
```

**请求示例：**

```bash
curl -X POST "http://localhost:3000/api/contact/admin/messages/xxx/reply" \
  -H "Content-Type: application/json" \
  -d '{"reply": "感谢您的反馈！"}'
```

---

## 环境变量配置

### OSS 存储配置（推荐）

Contact 模块使用 `tripnara-contact` bucket 存储图片：

```bash
# 复用现有 OSS 配置（会自动使用 tripnara-contact bucket）
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_ACCESS_KEY_ID=your_access_key_id
ALIYUN_OSS_ACCESS_KEY_SECRET=your_access_key_secret
ALIYUN_OSS_CDN_DOMAIN=your_cdn_domain  # 可选，CDN 加速

# 可选：Contact 专用 bucket 配置（优先级更高）
CONTACT_OSS_BUCKET=tripnara-contact  # 默认值
```

### 其他配置

| 环境变量 | 默认值 | 说明 |
|---------|-------|------|
| CONTACT_OSS_BUCKET | tripnara-contact | OSS Bucket 名称 |
| CONTACT_UPLOAD_DIR | uploads/contact | 本地上传目录（降级方案） |
| CONTACT_NOTIFICATION_EMAIL | support@tripnara.com | 客服通知邮箱 |

---

## 文件存储

### 阿里云 OSS 存储（默认）

- **Bucket**: `tripnara-contact`
- **文件夹**: `contact/`
- **文件命名**: UUID + 原始扩展名
- **缓存策略**: 1 年 (Cache-Control: max-age=31536000)
- **URL 格式**: `https://tripnara-contact.oss-cn-hangzhou.aliyuncs.com/contact/{uuid}.{ext}`

### 本地存储（降级方案）

如果 OSS 不可用，会自动降级到本地存储：
- **目录**: `uploads/contact/`
- **需要配置**: 静态文件服务或 `FILE_STORAGE_BASE_URL`

---

## 限流策略

| 用户类型 | 限制 | 说明 |
|---------|-----|------|
| 匿名用户 | 3次/小时 | 基于 IP 地址 |
| 已认证用户 | 10次/小时 | 基于用户 ID |

限流基于 Redis 实现，超出限制返回 429 状态码。

---

## 邮件通知

新消息提交后，系统会异步发送邮件通知到客服邮箱，包含：
- 消息 ID
- 用户信息（ID 或匿名标识）
- 消息内容预览
- 图片数量和访问链接

---

## 错误码说明

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| INVALID_REQUEST | 400 | 请求参数无效（如消息和图片都为空） |
| FILE_TOO_LARGE | 413 | 文件大小超过限制（5MB） |
| INVALID_FILE_TYPE | 415 | 不支持的文件类型 |
| TOO_MANY_FILES | 400 | 上传的图片数量超过限制（5张） |
| RATE_LIMIT_EXCEEDED | 429 | 请求频率过高，触发限流 |
| NOT_FOUND | 404 | 消息不存在 |
| VALIDATION_ERROR | 400 | 数据验证失败 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

---

## 数据库表结构

### contact_messages

| 字段 | 类型 | 说明 |
|-----|------|------|
| id | UUID | 主键 |
| userId | String? | 用户ID（可空，匿名用户） |
| message | String? | 消息内容 |
| status | String | 状态：pending/read/replied/resolved |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### contact_message_images

| 字段 | 类型 | 说明 |
|-----|------|------|
| id | UUID | 主键 |
| messageId | UUID | 关联消息ID |
| filePath | String | 文件路径（OSS key 或本地路径） |
| fileName | String | 原始文件名 |
| fileSize | BigInt | 文件大小（字节） |
| mimeType | String | MIME 类型 |
| createdAt | DateTime | 创建时间 |

---

## Swagger 文档

启动服务后，访问以下地址查看完整的 API 文档：

```
http://localhost:3000/api-docs
```

在 Swagger UI 中找到 `contact` tag 即可查看所有接口。

---

## 快速测试

```bash
# 1. 发送纯文本消息
curl -X POST http://localhost:3000/api/contact/message \
  -F "message=这是一条测试消息"

# 2. 发送带图片的消息
curl -X POST http://localhost:3000/api/contact/message \
  -F "message=发现了一个 bug" \
  -F "images=@./screenshot.png"

# 3. 获取消息列表
curl "http://localhost:3000/api/contact/admin/messages?limit=5"

# 4. 更新消息状态
curl -X PUT "http://localhost:3000/api/contact/admin/messages/{id}/status" \
  -H "Content-Type: application/json" \
  -d '{"status": "read"}'
```
