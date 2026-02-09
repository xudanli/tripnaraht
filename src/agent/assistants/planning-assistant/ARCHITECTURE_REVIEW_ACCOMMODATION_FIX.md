# 架构审查报告：住宿搜索功能修复

**审查日期**: 2026-02-09  
**审查角色**: 架构师、智能体工程师  
**问题优先级**: P0（阻塞功能）

---

## 🔍 问题分析

### 问题1: `accommodation` 路由目标无法映射到服务名称

**现象**:
```
[工具选择] 路由目标 accommodation 映射到服务: null
[工具选择] ⚠️ 路由目标 accommodation 无法映射到服务名称
```

**根本原因**:
- `SmartRouterService.mapTargetToServiceName()` 方法中缺少 `accommodation` 的映射
- 导致工具选择失败，无法使用 MCP 工具分发器

**影响**:
- 用户点击"推荐住宿"按钮时，无法使用工具分发器
- 回退到业务接口处理，但业务接口处理逻辑不完整

### 问题2: `accommodation` 处理逻辑缺少 `countryCode` 支持

**现象**:
```
住宿搜索失败: 无法确定搜索位置
```

**根本原因**:
- `PlanningAssistantV2Service` 中 `case 'accommodation'` 的处理逻辑只使用了 `destination` 进行地理编码
- 没有使用 `countryCode` 进行地理编码（与 `hotel` 处理逻辑不一致）
- 没有预定义坐标降级方案

**影响**:
- 规划工作台场景下（有 `tripId` 和 `countryCode`），无法正确获取位置坐标
- 导致住宿搜索失败

---

## ✅ 修复方案

### 修复1: 添加 `accommodation` 服务映射

**文件**: `src/agent/assistants/planning-assistant/services/smart-router.service.ts`

**修改**:
```typescript
private mapTargetToServiceName(target: RoutingTarget): string | null {
  const mapping: Record<string, string> = {
    // ... 其他映射
    'accommodation': 'hotel', // 住宿搜索映射到 hotel 服务（业务层会同时搜索酒店和 Airbnb）
    // ...
  };
  
  return mapping[target] || null;
}
```

**说明**:
- `accommodation` 映射到 `hotel` 服务
- 业务层会同时搜索酒店和 Airbnb，工具层使用 `hotel` 服务的工具

### 修复2: 增强 `accommodation` 处理逻辑

**文件**: `src/agent/assistants/planning-assistant/services/planning-assistant-v2.service.ts`

**修改内容**:

1. **添加规划工作台场景验证**:
   ```typescript
   const isPlanningWorkbench = !!(dto.context?.tripId || dto.context?.countryCode);
   if (isPlanningWorkbench) {
     if (!dto.context.tripId) {
       throw new BadRequestException('规划工作台场景下，tripId 是必需参数');
     }
     if (!dto.context.countryCode) {
       throw new BadRequestException('规划工作台场景下，countryCode 是必需参数');
     }
   }
   ```

2. **多级位置解析策略**:
   - **策略1**: 如果直接提供了 `location` 参数
   - **策略2**: 如果没有 `location`，但有 `countryCode`，使用国家代码进行地理编码
     - 先尝试 Google Maps 地理编码
     - 如果失败，使用预定义的国家中心坐标（降级方案）
   - **策略3**: 如果没有 `location`，但有 `destination`，使用目的地进行地理编码

3. **预定义国家中心坐标**:
   - 添加了 20+ 个常见国家的中心坐标映射
   - 当 Google Maps API 超时或失败时，使用预定义坐标作为降级方案

---

## 📊 修复前后对比

### 修复前

| 场景 | 行为 | 结果 |
|------|------|------|
| 推荐住宿 + countryCode | 工具选择失败 → 业务接口处理 → 地理编码失败 | ❌ 失败 |
| 推荐住宿 + destination | 工具选择失败 → 业务接口处理 → 地理编码成功 | ✅ 成功（如果 destination 可解析） |

