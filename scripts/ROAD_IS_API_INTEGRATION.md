# Road.is API 集成说明

## 概述

Road.is 是冰岛道路管理局（Icelandic Road and Coastal Administration, IRCA）的官方路况数据源，提供实时 F 路状态、道路封闭、天气警报等信息。

## 当前集成状态

### ✅ 已实现的集成

1. **IcelandRoadStatusAdapter** (`src/data-contracts/adapters/iceland-road-status.adapter.ts`)
   - 尝试调用 Road.is DATEX II API
   - 支持多种 API 端点回退
   - 包含错误处理和降级策略

2. **IcelandInfoController** (`src/iceland-info/iceland-info.controller.ts`)
   - 提供 `GET /api/iceland-info/road-conditions` 接口
   - 支持查询特定 F 路状态

3. **IcelandComprehensiveService** (`src/data-contracts/services/iceland-comprehensive.service.ts`)
   - 整合 Road.is、Vedur.is、SafeTravel.is 数据源

### ⚠️ 当前限制

1. **API 端点不确定**
   - 代码中尝试的端点可能不正确：
     - `/api/datex2/roadconditions`
     - `/api/roadconditions`
     - `/api/froads`

2. **网络连接问题**
   - 可能因为网络环境无法访问 `www.road.is`
   - 错误日志显示：`EAI_AGAIN`, `ENOTFOUND`, `ECONNREFUSED`

3. **降级策略**
   - API 失败时返回保守估计（假设道路开放）
   - 部分服务使用模拟数据

## Road.is API 信息

### DATEX II 标准

根据搜索结果，冰岛道路管理局自 2021 年 3 月起使用 **DATEX II 标准**（版本 3，基于 CEN 标准 16157）广播路况数据。

### 官方资源

- **网站**: umferdin.is（主要交通信息门户）
- **电话**: 1777（夏季 8-16，冬季 6:30-22）
- **紧急**: 112
- **路况查看器**: vegasja.vegagerdin.is

### API 端点（推测）

根据代码和 DATEX II 标准，可能的端点：

1. **DATEX II 端点**:
   ```
   https://www.road.is/api/datex2/roadconditions
   ```

2. **标准 API 端点**:
   ```
   https://www.road.is/api/roadconditions
   ```

3. **F 路专用端点**:
   ```
   https://www.road.is/api/froads
   ```

**注意**: 这些端点可能需要：
- 认证（API Key）
- 特定的请求格式（XML/JSON）
- 特定的参数格式

## 如何查询 Road.is API

### 方法 1: 通过现有 API 接口

```bash
# 查询特定 F 路状态
curl "http://localhost:3000/api/iceland-info/road-conditions?fRoads=F208,F26"

# 查询所有 F 路
curl "http://localhost:3000/api/iceland-info/road-conditions"

# 过滤状态
curl "http://localhost:3000/api/iceland-info/road-conditions?status=open"
```

### 方法 2: 通过数据合约接口

```bash
# 使用经纬度查询路况（自动选择适配器）
curl "http://localhost:3000/api/data-contracts/road-status?lat=64.5&lng=-18.5&radius=200000&includeFRoadInfo=true"
```

### 方法 3: 直接调用适配器（代码中）

```typescript
import { IcelandRoadStatusAdapter } from './adapters/iceland-road-status.adapter';

const adapter = new IcelandRoadStatusAdapter();
const status = await adapter.getRoadStatus({
  lat: 64.5,
  lng: -18.5,
  radius: 200000,
  includeFRoadInfo: true,
});
```

## 测试 Road.is API 连接

### 测试脚本

创建测试脚本验证 API 连接：

