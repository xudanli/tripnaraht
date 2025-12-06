# 🚀 快速开始指南

## 已完成的工作

✅ **项目结构已创建**
- NestJS 应用框架
- Prisma ORM 配置（支持 PostGIS）
- Places 模块（地点查询）
- 营业时间工具类
- Apify 数据抓取脚本
- 数据导入脚本

## 📋 下一步操作

### 1. 配置环境变量

创建 `.env` 文件（如果还没有）：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/your_database?schema=public"
APIFY_API_TOKEN="your_apify_token_here"
PORT=3000
```

### 2. 设置数据库

确保 PostgreSQL 已安装并运行，然后：

```bash
# 生成 Prisma Client
npm run prisma:generate

# 运行数据库迁移
npm run prisma:migrate
```

**重要**: 如果数据库用户没有超级用户权限，需要手动创建 PostGIS 扩展：

```sql
-- 连接到你的数据库
psql -U your_user -d your_database

-- 创建 PostGIS 扩展
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 3. 创建索引（提升性能）

运行迁移后，执行以下 SQL 创建索引：

```bash
psql -U your_user -d your_database -f prisma/migrations/create-indexes.sql
```

或者手动执行：

```sql
CREATE INDEX IF NOT EXISTS place_metadata_gin_idx ON "Place" USING GIN (metadata);
CREATE INDEX IF NOT EXISTS place_location_gist_idx ON "Place" USING GIST (location);
CREATE INDEX IF NOT EXISTS place_category_idx ON "Place" (category);
CREATE INDEX IF NOT EXISTS place_city_id_idx ON "Place" ("cityId");
```

### 4. 创建测试数据（可选）

如果需要测试数据，可以先创建一个城市：

```sql
INSERT INTO "City" (name, country) VALUES ('Osaka', 'Japan') RETURNING id;
```

### 5. 启动开发服务器

```bash
npm run backend:dev
```

服务器将在 `http://localhost:3000` 启动。

### 6. 测试 API

#### 查找附近的地点
```bash
curl "http://localhost:3000/places/nearby?lat=34.6937&lng=135.5023&radius=2000&type=RESTAURANT"
```

#### 创建地点
```bash
curl -X POST http://localhost:3000/places \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试餐厅",
    "category": "RESTAURANT",
    "lat": 34.6937,
    "lng": 135.5023,
    "address": "大阪市中央区",
    "cityId": 1,
    "metadata": {
      "openingHours": {
        "mon": "09:00-18:00",
        "tue": "09:00-18:00"
      },
      "facilities": {
        "payment": ["Visa", "Alipay"]
      }
    }
  }'
```

## 🕷️ 数据抓取（可选）

如果需要从 Google Maps 抓取数据：

1. 注册 Apify 账号：https://apify.com
2. 获取 API Token
3. 添加到 `.env` 文件
4. 运行抓取脚本：

```bash
npm run scrape
```

5. 导入数据到数据库：

```bash
npm run seed
```

## 📚 更多信息

查看 `README-BACKEND.md` 获取完整的文档。

