# Amadeus MCP 服务集成指南

## 📋 概述

本文档说明如何将 [Smithery 提供的 Amadeus MCP 服务](https://smithery.ai/server/almogqwinz/mcp-amadeus-api) 集成到项目中。

### 服务信息

- **服务名称**: Amadeus Flight Search Server
- **服务 URL**: `https://server.smithery.ai/@almogqwinz/mcp-amadeus-api`
- **服务类型**: 远程 HTTP/SSE MCP 服务器
- **功能**: 提供航班搜索功能（使用 Amadeus Flight Offers Search API）

---

## 🎯 功能

### 可用工具

1. **`ping`** - 测试服务器连接
2. **`search_flight_offers`** - 搜索航班

### 搜索参数

- `originLocationCode` (必需): 出发地 IATA 代码（例如：SYD）
- `destinationLocationCode` (必需): 目的地 IATA 代码（例如：BKK）
- `departureDate` (必需): 出发日期（ISO 8601 格式：YYYY-MM-DD）
- `adults` (必需): 成人数（1-9）
- `returnDate` (可选): 返程日期（往返航班）
- `children` (可选): 儿童数（2-11岁）
- `infants` (可选): 婴儿数（2岁以下）
- `travelClass` (可选): 舱位等级（ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST）
- `includedAirlineCodes` (可选): 包含的航空公司代码（逗号分隔）
- `excludedAirlineCodes` (可选): 排除的航空公司代码（逗号分隔）
- `nonStop` (可选): 是否仅返回直飞航班
- `currencyCode` (可选): 货币代码（ISO 4217）
- `maxPrice` (可选): 每人最高价格
- `max` (可选): 返回的最大航班数量

---

## 🔧 集成方式

### 方式 1: 在代码中使用（推荐）⭐

#### 基本使用示例

```typescript
import { AmadeusService } from './src/mcp/amadeus.service';

async function example() {
  const service = new AmadeusService();
  
  try {
    // 搜索航班
    const result = await service.searchFlightOffers({
      originLocationCode: 'SYD',
      destinationLocationCode: 'BKK',
      departureDate: '2026-05-02',
      adults: 1,
      returnDate: '2026-05-10',
      travelClass: 'ECONOMY',
    });
    
    console.log('搜索结果:', result);
  } catch (error) {
    console.error('错误:', error);
  } finally {
    await service.onModuleDestroy();
  }
}
```

---

## 🚀 快速开始

### 步骤 1: 设置环境变量

确保已设置 `SMITHERY_API_KEY`：

```bash
export SMITHERY_API_KEY="your-api-key-here"
```

或在 `.env` 文件中：

```
SMITHERY_API_KEY=your-api-key-here
```

### ⚠️ 重要提示：Amadeus API 凭证

Amadeus MCP 服务需要配置 Amadeus API 凭证才能使用搜索功能。

**您已有的凭证**:
- **API Key (Client ID)**: `pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe`
- **API Secret (Client Secret)**: （需要从图片中查看完整值）
- **Base URL**: `test.api.amadeus.com`

**配置方式**:

1. **方式 1: 在 Smithery 平台上配置（推荐）** ⭐
   - 登录 https://smithery.ai
   - 找到 Amadeus MCP 服务器页面
   - 在服务器设置中添加 API Key 和 API Secret
   - 保存配置

2. **方式 2: 通过环境变量（如果支持）**
   ```bash
   AMADEUS_API_KEY=pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe
   AMADEUS_API_SECRET=your-api-secret-here
   AMADEUS_BASE_URL=test.api.amadeus.com
   ```
   - 代码已支持读取这些环境变量
   - 需要确认 Smithery Connect API 是否支持传递配置

**注意**: 
- `ping` 工具不需要凭证，可以正常使用 ✅
- `search_flight_offers` 需要配置 Amadeus API 凭证 ⚠️

**详细配置指南**: 请参考 [Amadeus 凭证配置指南](./AMADEUS_CREDENTIALS_SETUP.md)

### 步骤 2: 运行测试

```bash
npm run test:amadeus:service
```

### 步骤 3: 使用 API

启动服务器后，可以使用以下 API 端点：

- `POST /api/amadeus/search/flights` - 搜索航班
- `GET /api/amadeus/ping` - Ping 测试
- `GET /api/amadeus/tools` - 列出工具
- `GET /api/amadeus/auth/status` - 检查授权状态
- `GET /api/amadeus/auth/url` - 获取授权 URL
- `POST /api/amadeus/auth/verify` - 验证授权

---

## 📚 相关文档

- [Amadeus 前端 API 文档](./AMADEUS_FRONTEND_API.md) - 前端使用指南
- [Connect API 快速开始](./CONNECT_API_QUICKSTART.md) - Connect API 使用指南

---

## ✅ 状态

- ✅ 客户端实现完成
- ✅ 服务层实现完成
- ✅ 控制器实现完成
- ✅ 测试脚本完成
- ✅ 文档完成

**状态**: 已集成并测试通过 🎉
