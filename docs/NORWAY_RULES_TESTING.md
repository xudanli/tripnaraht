# 挪威规则测试和优化指南

## 概述

本文档说明如何测试挪威规则、扩展规则以及性能优化。

## 测试用例

### 1. ReadinessService 测试

**文件**: `src/trips/readiness/services/readiness.service.spec.ts`

**测试覆盖**:
- ✅ 渡轮依赖规则触发
- ✅ 冬季山口自驾规则触发
- ✅ 极北极光活动规则触发
- ✅ 能力包集成测试

**运行测试**:
```bash
npm test -- readiness.service.spec.ts
```

### 2. CapabilityPackEvaluatorService 测试

**文件**: `src/trips/readiness/services/capability-pack-evaluator.service.spec.ts`

**测试覆盖**:
- ✅ 能力包评估逻辑
- ✅ 触发条件判断
- ✅ Readiness Pack 转换

**运行测试**:
```bash
npm test -- capability-pack-evaluator.service.spec.ts
```

## 扩展的挪威规则

### 新增规则列表

1. **极地夜/极地日规则** (`rule.no.polar.night.day`)
   - 触发: 极北地区 + 11-2 月
   - 输出: 头灯、反光装备、活动时间规划

2. **峡湾路线规则** (`rule.no.fjord.route`)
   - 触发: 海岸线 + 渡轮码头 + 自驾
   - 输出: 渡轮时刻表查询、排队时间预留

3. **极地野生动物规则** (`rule.no.arctic.wildlife`)
   - 触发: 极北地区 + 户外活动
   - 输出: 野生动物安全、防熊喷雾、避免夜间活动

4. **极地通信规则** (`rule.no.arctic.communication`)
   - 触发: 极北地区 + 道路稀疏
   - 输出: 卫星通信设备、行程告知

### 规则总数

- **原有规则**: 5 个
- **新增规则**: 4 个
- **总计**: 9 个挪威特有规则

## 性能优化

### 缓存机制

**服务**: `GeoFactsCacheService`

**特性**:
- 基于坐标和选项的缓存键
- 默认 TTL: 1 小时
- 自动清理过期缓存
- 支持缓存预热

**使用方式**:

```typescript
// 自动使用缓存（默认）
const features = await geoFactsService.getGeoFeaturesForPoint(
  69.6492, // Tromsø
  18.9553,
  { useCache: true } // 默认 true
);

// 禁用缓存
const features = await geoFactsService.getGeoFeaturesForPoint(
  69.6492,
  18.9553,
  { useCache: false }
);
```

**缓存统计**:
```typescript
const stats = cacheService.getStats();
console.log(`Cache size: ${stats.size}`);
```

**缓存预热**:
```typescript
await cacheService.warmup(
  [
    { lat: 69.6492, lng: 18.9553 }, // Tromsø
    { lat: 68.2385, lng: 14.5600 }, // Lofoten
    { lat: 71.1722, lng: 25.7844 }, // North Cape
  ],
  (lat, lng) => geoFactsService.getGeoFeaturesForPoint(lat, lng)
);
```

### 性能提升

- **首次查询**: 正常速度（需要查询数据库）
- **缓存命中**: 几乎瞬时（内存读取）
- **预期提升**: 90%+ 的查询速度提升（对于重复查询）

## 运行所有测试

```bash
# 运行所有 Readiness 模块测试
npm test -- --testPathPattern=readiness

# 运行特定测试文件
npm test -- readiness.service.spec.ts

# 监视模式
npm test -- --testPathPattern=readiness --watch

# 生成覆盖率报告
npm test -- --testPathPattern=readiness --coverage
```

## 测试最佳实践

1. **单元测试**: 测试单个服务的核心逻辑
2. **集成测试**: 测试服务之间的协作
3. **Mock 依赖**: 使用 Jest Mock 隔离外部依赖
4. **测试数据**: 使用真实的挪威坐标和场景

## 下一步

1. **E2E 测试**: 创建端到端测试验证完整流程
2. **性能测试**: 测试缓存机制的性能提升
3. **更多规则**: 根据实际需求添加更多挪威特有规则
4. **监控**: 添加缓存命中率监控

## 相关文档

- [挪威 Readiness 集成](./NORWAY_READINESS_INTEGRATION.md)
- [能力包使用指南](./CAPABILITY_PACKS_GUIDE.md)
- [POI 数据集成总结](./POI_DATA_INTEGRATION_SUMMARY.md)

