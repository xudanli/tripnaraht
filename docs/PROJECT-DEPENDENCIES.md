# 项目完整依赖清单

## 📋 概述

本文档列出项目所需的所有依赖，包括Node.js、Python、数据库和系统依赖。

---

## 📦 Node.js 依赖

### 安装方式

```bash
npm install
# 或
yarn install
```

### 运行时依赖 (dependencies)

#### NestJS 核心框架
- `@nestjs/common` - NestJS 核心模块
- `@nestjs/core` - NestJS 核心
- `@nestjs/platform-express` - Express 平台适配器
- `@nestjs/config` - 配置管理
- `@nestjs/cache-manager` - 缓存管理
- `@nestjs/schedule` - 定时任务
- `@nestjs/swagger` - API 文档
- `@nestjs/mapped-types` - 类型映射

#### 数据库相关
- `@prisma/client` - Prisma ORM 客户端
- `prisma` - Prisma CLI
- `pg` - PostgreSQL 驱动
- `@types/pg` - PostgreSQL 类型定义

#### HTTP 客户端
- `axios` - HTTP 请求库
- `node-fetch` - Fetch API 实现

#### 数据处理
- `csv-parse` - CSV 解析
- `xlsx` - Excel 文件处理
- `cheerio` - HTML 解析（类似 jQuery）
- `i18n-iso-countries` - 国家代码国际化

#### 浏览器自动化
- `puppeteer` - Chrome/Chromium 自动化
- `playwright` - 浏览器自动化框架
- `apify-client` - Apify 客户端

#### 缓存
- `cache-manager` - 缓存管理器
- `cache-manager-redis-store` - Redis 存储
- `redis` - Redis 客户端

#### 工具库
- `dotenv` - 环境变量管理
- `luxon` - 日期时间处理
- `class-transformer` - 类转换器
- `class-validator` - 类验证器
- `reflect-metadata` - 反射元数据
- `rxjs` - 响应式编程

#### 前端框架（Next.js）
- `next` - Next.js 框架
- `react` - React 库
- `react-dom` - React DOM

### 开发依赖 (devDependencies)

- `@nestjs/cli` - NestJS CLI
- `@nestjs/schematics` - NestJS 代码生成器
- `typescript` - TypeScript 编译器
- `ts-node` - TypeScript 执行器
- `nodemon` - 自动重启工具
- `eslint` - 代码检查
- `eslint-config-next` - Next.js ESLint 配置
- `@types/node` - Node.js 类型定义
- `@types/react` - React 类型定义
- `@types/react-dom` - React DOM 类型定义
- `@types/cheerio` - Cheerio 类型定义
- `@types/luxon` - Luxon 类型定义
- `@types/node-fetch` - node-fetch 类型定义

---

## 🐍 Python 依赖

### 安装方式

```bash
pip install -r requirements.txt
# 或
pip install requests pillow
```

### 依赖列表

#### 必需依赖
- `requests>=2.31.0` - HTTP 请求库（用于调用 Google/Mapbox API）
- `pillow>=10.0.0` - 图像处理库（用于 Mapbox Terrain-RGB 瓦片处理）

### 用途

Python 依赖主要用于**路线难度评估**功能：
- `requests`: 调用 Google Maps Directions/Elevation API 和 Mapbox Directions API
- `pillow`: 处理 Mapbox Terrain-RGB 瓦片图像，提取高程数据

### 验证安装

```bash
python3 -c "import requests; from PIL import Image; print('✅ Python依赖安装成功')"
```

---

## 🗄️ 数据库依赖

### PostgreSQL

#### 必需版本
- PostgreSQL 12+（推荐 14+）

#### PostGIS 扩展
项目使用 PostGIS 进行地理空间数据处理，需要安装 PostGIS 扩展：

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

#### 安装方式

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo apt-get install postgis postgresql-14-postgis-3  # 根据PostgreSQL版本调整
```

**macOS:**
```bash
brew install postgresql
brew install postgis
```

**Docker:**
```bash
docker run --name postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=yourdb \
  -p 5432:5432 \
  -d postgis/postgis:14-3.3
```

### Redis（可选，用于缓存）

#### 安装方式

**Ubuntu/Debian:**
```bash
sudo apt-get install redis-server
```

**macOS:**
```bash
brew install redis
```

**Docker:**
```bash
docker run --name redis -p 6379:6379 -d redis:alpine
```

---

## 🛠️ 系统依赖

### Node.js

- **版本要求**: Node.js 18+ 或 20+
- **推荐版本**: Node.js 20 LTS

**安装方式:**
```bash
# 使用 nvm（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# 或直接从官网下载
# https://nodejs.org/
```

### Python

- **版本要求**: Python 3.9+
- **推荐版本**: Python 3.11+

**安装方式:**
```bash
# Ubuntu/Debian
sudo apt-get install python3 python3-pip

