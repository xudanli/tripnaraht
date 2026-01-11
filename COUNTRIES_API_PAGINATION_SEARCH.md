# 国家API - 搜索和分页功能增强

## 功能概述

已为国家API添加完整的搜索和滚动加载（分页）支持，与城市API保持一致的功能体验。

## 新增功能

### 1. 支持更大的limit（最多500条）

- **默认limit**: 100
- **最大limit**: 500（自动限制，防止性能问题）
- **使用示例**: `/api/countries?limit=200`

### 2. 完整的搜索功能

- **支持字段**: 中文名（nameCN）、英文名（nameEN）、国家代码（isoCode）
- **搜索方式**: 不区分大小写的部分匹配（contains）
- **使用示例**: 
  - `/api/countries?q=日本`
  - `/api/countries?q=JP`
  - `/api/countries?q=Japan`

### 3. 完整的分页信息

API响应现在包含完整的分页信息：

```json
{
  "success": true,
  "data": {
    "countries": [...],
    "total": 200,
    "hasMore": true,
    "limit": 100,
    "offset": 0
  }
}
```

**字段说明**:
- `countries`: 国家列表
- `total`: 符合条件的总国家数
- `hasMore`: 是否还有更多数据（用于判断是否继续加载）
- `limit`: 本次请求的limit值
- `offset`: 本次请求的offset值

## API使用示例

### 1. 基础查询（带分页）

```bash
# 获取前100个国家
GET /api/countries?limit=100&offset=0

# 获取第2页（50个国家）
GET /api/countries?limit=50&offset=50
```

### 2. 搜索功能

```bash
# 搜索"日本"
GET /api/countries?q=日本

# 按国家代码搜索
GET /api/countries?q=JP

# 按英文名搜索
GET /api/countries?q=Japan

# 搜索并分页
GET /api/countries?q=中&limit=20&offset=0
```

### 3. 滚动加载实现

前端可以使用 `hasMore` 字段判断是否还有更多数据：

```typescript
// 前端示例代码
const loadCountries = async (offset = 0, limit = 100, searchQuery?: string) => {
  const params = new URLSearchParams();
  if (searchQuery) params.append('q', searchQuery);
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());

  const response = await fetch(`/api/countries?${params}`);
  const result = await response.json();
  
  if (result.success) {
    const { countries, total, hasMore } = result.data;
    
    // 追加到现有列表
    setCountries(prev => [...prev, ...countries]);
    
    // 如果还有更多，可以继续加载
    if (hasMore) {
      loadMoreCountries(offset + limit, limit, searchQuery);
    }
  }
};
```

## 响应格式

### 成功响应

```json
{
  "success": true,
  "data": {
    "countries": [
      {
        "isoCode": "JP",
        "nameCN": "日本",
        "nameEN": "Japan",
        "currencyCode": "JPY",
        "currencyName": "日元",
        "paymentType": "CASH_HEAVY",
        "exchangeRateToCNY": 0.0483,
        "exchangeRateToUSD": 0.0067
      }
    ],
    "total": 200,
    "hasMore": true,
    "limit": 100,
    "offset": 0
  }
}
```

### 搜索响应

```json
{
  "success": true,
  "data": {
    "countries": [
      {
        "isoCode": "JP",
        "nameCN": "日本",
        "nameEN": "Japan"
      }
    ],
    "total": 1,
    "hasMore": false,
    "limit": 10,
    "offset": 0
  }
}
```

## 技术实现

### 1. DTO层

创建了 `GetCountriesQueryDto`，包含：
- `q`: 搜索关键词（可选）
- `limit`: 返回数量限制（可选，默认100，最大500）
- `offset`: 偏移量（可选，默认0）

### 2. Service层修改

- 修改 `findAll` 方法接受 `GetCountriesQueryDto` 参数
- 返回类型包含 `countries`, `total`, `hasMore`, `limit`, `offset`
- 使用 Prisma 的 `contains` 和 `mode: 'insensitive'` 实现不区分大小写搜索
- 添加 limit 最大值限制（500）

### 3. Controller层修改

- 添加 `@Public()` 装饰器，允许未认证访问
- 添加 `@ApiQuery` 装饰器，完善Swagger文档
- 返回完整的分页信息

## 与城市API的一致性

国家API现在与城市API具有相同的功能特性：

| 功能 | 城市API | 国家API |
|------|---------|---------|
| 搜索 | ✅ | ✅ |
| 分页 | ✅ | ✅ |
| 最大limit | 1000 | 500 |
| 默认limit | 50 | 100 |
| hasMore字段 | ✅ | ✅ |
| total字段 | ✅ | ✅ |

## 性能考虑

1. **Limit限制**: 最大500条，防止单次查询返回过多数据
2. **索引优化**: 建议在 `nameCN`, `nameEN`, `isoCode` 字段上创建索引
3. **分页建议**: 前端应该使用合理的limit值（如50-100），避免一次性加载过多数据

## 修改的文件

- `src/countries/dto/get-countries-query.dto.ts` - 新建：查询参数DTO
- `src/countries/countries.service.ts` - 修改：支持搜索和分页
- `src/countries/countries.controller.ts` - 修改：添加查询参数和分页响应

## 注意事项

1. **搜索性能**: 如果国家数据量很大，建议在相关字段上创建数据库索引
2. **Limit限制**: 超过500的limit会自动调整为500，并记录警告日志
3. **搜索匹配**: 使用部分匹配（contains），支持模糊搜索
4. **分页建议**: 建议使用50-100的limit值，平衡性能和用户体验
5. **公开访问**: 已添加 `@Public()` 装饰器，允许未认证用户访问国家列表
