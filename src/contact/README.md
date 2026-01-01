# Contact 模块

联系我们功能 API 接口实现。

## 功能特性

- ✅ 支持文本消息和多图片上传
- ✅ 支持匿名用户提交（可选认证）
- ✅ 文件类型和大小验证
- ✅ 限流保护（匿名用户每小时3次，已认证用户每小时10次）
- ✅ 自动邮件通知到客服邮箱
- ✅ 完整的错误处理和响应格式

## API 接口

### POST /contact/message

发送联系消息，支持文本和图片上传。

**请求格式：** `multipart/form-data`

**请求参数：**
- `message` (string, 可选): 文本消息内容
- `images` (File[], 可选): 图片文件数组（最多5张）

**注意事项：**
- `message` 和 `images` 至少需要提供其中一项
- 支持的图片格式：jpg, jpeg, png, gif, webp
- 单张图片最大 5MB
- 最多上传 5 张图片

**响应示例：**

成功响应 (200):
```json
{
  "success": true,
  "data": {
    "id": "contact_msg_1234567890",
    "success": true,
    "message": "消息发送成功"
  }
}
```

错误响应示例：
```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "消息和图片不能同时为空"
  }
}
```

## 环境变量配置

可选的环境变量：

- `CONTACT_UPLOAD_DIR`: 文件上传目录（默认：`uploads/contact`）
- `CONTACT_NOTIFICATION_EMAIL`: 客服通知邮箱（默认：`contact@youmind.ai`）
- `FILE_STORAGE_BASE_URL`: 文件访问基础URL（用于对象存储，可选）
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`: 邮件发送配置（已配置）

## 数据库迁移

### ✅ 迁移已完成

已使用 `prisma db push` 将 schema 变更推送到数据库。两个表已成功创建：
- `contact_messages`
- `contact_message_images`

### 如果需要重新迁移

如果迁移历史不同步（如生产环境），可以使用：

```bash
# 直接推送 schema 变更（不创建迁移文件）
npx prisma db push --skip-generate

# 重新生成 Prisma 客户端
npm run prisma:generate
```

如果迁移历史同步，可以使用：

```bash
npm run prisma:migrate dev --name add_contact_tables
npm run prisma:generate
```

## 文件存储

默认情况下，上传的文件存储在 `uploads/contact` 目录下。文件名使用 UUID 生成，避免文件名冲突。

如果需要使用对象存储（如 AWS S3、阿里云 OSS），可以：
1. 配置 `FILE_STORAGE_BASE_URL` 环境变量
2. 修改 `FileStorageService` 以支持对象存储上传

## 限流策略

- **匿名用户**：每小时最多 3 次请求
- **已认证用户**：每小时最多 10 次请求

限流基于 Redis 实现，使用用户ID或IP地址作为标识。

## 邮件通知

当有新的联系消息时，系统会自动发送邮件通知到客服邮箱。邮件内容包括：
- 消息ID
- 用户信息（ID或匿名标识）
- 消息内容预览
- 图片数量和链接

邮件通知是异步发送的，不会阻塞API响应。

## Swagger 文档

启动服务后，访问 `http://localhost:3000/api` 查看完整的 Swagger API 文档。

## 测试建议

### 使用 curl 测试

```bash
# 仅发送文本消息
curl -X POST http://localhost:3000/contact/message \
  -F "message=测试消息内容"

# 发送文本和图片
curl -X POST http://localhost:3000/contact/message \
  -F "message=发现了一个问题" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.png"
```

### 使用 Swagger UI

1. 访问 `http://localhost:3000/api`
2. 找到 `contact` tag
3. 选择 `POST /contact/message` 接口
4. 点击 "Try it out"
5. 填写表单并上传文件
6. 点击 "Execute" 执行请求

## 错误码说明

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| INVALID_REQUEST | 400 | 请求参数无效（如消息和图片都为空） |
| FILE_TOO_LARGE | 413 | 文件大小超过限制（5MB） |
| INVALID_FILE_TYPE | 415 | 不支持的文件类型 |
| TOO_MANY_FILES | 400 | 上传的图片数量超过限制（5张） |
| RATE_LIMIT_EXCEEDED | 429 | 请求频率过高，触发限流 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |
