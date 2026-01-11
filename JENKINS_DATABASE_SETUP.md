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

## 下一步

1. 联系数据库管理员，在目标数据库中安装 PostGIS 扩展
2. 或者使用有权限的数据库用户执行 `CREATE EXTENSION postgis;`
3. 安装完成后，重新运行 Jenkins 构建

## 相关资源

- [PostGIS 官方文档](https://postgis.net/documentation/)
- [Prisma PostGIS 支持](https://www.prisma.io/docs/concepts/components/prisma-schema/data-sources#postgresql-extensions)
- [阿里云 RDS PostgreSQL PostGIS](https://help.aliyun.com/document_detail/126943.html)
