# 城市API Bug修复说明

## 问题描述

无论传入什么 `countryCode` 参数，API 都返回相同的50个城市（安道尔城、阿布扎比等），而不是对应国家的城市。

## 根本原因

**已修复**：将原始 SQL 查询改为使用标准 Prisma 查询，避免参数绑定问题。

## 修复内容

### 修改文件
- `src/cities/cities.service.ts`

### 修改内容

**之前（有问题的代码）：**
```typescript
// 使用原始 SQL 查询
const cities = await this.prisma.$queryRaw<any[]>`
  SELECT ... FROM "City" 
  WHERE "countryCode" = ${normalizedCountryCode}::text
  ...
`;
```

**之后（修复后的代码）：**
```typescript
// 使用标准 Prisma 查询
const cities = await this.prisma.city.findMany({
  where: {
    countryCode: normalizedCountryCode,
  },
  take: limit,
  skip: offset,
  orderBy: [
    { countryCode: 'asc' },
    { name: 'asc' },
  ],
});
```

## 验证

运行测试脚本验证修复：
```bash
npx ts-node scripts/test-cities-api-direct.ts
```

应该看到每个国家返回不同的城市列表，且所有城市的 `countryCode` 都正确。

## 注意事项

**需要重启服务器**才能生效！

如果使用 `npm run start:dev`，应该会自动热重载。如果没有，请手动重启服务器。
