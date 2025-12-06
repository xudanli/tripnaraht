# NestJS + PostgreSQL + PostGIS 后端项目

这是一个使用 NestJS、PostgreSQL 和 PostGIS 构建的旅游地点查询后端系统。

## 🚀 功能特性

- ✅ PostGIS 地理位置查询（查找附近的地点）
- ✅ JSONB 存储灵活的服务设施信息
- ✅ 营业时间解析和判断（支持跨午夜）
- ✅ Apify 数据抓取集成
- ✅ 类型安全的 Prisma ORM

## 📋 前置要求

1. Node.js 18+
2. PostgreSQL 12+ (需要安装 PostGIS 扩展)
3. Apify 账号和 API Token (用于数据抓取)

## 🛠️ 安装步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 配置数据库

在 `.env` 文件中配置数据库连接：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/your_database?schema=public"
APIFY_API_TOKEN="your_apify_token_here"
PORT=3000
```

### 3. 初始化数据库

```bash
# 生成 Prisma Client
npm run prisma:generate

# 运行数据库迁移（会自动创建 PostGIS 扩展）
npm run prisma:migrate
```

**注意**: 如果数据库用户没有超级用户权限，需要手动在数据库中创建 PostGIS 扩展：

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 4. 创建地理空间索引（可选但推荐）

运行迁移后，手动创建地理空间索引以提升查询性能：

```sql
CREATE INDEX place_location_idx ON "Place" USING GIST (location);
```

## 📝 使用说明

### 启动开发服务器

```bash
npm run backend:dev
```

服务器将在 `http://localhost:3000` 启动。

### API 端点

#### 1. 查找附近的地点

```
GET /places/nearby?lat=34.6937&lng=135.5023&radius=2000&type=RESTAURANT
```

参数：
- `lat`: 纬度（必需）
- `lng`: 经度（必需）
- `radius`: 搜索半径（米，可选，默认 2000）
- `type`: 地点类型（可选：RESTAURANT, ATTRACTION, SHOPPING, HOTEL）

#### 2. 查找附近支持特定支付方式的餐厅

```
GET /places/nearby/restaurants?lat=34.6937&lng=135.5023&radius=1000&payment=Visa
```

#### 3. 创建地点

```
POST /places
Content-Type: application/json

{
  "name": "测试餐厅",
  "category": "RESTAURANT",
  "lat": 34.6937,
  "lng": 135.5023,
  "address": "大阪市...",
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
}
```

## 🕷️ 数据抓取

### 使用 Apify 抓取 Google Maps 数据

1. 在 Apify 注册账号并获取 API Token
2. 将 Token 添加到 `.env` 文件
3. 运行抓取脚本：

```bash
npm run scrape
```

数据将保存到 `places-data.json` 文件。

### 导入数据到数据库

```bash
npm run seed
```

## 📁 项目结构

```
src/
├── places/              # 地点模块
│   ├── dto/            # 数据传输对象
│   ├── interfaces/     # TypeScript 接口
│   ├── places.controller.ts
│   ├── places.service.ts
│   └── places.module.ts
├── prisma/             # Prisma 服务
│   ├── prisma.service.ts
│   └── prisma.module.ts
├── common/             # 通用工具
│   └── utils/
│       └── opening-hours.util.ts
├── app.module.ts       # 根模块
└── main.ts             # 应用入口

prisma/
└── schema.prisma       # Prisma Schema

scripts/
├── scrape-places.ts    # Apify 抓取脚本
└── seed-places.ts     # 数据导入脚本
```

## 🔧 开发工具

- **Prisma Studio**: 可视化数据库管理
  ```bash
  npm run prisma:studio
  ```

- **生成 Prisma Client**: 修改 Schema 后需要重新生成
  ```bash
  npm run prisma:generate
  ```

## ⚠️ 注意事项

1. **PostGIS 扩展**: 确保数据库已安装 PostGIS 扩展
2. **时区处理**: 营业时间判断使用店铺当地时区（默认 Asia/Tokyo）
3. **跨午夜营业**: 工具类已处理跨午夜的营业时间（如 18:00-02:00）
4. **成本控制**: Apify 抓取有成本，测试时建议设置较小的 `maxCrawledPlacesPerSearch`

## 📚 相关文档

- [NestJS 文档](https://docs.nestjs.com/)
- [Prisma 文档](https://www.prisma.io/docs)
- [PostGIS 文档](https://postgis.net/documentation/)
- [Apify 文档](https://docs.apify.com/)

