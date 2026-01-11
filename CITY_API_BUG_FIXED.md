# 城市API Bug修复 - 已完成 ✅

## 问题描述

无论传入什么 `countryCode` 参数，API 都返回相同的50个城市，而不是对应国家的城市。

## 根本原因

**查询参数没有被正确绑定到DTO**，导致 Controller 收到空对象 `{}`。

### 问题分析

从服务器日志可以看到：
```
[CitiesController] ⚠️ 收到城市查询请求: {}
[CitiesService.findAll] 收到查询参数: {"limit":50,"offset":0}
[CitiesService.findAll] 未提供国家代码，将返回所有城市
```

虽然URL是 `/api/cities?countryCode=CN&limit=5`，但Controller收到的query是空对象。

### 原因

1. **`GetCitiesQueryDto` 类缺少 `class-validator` 装饰器**
   - 只有 `@ApiPropertyOptional`（Swagger装饰器，不影响参数绑定）
   - 没有 `@IsOptional()`, `@IsString()` 等验证装饰器

2. **ValidationPipe 配置了 `whitelist: true`**
   - 这会移除所有没有验证装饰器的属性
   - 导致所有查询参数都被移除，Controller收到空对象

## 修复方案

给 `GetCitiesQueryDto` 的每个字段添加 `class-validator` 装饰器：

```typescript
export class GetCitiesQueryDto {
  @ApiPropertyOptional({
    description: '国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
  })
  @IsOptional()      // ✅ 新增
  @IsString()        // ✅ 新增
  countryCode?: string;

  @ApiPropertyOptional({
    description: '搜索关键词（支持中文名、英文名、名称）',
    example: '东京',
  })
  @IsOptional()      // ✅ 新增
  @IsString()        // ✅ 新增
  q?: string;

  @ApiPropertyOptional({
    description: '返回数量限制',
    example: 50,
    default: 50,
  })
  @IsOptional()      // ✅ 新增
  @Type(() => Number) // ✅ 新增：类型转换
  @IsInt()           // ✅ 新增
  @Min(1)            // ✅ 新增
  limit?: number;

  @ApiPropertyOptional({
    description: '偏移量（用于分页）',
    example: 0,
    default: 0,
  })
  @IsOptional()      // ✅ 新增
  @Type(() => Number) // ✅ 新增：类型转换
  @IsInt()           // ✅ 新增
  @Min(0)            // ✅ 新增
  offset?: number;
}
```

## 修复结果

✅ **修复成功！**

测试结果：
- ✅ 中国 (CN) 返回中国城市：阿克苏、阿勒泰、阿拉善左旗等
- ✅ 日本 (JP) 返回日本城市：秋田、青森、旭川等
- ✅ 所有城市的国家代码都正确
- ✅ API返回的数据与数据库查询一致

## 修改的文件

- `src/cities/dto/city.dto.ts` - 添加了 `class-validator` 和 `class-transformer` 装饰器

## 相关文件

- `src/main.ts` - ValidationPipe 配置（`whitelist: true`）
- `src/cities/cities.controller.ts` - Controller 接收查询参数
- `src/cities/cities.service.ts` - Service 处理查询逻辑

## 经验教训

1. **使用 ValidationPipe 时，必须给 DTO 字段添加验证装饰器**
   - `whitelist: true` 会移除没有装饰器的属性
   - 即使字段是可选的，也需要 `@IsOptional()` 装饰器

2. **查询参数需要类型转换时，使用 `@Type()` 装饰器**
   - 查询参数默认是字符串类型
   - 数字类型需要使用 `@Type(() => Number)` 转换

3. **参考其他DTO的实现**
   - `src/route-directions/dto/query-route-direction.dto.ts` 是正确的实现示例

## 测试

运行测试脚本验证：
```bash
npx ts-node scripts/debug-cities-api.ts
```

应该看到每个国家返回不同的、正确的城市列表。
