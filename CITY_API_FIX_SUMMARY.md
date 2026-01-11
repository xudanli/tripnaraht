# 城市API Bug修复总结

## 问题确认

**问题**：无论传入什么 `countryCode`，API 都返回相同的50个城市（安道尔城、阿布扎比等）。

**测试结果**：
- ✅ 直接 Prisma 查询正常（返回正确的城市）
- ❌ API 调用仍然返回错误的城市

## 已修复的代码

### 文件：`src/cities/cities.service.ts`

**修复内容**：将原始 SQL 查询改为标准 Prisma 查询

```typescript
// 修复前（有问题）
const cities = await this.prisma.$queryRaw<any[]>`
  SELECT ... FROM "City" 
  WHERE "countryCode" = ${normalizedCountryCode}::text
  ...
`;

// 修复后（正确）
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

## 验证步骤

### 1. 确认代码已更新

```bash
grep -A 10 "if (normalizedCountryCode)" src/cities/cities.service.ts
```

应该看到使用 `prisma.city.findMany` 而不是 `$queryRaw`。

### 2. 重启服务器

**重要**：必须重启服务器才能生效！

```bash
# 如果使用 npm run start:dev，应该会自动热重载
# 如果没有，请手动重启：
# 1. 停止服务器 (Ctrl+C)
# 2. 重新启动: npm run start:dev
```

### 3. 测试 API

```bash
# 测试不同国家
curl "http://localhost:3000/api/cities?countryCode=CN&limit=3"
curl "http://localhost:3000/api/cities?countryCode=JP&limit=3"
curl "http://localhost:3000/api/cities?countryCode=IS&limit=3"

# 或使用测试脚本
npx ts-node scripts/test-cities-api-direct.ts
```

### 4. 检查服务器日志

查看服务器日志，应该看到：
```
[CitiesService.findAll] ⚠️ 使用 Prisma 查询（带国家代码过滤）: countryCode=CN
[CitiesService.findAll] WHERE 条件: {"countryCode":"CN"}
[CitiesService.findAll] ✅ Prisma 查询结果: X 个城市
[CitiesService.findAll] ✅ 所有城市都属于 CN
```

## 如果仍然不工作

### 检查点 1：服务器是否真的重启了

```bash
# 检查服务器进程
ps aux | grep -E "node|nest" | grep -v grep

# 检查服务器日志中的时间戳
# 如果时间戳很旧，说明服务器没有重启
```

### 检查点 2：代码是否真的更新了

```bash
# 检查文件修改时间
ls -la src/cities/cities.service.ts

# 检查代码内容
grep "findMany" src/cities/cities.service.ts
```

### 检查点 3：是否有编译缓存

```bash
# 清除编译缓存（如果使用 TypeScript）
rm -rf dist/
npm run build

# 或重启开发服务器
```

### 检查点 4：检查是否有其他代码路径

可能代码没有走到正确的分支。检查服务器日志，确认：
- 是否进入了 `if (normalizedCountryCode)` 分支
- WHERE 条件是否正确
- 查询结果是什么

## 调试日志

已添加详细的日志，包括：
- 收到的查询参数
- 使用的查询方法
- WHERE 条件
- 查询结果
- 返回的城市列表

查看服务器日志以确认实际执行的代码路径。
