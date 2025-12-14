# TripNara API - 智能旅行规划后端服务

一个基于 NestJS 的智能旅行规划后端 API 服务，提供行程管理、地点查询、路线优化、交通规划等功能。

## 技术栈

- **框架**: NestJS 11
- **数据库**: PostgreSQL + PostGIS
- **ORM**: Prisma 6
- **缓存**: Redis
- **API 文档**: Swagger/OpenAPI
- **语言**: TypeScript 5

## 环境搭建

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env` 文件，配置数据库连接和其他服务密钥：

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/tripnara"
REDIS_URL="redis://localhost:6379"
GOOGLE_PLACES_API_KEY="your_key"
GOOGLE_VISION_API_KEY="your_key"
MAPBOX_API_KEY="your_key"
# ... 其他环境变量
```

### 3. 数据库迁移

```bash
npm run prisma:generate
npm run prisma:migrate
```

## 开发流程

```bash
# 启动开发服务器（热重载）
npm run dev

# 构建生产版本
npm run build

# 运行生产服务器
npm run start
```

## API 文档

启动服务后，访问 `http://localhost:3000/api` 查看完整的 Swagger API 文档。

## 项目结构

```
.
├── src/                    # 源代码目录
│   ├── main.ts            # 应用入口
│   ├── app.module.ts      # 根模块
│   ├── trips/             # 行程管理模块
│   ├── places/            # 地点管理模块
│   ├── itinerary-optimization/  # 路线优化模块
│   ├── transport/         # 交通规划模块
│   ├── planning-policy/  # 规划策略模块（What-If）
│   ├── voice/             # 语音解析模块
│   ├── vision/            # 视觉识别模块
│   └── ...                # 其他模块
├── prisma/                # 数据库配置和迁移
├── scripts/               # 数据导入和处理脚本
├── docs/                  # 项目文档
└── package.json           # 项目依赖
```

## 核心功能

### 行程管理
- 创建行程（自动计算预算和节奏策略）
- 获取行程详情和当前状态
- Schedule 读写（算法视图和数据库视图转换）

### 地点查询与推荐
- 附近地点查询（基于 PostGIS）
- 关键词搜索和自动补全
- 酒店推荐（综合隐形成本）
- 路线难度计算

### 路线优化
- 节奏感算法优化（4维平衡算法）
- 支持多种场景（标准、带老人/小孩、快节奏）

### 规划策略（What-If）
- 稳健度评估
- 候选方案生成和评估
- 拆分接口支持分段 loading

### 语音与视觉
- 语音转写（ASR）
- 文字转语音（TTS）
- 拍照识别 POI 推荐

### 其他功能
- 交通规划（智能推荐）
- 价格估算（机票、酒店）
- 国家档案（货币、支付、签证信息）
- 操作历史和撤销

## API 接口文档

详细的 API 接口文档请查看：
- [API 接口文档 - 前端使用指南](./docs/API-接口文档-前端使用指南.md)
- [项目结构说明](./docs/项目结构说明.md)

## 数据模型

主要数据模型：
- `Place`: 地点（景点、餐厅、酒店等）
- `Trip`: 行程
- `TripDay`: 行程日期
- `ItineraryItem`: 行程项
- `City`: 城市
- `CountryProfile`: 国家档案

详细说明请查看 [数据模型边界说明](./docs/API-接口文档-前端使用指南.md#12-数据模型边界说明)

## 开发脚本

```bash
# 数据导入
npm run import:cities        # 导入城市数据
npm run import:airports      # 导入机场数据
npm run import:nature-poi    # 导入自然 POI

# 数据爬取
npm run scrape:alltrails     # 爬取 AllTrails 数据
npm run scrape:mafengwo     # 爬取马蜂窝景点数据

# 数据更新
npm run enrich:amap          # 从高德地图丰富景点信息
npm run update:alltrails:elevation  # 更新高程数据

# 测试
npm run test:optimize        # 测试路线优化 API
```

## 问题排查

**端口冲突：**
```bash
lsof -ti:3000 | xargs kill -9    # 清理 3000 端口
```

**清理并重装依赖：**
```bash
rm -rf node_modules dist
npm install
```

## 许可证

MIT
