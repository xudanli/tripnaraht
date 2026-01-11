# 国家列表API - 默认返回所有国家

## 修改内容

已修改国家列表API，**默认返回所有国家**，而不是只返回100个。

## 修改前

- **默认limit**: 100
- **最大limit**: 500
- **行为**: 不指定limit时，只返回前100个国家

## 修改后

- **默认limit**: 自动设置为总数（返回所有国家）
- **最大limit**: 1000（提高上限）
- **行为**: 
  - 不指定limit时，自动返回所有国家
  - 指定limit时，按指定数量返回（支持分页）

## 实现逻辑

```typescript
// 如果没有指定limit，返回所有国家
if (limit === undefined) {
  // 先查询总数，然后使用总数作为limit
  const totalCount = await this.prisma.countryProfile.count({
    where: q ? { /* 搜索条件 */ } : {},
  });
  limit = totalCount;
}
```

## 测试结果

### ✅ 默认请求（无limit参数）

```bash
GET /api/countries
```

**结果**:
- 返回数量: **193**（所有国家）
- 总数: **193**
- HasMore: **False**
- Limit: **193**

### ✅ 指定limit

```bash
GET /api/countries?limit=50
```

**结果**:
- 返回数量: **50**
- 总数: **193**
- HasMore: **True**
- Limit: **50**

### ✅ 搜索功能

```bash
GET /api/countries?q=Japan
```

**结果**:
- 自动返回所有匹配的国家（不限制数量）

## 使用场景

### 1. 获取所有国家（推荐）

```bash
# 不指定limit，自动返回所有
GET /api/countries
```

### 2. 分页加载

```bash
# 第一页
GET /api/countries?limit=50&offset=0

# 第二页
GET /api/countries?limit=50&offset=50
```

### 3. 搜索（自动返回所有匹配结果）

```bash
# 搜索"Japan"，返回所有匹配的国家
GET /api/countries?q=Japan
```

## 性能考虑

- **国家总数**: 193个（相对较少）
- **默认行为**: 返回所有国家，适合前端一次性加载
- **最大limit**: 1000（防止恶意请求）
- **分页支持**: 仍然支持通过limit和offset进行分页

## 修改的文件

1. `src/countries/countries.service.ts` - 修改默认limit逻辑
2. `src/countries/dto/get-countries-query.dto.ts` - 更新文档说明
3. `src/countries/countries.controller.ts` - 更新API文档说明

## 注意事项

1. **性能**: 国家数量只有193个，一次性返回所有国家不会造成性能问题
2. **分页**: 仍然支持通过limit参数进行分页，适合需要分页的场景
3. **搜索**: 搜索时也会自动返回所有匹配结果，不会限制数量
4. **最大limit**: 如果手动指定limit超过1000，会自动限制为1000

## 前端使用建议

### 推荐方式（一次性加载所有）

```typescript
// 获取所有国家（不指定limit）
const response = await fetch('/api/countries');
const result = await response.json();

if (result.success) {
  const allCountries = result.data.countries; // 所有193个国家
  // 前端可以缓存，用于下拉选择等场景
}
```

### 分页方式（如果需要）

```typescript
// 分页加载
const loadCountries = async (offset = 0, limit = 50) => {
  const response = await fetch(`/api/countries?limit=${limit}&offset=${offset}`);
  const result = await response.json();
  
  if (result.success) {
    return result.data;
  }
};
```

## 优势

1. **简化前端逻辑**: 不需要处理分页，一次性获取所有国家
2. **更好的用户体验**: 下拉选择等场景可以直接使用完整列表
3. **保持兼容性**: 仍然支持limit参数，兼容需要分页的场景
4. **性能友好**: 国家数量少，一次性返回不会造成性能问题
