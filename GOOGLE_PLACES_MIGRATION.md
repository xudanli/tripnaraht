# Mapbox 到 Google Places 迁移说明

## 概述

已将 Mapbox API 替换为 Google Places API 来获取景点数据。

## 变更内容

### 1. 新增服务
- `src/places/services/google-places.service.ts` - Google Places API 服务（398 行）

### 2. 更新的文件
- `src/places/places.service.ts` - 使用 GooglePlacesService 替代 MapboxService
- `src/places/places.module.ts` - 导入 GooglePlacesService
- `src/places/places.controller.ts` - 更新 API 文档描述

### 3. 保留的服务
- `src/places/services/mapbox.service.ts` - 已不再使用（可保留作为备份）

## 配置要求

### 环境变量

需要在 `.env` 文件中添加 Google Places API Key：

```bash
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
```

或者使用：

```bash
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### 获取 Google Places API Key

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 **Places API** 和 **Places API (New)**
4. 创建 API 密钥
5. 限制 API 密钥（可选但推荐）

### 启用必要的 API

在 Google Cloud Console 中启用以下 API：
- **Places API** (旧版)
- **Places API (New)** (推荐)
- **Geocoding API** (如果需要)

## API 差异

### Mapbox vs Google Places API

| 特性 | Mapbox Geocoding API | Google Places API |
|------|---------------------|-------------------|
| 数据源 | Mapbox 数据（基于 OSM + 商业数据） | Google 数据（更丰富） |
| POI 搜索 | 较弱 | 强大，专门用于 POI |
| 查询方式 | 地理编码为主 | Text Search API |
| 分页支持 | 无 | 支持（next_page_token） |
| 数据质量 | 中等 | 高质量，包含评分、评论等 |
| 速率限制 | 免费版每月 100,000 次 | 按项目配额（通常更高） |
| 成本 | 免费额度较高 | 按请求计费 |

## 使用方式

### 接口保持不变

所有 API 接口路径和参数保持不变，只是底层实现从 Mapbox 改为 Google Places：

- `GET /places/overpass/:countryCode` - 获取指定国家的景点数据
- `POST /places/overpass/iceland/import` - 导入冰岛景点到数据库

### 兼容性

- 返回的数据结构保持兼容（使用 `OverpassPOI` 接口）
- `osmId` 字段使用 Google Place ID 的哈希值生成
- `rawTags` 字段从 Google Places 结果映射而来
- `placeId` 字段存储 Google Place ID（可用于后续详情查询）

## 功能特性

### ✅ 已实现

1. **多城市搜索**: 自动搜索国家的主要城市
2. **类型过滤**: 支持 attraction, museum, viewpoint 等类型
3. **分页支持**: 自动获取多页结果（最多 3 页）
4. **数据去重**: 基于 place_id 和坐标去重
5. **错误处理**: 完善的错误处理和日志记录

### 📋 主要城市列表

当前支持的国家和主要城市：

- **US (美国)**: New York, Los Angeles, Chicago, San Francisco, Washington, Miami, Las Vegas, Boston
- **IS (冰岛)**: Reykjavik
- **JP (日本)**: Tokyo, Osaka, Kyoto
- **GB (英国)**: London, Manchester, Edinburgh

## 注意事项

1. **API 配额**: Google Places API 按请求计费，注意控制调用频率
2. **延迟处理**: 代码中已添加延迟（200ms）避免触发限流
3. **分页延迟**: Google 要求 next_page_token 使用前需等待 2 秒
4. **错误处理**: 单个城市搜索失败不会中断整个流程

## 测试

运行测试脚本验证功能：

```bash
./test-us-mapbox.sh
```

测试接口：
- `GET /places/overpass/US?tourismTypes=attraction`
- `POST /places/overpass/iceland/import`

## 代码结构

Google Places Service 分为 4 个部分：

1. **基础结构** (1-110行): 服务类定义、构造函数、主要方法框架
2. **搜索方法** (111-220行): 城市搜索、分页、查询构建
3. **数据映射** (221-320行): POI 映射、类型提取、去重
4. **接口定义** (321-398行): GooglePlacesPOI 接口定义

## 回退方案

如果需要回退到 Mapbox：

1. 恢复 `MapboxService` 的导入
2. 在 `PlacesModule` 中替换 `GooglePlacesService` 为 `MapboxService`
3. 更新 `PlacesService` 中的服务引用

