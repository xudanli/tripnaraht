# Advanced Geocoding Service - 高级地理编码服务

## 🌍 概述

`AdvancedGeocodingService` 是一个强大的地理编码服务，从地理科学家的视角设计，提供智能位置名称解析、地标识别、相对位置理解等功能。

## ✨ 核心功能

### 1. 智能位置名称解析
- **多语言支持**: 自动识别和处理中文、英文位置名称
- **别名支持**: 支持城市别名（如"北京"、"北京市"）
- **模糊匹配**: 自动处理拼写错误和变体

### 2. 地标和POI识别
支持识别 100+ 个常见旅游地标，包括：
- **中国地标**: 天安门、故宫、长城、外滩、东方明珠、西湖等
- **日本地标**: 东京塔、浅草寺、秋叶原、大阪城、清水寺等
- **欧洲地标**: 埃菲尔铁塔、卢浮宫、大本钟、斗兽场、比萨斜塔、威尼斯、圣家堂、新天鹅堡、雅典卫城等
- **冰岛地标**: 蓝湖、黄金瀑布、间歇泉、杰古沙龙冰河湖、黑沙滩、钻石沙滩、辛格维利尔国家公园、黄金圈、1号公路等
- **亚洲地标**: 首尔塔、济州岛、大皇宫、吴哥窟、鱼尾狮、双子塔、巴厘岛等
- **北美地标**: 自由女神像、时代广场、金门大桥、尼亚加拉瀑布、大峡谷、黄石公园、CN塔等
- **澳洲/新西兰地标**: 悉尼歌剧院、大堡礁、乌鲁鲁、皇后镇、米尔福德峡湾等

### 3. 相对位置理解
- **首都识别**: 支持 40+ 个国家首都识别（"冰岛首都" → "Reykjavik"）
- **市中心识别**: "东京市中心" → "Tokyo city center"
- **相对位置**: "附近的"、"在...附近"等上下文理解
- **交通枢纽**: "机场"、"火车站"、"港口"等关键词识别

### 4. 上下文感知
- **选定目的地增强**: 如果用户已选定目的地，短位置名称会自动组合
- **语言感知**: 根据用户语言偏好返回相应格式的位置名称
- **区域偏好**: 支持区域代码（如"cn"、"is"）来优化搜索结果

### 5. 多层级地理编码
自动提取和返回：
- **坐标**: 精确的经纬度坐标
- **地址**: 完整格式地址
- **城市**: 城市名称
- **国家**: 国家名称和国家代码
- **时区**: 时区信息（未来扩展）
- **行政区划**: 省/州、市、区/县等层级信息

### 6. 智能缓存策略
- **24小时TTL**: 地理编码结果缓存24小时
- **自动清理**: 定期清理过期缓存
- **性能优化**: 减少重复API调用

### 7. 批量地理编码
支持批量处理多个位置名称，自动控制并发数以避免API限流。

### 8. 智能模糊匹配
- **编辑距离算法**: 使用 Levenshtein Distance 计算字符串相似度
- **变体生成**: 自动生成位置名称变体（移除后缀、前缀等）
- **相似度评分**: 根据相似度调整置信度，确保匹配质量

## 🎯 使用示例

### 基础使用

```typescript
const result = await advancedGeocodingService.geocode('冰岛', {
  selectedDestination: 'Iceland',
  language: 'zh',
});

// 结果:
// {
//   normalizedName: 'Iceland',
//   coordinates: { lat: 64.9631, lng: -19.0208 },
//   city: undefined,
//   country: 'Iceland',
//   countryCode: 'IS',
//   confidence: 0.95,
//   source: 'mapping',
// }
```

### 地标识别

```typescript
const result = await advancedGeocodingService.geocode('埃菲尔铁塔');

// 结果:
// {
//   normalizedName: 'Eiffel Tower',
//   coordinates: { lat: 48.8584, lng: 2.2945 },
//   city: 'Paris',
//   country: 'France',
//   confidence: 0.95,
//   source: 'mapping',
// }
```

### 相对位置

```typescript
const result = await advancedGeocodingService.geocode('冰岛首都');

// 结果:
// {
//   normalizedName: 'Reykjavik',
//   coordinates: { lat: 64.1466, lng: -21.9426 },
//   city: 'Reykjavik',
//   country: 'Iceland',
//   confidence: 0.85,
//   source: 'geocoding',
// }
```

### 上下文增强

```typescript
const result = await advancedGeocodingService.geocode('市中心', {
  selectedDestination: 'Tokyo',
});

// 结果:
// {
//   normalizedName: 'Tokyo city center',
//   coordinates: { lat: 35.6762, lng: 139.6503 },
//   city: 'Tokyo',
//   country: 'Japan',
//   confidence: 0.80,
//   source: 'geocoding',
// }
```

### 批量地理编码

```typescript
const results = await advancedGeocodingService.batchGeocode([
  '冰岛',
  '东京',
  '巴黎',
], {
  language: 'zh',
});

// 返回 Map<string, GeocodingResult>
```

## 🔧 技术架构

### 多策略解析流程

```
用户输入位置名称
    ↓
1. 地标识别 (confidence >= 0.9)
    ↓ (失败)
2. 相对位置解析 (confidence >= 0.8)
    ↓ (失败)
3. 上下文增强解析 (confidence >= 0.7)
    ↓ (失败)
4. Google Maps 地理编码 (confidence >= 0.6)
    ↓ (失败)
5. 模糊匹配 (confidence >= 0.5)
    ↓ (失败)
返回低置信度结果 (confidence = 0.3)
```

### 置信度说明

- **0.9-1.0**: 精确匹配（地标映射、已知位置）
- **0.8-0.9**: 高置信度（相对位置、上下文增强）
- **0.6-0.8**: 中等置信度（Google Maps 地理编码成功）
- **0.5-0.6**: 低置信度（模糊匹配）
- **< 0.5**: 不确定（返回原始名称）

## 📊 性能优化

1. **缓存优先**: 优先使用缓存结果，避免重复API调用
2. **批量处理**: 支持批量地理编码，自动控制并发
3. **降级策略**: 多层级降级，确保总能返回结果
4. **智能清理**: 定期清理过期缓存，减少内存占用

## 🚀 未来扩展

1. ✅ **时区信息**: 已实现基础时区映射（20+个主要城市）
2. **海拔信息**: 支持海拔高度查询
3. **天气区域**: 识别天气服务的最佳查询区域
4. **多语言地标**: 扩展更多语言的地标映射
5. **机器学习**: 使用ML模型提升模糊匹配准确度
6. **历史位置**: 支持历史位置名称查询
7. **实时时区**: 通过API实时获取时区信息（而非静态映射）
8. **地标分类**: 按类型分类地标（自然景观、历史建筑、现代地标等）

## 📝 集成说明

`AdvancedGeocodingService` 已集成到 `McpToolDispatcherService` 中，在调用天气工具时自动使用。

如果高级地理编码服务不可用，会自动降级到基础地理编码策略。

## 🎓 地理科学家视角

从地理科学家的视角，这个服务实现了：

1. **地理信息提取**: 自动提取坐标、地址、行政区划等地理信息
2. **空间关系理解**: 理解相对位置、上下文关系
3. **多尺度处理**: 从国家到城市到地标的多尺度处理
4. **数据质量保证**: 通过置信度评分和验证确保数据质量
5. **性能优化**: 通过缓存和批量处理优化性能

## 📚 相关文档

- `MCP_TOOLS_FUSION_STRATEGY.md` - MCP工具融合策略
- `mcp-tool-dispatcher.service.ts` - MCP工具分发器实现
