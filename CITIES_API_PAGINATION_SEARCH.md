# 城市API - 搜索和分页功能增强

## 功能概述

已为城市API添加完整的搜索和滚动加载（分页）支持，满足前端需求。

## 新增功能

### 1. 支持更大的limit（最多1000条）

- **默认limit**: 50
- **最大limit**: 1000（自动限制，防止性能问题）
- **使用示例**: `/api/cities?countryCode=CN&limit=200`

### 2. 完整的搜索功能

- **支持字段**: 中文名（nameCN）、英文名（nameEN）、通用名称（name）
- **搜索方式**: 不区分大小写的部分匹配（contains）
- **支持组合**: 可以同时使用 `countryCode` 和 `q` 参数
- **使用示例**: 
  - `/api/cities?countryCode=JP&q=Tokyo`
  - `/api/cities?q=北京`

### 3. 完整的分页信息

API响应现在包含完整的分页信息：

```json
{
  "success": true,
  "data": {
    "cities": [...],
    "total": 393,
    "hasMore": true,
    "limit": 100,
    "offset": 0,
    "countryCode": "CN"
  }
}
```

**字段说明**:
- `cities`: 城市列表
- `total`: 符合条件的总城市数
- `hasMore`: 是否还有更多数据（用于判断是否继续加载）
- `limit`: 本次请求的limit值
- `offset`: 本次请求的offset值
- `countryCode`: 如果提供了国家代码，会返回规范化后的值

## API使用示例

### 1. 基础查询（带分页）

```bash
# 获取前100个中国城市
GET /api/cities?countryCode=CN&limit=100&offset=0

# 获取第2页（50个城市）
GET /api/cities?countryCode=CN&limit=50&offset=50
```

### 2. 搜索功能

```bash
# 在中国城市中搜索"Tokyo"
GET /api/cities?countryCode=JP&q=Tokyo

# 在所有城市中搜索"北京"
GET /api/cities?q=北京

# 搜索并分页
GET /api/cities?countryCode=CN&q=上&limit=20&offset=0
```

### 3. 滚动加载实现

前端可以使用 `hasMore` 字段判断是否还有更多数据：

```typescript
// 前端示例代码
const loadCities = async (countryCode: string, offset = 0, limit = 50) => {
  const response = await fetch(
    `/api/cities?countryCode=${countryCode}&limit=${limit}&offset=${offset}`
  );
  const result = await response.json();
  
  if (result.success) {
    const { cities, total, hasMore } = result.data;
    
    // 追加到现有列表
    setCities(prev => [...prev, ...cities]);
    
    // 如果还有更多，可以继续加载
    if (hasMore) {
      // 触发下一次加载
      loadMoreCities(countryCode, offset + limit, limit);
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
    "cities": [
      {
        "id": 5773,
        "name": "Aksu",
        "countryCode": "CN",
        "nameCN": "阿克苏",
        "nameEN": "Aksu",
        "lat": 41.1688,
        "lng": 80.2604
      }
    ],
    "total": 393,
    "hasMore": true,
    "limit": 100,
    "offset": 0,
    "countryCode": "CN"
  }
}
```

### 搜索响应

```json
{
  "success": true,
  "data": {
    "cities": [
      {
        "id": 1,
        "name": "Tokyo",
        "countryCode": "JP",
        "nameCN": "东京",
        "nameEN": "Tokyo"
      }
    ],
    "total": 1,
    "hasMore": false,
    "limit": 10,
    "offset": 0,
    "countryCode": "JP"
  }
}
```

## 测试结果

### ✅ 分页功能测试

```bash
# 测试1: 获取100个城市
GET /api/cities?countryCode=CN&limit=100&offset=0
结果: ✅ 返回100个城市，total=393, hasMore=true

# 测试2: 分页offset=50
GET /api/cities?countryCode=CN&limit=50&offset=50
结果: ✅ 返回50个城市，total=393, hasMore=true
```

### ✅ 搜索功能测试

```bash
# 测试1: 搜索Tokyo
GET /api/cities?countryCode=JP&q=Tokyo
结果: ✅ 返回1个城市（东京）

# 测试2: 部分匹配搜索
GET /api/cities?countryCode=CN&q=上
结果: ✅ 返回包含"上"的城市列表
```

### ✅ Limit限制测试

```bash
# 测试: 超过最大limit
GET /api/cities?countryCode=CN&limit=2000
结果: ✅ 自动限制为1000，并记录警告日志
```

