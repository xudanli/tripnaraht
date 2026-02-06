# Google Calendar API 测试指南

## 快速开始

### 1. 启动 API 服务器

```bash
# 开发模式（推荐）
npm run dev

# 或生产模式
npm run build
npm run start
```

### 2. 运行测试

在另一个终端运行：

```bash
npm run test:google-calendar:api
```

### 3. 使用自定义服务器地址

```bash
API_BASE_URL=http://your-server:port npm run test:google-calendar:api
```

## 测试内容

测试脚本会测试以下 API 端点：

1. ✅ **GET /api/google-calendar/tools** - 列出所有可用工具
2. ✅ **GET /api/google-calendar/calendars** - 列出所有日历
3. ✅ **GET /api/google-calendar/current-time** - 获取当前时间
4. ✅ **GET /api/google-calendar/events** - 列出日历事件
5. ✅ **POST /api/google-calendar/events** - 创建日历事件
6. ✅ **POST /api/google-calendar/free-slots** - 查找空闲时间段
7. ✅ **POST /api/google-calendar/quick-add** - 快速添加事件
8. ✅ **POST /api/google-calendar/events/find** - 查找事件
9. ✅ **POST /api/google-calendar/events/:eventId/update** - 更新事件
10. ✅ **POST /api/google-calendar/events/:eventId/delete** - 删除事件
11. ⏭️ **POST /api/google-calendar/trips/:tripId/sync** - 同步行程到日历（需要真实 tripId）
12. ⏭️ **POST /api/google-calendar/trips/:tripId/delete-events** - 删除行程事件（需要真实 tripId）

## OAuth 授权

如果测试失败并提示 OAuth 未授权，需要先完成授权：

1. **检查授权状态**：
   ```bash
   ls -la ~/.tripnara-mcp/googlecalendar-tokens.json
   ```

2. **完成授权**（如果需要）：
   - 首次调用 API 时，如果未授权会返回错误
   - 根据错误信息中的授权 URL 完成 OAuth 流程
   - 授权完成后，token 会自动保存

## 测试结果说明

- ✅ **成功**: API 调用成功
- ⚠️ **警告**: API 调用失败，可能是 OAuth 未授权
- ❌ **错误**: API 调用失败，可能是服务器未启动或配置错误

## 手动测试

你也可以使用 curl 或 Postman 手动测试：

```bash
# 列出工具
curl http://localhost:3000/api/google-calendar/tools

# 列出日历
curl http://localhost:3000/api/google-calendar/calendars

# 创建事件
curl -X POST http://localhost:3000/api/google-calendar/events \
  -H "Content-Type: application/json" \
  -d '{
    "calendarId": "primary",
    "summary": "测试事件",
    "start": {
      "dateTime": "2026-02-07T10:00:00Z",
      "timeZone": "UTC"
    },
    "end": {
      "dateTime": "2026-02-07T11:00:00Z",
      "timeZone": "UTC"
    }
  }'
```

## Swagger UI

启动服务器后，访问 Swagger UI 查看交互式 API 文档：

```
http://localhost:3000/api-docs
```

在 Swagger UI 中可以：
- 查看所有 API 端点
- 查看请求/响应格式
- 直接测试 API（需要先完成 OAuth 授权）

## 故障排除

### 问题：连接被拒绝 (ECONNREFUSED)

**解决方案**: 确保 API 服务器已启动
```bash
npm run dev
```

### 问题：OAuth 未授权错误

**解决方案**: 完成 Google Calendar OAuth 授权流程
- 首次调用 API 时会返回授权 URL
- 访问 URL 完成授权
- Token 会自动保存到 `~/.tripnara-mcp/googlecalendar-tokens.json`

### 问题：某些测试失败

**可能原因**:
1. OAuth 未授权（最常见）
2. Google Calendar API 配额限制
3. 网络连接问题

**解决方案**: 查看错误信息，根据提示解决

## 相关文档

- [Google Calendar 前端 API 文档](../src/mcp/GOOGLE_CALENDAR_FRONTEND_API.md)
- [Google Calendar 产品策略](../src/mcp/GOOGLE_CALENDAR_PRODUCT_STRATEGY.md)
