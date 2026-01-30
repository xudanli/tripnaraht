# 冰岛信息源模块

本模块实现了冰岛官方信息源的API接口集成，为高地F路5天游线提供动态信息支持。

## 功能概述

### 1. vedur.is 天气预报服务
- 获取高地天气预报（当前天气 + 6天预报）
- 支持多个高地区域（中央、南部、北部）
- 包含温度、风速、降水、能见度等详细信息

### 2. safetravel.is 安全信息服务
- 获取安全警报（天气、路况、旅行等）
- 获取旅行条件状态（绿色/黄色/橙色/红色）
- 支持按区域和类型过滤

### 3. road.is 路况信息服务
- 获取F路开放状态和路况
- 支持多F路查询
- 包含路况描述和预计开放时间

## 文件结构

```
src/iceland-info/
├── dto/
│   ├── vedur-weather.dto.ts      # vedur.is DTO
│   ├── safetravel.dto.ts          # safetravel.is DTO
│   └── road-conditions.dto.ts    # road.is DTO
├── services/
│   ├── vedur.service.ts           # vedur.is 服务实现
│   ├── safetravel.service.ts      # safetravel.is 服务实现
│   └── road.service.ts            # road.is 服务实现
├── iceland-info.controller.ts     # API控制器
├── iceland-info.module.ts         # NestJS模块
├── ICELAND_INFO_API.md            # API文档
└── README.md                      # 本文件
```

## 快速开始

### 1. 启动服务

服务已集成到主应用中，启动应用后即可使用：

```bash
npm run dev
```

### 2. 测试接口

```bash
# 获取天气预报
curl "http://localhost:3000/iceland-info/weather?region=centralhighlands"

# 获取安全信息
curl "http://localhost:3000/iceland-info/safety?region=highlands"

# 获取F路路况
curl "http://localhost:3000/iceland-info/road-conditions?fRoads=F208,F26"
```

### 3. Swagger文档

访问 `http://localhost:3000/api-docs` 查看完整的API文档。

## 实现说明

### API可用性

由于这些冰岛官方服务可能没有公开的REST API端点，当前实现采用以下策略：

1. **尝试调用API**: 首先尝试调用可能的API端点
2. **降级处理**: 如果API不可用，返回模拟数据（标记为 `mock`）
3. **日志记录**: 所有API调用失败都会记录到日志中

### 模拟数据

当官方API不可用时，服务会返回合理的模拟数据：
- **天气预报**: 基于高地区域特点生成6天预报
- **安全信息**: 包含常见的高地安全警报
- **路况信息**: 包含主要F路的路况状态

### 缓存策略

所有接口都支持缓存（使用 `HybridCacheService`）：
- 天气预报: 1小时缓存
- 安全信息: 30分钟缓存
- 路况信息: 15分钟缓存

## 与POI数据集成

这些接口与之前导入的高地F路POI数据配合使用：

```typescript
// 1. 查询F路节点POI
const fRoadPois = await placesService.findByMetadata({
  subCategory: 'F_ROAD_NODE',
});

// 2. 获取这些F路的路况
const fRoadNumbers = fRoadPois.map(poi => poi.metadata.fRoadTags).flat();
const roadConditions = await roadService.getRoadConditions({
  fRoads: fRoadNumbers.join(','),
});

// 3. 检查是否有安全警报
const safetyInfo = await safetravelService.getSafetyInfo({
  region: 'highlands',
});

// 4. 获取天气预报
const weather = await vedurService.getHighlandWeather({
  region: HighlandRegion.CENTRAL_HIGHLANDS,
});
```

## 未来改进

### 短期（P0）
- [ ] 联系官方获取API访问权限
- [ ] 实现web scraping（如果API不可用）
- [ ] 添加单元测试

### 中期（P1）
- [ ] 数据同步到本地数据库
- [ ] 历史数据存储和分析
- [ ] 推送通知（路况/天气变化）

### 长期（P2）
- [ ] 机器学习预测（基于历史数据）
- [ ] 多数据源聚合
- [ ] 实时数据流处理

## 相关文档

- [API文档](./ICELAND_INFO_API.md) - 详细的API使用说明
- [POI导入脚本](../../scripts/import-iceland-highland-froad-pois.ts) - 高地F路POI导入脚本
- [POI数据文件](../../data/iceland/highland-froad-pois.json) - POI数据JSON文件

## 贡献

如果需要改进这些接口的实现，请：

1. 查看官方API文档（如果可用）
2. 更新服务实现
3. 更新DTO定义
4. 更新API文档
5. 添加测试用例
