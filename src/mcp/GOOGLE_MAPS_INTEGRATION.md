# Google Maps MCP 服务集成指南

## 📋 概述

本文档说明如何将 [Smithery 提供的 Google Maps MCP 服务](https://smithery.ai/server/google_maps) 集成到项目中。

### 服务信息

- **服务名称**: Google Maps MCP Server
- **服务 URL**: `https://server.smithery.ai/google_maps`
- **服务类型**: 远程 HTTP/SSE MCP 服务器
- **功能**: 提供地图、地理编码、路线规划等功能
- **认证方式**: OAuth 2.0（现代 API）或 API Key（已废弃的 API）

---

## 🔧 集成方式

### 方式 1: 在 Cursor 中使用（推荐）⭐

Google Maps 工具已经集成到 MCP Skills Server 中，重启 Cursor 后即可使用：

1. **获取路线**:
   ```
   从纽约到波士顿的驾车路线
   ```

2. **计算路线矩阵**:
   ```
   计算从纽约到波士顿和费城的距离和时间
   ```

### 方式 2: 在 Claude Desktop 中使用

#### 配置 Claude Desktop

在 Claude Desktop 配置文件中添加（根据您的操作系统）：

**macOS**:
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows**:
```bash
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux**:
```bash
~/.config/Claude/claude_desktop_config.json
```

配置内容：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": ["tsx", "src/mcp/mcp-skills-server.ts"],
      "cwd": "/home/devbox/project"
    },
    "google-maps": {
      "command": "npx",
      "args": ["tsx", "src/mcp/google-maps-bridge-server.ts"],
      "cwd": "/home/devbox/project"
    }
  }
}
```

---

### 方式 3: 创建桥接 MCP 服务器（用于项目集成）⭐

桥接服务器已创建在 `src/mcp/google-maps-bridge-server.ts`，可以直接使用。

#### 启动桥接服务器

```bash
npm run mcp:google-maps
```

---

### 方式 4: 在代码中集成（程序化使用）

如果需要在项目代码中直接使用 Google Maps 功能，可以使用 MCP SDK 的 HTTP 客户端。

#### 创建客户端连接

```typescript
// src/mcp/google-maps-client.ts
import { getGoogleMapsClient } from './google-maps-client';

const client = getGoogleMapsClient();
await client.connect();

// 获取路线
const route = await client.getRoute({
  origin_address: 'New York, NY',
  destination_address: 'Boston, MA',
  travelMode: 'DRIVE',
  units: 'METRIC',
});

// 计算路线矩阵
const matrix = await client.computeRouteMatrix({
  origins: ['New York, NY'],
  destinations: ['Boston, MA', 'Philadelphia, PA'],
  travelMode: 'DRIVE',
  units: 'METRIC',
});

await client.disconnect();
```

---

## 🛠️ 可用工具列表

Google Maps MCP 服务器提供以下工具：

### 现代 API（支持 OAuth2）⭐

#### GOOGLE_MAPS_GET_ROUTE

计算两个地点之间的路线。

**参数**:
- `origin_address` (必需): 起点地址或地点名称
- `destination_address` (必需): 终点地址或地点名称
- `travelMode` (可选): 交通方式 - `DRIVE`, `WALK`, `BICYCLE`, `TRANSIT`
- `units` (可选): 单位系统 - `METRIC`（公里）或 `IMPERIAL`（英里）
- `languageCode` (可选): 语言代码，例如 `en-US`, `zh-CN`
- `routingPreference` (可选): 路线偏好
  - `TRAFFIC_UNAWARE` - 忽略交通（最快）
  - `TRAFFIC_AWARE` - 考虑交通（优化）
  - `TRAFFIC_AWARE_OPTIMAL` - 最准确的交通路线
- `computeAlternativeRoutes` (可选): 是否计算替代路线
- `routeModifiers_avoidTolls` (可选): 是否避开收费道路
- `routeModifiers_avoidFerries` (可选): 是否避开渡轮
- `routeModifiers_avoidHighways` (可选): 是否避开高速公路
- `fieldMask` (可选): 要返回的字段，用逗号分隔

**返回**:
- 路线信息，包括距离、时间、导航指令等

#### GOOGLE_MAPS_COMPUTE_ROUTE_MATRIX

计算多个起点和终点之间的路线矩阵（距离和时间）。

**参数**:
- `origins` (必需): 起点列表，每个可以是地址或经纬度坐标
- `destinations` (必需): 终点列表，每个可以是地址或经纬度坐标
- `travelMode` (可选): 交通方式
- `units` (可选): 单位系统
- `languageCode` (可选): 语言代码
- `routingPreference` (可选): 路线偏好
- `fieldMask` (可选): 要返回的字段

**返回**:
- 路线矩阵，包含每个起点到每个终点的距离和时间

### 已废弃的 API（仅支持 API Key）⚠️

以下 API 已废弃，建议使用现代 API：

- `GOOGLE_MAPS_GEOCODING_API` - 地理编码（已废弃）
- `GOOGLE_MAPS_GET_DIRECTION` - 获取方向（已废弃）
- `GOOGLE_MAPS_DISTANCE_MATRIX_API` - 距离矩阵（已废弃）

---

## 💡 使用场景

### 场景 1: 路线规划

在生成行程时，计算地点间的路线：

```typescript
async function calculateRoute(origin: string, destination: string) {
  const client = getGoogleMapsClient();
  await client.connect();
  
  const route = await client.getRoute({
    origin_address: origin,
    destination_address: destination,
    travelMode: 'DRIVE',
    units: 'METRIC',
    routingPreference: 'TRAFFIC_AWARE',
  });
  
  await client.disconnect();
  return route;
}
```

### 场景 2: 批量计算距离

计算多个地点间的距离矩阵：

```typescript
async function calculateDistanceMatrix(origins: string[], destinations: string[]) {
  const client = getGoogleMapsClient();
  await client.connect();
  
  const matrix = await client.computeRouteMatrix({
    origins,
    destinations,
    travelMode: 'DRIVE',
    units: 'METRIC',
  });
  
  await client.disconnect();
  return matrix;
}
```

### 场景 3: 多交通方式比较

比较不同交通方式的路线：

```typescript
async function compareTransportModes(origin: string, destination: string) {
  const client = getGoogleMapsClient();
  await client.connect();
  
  const modes = ['DRIVE', 'WALK', 'BICYCLE', 'TRANSIT'];
  const results = [];
  
  for (const mode of modes) {
    const route = await client.getRoute({
      origin_address: origin,
      destination_address: destination,
      travelMode: mode,
      units: 'METRIC',
    });
    results.push({ mode, route });
  }
  
  await client.disconnect();
  return results;
}
```

---

## 🧪 测试连接

### 测试方法 1: 完成 OAuth 认证（首次使用）

首次使用需要完成 OAuth 认证：

```bash
npm run mcp:auth:google-maps
```

这会：
1. 显示认证 URL
2. 引导您完成 OAuth 流程
3. 保存认证信息供后续使用

### 测试方法 2: 使用测试脚本

完成认证后，运行测试脚本验证集成：

```bash
npm run mcp:test:google-maps
```

### 测试方法 2: 在 Cursor 中测试

1. 重启 Cursor
2. 在对话中询问："从纽约到波士顿的驾车路线"
3. 如果成功返回路线信息，说明连接正常

---

## 🔐 认证说明

Google Maps MCP 服务使用 OAuth 2.0 认证。

### OAuth 2.0 认证流程

现代 API（`GOOGLE_MAPS_GET_ROUTE`, `GOOGLE_MAPS_COMPUTE_ROUTE_MATRIX`）支持 OAuth 2.0：

1. **首次使用**: 需要完成一次性的 OAuth 认证流程
   - 运行 `npm run mcp:auth:google-maps`
   - 在浏览器中完成 Google 授权
   - 认证信息会自动保存

2. **后续使用**: 认证信息会被保存，无需重复认证

3. **权限范围**: 需要访问 Google Maps API 的权限

### 详细认证步骤

请参考 [Google Maps 认证指南](./GOOGLE_MAPS_AUTH_GUIDE.md) 了解详细的认证步骤和常见问题。

### API Key（已废弃）⚠️

已废弃的 API 仅支持 API Key：

- 需要在请求中提供 `key` 参数
- 不推荐使用，建议迁移到现代 API

---

## ⚠️ 注意事项

1. **API 限制**: Google Maps API 有配额限制，请注意使用频率
2. **成本**: 使用 Google Maps API 可能产生费用
3. **认证**: 首次使用需要完成 OAuth 认证流程
4. **网络连接**: 远程服务器需要稳定的网络连接
5. **错误处理**: 建议添加重试机制和错误处理
6. **会话过期**: 如果遇到 "Session not found or expired" 错误，运行 `npm run mcp:auth:google-maps -- --clear` 重新认证

## 🐛 故障排除

如果遇到问题，请参考：
- [Google Maps 认证指南](./GOOGLE_MAPS_AUTH_GUIDE.md) - 详细的认证步骤
- [Google Maps 故障排除](./GOOGLE_MAPS_TROUBLESHOOTING.md) - 常见错误及解决方案

---

## 📚 相关资源

- [Smithery Google Maps MCP 服务页面](https://smithery.ai/server/google_maps)
- [Google Maps Platform 文档](https://developers.google.com/maps)
- [MCP SDK 文档](https://modelcontextprotocol.io/)

---

## 🔄 更新日志

- **2026-02-06**: 初始版本，添加 Google Maps MCP 集成指南