### 修复后

| 场景 | 行为 | 结果 |
|------|------|------|
| 推荐住宿 + countryCode | 工具选择成功 → 使用 hotel 工具 → 多级位置解析 → 预定义坐标降级 | ✅ 成功 |
| 推荐住宿 + destination | 工具选择成功 → 使用 hotel 工具 → 地理编码 | ✅ 成功 |
| 推荐住宿 + location | 工具选择成功 → 直接使用 location | ✅ 成功 |

---

## 🎯 架构改进

### 1. 统一的位置解析策略

现在 `hotel` 和 `accommodation` 都使用相同的多级位置解析策略：
1. 直接提供的 `location` 参数
2. `countryCode` → 地理编码 → 预定义坐标降级
3. `destination` → 地理编码

### 2. 工具分发器集成

- `accommodation` 现在可以正确映射到 `hotel` 服务
- 可以使用 MCP 工具分发器进行工具调用
- 与 `hotel` 路由目标保持一致的行为

### 3. 降级方案

- 添加了预定义国家中心坐标作为降级方案
- 即使 Google Maps API 超时，也能正常工作
- 提高了系统的可用性和稳定性

---

## 🔧 技术细节

### 预定义坐标选择原则

1. **小国**（如冰岛、新加坡）：使用国家中心坐标
2. **大国**（如中国、美国）：使用主要城市坐标（如首都或主要旅游城市）
3. **旅游热门国家**：优先选择主要旅游城市坐标

### 坐标精度

- 预定义坐标精度：约 ±50km（适合酒店搜索范围）
- 对于小国（如冰岛），使用国家中心坐标即可
- 对于大国，使用主要城市坐标，搜索半径设置为 10km-50km

---

## 📝 测试建议

### 测试用例1: 规划工作台场景 + countryCode

```bash
POST /api/agent/planning-assistant/v2/chat
{
  "sessionId": "xxx",
  "message": "推荐住宿",
  "context": {
    "tripId": "trip_123",
    "countryCode": "IS"
  }
}
```

**预期结果**:
- ✅ 路由到 `accommodation` 目标
- ✅ 工具选择成功（使用 `hotel.search`）
- ✅ 使用 `countryCode=IS` 获取坐标（预定义坐标或地理编码）
- ✅ 返回酒店和 Airbnb 搜索结果

### 测试用例2: 普通场景 + destination

```bash
POST /api/agent/planning-assistant/v2/chat
{
  "sessionId": "xxx",
  "message": "推荐冰岛的住宿"
}
```

**预期结果**:
- ✅ 路由到 `accommodation` 目标
- ✅ 从消息中提取 `destination=冰岛`
- ✅ 地理编码获取坐标
- ✅ 返回酒店和 Airbnb 搜索结果

### 测试用例3: Google Maps API 超时场景

**模拟场景**: Google Maps API 超时

**预期结果**:
- ✅ 自动降级到预定义坐标
- ✅ 使用预定义坐标进行搜索
- ✅ 返回搜索结果（即使 API 超时）

---

## 🚀 后续优化建议

### P1: 工具选择优化

- 对于 `accommodation` 目标，可以考虑同时选择 `hotel.search` 和 `airbnb.search` 工具
- 或者创建组合工具 `accommodation.search`，内部调用两个服务

### P2: 位置解析优化

- 考虑使用 `AdvancedGeocodingService` 进行更智能的位置解析
- 支持相对位置（如"冰岛首都"、"东京市中心"）

### P3: 缓存优化

- 缓存 `countryCode` → 坐标的映射结果
- 减少重复的地理编码调用

---

## ✅ 修复完成

- ✅ 添加 `accommodation` 服务映射
- ✅ 增强 `accommodation` 处理逻辑
- ✅ 添加 `countryCode` 支持
- ✅ 添加预定义坐标降级方案
- ✅ 统一位置解析策略
- ✅ 代码通过 linter 检查

**状态**: ✅ **已修复，可以测试**