# macOS
brew install python3

# 验证
python3 --version
pip3 --version
```

### Git

用于版本控制：
```bash
sudo apt-get install git  # Ubuntu/Debian
brew install git           # macOS
```

---

## 🔑 外部服务依赖

### API 密钥配置

项目需要以下 API 密钥（在 `.env` 文件中配置）：

#### 必需
- **PostgreSQL 数据库**: `DATABASE_URL`

#### 可选（根据使用的功能）
- **Google Maps API**: 
  - `GOOGLE_MAPS_API_KEY` 或
  - `GOOGLE_ROUTES_API_KEY` 或
  - `GOOGLE_PLACES_API_KEY`
  
- **Mapbox API**: 
  - `MAPBOX_ACCESS_TOKEN` 或
  - `VITE_MAPBOX_ACCESS_TOKEN`

- **Redis** (可选): `REDIS_URL`

---

## 📦 完整安装步骤

### 1. 系统依赖

```bash
# 安装 Node.js (使用 nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# 安装 Python 3
sudo apt-get install python3 python3-pip

# 安装 PostgreSQL + PostGIS
sudo apt-get install postgresql postgresql-contrib
sudo apt-get install postgis postgresql-14-postgis-3

# 安装 Redis (可选)
sudo apt-get install redis-server
```

### 2. Node.js 依赖

```bash
cd /path/to/project
npm install
```

### 3. Python 依赖

```bash
pip install -r requirements.txt
# 或
pip install requests pillow
```

### 4. 数据库设置

```bash
# 创建数据库
createdb your_database_name

# 运行迁移
npm run prisma:migrate

# 生成 Prisma 客户端
npm run prisma:generate
```

### 5. 环境变量配置

创建 `.env` 文件：

```bash
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# API 密钥
GOOGLE_ROUTES_API_KEY=your_google_api_key
MAPBOX_ACCESS_TOKEN=your_mapbox_token

# Redis (可选)
REDIS_URL="redis://localhost:6379"
```

---

## ✅ 验证安装

### Node.js 依赖

```bash
npm list --depth=0
```

### Python 依赖

```bash
python3 -c "import requests; from PIL import Image; print('OK')"
```

### 数据库

```bash
psql -U postgres -d your_database -c "SELECT PostGIS_version();"
```

### Redis (如果使用)

```bash
redis-cli ping
# 应该返回: PONG
```

---

## 📊 依赖大小估算

- **Node.js 依赖**: ~500MB (node_modules)
- **Python 依赖**: ~50MB (requests + pillow)
- **PostgreSQL**: ~200MB
- **PostGIS**: ~50MB
- **Redis**: ~5MB

**总计**: 约 ~800MB (不包括数据)

---

## 🔄 更新依赖

### Node.js

```bash
npm update
# 或更新特定包
npm update @nestjs/common
```

### Python

```bash
pip install --upgrade requests pillow
```

---

## 🐛 常见问题

### 问题1: npm install 失败

**可能原因**: Node.js 版本不兼容
**解决**: 使用 Node.js 18+ 或 20+

### 问题2: Python 依赖安装失败

**可能原因**: pip 未安装或权限不足
**解决**: 
```bash
# 安装 pip
sudo apt-get install python3-pip

# 使用 --user 标志
pip install --user requests pillow
```

### 问题3: PostgreSQL 连接失败

**可能原因**: 数据库未启动或配置错误
**解决**: 
```bash
# 检查服务状态
sudo systemctl status postgresql

# 启动服务
sudo systemctl start postgresql
```

### 问题4: PostGIS 扩展未找到

**可能原因**: PostGIS 未安装
**解决**: 
```bash
sudo apt-get install postgis postgresql-14-postgis-3
# 然后在数据库中创建扩展
psql -U postgres -d your_database -c "CREATE EXTENSION postgis;"
```

---

## 📝 总结

### 必需依赖
- ✅ Node.js 18+
- ✅ PostgreSQL 12+ (带 PostGIS)
- ✅ Python 3.9+
- ✅ Node.js 包 (通过 npm install)
- ✅ Python 包 (requests, pillow)

### 可选依赖
- ⚪ Redis (用于缓存)
- ⚪ 外部 API 密钥 (根据功能需求)

所有依赖安装完成后，项目即可正常运行！

