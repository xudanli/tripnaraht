# Google Maps MCP 替代解决方案

## 🔄 当前问题

如果遇到持续的 OAuth 认证问题（"Internal server error" 或 "Session not found"），可以考虑以下替代方案：

---

## 方案 1: 使用已废弃的 API（临时方案）⚠️

Google Maps MCP 服务提供了一些已废弃但可用的 API，这些 API 使用 API Key 而不是 OAuth：

### 可用的 API Key 方式 API

1. **GOOGLE_MAPS_DISTANCE_MATRIX_API** - 距离矩阵
2. **GOOGLE_MAPS_GEOCODING_API** - 地理编码
3. **GOOGLE_MAPS_GET_DIRECTION** - 获取方向

### 使用步骤

1. **获取 Google Maps API Key**:
   - 访问 [Google Cloud Console](https://console.cloud.google.com/)
   - 创建项目或选择现有项目
   - 启用 Google Maps Platform APIs
   - 创建 API Key

2. **在代码中使用**:
   ```typescript
   const client = getGoogleMapsClient();
   await client.connect();
   
   // 使用 API Key 方式（已废弃但可用）
   const result = await client.distanceMatrix({
     origins: 'New York, NY',
     destinations: 'Boston, MA',
     key: 'YOUR_API_KEY', // 需要提供 API Key
     mode: 'driving',
     units: 'metric',
   });
   ```

**注意**: 
- ⚠️ 这些 API 已废弃，不推荐长期使用
- ⚠️ 需要您自己的 Google Maps API Key（可能产生费用）
- ✅ 但可以作为临时解决方案

---

## 方案 2: 直接使用 Google Maps API（推荐长期方案）⭐

如果 Smithery 的 OAuth 认证持续有问题，可以考虑直接集成 Google Maps API：

### 优势

- ✅ 完全控制认证流程
- ✅ 不依赖第三方服务
- ✅ 可以使用最新的 Google Maps API
- ✅ 更好的错误处理和调试

### 实现步骤

1. **安装 Google Maps SDK**:
   ```bash
   npm install @googlemaps/google-maps-services-js
   ```

2. **创建服务**:
   ```typescript
   // src/mcp/google-maps-direct.service.ts
   import { Client } from '@googlemaps/google-maps-services-js';
   
   export class GoogleMapsDirectService {
     private client: Client;
     
     constructor(apiKey: string) {
       this.client = new Client({});
       this.apiKey = apiKey;
     }
     
     async getRoute(origin: string, destination: string) {
       const response = await this.client.directions({
         params: {
           origin,
           destination,
           key: this.apiKey,
         },
       });
       return response.data;
     }
   }
   ```

3. **集成到 MCP Skills Server**:
   - 将服务注册为 MCP 工具
   - 使用环境变量存储 API Key

---

## 方案 3: 等待 Smithery 服务恢复

如果这是临时问题：

1. **监控服务状态**:
   - 检查 Smithery 是否有状态页面
   - 查看 Smithery Discord/社区是否有公告

2. **定期重试**:
   ```bash
   # 每小时重试一次
   while true; do
     npm run mcp:auth:google-maps -- --clear
     sleep 3600
   done
   ```

3. **联系 Smithery 支持**:
   - 如果问题持续超过 24 小时
   - 提供详细的错误信息和时间戳

---

## 方案 4: 使用其他地图服务（临时替代）

如果需要立即使用地图功能，可以考虑：

### OpenStreetMap / Nominatim

- ✅ 免费
- ✅ 无需 API Key
- ⚠️ 功能有限
- ⚠️ 没有实时交通信息

### Mapbox

- ✅ 功能强大
- ✅ 有免费额度
- ⚠️ 需要 API Key
- ⚠️ 超出免费额度后收费

---

## 推荐方案

### 短期（立即需要）

1. **尝试使用已废弃的 API Key 方式**（如果 Smithery 支持）
2. **等待并定期重试 OAuth 认证**

### 中期（1-2 周内）

1. **直接集成 Google Maps API**
2. **创建自己的 MCP 服务器包装 Google Maps API**

### 长期（生产环境）

1. **使用直接 Google Maps API 集成**
2. **不依赖第三方 OAuth 服务**

---

## 实施建议

### 如果选择方案 2（直接集成）

我可以帮您：
1. 创建 Google Maps 直接集成服务
2. 集成到 MCP Skills Server
3. 添加环境变量配置
4. 更新文档

### 如果选择等待

建议：
1. 设置监控检查服务状态
2. 定期重试认证
3. 记录错误时间以便报告

---

**最后更新**: 2026-02-06
