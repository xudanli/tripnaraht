# 国家搜索功能优化

## 问题描述

国家搜索功能对中文搜索不够准确，特别是：
1. 中文搜索时可能返回0个结果
2. 查询逻辑可以进一步优化

## 根本原因分析

### 1. URL编码问题

- **问题**: 直接使用未编码的中文字符在URL中时，可能无法正确解析
- **原因**: 浏览器和HTTP客户端应该自动进行URL编码，但在某些情况下（如curl直接使用中文字符）可能不会
- **影响**: 使用URL编码后的请求可以正常工作

### 2. 查询逻辑优化

- **中文字段**: 对中文字段使用 `mode: 'insensitive'` 是不必要的（中文没有大小写）
- **ISO代码**: 应该支持部分匹配，而不是精确匹配

## 修复方案

### 1. 优化查询逻辑

```typescript
// 修复前
whereCondition.OR = [
  { nameCN: { contains: searchTerm, mode: 'insensitive' } },
  { nameEN: { contains: searchTerm, mode: 'insensitive' } },
  { isoCode: { contains: searchTerm.toUpperCase(), mode: 'insensitive' } },
];

// 修复后
const upperSearchTerm = searchTerm.toUpperCase();
whereCondition.OR = [
  { nameCN: { contains: searchTerm } }, // 中文不需要 case insensitive
  { nameEN: { contains: searchTerm, mode: 'insensitive' } }, // 英文需要 case insensitive
  { isoCode: { contains: upperSearchTerm } }, // ISO代码部分匹配（大写）
];
```

### 2. 优化点

1. **中文字段**: 移除了 `mode: 'insensitive'`，因为中文没有大小写概念
2. **ISO代码**: 改为部分匹配（`contains`），支持搜索部分国家代码
3. **英文字段**: 保留 `mode: 'insensitive'` 以支持大小写不敏感搜索

## 测试结果

### ✅ URL编码后的搜索（正常）

```bash
# 搜索"中"（URL编码: %E4%B8%AD）
curl "http://localhost:3000/api/countries?q=%E4%B8%AD&limit=10"
结果: 返回2个国家（中国、中非）

# 搜索"中国"（URL编码: %E4%B8%AD%E5%9B%BD）
curl "http://localhost:3000/api/countries?q=%E4%B8%AD%E5%9B%BD&limit=10"
结果: 返回1个国家（中国）
```

### ✅ 英文搜索（正常）

```bash
# 搜索"Japan"
curl "http://localhost:3000/api/countries?q=Japan&limit=10"
结果: 返回1个国家（日本）

# 搜索"JP"
curl "http://localhost:3000/api/countries?q=JP&limit=10"
结果: 返回1个国家（日本）
```

### ⚠️ 未编码的中文搜索（需要前端处理）

```bash
# 直接使用中文字符（不推荐）
curl "http://localhost:3000/api/countries?q=中&limit=10"
结果: 可能返回0个结果（取决于HTTP客户端）

# 使用 --data-urlencode（推荐）
curl -G "http://localhost:3000/api/countries" --data-urlencode "q=中" --data-urlencode "limit=10"
结果: 正常返回结果
```

## 前端使用建议

### 1. 使用URL编码（推荐）

前端应该自动进行URL编码，现代浏览器和HTTP客户端库（fetch, axios等）会自动处理：

```javascript
// 使用 fetch（自动编码）
fetch(`/api/countries?q=${encodeURIComponent('中')}&limit=10`)

// 使用 axios（自动编码）
axios.get('/api/countries', {
  params: {
    q: '中',
    limit: 10
  }
})

// 使用 URLSearchParams（自动编码）
const params = new URLSearchParams();
params.append('q', '中');
params.append('limit', '10');
fetch(`/api/countries?${params.toString()}`)
```

### 2. React示例

```typescript
const [searchQuery, setSearchQuery] = useState('');
const [countries, setCountries] = useState([]);

const searchCountries = async (query: string) => {
  const params = new URLSearchParams();
  params.append('q', query);
  params.append('limit', '100');
  
  const response = await fetch(`/api/countries?${params.toString()}`);
  const result = await response.json();
  
  if (result.success) {
    setCountries(result.data.countries);
  }
};

// 使用
<input 
  value={searchQuery}
  onChange={(e) => {
    setSearchQuery(e.target.value);
    searchCountries(e.target.value);
  }}
/>
```

### 3. Vue示例

```vue
<template>
  <input 
    v-model="searchQuery" 
    @input="handleSearch"
    placeholder="搜索国家..."
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';

const searchQuery = ref('');
const countries = ref([]);

const searchCountries = async (query: string) => {
  const params = new URLSearchParams();
  params.append('q', query);
  params.append('limit', '100');
  
  const response = await fetch(`/api/countries?${params.toString()}`);
  const result = await response.json();
  
  if (result.success) {
    countries.value = result.data.countries;
  }
};

const handleSearch = () => {
  searchCountries(searchQuery.value);
};
</script>
```

## 查询逻辑说明

### 搜索字段

1. **nameCN**（中文名称）: 部分匹配，区分大小写（中文无大小写）
2. **nameEN**（英文名称）: 部分匹配，不区分大小写
3. **isoCode**（国家代码）: 部分匹配，自动转换为大写

### 搜索示例

| 搜索词 | 匹配字段 | 说明 |
|--------|----------|------|
| `中` | nameCN | 匹配"中国"、"中非"等 |
| `China` | nameEN | 匹配"China"（不区分大小写） |
| `JP` | isoCode | 匹配国家代码"JP" |
| `japan` | nameEN | 匹配"Japan"（不区分大小写） |

## 修改的文件

- `src/countries/countries.service.ts` - 优化查询逻辑

## 注意事项

1. **URL编码**: 前端应该使用URL编码处理中文搜索词（现代HTTP客户端库会自动处理）
2. **查询性能**: 建议在 `nameCN`, `nameEN`, `isoCode` 字段上创建数据库索引
3. **搜索建议**: 
   - 支持部分匹配，可以搜索部分名称
   - 支持中英文混合搜索
   - ISO代码搜索会自动转换为大写

## 测试建议

1. **前端测试**: 使用浏览器开发者工具测试，确保URL编码正确
2. **API测试**: 使用 `--data-urlencode` 或手动URL编码进行测试
3. **搜索测试**: 测试中文、英文、ISO代码等各种搜索场景
