# Jenkins 数据库迁移问题解决指南

## 问题

迁移失败，错误信息：
```
ERROR: type "geography" does not exist
Database error code: 42704
```

## 原因

项目使用 PostgreSQL + PostGIS 扩展，但目标数据库中没有安装 PostGIS 扩展。

从 `prisma/schema.prisma` 可以看到：
```prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [postgis]  // 需要 PostGIS 扩展
}
```

## 解决方案

### 方案 1：在数据库服务器上安装 PostGIS（推荐）

连接到数据库服务器，在目标数据库中安装 PostGIS 扩展：

```sql
-- 连接到目标数据库
\c tripnara_prod

-- 安装 PostGIS 扩展
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 验证安装
SELECT PostGIS_version();
```

### 方案 2：在迁移前自动安装（如果数据库用户有权限）

如果数据库用户有创建扩展的权限，可以在迁移前添加安装扩展的步骤。

在 `docker-compose.yml` 的 migrate service 中添加初始化脚本：

```yaml
migrate:
  image: tripnara:latest
  container_name: tripnara-migrate
  profiles: ["ops"]
  restart: "no"
  env_file:
    - ./.env
  command: 
    - sh
    - -c
    - |
      # 安装 PostGIS 扩展（如果不存在）
      PGPASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\([^@]*\)@.*/\1/p') \
      psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis;" || true
      
      # 运行迁移
      node ./node_modules/.bin/prisma migrate deploy
```

**注意**：这需要安装 `postgresql-client` 包到镜像中，或者在 Dockerfile 中添加。

### 方案 3：使用数据库管理工具

使用数据库管理工具（如 pgAdmin、DBeaver 等）连接到数据库，执行：

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

## 验证

安装 PostGIS 后，可以通过以下 SQL 验证：

```sql
-- 检查扩展是否安装
SELECT * FROM pg_extension WHERE extname = 'postgis';

-- 检查 PostGIS 版本
SELECT PostGIS_version();
```

## 阿里云 RDS PostgreSQL 说明

如果使用的是阿里云 RDS PostgreSQL，需要注意：

1. **PostGIS 支持**：阿里云 RDS PostgreSQL 支持 PostGIS，但可能需要：
   - 在 RDS 控制台中启用 PostGIS
   - 或使用高可用版本（通常默认支持）

2. **权限问题**：RDS 通常不允许普通用户创建扩展，需要：
   - 使用主账号（通常是 `postgres`）
   - 或在 RDS 控制台中启用 PostGIS

3. **检查方法**：
   ```sql
   -- 检查可用的扩展
   SELECT * FROM pg_available_extensions WHERE name LIKE 'postgis%';
   
   -- 检查已安装的扩展
   SELECT * FROM pg_extension WHERE extname LIKE 'postgis%';
   ```

## 解决失败的迁移（P3009 错误）

如果之前迁移失败，Prisma 会记录失败的迁移，阻止新的迁移。需要先解决失败的迁移记录。

### 错误信息

```
Error: P3009
migrate found failed migrations in the target database, new migrations will not be applied.
The `20251225191251_add_route_directions` migration started at 2026-01-11 05:48:11.796832 UTC failed
```

### 解决方案

#### 方案 1：标记失败迁移为已回滚（推荐）

连接到数据库，将失败的迁移标记为已回滚：

```sql
-- 连接到目标数据库
\c tripnara_prod

-- 查看失败的迁移
SELECT * FROM "_prisma_migrations" WHERE finished_at IS NULL;

-- 标记失败的迁移为已回滚（替换 migration_name 为实际的迁移名称）
UPDATE "_prisma_migrations" 
SET finished_at = NOW(), 
    rolled_back_at = NOW() 
WHERE migration_name = '20251225191251_add_route_directions' 
  AND finished_at IS NULL;
```

#### 方案 2：使用 Prisma migrate resolve 命令（如果数据库用户有权限）

在容器中运行：

```bash
# 标记为已应用（如果迁移实际上已经成功，只是标记失败）
npx prisma migrate resolve --applied 20251225191251_add_route_directions

# 或标记为已回滚（如果迁移确实失败，需要重新运行）
npx prisma migrate resolve --rolled-back 20251225191251_add_route_directions
```

在 Jenkins 中，可以在 Migrate stage 之前添加一个清理步骤，或者手动修复数据库。

#### 方案 3：手动修复数据库并标记迁移

如果迁移因为 PostGIS 扩展缺失而失败，但表已经部分创建：

1. **安装 PostGIS 扩展**（如果还没有安装）
2. **删除部分创建的数据库对象**（表、索引等）
3. **标记迁移为已回滚**

```sql
-- 1. 安装 PostGIS（如果还没有）
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. 查看是否有部分创建的对象（需要根据实际情况调整）
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%route_directions%';

-- 3. 删除部分创建的对象（如果有）
-- DROP TABLE IF EXISTS "RouteDirection" CASCADE;

-- 4. 标记迁移为已回滚
UPDATE "_prisma_migrations" 
SET finished_at = NOW(), 
    rolled_back_at = NOW() 
WHERE migration_name = '20251225191251_add_route_directions' 
  AND finished_at IS NULL;
```

### 完整解决流程

1. **安装 PostGIS 扩展**
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS postgis_topology;
   ```

2. **清理失败的迁移记录**
   ```sql
   UPDATE "_prisma_migrations" 
   SET finished_at = NOW(), 
       rolled_back_at = NOW() 
   WHERE migration_name = '20251225191251_add_route_directions' 
     AND finished_at IS NULL;
   ```

3. **清理部分创建的对象**（如果有）
   - 检查是否有部分创建的表、索引等
   - 手动删除或使用 Prisma 的回滚命令

4. **重新运行 Jenkins 构建**
   - 迁移会重新尝试执行

## 下一步

1. 连接数据库，安装 PostGIS 扩展
2. 标记失败的迁移为已回滚
3. 清理部分创建的对象（如果有）
4. 重新运行 Jenkins 构建

## 相关资源

- [PostGIS 官方文档](https://postgis.net/documentation/)
- [Prisma PostGIS 支持](https://www.prisma.io/docs/concepts/components/prisma-schema/data-sources#postgresql-extensions)
- [阿里云 RDS PostgreSQL PostGIS](https://help.aliyun.com/document_detail/126943.html)