## 技术实现

### 1. Service层修改

- 修改 `findAll` 方法返回类型，包含 `cities`, `total`, `hasMore`, `limit`, `offset`
- 使用 Prisma 的 `contains` 和 `mode: 'insensitive'` 实现不区分大小写搜索
- 添加 limit 最大值限制（1000）

### 2. Controller层修改

- 简化响应格式，直接返回 Service 返回的所有分页信息
- 移除冗余的日志和计算

### 3. DTO修改

- 更新 `GetCitiesQueryDto` 的文档说明，明确最大limit为1000

## 性能考虑

1. **Limit限制**: 最大1000条，防止单次查询返回过多数据
2. **索引优化**: 建议在 `countryCode`, `name`, `nameCN`, `nameEN` 字段上创建索引
3. **分页建议**: 前端应该使用合理的limit值（如50-100），避免一次性加载过多数据

## 前端集成建议

### React示例

```typescript
import { useState, useEffect, useCallback } from 'react';

interface City {
  id: number;
  name: string;
  countryCode: string;
  nameCN?: string;
  nameEN?: string;
}

const useCities = (countryCode?: string, searchQuery?: string) => {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const loadCities = useCallback(async (offset = 0, limit = 50) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (countryCode) params.append('countryCode', countryCode);
      if (searchQuery) params.append('q', searchQuery);
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await fetch(`/api/cities?${params}`);
      const result = await response.json();

      if (result.success) {
        const { cities: newCities, total: newTotal, hasMore: newHasMore } = result.data;
        
        if (offset === 0) {
          // 首次加载或搜索，替换列表
          setCities(newCities);
        } else {
          // 滚动加载，追加到列表
          setCities(prev => [...prev, ...newCities]);
        }
        
        setTotal(newTotal);
        setHasMore(newHasMore);
      }
    } catch (error) {
      console.error('加载城市失败:', error);
    } finally {
      setLoading(false);
    }
  }, [countryCode, searchQuery]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadCities(cities.length, 50);
    }
  }, [loading, hasMore, cities.length, loadCities]);

  useEffect(() => {
    loadCities(0, 50);
  }, [countryCode, searchQuery]);

  return { cities, loading, hasMore, total, loadMore };
};
```

### Vue示例

```vue
<template>
  <div>
    <input 
      v-model="searchQuery" 
      placeholder="搜索城市..."
      @input="handleSearch"
    />
    <div v-for="city in cities" :key="city.id">
      {{ city.nameCN || city.name }}
    </div>
    <button 
      v-if="hasMore && !loading" 
      @click="loadMore"
    >
      加载更多
    </button>
    <div v-if="loading">加载中...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  countryCode?: string;
}>();

const cities = ref([]);
const loading = ref(false);
const hasMore = ref(false);
const total = ref(0);
const searchQuery = ref('');

const loadCities = async (offset = 0, limit = 50) => {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (props.countryCode) params.append('countryCode', props.countryCode);
    if (searchQuery.value) params.append('q', searchQuery.value);
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());

    const response = await fetch(`/api/cities?${params}`);
    const result = await response.json();

    if (result.success) {
      const { cities: newCities, total: newTotal, hasMore: newHasMore } = result.data;
      
      if (offset === 0) {
        cities.value = newCities;
      } else {
        cities.value.push(...newCities);
      }
      
      total.value = newTotal;
      hasMore.value = newHasMore;
    }
  } catch (error) {
    console.error('加载城市失败:', error);
  } finally {
    loading.value = false;
  }
};

const loadMore = () => {
  if (!loading.value && hasMore.value) {
    loadCities(cities.value.length, 50);
  }
};

const handleSearch = () => {
  loadCities(0, 50);
};

watch(() => props.countryCode, () => {
  loadCities(0, 50);
});

loadCities(0, 50);
</script>
```

## 修改的文件

- `src/cities/cities.service.ts` - 修改Service返回分页信息，优化搜索实现
- `src/cities/cities.controller.ts` - 简化Controller响应格式
- `src/cities/dto/city.dto.ts` - 更新DTO文档说明

## 注意事项

1. **搜索性能**: 如果城市数据量很大，建议在相关字段上创建数据库索引
2. **Limit限制**: 超过1000的limit会自动调整为1000，并记录警告日志
3. **搜索匹配**: 使用部分匹配（contains），支持模糊搜索
4. **分页建议**: 建议使用50-100的limit值，平衡性能和用户体验