```bash
#!/bin/bash
# scripts/test-road-is-api.sh

BASE_URL="https://www.road.is"

echo "测试 Road.is API 连接..."
echo ""

# 测试 1: DATEX II 端点
echo "1. 测试 DATEX II 端点..."
curl -v "${BASE_URL}/api/datex2/roadconditions?lat=64.5&lon=-18.5&radius=50000" 2>&1 | head -20
echo ""

# 测试 2: 标准 API 端点
echo "2. 测试标准 API 端点..."
curl -v "${BASE_URL}/api/roadconditions?lat=64.5&lon=-18.5&radius=50000" 2>&1 | head -20
echo ""

# 测试 3: F 路端点
echo "3. 测试 F 路端点..."
curl -v "${BASE_URL}/api/froads?lat=64.5&lon=-18.5&radius=50000" 2>&1 | head -20
echo ""

# 测试 4: 检查网站可访问性
echo "4. 检查网站可访问性..."
curl -I "${BASE_URL}" 2>&1 | head -5
```

### 运行测试

```bash
chmod +x scripts/test-road-is-api.sh
./scripts/test-road-is-api.sh
```

## 改进建议

### 1. 验证 API 端点

- [ ] 联系冰岛道路管理局获取官方 API 文档
- [ ] 测试不同的 API 端点格式
- [ ] 检查是否需要认证

### 2. 实现 Web Scraping 降级方案

如果 API 不可用，可以考虑：

```typescript
// 从 road.is 网站抓取 F 路状态
async function scrapeFRoadStatus(fRoadNumber: string): Promise<FRoadStatus> {
  // 使用 Puppeteer 或 Cheerio 抓取
  // 解析 HTML 获取状态
}
```

### 3. 使用第三方数据源

- **Vedur.is**: 天气和路况信息
- **SafeTravel.is**: 安全警报
- **OpenStreetMap**: 道路数据

### 4. 缓存策略

```typescript
// 缓存 F 路状态（F 路状态变化不频繁）
const cacheKey = `froad_status:${fRoadNumber}`;
const cached = await cache.get(cacheKey);
if (cached && Date.now() - cached.timestamp < 3600000) { // 1小时
  return cached.data;
}
```

### 5. 错误处理和监控

```typescript
// 记录 API 失败率
if (error) {
  metrics.increment('road.is.api.failure');
  // 如果失败率过高，切换到降级方案
}
```

## 当前世界模型中的使用

在世界模型构建中，道路状态数据来源：

1. **静态数据文件**: `data/physical-reality/road-status/iceland-road-status.json`
   - ✅ 包含 23 条 F 路的基础信息
   - ⚠️ 状态为静态（`currentStatus: "closed"`）
   - ✅ 包含季节性信息（开放月份）

2. **实时 API**: Road.is API（如果可用）
   - ⚠️ 当前可能因网络或端点问题无法访问
   - ✅ 有降级策略（返回保守估计）

### 建议的改进

在世界模型构建中：

```typescript
// src/skills/world/world-build-context.skill.ts

// 1. 优先使用实时 API
try {
  const roadStatus = await icelandComprehensive.getComprehensiveRoadStatus({
    lat: icelandCenterLat,
    lng: icelandCenterLng,
    includeFRoadInfo: true,
  });
  
  // 使用实时数据
  roadStates = convertToRoadStates(roadStatus);
} catch (error) {
  // 2. 降级到静态数据文件
  this.logger.warn('Road.is API 不可用，使用静态数据');
  roadStates = loadFromStaticFile();
  
  // 3. 标记数据为静态
  missingPieces.physicalRealityIncomplete = true;
  missingPieces.roadStatusStatic = true;
}
```

## 相关文件

- `src/data-contracts/adapters/iceland-road-status.adapter.ts` - Road.is API 适配器
- `src/iceland-info/iceland-info.controller.ts` - F 路查询接口
- `src/data-contracts/services/iceland-comprehensive.service.ts` - 综合服务
- `data/physical-reality/road-status/iceland-road-status.json` - 静态数据文件

## 总结

**当前状态**: 
- ✅ 代码已实现 Road.is API 集成
- ⚠️ API 端点可能不正确或需要认证
- ✅ 有降级策略（使用静态数据）

**建议**:
1. 验证并修复 API 端点
2. 实现 Web Scraping 降级方案
3. 在世界模型构建中优先使用实时数据，失败时降级到静态数据
