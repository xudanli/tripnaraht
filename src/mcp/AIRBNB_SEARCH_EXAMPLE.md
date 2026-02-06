# Airbnb 搜索示例 - 雷克雅未克

## 🎯 示例说明

本示例演示如何使用 Airbnb MCP 客户端搜索雷克雅未克（Reykjavik，冰岛首都）的房源。

## 🚀 快速开始

### 运行搜索脚本

```bash
npm run mcp:search:airbnb
```

或直接运行：

```bash
npx tsx scripts/test-airbnb-search-reykjavik.ts
```

## 📋 搜索结果示例

搜索成功后会显示：

```
✅ 找到 18 个房源:

1. Cozy cottage and divine nature
   🏷️  标签: Guest favorite
   📍 1 bedroom, 1 queen bed
   ⭐ 4.99 out of 5 average rating,  104 reviews
   💰 $1,815 for 5 nights
   📌 坐标: 64.1041, -21.6581
   🔗 https://www.airbnb.com/rooms/1167900959645091300

2. CityHub Reykjavík, Hub!
   🏷️  标签: Guest favorite
   📍 50 bedrooms, 1 bed
   ⭐ 4.9 out of 5 average rating,  229 reviews
   💰 $509 for 5 nights, originally $679
   ...
```

## 🔧 代码示例

### 基本搜索

```typescript
import { AirbnbMcpClientConnectAPI } from './src/mcp/airbnb-client-connect-api';

const client = new AirbnbMcpClientConnectAPI();

await client.connect();

const result = await client.callTool('airbnb_search', {
  location: 'Reykjavik, Iceland',
  adults: 2,
  children: 0,
  infants: 0,
  pets: 0,
  ignoreRobotsText: true, // 绕过 robots.txt（仅用于测试）
});

// 解析结果
const data = JSON.parse(result.content[0].text);
const listings = data.searchResults || [];
```

### 搜索参数

- `location` (必需): 搜索位置，例如 `"Reykjavik, Iceland"`
- `adults` (可选): 成人数，默认 1
- `children` (可选): 儿童数，默认 0
- `infants` (可选): 婴儿数，默认 0
- `pets` (可选): 宠物数，默认 0
- `checkin` (可选): 入住日期，格式 `YYYY-MM-DD`
- `checkout` (可选): 退房日期，格式 `YYYY-MM-DD`
- `page` (可选): 页码，默认 1
- `ignoreRobotsText` (可选): 是否忽略 robots.txt，默认 `false`（仅用于测试）

### 获取房源详情

```typescript
const detailsResult = await client.callTool('airbnb_listing_details', {
  listingId: '1573970428683000922',
  ignoreRobotsText: true,
});
```

## ⚠️ 重要提示

1. **robots.txt 限制**: 
   - Airbnb 的 robots.txt 默认会阻止某些请求
   - 测试时可以设置 `ignoreRobotsText: true`
   - 生产环境建议遵守 robots.txt 规则

2. **API Key**: 
   - 需要设置 `SMITHERY_API_KEY` 环境变量
   - 获取方式：https://smithery.ai/account/api-keys

3. **Connection ID**: 
   - 首次连接后会保存 connectionId
   - 后续连接会自动使用保存的 connectionId
   - 保存在 `~/.tripnara-mcp/airbnb-connection-id.txt`

## 📚 相关文档

- [Airbnb Connect API 指南](./AIRBNB_CONNECT_API_GUIDE.md)
- [Connect API 快速开始](./CONNECT_API_QUICKSTART.md)
- [Connect API 问题排查](./CONNECT_API_TROUBLESHOOTING.md)

---

**状态**: ✅ 已测试通过
