# Overpass 到 Mapbox 迁移说明

## 概述

已将 Overpass API 替换为 Mapbox Geocoding API 来获取景点数据。

## 变更内容

### 1. 新增服务
- `src/places/services/mapbox.service.ts` - Mapbox API 服务

### 2. 更新的文件
- `src/places/places.service.ts` - 使用 MapboxService 替代 OverpassService
- `src/places/places.module.ts` - 导入 MapboxService
- `src/places/places.controller.ts` - 更新 API 文档描述

### 3. 移除的服务
- `src/places/services/overpass.service.ts` - 已不再使用（可保留作为备份）

## 配置要求

### 环境变量

需要在 `.env` 文件中添加 Mapbox Access Token：

```bash
MAPBOX_ACCESS_TOKEN=your_mapbox_access_token_here
```

### 获取 Mapbox Access Token

1. 访问 [Mapbox 官网](https://www.mapbox.com/)
2. 注册/登录账户
3. 进入 [Account Tokens](https://account.mapbox.com/access-tokens/)
4. 创建或复制 Access Token

## API 差异

### Overpass API vs Mapbox Geocoding API

| 特性 | Overpass API | Mapbox Geocoding API |
|------|-------------|---------------------|
| 数据源 | OpenStreetMap | Mapbox 数据（基于 OSM + 商业数据） |
| 查询方式 | Overpass QL 查询语言 | RESTful API |
| 国家查询 | 支持 ISO 3166-1 国家代码 | 需要边界框（bbox） |
| 类型过滤 | 支持 tourism 标签 | 支持 POI 类型过滤 |
| 速率限制 | 较宽松 | 有配额限制（免费版每月 100,000 次） |
| 数据质量 | OSM 原始数据 | 经过 Mapbox 处理的数据 |

## 使用方式

### 接口保持不变

所有 API 接口路径和参数保持不变，只是底层实现从 Overpass 改为 Mapbox：

- `GET /places/overpass/:countryCode` - 获取指定国家的景点数据
- `POST /places/overpass/iceland/import` - 导入冰岛景点到数据库

### 兼容性

- 返回的数据结构保持兼容（使用 `OverpassPOI` 接口）
- `osmId` 字段使用 Mapbox ID 的哈希值生成
- `rawTags` 字段从 Mapbox properties 映射而来

## 注意事项

1. **API 配额**: Mapbox 免费版每月有 100,000 次请求限制
2. **搜索策略**: 由于 Mapbox 不支持直接按国家代码搜索，实现中使用了边界框分片搜索
3. **数据延迟**: 每次搜索之间有 200ms 延迟，避免触发 API 限流
4. **错误处理**: 如果 Mapbox API 调用失败，会记录警告但不会中断整个流程

## 测试

运行测试脚本验证功能：

```bash
./test-places-api.sh
```

测试接口：
- `GET /places/overpass/IS?tourismTypes=attraction,viewpoint`
- `POST /places/overpass/iceland/import`

## 回退方案

如果需要回退到 Overpass API：

1. 恢复 `OverpassService` 的导入
2. 在 `PlacesModule` 中替换 `MapboxService` 为 `OverpassService`
3. 更新 `PlacesService` 中的服务引用

