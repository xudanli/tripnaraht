# Amadeus MCP 快速开始指南

## ✅ 已完成的工作

1. ✅ 已创建 Amadeus MCP 客户端
2. ✅ 已创建服务层和控制器
3. ✅ 已注册到应用模块
4. ✅ 已创建测试脚本
5. ✅ 已创建文档

## 🚀 快速开始（3 步）

### 步骤 1: 设置环境变量

确保已设置 `SMITHERY_API_KEY`：

```bash
export SMITHERY_API_KEY="your-api-key-here"
```

或在 `.env` 文件中：

```
SMITHERY_API_KEY=your-api-key-here
```

### 步骤 2: 运行测试

```bash
npm run test:amadeus:service
```

### 步骤 3: 使用 API

启动服务器后，可以使用以下 API 端点：

- `POST /api/amadeus/search/flights` - 搜索航班
- `GET /api/amadeus/ping` - Ping 测试
- `GET /api/amadeus/tools` - 列出工具

## 📋 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/amadeus/search/flights` | POST | 搜索航班 |
| `/api/amadeus/ping` | GET | Ping 测试 |
| `/api/amadeus/tools` | GET | 列出工具 |
| `/api/amadeus/auth/status` | GET | 检查授权状态 |
| `/api/amadeus/auth/url` | GET | 获取授权 URL |
| `/api/amadeus/auth/verify` | POST | 验证授权 |

## ⚠️ 重要提示

### Amadeus API 凭证

Amadeus MCP 服务需要配置 Amadeus API 凭证才能使用搜索功能：

1. **获取凭证**:
   - 访问 https://developers.amadeus.com/
   - 注册账户并创建应用
   - 获取 API Key 和 API Secret

2. **配置方式**:
   - 当前版本：需要在 Smithery 平台上配置
   - 或者：联系服务提供者了解如何传递凭证

3. **当前状态**:
   - ✅ `ping` 工具可以正常使用（不需要凭证）
   - ⚠️ `search_flight_offers` 需要配置 Amadeus API 凭证

## 📚 相关文档

- [Amadeus 集成指南](./AMADEUS_INTEGRATION.md) - 完整集成文档
- [Amadeus 前端 API 文档](./AMADEUS_FRONTEND_API.md) - 前端使用指南
- [Connect API 快速开始](./CONNECT_API_QUICKSTART.md) - Connect API 使用指南

---

**状态**: ✅ 已集成，需要配置 Amadeus API 凭证才能使用搜索功能
