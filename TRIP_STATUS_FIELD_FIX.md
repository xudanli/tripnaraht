# Trip.status 字段修复

## 问题描述

`GET /api/trips` 接口报错：
```
The column `Trip.status` does not exist in the current database.
```

## 根本原因

1. **Prisma Schema** 中定义了 `Trip.status` 字段：
   ```prisma
   model Trip {
     status String? @default("PLANNING") // PLANNING, IN_PROGRESS, COMPLETED, CANCELLED
     ...
     @@index([status])
   }
   ```

2. **数据库表**中缺少 `status` 列，导致 Prisma Client 查询时失败

3. **Schema 和数据库不同步**：可能是手动修改了 schema 但没有运行 migration

## 解决方案

### 1. 添加数据库字段

执行以下 SQL 语句：

```sql
-- 添加 status 字段
ALTER TABLE "Trip" 
ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'PLANNING';

-- 创建索引
CREATE INDEX IF NOT EXISTS "Trip_status_idx" ON "Trip"("status");

-- 更新现有数据
UPDATE "Trip" SET "status" = 'PLANNING' WHERE "status" IS NULL;
```

### 2. 重新生成 Prisma Client

```bash
npx prisma generate
```

## 验证

### ✅ 数据库字段验证

```bash
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.trip.findMany({ take: 1 }).then(trips => {
  console.log('✅ 查询成功');
  console.log('status:', trips[0]?.status);
  prisma.\$disconnect();
});
"
```

### ✅ 字段存在性验证

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'Trip' AND column_name = 'status';
```

## 修复结果

- ✅ `status` 字段已成功添加到数据库
- ✅ 索引已创建
- ✅ 现有数据已更新为默认值 `'PLANNING'`
- ✅ Prisma Client 已重新生成
- ✅ 直接 Prisma 查询成功

## 注意事项

1. **API 认证**：`GET /api/trips` 需要认证，返回 401 是正常的（不是数据库字段问题）

2. **字段类型**：数据库中使用 `TEXT` 类型，Prisma schema 中使用 `String?`，两者兼容

3. **默认值**：新创建的 Trip 会自动设置 `status = 'PLANNING'`

4. **状态值**：支持的状态值：
   - `PLANNING` - 规划中
   - `IN_PROGRESS` - 进行中
   - `COMPLETED` - 已完成
   - `CANCELLED` - 已取消

## 相关文件

- `prisma/schema.prisma` - Trip 模型定义
- `src/trips/trips.service.ts` - 使用 status 字段的业务逻辑
- `src/trips/dto/trip-status.dto.ts` - TripStatus 枚举定义
