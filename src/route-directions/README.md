# 国家级路线方向（Route Directions）模块

## 概述

Route Directions 是一个国家级路线方向资产系统，用于沉淀和管理每个国家的特色路线方向。这些路线方向既能指导行程生成，也能成为 Decision/Readiness 的先验知识，让规划更像"懂行的当地人"。

## 核心概念

### 路线方向（RouteDirection）

路线方向不是简单的标签，而是一套可执行的模板，包含：

- **线路叙事**：路线的描述和主题
- **地理走廊**：可计算的地理区域（regions、corridor_geom）
- **强约束**：海拔/爬升/坡度/许可等结构化约束
- **关键节点**：入口枢纽、必须节点
- **典型节奏**：每日主题、强度上限、休息日要求
- **风险/准备**：高反、封路、渡轮、天气窗口等风险画像

### 路线模板（RouteTemplate）

基于路线方向的具体行程模板，包含：
- 天数（3/5/7/10 天游）
- 每日计划（主题、强度上限、必须节点）
- 默认节奏偏好（RELAX/BALANCED/CHALLENGE）

## 数据结构

### RouteDirection 表

```typescript
{
  id: number;
  uuid: string;
  countryCode: string; // NZ, NP, CN_XZ 等
  name: string; // 路线方向标识（如 NZ_SOUTH_ISLAND_LAKES_AND_PASSES）
  nameCN: string; // 中文名称
  nameEN?: string; // 英文名称
  description?: string; // 路线描述
  tags: string[]; // 标签数组（摄影/徒步/出海等）
  regions: string[]; // region_key 列表
  entryHubs: string[]; // 入口枢纽
  seasonality?: { // 季节性信息
    bestMonths?: number[];
    avoidMonths?: number[];
  };
  constraints?: { // 结构化约束
    maxElevationM?: number;
    maxDailyAscentM?: number;
    maxSlope?: number;
    requiresPermit?: boolean;
    requiresGuide?: boolean;
    rapidAscentForbidden?: boolean;
  };
  riskProfile?: { // 风险画像
    altitudeSickness?: boolean;
    roadClosure?: boolean;
    ferryDependent?: boolean;
    weatherWindow?: boolean;
    weatherWindowMonths?: number[];
  };
  signaturePois?: { // 代表性 POI
    types?: string[];
    examples?: string[];
  };
  itinerarySkeleton?: { // 行程骨架
    dayThemes?: string[];
    dailyPace?: string;
    restDaysRequired?: number[];
  };
  isActive: boolean;
}
```

### RouteTemplate 表

```typescript
{
  id: number;
  uuid: string;
  routeDirectionId: number;
  durationDays: number; // 3/5/7/10
  name?: string;
  nameCN?: string;
  nameEN?: string;
  dayPlans: DayPlan[]; // 每日计划
  defaultPacePreference?: 'RELAX' | 'BALANCED' | 'CHALLENGE';
  isActive: boolean;
}
```

## API 接口

### 创建路线方向

```http
POST /route-directions
Content-Type: application/json

{
  "countryCode": "NZ",
  "name": "NZ_SOUTH_ISLAND_LAKES_AND_PASSES",
  "nameCN": "南岛湖区+山口+徒步",
  "nameEN": "South Island Lakes and Passes",
  "tags": ["徒步", "摄影", "湖区"],
  "regions": ["NZ_QT", "NZ_WN"],
  "entryHubs": ["Queenstown Airport"],
  "seasonality": {
    "bestMonths": [12, 1, 2, 3],
    "avoidMonths": [6, 7, 8]
  },
  "constraints": {
    "maxElevationM": 2000,
    "maxDailyAscentM": 800
  },
  "riskProfile": {
    "roadClosure": true,
    "weatherWindow": true
  }
}
```

### 查询路线方向

```http
GET /route-directions?countryCode=NZ&tag=徒步&month=1
```

### 根据国家获取路线方向（用于 Agent）

```http
GET /route-directions/by-country/NZ?tags=徒步,摄影&month=1&limit=5
```

### 创建路线模板

```http
POST /route-directions/templates
Content-Type: application/json

{
  "routeDirectionId": 1,
  "durationDays": 7,
  "nameCN": "经典7日游",
  "dayPlans": [
    {
      "day": 1,
      "theme": "适应日",
      "maxIntensity": "LIGHT",
      "maxElevationM": 3000,
      "requiredNodes": ["lodge_uuid_1"]
    }
  ],
  "defaultPacePreference": "BALANCED"
}
```

## Agent 集成

RouteDirection 可以作为 Agent 路由的先验候选生成器：

### Step A: 先选方向（Router）

```typescript
// 输入：目的地国家 + 用户偏好 + 季节
const routeDirections = await routeDirectionsService.findRouteDirectionsByCountry(
  'NZ',
  {
    tags: ['徒步', '摄影'],
    month: 1, // 1月
    limit: 3
  }
);
// 输出：Top 3 route_direction（带原因）
```

### Step B: 方向变"硬约束 + 候选池"

```typescript
// 把 constraints 注入 world model（Dr.Dre）
const constraints = routeDirection.constraints;
// 把 risk_profile 注入 readiness（提示清单）
const riskProfile = routeDirection.riskProfile;
// 把 signature_pois 变成候选 POI pool
const candidatePois = routeDirection.signaturePois;
```

### Step C: DEM/POI 去"落地与修复"

- DEM 负责强度/海拔节奏
- Neptune 负责最小改动修复
- Abu 负责风险降级

## 示例数据

已包含以下国家的路线方向示例：

### 新西兰 (NZ)
- `NZ_SOUTH_ISLAND_LAKES_AND_PASSES`: 南岛湖区+山口+徒步
- `NZ_FIORDLAND_MILFORD`: 峡湾出海（米尔福德）
- `NZ_NORTH_ISLAND_VOLCANIC`: 北岛火山地热

### 尼泊尔 (NP)
- `NP_EBC_CLASSIC`: EBC 经典徒步线
- `NP_ANNAPURNA_BASE_CAMP`: 安娜普尔纳大本营
- `NP_CHITWAN_WILDLIFE`: 奇特旺野生动物

### 西藏 (CN_XZ)
- `CN_XZ_LHASA_RING`: 拉萨周边轻量适应
- `CN_XZ_SHIGATSE_CORRIDOR`: 拉萨-羊湖-日喀则走廊
- `CN_XZ_EBC_GATE`: 定日-珠峰入口

## 使用步骤

### 1. 运行数据库迁移

```bash
npm run prisma:migrate
```

### 2. 生成 Prisma Client

```bash
npm run prisma:generate
```

### 3. 导入示例数据（可选）

```bash
ts-node --project tsconfig.backend.json scripts/seed-route-directions.ts
```

### 4. 启动服务

```bash
npm run backend:dev
```

## 扩展新国家

每个新国家只需要产出：

1. **3–8 条 RouteDirection**（国家名片）
2. **每条方向的 corridor（geom）+ regions（OSM seed）**
3. **一套 constraints**（DEM 阈值+合规提醒）
4. **2–3 个 duration 模板**（5/7/10 天游）

就可以用同一套引擎跑起来。

## 相关文件

- 数据模型：`prisma/schema.prisma`（RouteDirection, RouteTemplate）
- 服务层：`src/route-directions/route-directions.service.ts`
- 控制器：`src/route-directions/route-directions.controller.ts`
- DTO：`src/route-directions/dto/`
- 接口：`src/route-directions/interfaces/route-direction.interface.ts`
- 示例数据：`scripts/seed-route-directions.ts`

