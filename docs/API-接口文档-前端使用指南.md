# API 接口文档 - 前端使用指南

本文档列出所有 API 接口，按用户场景分类，并说明前端如何使用。

## 📋 目录

1. [行程管理](#行程管理)
2. [地点查询与推荐](#地点查询与推荐)
3. [路线优化](#路线优化)
4. [交通规划](#交通规划)
5. [价格估算](#价格估算)
6. [国家档案](#国家档案)
7. [规划策略（What-If）](#规划策略what-if)
8. [系统状态](#系统状态)
9. [语音与视觉](#语音与视觉)
10. [行程动作执行](#行程动作执行)
11. [行程项管理](#行程项管理)
12. [数据模型边界说明](#数据模型边界说明)
13. [LLM 智能服务](#13-llm-智能服务)
14. [徒步路线（Trail）](#14-徒步路线trail)
15. [旅行准备度检查（Readiness）](#15-旅行准备度检查readiness)

---

## 1. 行程管理

### 1.1 创建行程
**接口**: `POST /trips`

**使用场景**:
- **场景 1**: 用户首次创建行程，填写目的地、日期、预算、旅行者信息
- **场景 2**: 系统自动计算预算切分（每日预算、酒店档次推荐）
- **场景 3**: 系统自动计算节奏策略（根据旅行者体力、地形限制）
- **场景 4**: 创建成功后跳转到行程详情页

**请求示例**:
```typescript
const response = await fetch('http://localhost:3000/trips', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    destination: 'JP', // 国家代码
    startDate: '2024-05-01T00:00:00.000Z',
    endDate: '2024-05-05T00:00:00.000Z',
    budgetConfig: {
      total: 20000,
      currency: 'CNY',
    },
    pacingConfig: {
      mobilityProfile: 'STAMINA_60_TERRAIN_NO_STAIRS',
    },
  }),
});
```

**返回内容**:
- 自动计算预算切分（每日预算、酒店档次推荐）
- 自动计算节奏策略（体力限制、地形限制）
- 返回行程 ID 和配置信息

**前端使用**:
- 创建行程后，保存 `tripId` 用于后续操作
- 显示系统推荐的酒店档次和节奏建议

---

### 1.2 获取所有行程
**接口**: `GET /trips`

**使用场景**:
- **场景 1**: 应用首页显示所有行程列表
- **场景 2**: 行程管理页面，显示所有历史行程
- **场景 3**: 快速浏览多个行程的基本信息
- **场景 4**: 支持按创建时间、目的地等排序和筛选

**前端使用**:
```typescript
const trips = await fetch('http://localhost:3000/trips').then(r => r.json());
// 显示行程列表
```

---

### 1.3 获取行程详情（全景视图）
**接口**: `GET /trips/:id`

**使用场景**:
- **场景 1**: 点击行程卡片进入详情页，显示完整行程信息
- **场景 2**: 时间轴视图，展示所有日期和活动
- **场景 3**: 行程统计页面，显示总天数、总活动数、行程状态
- **场景 4**: 导出行程 PDF/分享行程时获取完整数据
- **场景 5**: 行程编辑页面，加载现有行程数据

**返回内容**:
- 所有 TripDay（按日期排序）
- 每个 Day 下的所有 ItineraryItem（按时间排序）
- 每个 Item 关联的 Place 详情
- 统计信息（总天数、总活动数、行程状态等）

**前端使用**:
```typescript
const trip = await fetch(`http://localhost:3000/trips/${tripId}`).then(r => r.json());
// 渲染行程时间轴视图
// trip.days 包含所有日期和活动
```

**注意**: 此接口返回的是**数据库视图**（Trip/TripDay/ItineraryItem），不是算法视图（Schedule）。如果需要算法视图，请使用 `GET /trips/:id/schedule`。

---

### 1.4 获取行程当前状态
**接口**: `GET /trips/:id/state?now=ISO`

**使用场景**:
- **场景 1**: 语音助手问"下一站是哪里？"，需要知道当前进行到哪一项
- **场景 2**: 行程进行中页面，显示"当前活动"和"下一站"按钮
- **场景 3**: 导航模式，实时显示当前位置和下一个目的地
- **场景 4**: 推送通知，提醒用户"下一站即将开始"
- **场景 5**: 自动判断行程进度（规划中/进行中/已完成）

**请求示例**:
```typescript
const response = await fetch(
  `http://localhost:3000/trips/${tripId}/state?now=2024-05-01T10:30:00.000Z`
).then(r => r.json());
// 返回格式：{ success: true, data: { currentDayId, currentItemId, nextStop, timezone, now } }
```

**返回内容**:
- `currentDayId`: 当前日期 ID
- `currentItemId`: 当前行程项 ID
- `nextStop`: 下一站信息（itemId, placeId, placeName, startTime, estimatedArrivalTime）
- `timezone`: 时区
- `now`: 当前时间（ISO 格式）

**前端使用**:
- `/voice/parse` 和 `QUERY_NEXT_STOP` 可以依赖此接口，不需要前端自己推断
- 显示"下一站"按钮时调用

---

### 1.5 获取指定日期的 Schedule
**接口**: `GET /trips/:id/schedule?date=YYYY-MM-DD`

**使用场景**:
- **场景 1**: 路线优化前，获取当天的算法视图 Schedule
- **场景 2**: What-If 评估前，加载当天的行程计划
- **场景 3**: 执行行程动作前，获取当前的 Schedule
- **场景 4**: 编辑单日行程时，加载算法视图进行修改
- **场景 5**: 检查某一天是否有已保存的 Schedule（persisted 字段）

**请求示例**:
```typescript
const response = await fetch(
  `http://localhost:3000/trips/${tripId}/schedule?date=2024-05-01`
).then(r => r.json());
// 返回格式：{ success: true, data: { date, schedule: DayScheduleResult | null, persisted } }
```

**返回内容**:
- `date`: 日期（YYYY-MM-DD）
- `schedule`: DayScheduleResult 格式的行程计划（如果存在）
- `persisted`: 是否已保存到数据库

**前端使用**:
- 获取算法视图的 Schedule
- 如果 `schedule` 为 `null`，表示该日期还没有 Schedule

**注意**: 此接口返回的是**算法视图**（DayScheduleResult），不是数据库视图。如果需要数据库视图，请使用 `GET /trips/:id`。

---

### 1.6 保存指定日期的 Schedule
**接口**: `PUT /trips/:id/schedule?date=YYYY-MM-DD`

**使用场景**: 保存 apply-action、what-if apply 后的新 schedule

**请求示例**:
```typescript
const response = await fetch(
  `http://localhost:3000/trips/${tripId}/schedule?date=2024-05-01`,
  {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schedule: dayScheduleResult, // DayScheduleResult 格式
    }),
  }
).then(r => r.json());
// 返回格式：{ success: true, data: { date, schedule, persisted: true } }
```

**前端使用**:
- 在 apply-action 或 what-if apply 后调用
- 将算法视图的 Schedule 转换为数据库视图（ItineraryItem）并保存

**注意**: 此接口接收的是**算法视图**（DayScheduleResult），会自动转换为数据库视图保存。

---

### 1.7 获取操作历史
**接口**: `GET /trips/:id/actions?date=YYYY-MM-DD`

**使用场景**: 获取行程的操作历史记录，用于审计回放和撤销功能

**请求示例**:
```typescript
const response = await fetch(
  `http://localhost:3000/trips/${tripId}/actions?date=2024-05-01`
).then(r => r.json());
// 返回格式：{ success: true, data: [action1, action2, ...] }
```

**返回内容**:
- 操作历史列表（包含 actionType, action, scheduleBefore, scheduleAfter, timestamp 等）

**前端使用**:
- 显示操作历史时间轴
- 用于撤销/重做功能

---

### 1.8 撤销操作
**接口**: `POST /trips/:id/actions/undo`

**使用场景**:
- **场景 1**: 用户误操作后，点击"撤销"按钮恢复
- **场景 2**: 测试不同方案时，快速回退到上一个版本
- **场景 3**: 编辑过程中，临时撤销查看效果
- **场景 4**: 多步撤销，连续点击撤销按钮

**请求示例**:
```typescript
const response = await fetch(
  `http://localhost:3000/trips/${tripId}/actions/undo`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: '2024-05-01',
    }),
  }
).then(r => r.json());
// 返回格式：{ success: true, data: { schedule: DayScheduleResult } }
```

**前端使用**:
- 用户点击"撤销"按钮时调用
- 获取撤销后的 Schedule，然后调用 `PUT /trips/:id/schedule` 保存

---

### 1.9 重做操作
**接口**: `POST /trips/:id/actions/redo`

**使用场景**: 重做最后一次撤销的操作，返回操作后的 Schedule

**请求示例**:
```typescript
const response = await fetch(
  `http://localhost:3000/trips/${tripId}/actions/redo`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: '2024-05-01',
    }),
  }
).then(r => r.json());
// 返回格式：{ success: true, data: { schedule: DayScheduleResult } }
```

**前端使用**:
- 用户点击"重做"按钮时调用
- 获取重做后的 Schedule，然后调用 `PUT /trips/:id/schedule` 保存

---

### 1.10 生成行程复盘报告
**接口**: `GET /trips/:id/recap`

**使用场景**:
- **场景 1**: 行程结束后，生成包含景点打卡顺序、徒步总里程、海拔变化等数据的完整复盘报告
- **场景 2**: 分享行程前，生成可分享的复盘报告
- **场景 3**: 查看行程统计信息（总里程、总爬升、总下降等）

**请求示例**:
```typescript
const recap = await fetch(`http://localhost:3000/trips/${tripId}/recap`).then(r => r.json());
// 返回格式：{ success: true, data: { trip, summary, places, trails, statistics } }
```

**返回内容**:
- `trip`: 行程基本信息
- `summary`: 行程总结（总天数、总活动数等）
- `places`: 景点列表（按访问顺序）
- `trails`: 徒步路线列表（包含距离、爬升、下降等）
- `statistics`: 统计信息（总里程、总爬升、总下降等）

**前端使用**:
- 显示行程复盘报告页面
- 展示景点打卡顺序和徒步数据
- 用于生成可分享的行程报告

---

### 1.11 导出行程复盘报告
**接口**: `GET /trips/:id/recap/export`

**使用场景**:
- **场景 1**: 导出为可分享的格式（JSON/PDF等）
- **场景 2**: 分享行程到社区
- **场景 3**: 保存行程记录

**请求示例**:
```typescript
const exportData = await fetch(`http://localhost:3000/trips/${tripId}/recap/export`).then(r => r.json());
// 返回格式：{ success: true, data: { ... } }
```

**前端使用**:
- 导出为可分享的格式
- 用于社区分享功能

---

### 1.12 生成3D轨迹视频数据
**接口**: `GET /trips/:id/trail-video-data`

**使用场景**:
- **场景 1**: 生成3D轨迹视频，展示行程中的徒步路线
- **场景 2**: 可视化行程轨迹，包含海拔变化
- **场景 3**: 分享行程时，生成动态轨迹视频

**请求示例**:
```typescript
const videoData = await fetch(`http://localhost:3000/trips/${tripId}/trail-video-data`).then(r => r.json());
// 返回格式：{ success: true, data: { trails: [{ gpxPoints, waypoints, ... }] } }
```

**返回内容**:
- `trails`: 轨迹数据列表，每个包含 GPX 点、途经点、海拔信息等

**前端使用**:
- 使用返回的轨迹数据生成3D视频
- 展示行程中的徒步路线可视化

---

### 1.13 根据分享令牌获取行程
**接口**: `GET /trips/shared/:shareToken`

**使用场景**:
- **场景 1**: 用户点击分享链接，预览分享的行程
- **场景 2**: 查看分享行程的完整信息（包括Trail数据）
- **场景 3**: 导入前预览行程内容

**请求示例**:
```typescript
const tripData = await fetch(`http://localhost:3000/trips/shared/${shareToken}`).then(r => r.json());
// 返回格式：{ success: true, data: { trip, days, items, trails, ... } }
```

**返回内容**:
- 完整的行程数据，包括所有Trail信息、行程项、景点等

**前端使用**:
- 显示分享行程的预览页面
- 展示行程的完整信息供用户查看

---

### 1.14 导入分享的行程
**接口**: `POST /trips/shared/:shareToken/import`

**使用场景**:
- **场景 1**: 从分享链接导入行程，创建新的行程副本
- **场景 2**: 复用其他用户的行程规划（包括Trail数据）
- **场景 3**: 社区分享功能，一键导入行程

**请求示例**:
```typescript
const result = await fetch(`http://localhost:3000/trips/shared/${shareToken}/import`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    destination: '武功山',
    startDate: '2024-05-01',
    endDate: '2024-05-03',
    userId: 'user123', // 可选
  }),
}).then(r => r.json());
// 返回格式：{ success: true, data: { tripId, ... } }
```

**返回内容**:
- `tripId`: 新创建的行程ID
- 其他导入结果信息

**前端使用**:
- 一键导入分享的行程
- 创建新的行程副本，用户可以在此基础上修改

**注意**: 导入时会完整复制所有行程项、Trail关联、GPX数据等。

---

## 2. 地点查询与推荐

### 2.1 获取地点详情
**接口**: `GET /places/:id`

**使用场景**:
- **场景 1**: 点击时间轴上的地点，显示详情页（营业时间、地址、评分、图片）
- **场景 2**: 搜索列表点击地点，查看完整信息
- **场景 3**: 加入行程前的确认弹窗，显示营业时间、门票价格等
- **场景 4**: 地图上点击标记，显示地点信息卡片
- **场景 5**: 分享地点时，获取完整信息

**请求示例**:
```typescript
const response = await fetch('http://localhost:3000/places/1').then(r => r.json());
// 返回格式：{ success: true, data: { id, nameCN, nameEN, category, location, metadata, ... } }
```

**返回内容**:
- 完整的地点信息（包括元数据、物理元数据、营业状态等）
- 关联的城市信息
- 坐标信息

**前端使用**:
- 显示地点详情页
- 在时间轴上显示地点信息
- 加入行程前的确认弹窗

---

### 2.2 批量获取地点详情
**接口**: `POST /places/batch`

**使用场景**:
- **场景 1**: 地图上显示多个地点标记，一次性获取所有地点信息
- **场景 2**: 路线优化结果展示，批量获取所有 POI 的详情
- **场景 3**: 行程时间轴渲染，批量加载所有地点的基本信息
- **场景 4**: 导出行程时，批量获取所有地点的完整信息
- **场景 5**: 性能优化，避免多次单独请求

**请求示例**:
```typescript
const response = await fetch('http://localhost:3000/places/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ids: [1, 2, 3, 4, 5],
  }),
}).then(r => r.json());
// 返回格式：{ success: true, data: [place1, place2, ...] }
```

**前端使用**:
- 一次性获取多个地点信息
- 用于地图标记、列表展示等场景

---

### 2.3 关键词搜索地点
**接口**: `GET /places/search`

**使用场景**: 搜索"东京塔/寿司之神/浅草寺"，支持输入法联想

**请求示例**:
```typescript
const response = await fetch(
  `http://localhost:3000/places/search?q=东京塔&lat=35.6762&lng=139.6503&radius=5000&type=ATTRACTION&limit=20`
).then(r => r.json());
// 返回格式：{ success: true, data: [place1, place2, ...] }
```

**参数说明**:
- `q`: 搜索关键词（必填）
- `lat`, `lng`: 纬度、经度（可选，用于距离排序）
- `radius`: 搜索半径（米，可选）
- `type`: 地点类型（可选：RESTAURANT, ATTRACTION, SHOPPING, HOTEL）
- `limit`: 返回数量限制（默认 20）

**前端使用**:
- 搜索框输入关键词后调用
- 支持按类别筛选和距离排序

---

### 2.4 地点名称自动补全
**接口**: `GET /places/autocomplete`

**使用场景**: 搜索框下拉建议

**请求示例**:
```typescript
const response = await fetch(
  `http://localhost:3000/places/autocomplete?q=东京&lat=35.6762&lng=139.6503&limit=10`
).then(r => r.json());
// 返回格式：{ success: true, data: [{ id, name, nameCN, nameEN, category, address }, ...] }
```

**前端使用**:
- 用户输入时实时调用
- 显示下拉建议列表

---

### 2.5 查找附近地点
**接口**: `GET /places/nearby`

**使用场景**:
- **场景 1**: 地图页面，以当前位置为中心显示附近地点
- **场景 2**: 行程进行中，查找附近的餐厅、景点
- **场景 3**: 探索模式，发现周围有趣的地方
- **场景 4**: 按类型筛选（只显示餐厅、只显示景点等）
- **场景 5**: 调整地图范围时，动态加载新区域的地点

**请求示例**:
```typescript
const places = await fetch(
  `http://localhost:3000/places/nearby?lat=35.6762&lng=139.6503&radius=2000&type=ATTRACTION`
).then(r => r.json());
```

**参数说明**:
- `lat`, `lng`: 中心点坐标
- `radius`: 搜索半径（米，默认 2000）
- `type`: 地点类型（可选：RESTAURANT, ATTRACTION, SHOPPING, HOTEL）

**前端使用**:
- 在地图上显示附近地点
- 支持按类型筛选

---

### 2.6 查找附近餐厅
**接口**: `GET /places/nearby/restaurants`

**使用场景**:
- **场景 1**: 午餐/晚餐时间，推荐附近的餐厅
- **场景 2**: 根据用户支付方式（Visa、Alipay 等）筛选餐厅
- **场景 3**: 行程中临时找餐厅，显示距离和评分
- **场景 4**: 根据预算筛选餐厅档次
- **场景 5**: 显示餐厅营业状态，避免白跑一趟

**请求示例**:
```typescript
const restaurants = await fetch(
  `http://localhost:3000/places/nearby/restaurants?lat=35.6762&lng=139.6503&radius=1000&payment=Visa`
).then(r => r.json());
```

**前端使用**:
- 午餐/晚餐时间推荐餐厅
- 根据用户支付方式（Visa、Alipay 等）筛选

---

### 2.7 酒店推荐（综合隐形成本）
**接口**: `POST /places/hotels/recommend`

**使用场景**:
- **场景 1**: 创建行程后，自动推荐合适的酒店
- **场景 2**: 根据已选景点，推荐地理位置最优的酒店
- **场景 3**: 显示总成本（房价 + 交通费 + 时间成本），帮助用户看到隐形成本
- **场景 4**: 根据行程密度自动选择策略（特种兵/大多数人/躺平）
- **场景 5**: 预算规划时，推荐符合预算的酒店档次

**请求示例**:
```typescript
const hotels = await fetch('http://localhost:3000/places/hotels/recommend', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tripId: 'trip-uuid', // 或 attractionIds: [1, 2, 3]
    strategy: 'CENTROID', // CENTROID | HUB | RESORT
    maxBudget: 2000,
    includeHiddenCost: true, // 包含交通费和时间成本
    timeValuePerHour: 50,
  }),
}).then(r => r.json());
```

**策略说明**:
- `CENTROID`: 重心法，适合"特种兵"（找所有景点的地理中心）
- `HUB`: 交通枢纽法，适合"大多数人"（优先选择离地铁站近的）
- `RESORT`: 度假模式，适合"躺平"（牺牲距离换取档次）

**前端使用**:
- 显示酒店列表，包含总成本（房价 + 交通费 + 时间成本）
- 显示推荐理由和隐形成本明细

---

### 2.4 酒店推荐选项（三个区域选项）
**接口**: `POST /places/hotels/recommend-options`

**使用场景**: 提供三个酒店区域选项供用户选择

**返回内容**:
- `CONVENIENT`: 核心方便区（市中心，交通便利，但房间可能较小）
- `COMFORTABLE`: 舒适享受区（房间大，档次高，但距离市区较远）
- `BUDGET`: 极限省钱区（价格极低，但通勤时间较长）

**前端使用**:
- 展示三个选项卡片，每个卡片显示优缺点
- 根据行程密度显示 AI 推荐建议

---

### 2.9 计算路线难度
**接口**: `POST /places/metrics/difficulty`

**使用场景**:
- **场景 1**: 路线规划时，评估路线是否适合用户体力
- **场景 2**: 显示难度警告，避免用户选择超出能力的路线
- **场景 3**: 根据用户 pacingConfig 自动过滤不适合的路线
- **场景 4**: 显示路线详细信息（距离、爬升、坡度）
- **场景 5**: 地图上显示路线难度等级（颜色标识）

**请求示例**:
```typescript
const difficulty = await fetch('http://localhost:3000/places/metrics/difficulty', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'google', // 或 'mapbox'
    origin: '39.9042,116.4074',
    destination: '39.914,116.403',
    profile: 'walking',
    sampleM: 30,
    category: 'ATTRACTION',
    accessType: 'HIKING',
    elevationMeters: 2300,
    includeGeoJson: false,
  }),
}).then(r => r.json());
```

**返回内容**:
- 难度等级：EASY / MODERATE / HARD / EXTREME
- 距离、累计爬升、平均坡度
- 可选返回 GeoJSON 格式的路线数据

**前端使用**:
- 在路线规划时显示难度警告
- 根据用户体力限制（pacingConfig）过滤不适合的路线

---

### 2.10 查找附近的自然 POI
**接口**: `GET /places/nature-poi/nearby`

**使用场景**:
- **场景 1**: 自然风光类行程，推荐附近的自然景点
- **场景 2**: 按子类别筛选（火山、冰川、瀑布、温泉等）
- **场景 3**: 探索目的地时，发现独特的自然景观
- **场景 4**: 户外活动规划，查找适合的徒步路线

**请求示例**:
```typescript
const pois = await fetch(
  `http://localhost:3000/places/nature-poi/nearby?lat=64.1466&lng=-21.9426&radius=5000&subCategory=volcano`
).then(r => r.json());
```

**前端使用**:
- 在自然风光类行程中推荐 POI
- 支持按子类别筛选（volcano, glacier, waterfall 等）

---

## 3. 路线优化

### 3.1 优化路线（节奏感算法）
**接口**: `POST /itinerary-optimization/optimize`

**使用场景**:
- **场景 1**: 用户选择多个地点后，点击"优化路线"按钮
- **场景 2**: 自动调整地点顺序，避免"折返跑"
- **场景 3**: 根据用户节奏（快/标准/慢）优化时间安排
- **场景 4**: 带老人/小孩时，自动调整节奏和休息时间
- **场景 5**: 显示优化后的快乐值和分数详情
- **场景 6**: 在地图上显示优化后的路线和聚类区域
- **场景 7**: 使用 VRPTW 算法，确保地点在营业时间窗内访问

**请求示例**:
```typescript
// 标准优化（模拟退火算法）
const optimized = await fetch('http://localhost:3000/itinerary-optimization/optimize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    placeIds: [1, 2, 3, 4, 5],
    config: {
      date: '2024-05-01',
      startTime: '2024-05-01T09:00:00.000Z',
      endTime: '2024-05-01T18:00:00.000Z',
      pacingFactor: 1.0, // 1.0=标准, 0.7=快节奏, 1.5=慢节奏
      hasChildren: false,
      hasElderly: false,
      lunchWindow: {
        start: '12:00',
        end: '13:30',
      },
      useVRPTW: false, // 使用传统模拟退火算法
    },
  }),
}).then(r => r.json());

// VRPTW 优化（带时间窗约束）
const optimizedVRPTW = await fetch('http://localhost:3000/itinerary-optimization/optimize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    placeIds: [1, 2, 3, 4, 5],
    config: {
      date: '2024-05-01',
      startTime: '2024-05-01T08:00:00+09:00',
      endTime: '2024-05-01T18:00:00+09:00',
      pacingFactor: 1.0,
      hasChildren: false,
      hasElderly: false,
      useVRPTW: true, // 启用 VRPTW 算法
    },
  }),
}).then(r => r.json());
```

**VRPTW 说明**:
- **用途**: 解决时间窗约束问题，确保地点在营业时间内访问
- **适用场景**: 
  - 餐厅有午市/晚市时间限制
  - 景点有营业时间限制
  - 特殊活动有固定时间
- **时间窗设置**: 地点需要设置 `timeWindow` 和 `serviceTime` 字段
- **详细文档**: 参见 [VRPTW 优化指南](./vrptw-optimization-guide.md)

**返回内容**:
- `nodes`: 优化后的地点顺序
- `schedule`: 时间安排（每个地点的开始/结束时间）
- `happinessScore`: 快乐值（评分）
- `scoreBreakdown`: 分数详情（兴趣匹配、距离惩罚、疲劳惩罚等）
- `zones`: 聚类结果（空间分组）

**前端使用**:
- 显示优化后的路线时间轴
- 在地图上显示路线和聚类区域
- 显示快乐值和分数详情
- 如果使用 VRPTW，显示时间窗约束验证结果

---

## 4. 交通规划

### 4.1 规划交通路线（智能推荐）
**接口**: `POST /transport/plan`

**使用场景**:
- **场景 1**: 行程项之间，自动规划交通方式
- **场景 2**: 根据用户画像（行李、老人、天气）智能推荐
- **场景 3**: 显示多个交通选项（步行、公交、打车、高铁等）
- **场景 4**: 显示"痛苦指数"和推荐理由
- **场景 5**: 提供特殊建议（如使用宅急便寄行李）
- **场景 6**: 城市间大交通规划（飞机、高铁、巴士）

**请求示例**:
```typescript
const transport = await fetch('http://localhost:3000/transport/plan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromLat: 35.6762,
    fromLng: 139.6503,
    toLat: 35.6812,
    toLng: 139.7671,
    hasLuggage: false,
    hasElderly: false,
    isRaining: false,
    budgetSensitivity: 'MEDIUM', // LOW | MEDIUM | HIGH
    timeSensitivity: 'MEDIUM',
  }),
}).then(r => r.json());
```

**返回内容**:
- `options`: 交通方式列表（按推荐度排序）
- `recommendationReason`: 推荐理由
- `specialAdvice`: 特殊建议（如使用宅急便寄行李）

**前端使用**:
- 显示多个交通选项（步行、公交、打车、高铁等）
- 根据用户画像（行李、老人、天气）智能排序
- 显示"痛苦指数"和推荐理由

---

## 5. 价格估算

### 5.1 估算机票+签证成本
**接口**: `GET /flight-prices/estimate`

**使用场景**:
- **场景 1**: 创建行程时，自动估算机票和签证费用
- **场景 2**: 预算规划页面，显示大交通成本
- **场景 3**: 支持保守估算（旺季价格）和平均估算
- **场景 4**: 根据出发城市调整估算价格
- **场景 5**: 预算切分时，扣除大交通后计算每日预算

**请求示例**:
```typescript
const price = await fetch(
  `http://localhost:3000/flight-prices/estimate?countryCode=JP&originCity=PEK&useConservative=true`
).then(r => r.json());
```

**返回内容**:
- `totalCost`: 总成本（机票 + 签证）
- `flightPrice`: 机票价格
- `visaCost`: 签证费用

**前端使用**:
- 在行程创建页面显示预算估算
- 支持保守估算（旺季价格）和平均估算

---

### 5.2 估算国内航线价格
**接口**: `GET /flight-prices/domestic/estimate`

**使用场景**:
- **场景 1**: 国内旅行时，估算机票价格
- **场景 2**: 显示不同月份的价格差异
- **场景 3**: 显示不同日期的价格差异（周内因子）
- **场景 4**: 价格对比，帮助用户选择出行日期
- **场景 5**: 显示价格区间（最低价-最高价）

**请求示例**:
```typescript
const price = await fetch(
  `http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=3&dayOfWeek=4`
).then(r => r.json());
```

**返回内容**:
- `estimatedPrice`: 估算价格
- `lowerBound`, `upperBound`: 价格区间
- `monthlyBasePrice`: 月度基准价
- `dayOfWeekFactor`: 周内因子

**前端使用**:
- 显示价格估算和价格区间
- 显示不同日期的价格差异

---

### 5.3 估算酒店价格
**接口**: `GET /hotels/price/estimate`

**使用场景**:
- **场景 1**: 酒店选择页面，显示价格估算
- **场景 2**: 预算规划时，估算住宿成本
- **场景 3**: 显示不同星级的价格对比
- **场景 4**: 根据年份和季度显示价格趋势
- **场景 5**: 可选显示推荐酒店列表

**请求示例**:
```typescript
const price = await fetch(
  `http://localhost:3000/hotels/price/estimate?city=洛阳市&starRating=4&year=2024&quarter=1&includeRecommendations=true`
).then(r => r.json());
```

**返回内容**:
- `estimatedPrice`: 估算价格
- `recommendations`: 推荐酒店列表（可选）

**前端使用**:
- 在酒店选择页面显示价格估算
- 可选显示推荐酒店列表

---

### 5.4 获取城市的所有星级价格选项
**接口**: `GET /hotels/price/city-options`

**使用场景**:
- **场景 1**: 酒店选择页面，显示 1-5 星的价格对比表
- **场景 2**: 帮助用户选择合适档次的酒店
- **场景 3**: 预算规划时，了解不同档次的价格范围
- **场景 4**: 显示价格因子和样本数量，增加可信度

**前端使用**:
- 显示 1-5 星的价格对比表
- 帮助用户选择合适档次的酒店

---

## 6. 国家档案

### 6.1 获取所有国家列表
**接口**: `GET /countries`

**使用场景**:
- **场景 1**: 创建行程时，国家选择器下拉列表
- **场景 2**: 目的地探索页面，显示所有支持的国家
- **场景 3**: 国家筛选功能，按国家查看行程
- **场景 4**: 显示国家基本信息和货币代码

**前端使用**:
- 显示国家列表供用户选择

---

### 6.2 获取国家的货币策略
**接口**: `GET /countries/:countryCode/currency-strategy`

**使用场景**:
- **场景 1**: 行程详情页，显示目的地货币信息
- **场景 2**: 汇率速算工具，快速换算金额
- **场景 3**: 支付建议页面，显示支付方式和注意事项
- **场景 4**: 显示快速对照表（常用金额的汇率对照）
- **场景 5**: 显示支付画像（现金为主/混合/数字化）

**请求示例**:
```typescript
const strategy = await fetch(
  `http://localhost:3000/countries/JP/currency-strategy`
).then(r => r.json());
```

**返回内容**:
- 货币代码、汇率、速算口诀
- 支付画像（现金为主/混合/数字化）
- 支付实用建议（小费、ATM、钱包App等）

**前端使用**:
- 在行程详情页显示货币信息
- 提供汇率速算工具

---

## 7. 规划策略（What-If）

### 7.1 仅评估 base 指标（拆分接口）
**接口**: `POST /planning-policy/robustness/evaluate-day`

**使用场景**:
- **场景 1**: What-If 评估的第一步，快速显示风险指标
- **场景 2**: 分段 loading，先秒出 base 风险，提升用户体验
- **场景 3**: 实时监控行程稳健度，不生成候选方案
- **场景 4**: 显示时间窗口错过概率、完成率等关键指标

**请求示例**:
```typescript
const result = await fetch('http://localhost:3000/planning-policy/robustness/evaluate-day', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    placeIds: [1, 2, 3, 4, 5],
    policy: { ... },
    schedule: { ... },
    dayEndMin: 1200,
    dateISO: '2026-12-25',
    dayOfWeek: 0,
    config: { samples: 300, seed: 42 },
  }),
}).then(r => r.json());
// 返回格式：{ success: true, data: { metrics: RobustnessMetrics, schedule } }
```

**返回内容**:
- `metrics`: 稳健度指标（时间窗口错过概率、完成率等）
- `schedule`: 原计划

**前端使用**:
- 先调用此接口快速显示风险指标
- 然后调用 `generate-candidates` 生成候选方案
- 最后调用 `evaluate-candidates` 评估候选方案

---

### 7.2 只生成候选方案（拆分接口）
**接口**: `POST /planning-policy/what-if/generate-candidates`

**使用场景**:
- **场景 1**: What-If 评估的第二步，生成候选方案列表
- **场景 2**: 分段 loading，显示候选方案标题和描述
- **场景 3**: 用户可以选择要评估的候选方案（节省计算资源）
- **场景 4**: 显示优化建议列表，让用户了解可能的改进方向

**请求示例**:
```typescript
const result = await fetch('http://localhost:3000/planning-policy/what-if/generate-candidates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    metrics: baseMetrics, // 从 evaluate-day 获取
    schedule: currentSchedule,
  }),
}).then(r => r.json());
// 返回格式：{ success: true, data: { candidates, suggestions } }
```

**返回内容**:
- `candidates`: 候选方案列表（不包含评估结果）
- `suggestions`: 优化建议列表

**前端使用**:
- 显示候选方案列表（标题、描述）
- 用户可以选择要评估的候选方案

---

### 7.3 评估候选方案（拆分接口）
**接口**: `POST /planning-policy/what-if/evaluate-candidates`

**使用场景**:
- **场景 1**: What-If 评估的第三步，对候选方案运行 MC 评估
- **场景 2**: 分段 loading，最后显示评估结果和推荐方案
- **场景 3**: 显示候选方案的改善指标（deltaSummary、impactCost）
- **场景 4**: 高亮显示推荐方案（winnerId）
- **场景 5**: 显示风险警告（如有）

**请求示例**:
```typescript
const result = await fetch('http://localhost:3000/planning-policy/what-if/evaluate-candidates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    placeIds: [1, 2, 3, 4, 5],
    policy: { ... },
    schedule: { ... },
    dayEndMin: 1200,
    dateISO: '2026-12-25',
    dayOfWeek: 0,
    config: { samples: 300, seed: 42 },
    suggestions: [ // 必须提供
      { type: 'SHIFT_EARLIER', poiId: 'poi-1', minutes: 35, reason: '入场裕量偏紧' },
    ],
  }),
}).then(r => r.json());
// 返回格式：{ success: true, data: { base, candidates, winnerId, riskWarning } }
```

**返回内容**:
- `base`: 原计划评估结果
- `candidates`: 候选方案评估结果（包含改善指标）
- `winnerId`: 自动推荐的方案 ID
- `riskWarning`: 风险提示（如有）

**前端使用**:
- 显示候选方案的评估结果
- 高亮显示推荐方案
- 显示风险警告（如有）

---

### 7.4 What-If 评估报告（完整接口）
**接口**: `POST /planning-policy/what-if/evaluate`

**使用场景**:
- **场景 1**: 一键评估，一次性完成所有步骤（适合简单场景）
- **场景 2**: 评估行程计划的稳健度，发现潜在风险
- **场景 3**: 生成优化建议，自动推荐最佳方案
- **场景 4**: 显示原计划和候选方案的对比
- **场景 5**: 风险提示，避免行程安排过于紧张

**请求示例**:
```typescript
const report = await fetch('http://localhost:3000/planning-policy/what-if/evaluate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    placeIds: [1, 2, 3, 4, 5], // 推荐：提供 placeIds，系统自动查询
    // 或 poiLookup: { ... }, // 方式2：手动提供 POI 数据
    policy: {
      pacing: {
        hpMax: 100,
        regenRate: 0.3,
        walkSpeedMin: 75,
        forcedRestIntervalMin: 120,
      },
      constraints: {
        maxSingleWalkMin: 30,
        requireWheelchairAccess: false,
        forbidStairs: false,
      },
      weights: {
        tagAffinity: { 'ATTRACTION': 1.0, 'RESTAURANT': 1.2 },
        walkPainPerMin: 0.5,
        overtimePenaltyPerMin: 1.0,
      },
    },
    schedule: {
      stops: [
        {
          kind: 'POI',
          id: 'poi-1',
          name: '景点A',
          startMin: 540,
          endMin: 660,
          lat: 35.6762,
          lng: 139.6503,
        },
      ],
      metrics: {
        totalTravelMin: 120,
        totalWalkMin: 60,
        totalTransfers: 0,
        totalQueueMin: 10,
        overtimeMin: 0,
        hpEnd: 85,
      },
    },
    dayEndMin: 1200,
    dateISO: '2026-12-25',
    dayOfWeek: 0,
    config: {
      samples: 300,
      seed: 42,
    },
    suggestions: [
      {
        type: 'SHIFT_EARLIER',
        poiId: 'poi-1',
        minutes: 35,
        reason: '入场裕量偏紧',
      },
    ],
    budgetStrategy: {
      baseSamples: 300,
      candidateSamples: 300,
      confirmSamples: 600,
    },
  }),
}).then(r => r.json());
```

**返回内容**:
- `base`: 原计划评估结果
- `candidates`: 候选方案列表（2~3 个）
- `winnerId`: 自动推荐的方案 ID
- `riskWarning`: 风险红线提示（如有）

**前端使用**:
- 显示原计划的稳健度指标（时间窗口错过概率、完成率等）
- 展示候选方案及其改善指标
- 高亮显示推荐方案
- 显示风险警告（如有）

---

### 7.5 应用候选方案
**接口**: `POST /planning-policy/what-if/apply`

**使用场景**:
- **场景 1**: 用户查看候选方案后，点击"应用该方案"按钮
- **场景 2**: 将候选方案的 Schedule 应用到行程中
- **场景 3**: 应用后更新行程计划，刷新时间轴视图
- **场景 4**: 应用后需要调用 `PUT /trips/:id/schedule` 保存到数据库

**请求示例**:
```typescript
const newSchedule = await fetch('http://localhost:3000/planning-policy/what-if/apply', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    report: whatIfReport,
    candidateId: 'SHIFT:poi-1:35',
  }),
}).then(r => r.json());
```

**前端使用**:
- 应用后更新行程计划
- 刷新时间轴视图

---

### 7.6 一键复评（确认推荐方案）
**接口**: `POST /planning-policy/what-if/re-evaluate`

**使用场景**:
- **场景 1**: 应用方案后，用更高 samples 复评确认优化效果
- **场景 2**: 最终确认前，获得更稳定的评估结果
- **场景 3**: 显示更详细的评估报告，增加可信度

**前端使用**:
- 显示更稳定的确认结果
- 用于最终确认优化效果

---

## 8. 系统状态

### 8.1 获取系统能力/状态
**接口**: `GET /system/status`

**使用场景**:
- **场景 1**: 应用启动时，检查系统各功能模块的状态
- **场景 2**: 根据 provider 状态显示功能可用性（OCR、POI、ASR、TTS、LLM）
- **场景 3**: 如果某个 provider 不可用，显示提示信息
- **场景 4**: 限流信息，提示用户当前请求频率
- **场景 5**: 功能开关状态，控制功能显示/隐藏

**请求示例**:
```typescript
const response = await fetch('http://localhost:3000/system/status').then(r => r.json());
// 返回格式：{ success: true, data: { ocrProvider, poiProvider, asrProvider, ttsProvider, llmProvider, rateLimit, features } }
```

**返回内容**:
- `ocrProvider`: OCR Provider 状态（mock/google/unavailable）
- `poiProvider`: POI Provider 状态（mock/google/osm/unavailable）
- `asrProvider`: ASR Provider 状态（mock/openai/google/azure/unavailable）
- `ttsProvider`: TTS Provider 状态（mock/openai/google/azure/unavailable）
- `llmProvider`: LLM Provider 状态（mock/openai/anthropic/google/unavailable）
- `rateLimit`: 限流信息
- `features`: 功能开关状态

**前端使用**:
- 应用启动时调用，检查系统能力
- 根据 provider 状态显示功能可用性
- 如果某个 provider 不可用，显示提示信息

---

## 9. 语音与视觉

### 9.1 转写音频文件为文字（ASR）
**接口**: `POST /voice/transcribe`

**使用场景**:
- **场景 1**: 用户录制语音指令，转换为文字
- **场景 2**: 语音助手功能，支持语音输入
- **场景 3**: 驾驶/走路场景，不方便打字时使用
- **场景 4**: 多语言支持，自动识别语言
- **场景 5**: 获取词级时间戳，用于语音同步显示

**请求示例**:
```typescript
const formData = new FormData();
formData.append('audio', audioFile);
formData.append('language', 'zh-CN');
formData.append('format', 'audio/mpeg');

const result = await fetch('http://localhost:3000/voice/transcribe', {
  method: 'POST',
  body: formData,
}).then(r => r.json());
// 返回格式：{ success: true, data: { transcript, words, language, confidence } }
```

**返回内容**:
- `transcript`: 转写文本
- `words`: 词级时间戳（可选）
- `language`: 语言代码
- `confidence`: 置信度（0-1）

**前端使用**:
- 上传音频文件后调用
- 获取 transcript 后调用 `/voice/parse` 解析

**后端可插拔 provider**:
- OpenAI Whisper
- Google Speech-to-Text
- Azure Speech
- Mock（开发和测试）

---

### 9.2 将文字转换为语音（TTS）
**接口**: `POST /voice/speak`

**使用场景**:
- **场景 1**: 语音助手回复，将文字转换为语音播放
- **场景 2**: 驾驶/走路场景，不方便看屏幕时使用
- **场景 3**: 行程提醒，语音播报下一站信息
- **场景 4**: 多语言支持，选择不同语言和声音
- **场景 5**: 离线场景，提前下载语音文件

**请求示例**:
```typescript
const result = await fetch('http://localhost:3000/voice/speak', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: '下一站是东京塔，预计 09:00 到达',
    locale: 'zh-CN',
    voice: 'alloy',
    format: 'mp3',
  }),
}).then(r => r.json());
// 返回格式：{ success: true, data: { audioBuffer, audioUrl, format, duration } }
```

**返回内容**:
- `audioBuffer`: 音频 Buffer（Base64 编码）
- `audioUrl`: 音频 URL（如果返回 URL）
- `format`: 音频格式（mp3, wav, ogg）
- `duration`: 音频时长（秒）

**前端使用**:
- 驾驶/走路场景价值巨大
- 播放语音回复

**后端可插拔 provider**:
- OpenAI TTS
- Google Text-to-Speech
- Azure Speech
- Mock（开发和测试）

---

### 9.3 解析语音文本
**接口**: `POST /voice/parse`

**使用场景**:
- **场景 1**: 用户说"下一站是哪里？"，解析为查询指令
- **场景 2**: 用户说"把东京塔移到上午"，解析为移动动作
- **场景 3**: 用户说"添加浅草寺到行程"，解析为添加动作
- **场景 4**: 信息不足时，显示选择界面让用户确认
- **场景 5**: 信息充足时，直接执行动作

**请求示例**:
```typescript
const result = await fetch('http://localhost:3000/voice/parse', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transcript: '下一站是哪里？',
    schedule: currentSchedule,
  }),
}).then(r => r.json());
// 返回格式：{ success: true, data: { suggestions } }
```

**返回内容**:
- `suggestions`: 动作建议列表
- 每个建议包含 `action`（可执行）或 `clarification`（需要用户选择）

**前端使用**:
- 显示解析结果
- 如果信息充足，直接执行动作
- 如果信息不足，显示选择界面

---

### 9.4 查询 Vision 服务能力
**接口**: `GET /vision/capabilities`

**使用场景**:
- **场景 1**: 上传图片前，检查文件格式和大小是否符合要求
- **场景 2**: 根据建议进行图片压缩，提升上传速度
- **场景 3**: 处理 HEIC 格式（iPhone 照片），转换为支持的格式
- **场景 4**: 显示支持的文件格式列表，避免上传失败

**请求示例**:
```typescript
const response = await fetch('http://localhost:3000/vision/capabilities').then(r => r.json());
// 返回格式：{ success: true, data: { supportedFormats, maxFileSize, supportsHeic, ... } }
```

**返回内容**:
- `supportedFormats`: 支持的文件格式（如 ['image/jpeg', 'image/png', 'image/heic']）
- `maxFileSize`: 最大文件大小（字节）
- `maxFileSizeMB`: 最大文件大小（MB）
- `supportsHeic`: 是否支持 HEIC 格式
- `requiresCompression`: 是否需要前端压缩
- `compressionRecommendation`: 压缩建议
- `supportsExifRotation`: 是否支持 EXIF 旋转

**前端使用**:
- 上传前检查文件格式和大小
- 根据建议进行压缩
- 处理 HEIC 格式（如果需要转换）

---

### 9.5 拍照识别 POI 推荐
**接口**: `POST /vision/poi-recommend`

**使用场景**:
- **场景 1**: 用户看到感兴趣的招牌，拍照识别
- **场景 2**: 看到菜单想找餐厅，拍照识别
- **场景 3**: 显示 OCR 提取的文字（店名、地址等）
- **场景 4**: 显示候选 POI 列表（带距离、评分、营业状态）
- **场景 5**: 提供"加入行程"按钮，一键添加到行程

**请求示例**:
```typescript
const formData = new FormData();
formData.append('image', imageFile);
formData.append('lat', '35.6762');
formData.append('lng', '139.6503');
formData.append('locale', 'zh-CN');

const result = await fetch('http://localhost:3000/vision/poi-recommend', {
  method: 'POST',
  body: formData,
}).then(r => r.json());
// 返回格式：{ success: true, data: { ocrResult, candidates, suggestions } }
```

**返回内容**:
- `ocrResult`: OCR 提取的文字
- `candidates`: POI 候选列表
- `suggestions`: "加入行程"建议

**前端使用**:
- 显示 OCR 结果
- 显示候选 POI 列表（带距离、评分、营业状态）
- 提供"加入行程"按钮

---

## 10. 行程动作执行

### 10.1 预览行程动作（dry-run）
**接口**: `POST /schedule/preview-action`

**使用场景**:
- **场景 1**: 用户点击"移动 POI"按钮前，先预览效果
- **场景 2**: 显示"将东京塔移动到上午，会影响后续 3 个点"的提示
- **场景 3**: 显示差异信息（移动了哪些 stop、新增、删除）
- **场景 4**: 显示警告信息（时间冲突、影响范围等）
- **场景 5**: 用户确认后再执行，避免误操作

**请求示例**:
```typescript
const result = await fetch('http://localhost:3000/schedule/preview-action', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    schedule: currentSchedule,
    action: {
      type: 'MOVE_POI_TO_MORNING',
      poiId: 'poi-1',
    },
  }),
}).then(r => r.json());
// 返回格式：{ success: true, data: { applied: false, canApply, diff, warnings, newSchedule, message } }
```

**返回内容**:
- `applied`: 始终为 `false`（预览模式不实际应用）
- `canApply`: 是否可以应用
- `diff`: 差异信息（移动了哪些 stop、新增、删除）
- `warnings`: 警告信息（时间冲突、影响范围等）
- `newSchedule`: 预览后的行程计划
- `message`: 预览说明

**前端使用**:
- 先调用此接口预览，显示"将东京塔移动到上午，会影响后续 3 个点"
- 用户确认后再调用 `apply-action` 实际执行

---

### 10.2 应用行程动作
**接口**: `POST /schedule/apply-action`

**使用场景**:
- **场景 1**: 执行语音解析后的动作（移动、添加 POI 等）
- **场景 2**: 执行助手建议的动作
- **场景 3**: 查询下一站（QUERY_NEXT_STOP），返回答案不修改 schedule
- **场景 4**: 移动 POI 到上午（MOVE_POI_TO_MORNING）
- **场景 5**: 添加 POI 到行程（ADD_POI_TO_SCHEDULE）
- **场景 6**: 执行后需要调用 `PUT /trips/:id/schedule` 保存到数据库

**请求示例**:
```typescript
const result = await fetch('http://localhost:3000/schedule/apply-action', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    schedule: currentSchedule,
    action: {
      type: 'MOVE_POI_TO_MORNING',
      poiId: 'poi-1',
    },
  }),
}).then(r => r.json());
// 返回格式：{ success: true, data: { applied, newSchedule, answer, message } }
```

**支持的动作**:
- `QUERY_NEXT_STOP`: 查询下一站（返回答案，不修改 schedule）
- `MOVE_POI_TO_MORNING`: 移动 POI 到上午
- `ADD_POI_TO_SCHEDULE`: 添加 POI 到行程

**返回内容**:
- `applied`: 是否修改了 schedule
- `newSchedule`: 修改后的行程计划（applied=true 时）
- `answer`: QUERY_NEXT_STOP 的答案（applied=false 时）

**前端使用**:
- 执行动作后更新行程计划
- 显示操作结果和提示信息
- **重要**: 执行后需要调用 `PUT /trips/:id/schedule` 保存到数据库

---

## 11. 行程项管理

### 11.1 创建行程项
**接口**: `POST /itinerary-items`

**使用场景**:
- **场景 1**: 手动添加活动到行程
- **场景 2**: 添加用餐时间（MEAL_ANCHOR、MEAL_FLOATING）
- **场景 3**: 添加休息时间（REST）
- **场景 4**: 添加交通项（TRANSIT）
- **场景 5**: 系统自动校验营业时间和时间逻辑

**请求示例**:
```typescript
const item = await fetch('http://localhost:3000/itinerary-items', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tripDayId: 'day-uuid',
    placeId: 1,
    type: 'ACTIVITY',
    startTime: '2024-05-01T10:00:00.000Z',
    endTime: '2024-05-01T12:00:00.000Z',
    note: '记得穿和服拍照',
  }),
}).then(r => r.json());
```

**前端使用**:
- 系统会自动校验营业时间和时间逻辑
- 如果校验失败，返回错误信息

---

### 11.2 获取行程项列表
**接口**: `GET /itinerary-items?tripDayId=xxx`

**使用场景**:
- **场景 1**: 显示当天的行程时间轴
- **场景 2**: 获取所有行程项（不指定 tripDayId）
- **场景 3**: 按日期筛选行程项
- **场景 4**: 统计行程项数量（活动、用餐、休息等）

**前端使用**:
- 显示当天的行程时间轴

---

### 11.3 更新行程项
**接口**: `PATCH /itinerary-items/:id`

**使用场景**:
- **场景 1**: 修改活动时间
- **场景 2**: 修改活动地点
- **场景 3**: 添加/修改备注
- **场景 4**: 系统会重新校验营业时间
- **场景 5**: 检查时间冲突

**前端使用**:
- 如果更新了时间，系统会重新校验营业时间

---

### 11.4 删除行程项
**接口**: `DELETE /itinerary-items/:id`

**使用场景**:
- **场景 1**: 用户手动删除不需要的活动
- **场景 2**: 取消已添加的行程项
- **场景 3**: 清理测试数据
- **场景 4**: 批量删除操作

---

## 12. 数据模型边界说明

### 10.1 数据库视图（持久化）

**Trip / TripDay / ItineraryItem** 是数据库中的持久化结构：

- **Trip**: 行程主表，包含行程基本信息（目的地、日期、预算配置、节奏配置等）
- **TripDay**: 行程日期表，每个日期一条记录
- **ItineraryItem**: 行程项表，包含具体的活动、用餐、休息、交通等

**特点**:
- 存储在数据库中，持久化保存
- 通过 `GET /trips/:id` 获取
- 结构固定，包含数据库字段（id, startTime, endTime, type, placeId 等）

**使用场景**:
- 查看完整的行程信息
- 需要关联 Place 详情时
- 需要统计信息时

---

### 10.2 算法视图（内存结构）

**DayScheduleResult / PlannedStop** 是算法使用的内存结构：

- **DayScheduleResult**: 日程排程结果，包含 `stops` 数组和 `metrics` 指标
- **PlannedStop**: 计划站点，包含 POI、休息、用餐等

**特点**:
- 算法生成的结构，用于路线优化、What-If 评估等
- 通过 `GET /trips/:id/schedule` 获取
- 结构灵活，包含算法需要的字段（startMin, endMin, transitIn 等）

**使用场景**:
- 路线优化（`POST /itinerary-optimization/optimize`）
- What-If 评估（`POST /planning-policy/what-if/evaluate`）
- 行程动作执行（`POST /schedule/apply-action`）

---

### 10.3 转换关系

**Schedule → ItineraryItem**:
- 通过 `ScheduleConverterService.saveScheduleToDatabase` 转换
- 将 `DayScheduleResult.stops` 转换为 `ItineraryItem` 并保存到数据库
- 在 `PUT /trips/:id/schedule` 中自动执行

**ItineraryItem → Schedule**:
- 通过 `ScheduleConverterService.loadScheduleFromDatabase` 转换
- 将数据库中的 `ItineraryItem` 转换为 `DayScheduleResult`
- 在 `GET /trips/:id/schedule` 中自动执行

---

### 10.4 接口说明

| 接口 | 返回类型 | 说明 |
|------|---------|------|
| `GET /trips/:id` | 数据库视图 | 返回 Trip + TripDay + ItineraryItem（包含关联的 Place） |
| `GET /trips/:id/schedule` | 算法视图 | 返回 DayScheduleResult（如果存在） |
| `PUT /trips/:id/schedule` | 算法视图 → 数据库视图 | 接收 DayScheduleResult，转换为 ItineraryItem 保存 |
| `POST /itinerary-optimization/optimize` | 算法视图 | 返回 DayScheduleResult |
| `POST /planning-policy/what-if/evaluate` | 算法视图 | 接收和返回 DayScheduleResult |
| `POST /schedule/apply-action` | 算法视图 | 接收和返回 DayScheduleResult |

---

### 10.5 前端使用建议

1. **显示行程列表/详情**: 使用 `GET /trips/:id`（数据库视图）
2. **路线优化/What-If**: 使用 `GET /trips/:id/schedule` 获取算法视图，操作后使用 `PUT /trips/:id/schedule` 保存
3. **执行动作**: 先调用 `POST /schedule/preview-action` 预览，确认后调用 `POST /schedule/apply-action`，最后调用 `PUT /trips/:id/schedule` 保存

**重要**: 
- 不要混淆两种视图
- `stops` 是算法视图的字段，不是数据库字段
- 操作算法视图后，记得保存到数据库

---

## 📝 前端集成建议

### 1. 统一响应格式
**所有接口都返回统一格式**：
```typescript
{
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
```

**错误码**:
- `VALIDATION_ERROR`: 输入数据验证失败
- `NOT_FOUND`: 资源不存在
- `PROVIDER_ERROR`: 外部服务错误（OCR/POI 等）
- `BUSINESS_ERROR`: 业务逻辑错误
- `INTERNAL_ERROR`: 内部服务器错误
- `UNSUPPORTED_ACTION`: 不支持的操作

**前端处理**:
```typescript
const response = await fetch(url).then(r => r.json());
if (response.success) {
  // 使用 response.data
} else {
  // 处理错误：response.error.code, response.error.message
}
```

### 2. 错误处理
**HTTP 状态码**:
- `200`: 成功（即使业务失败，也会返回 200，通过 `success` 字段判断）
- `400`: 输入数据验证失败
- `404`: 资源不存在
- `503`: 服务不可用（API密钥未配置或外部API错误）

**注意**: 所有接口都返回 HTTP 200，实际成功/失败通过响应体中的 `success` 字段判断。

### 3. 数据缓存
- 国家列表、地点数据等可以缓存
- 价格估算结果建议缓存（价格数据相对稳定）

### 4. 加载状态
- 路线优化、What-If 评估等接口可能耗时较长（10-60秒）
- 建议显示加载进度和预计时间

### 5. 用户体验
- 路线优化后，在地图上高亮显示优化后的路线
- What-If 评估结果用可视化图表展示（稳健度指标对比）
- 语音/视觉识别结果提供快速操作按钮

---

## 🔗 Swagger 文档

访问 `http://localhost:3000/api` 查看完整的 Swagger API 文档（包含所有接口的详细说明和示例）。

---

## 13. LLM 智能服务

### 13.1 自然语言转接口参数
**接口**: `POST /llm/natural-language-to-params`

**使用场景**:
- **场景 1**: 调试自然语言解析，查看 LLM 如何理解用户输入
- **场景 2**: 前端需要先解析再确认，而不是直接创建行程
- **场景 3**: 测试不同 LLM 提供商的解析效果

**请求示例**:
```typescript
const response = await fetch('http://localhost:3000/llm/natural-language-to-params', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: '帮我规划带娃去东京5天的行程，预算2万',
    provider: 'openai', // 可选：openai, gemini, deepseek, anthropic
  }),
}).then(r => r.json());
```

**返回内容**:
- `params`: 解析出的参数（destination, startDate, endDate, totalBudget 等）
- `needsClarification`: 是否需要澄清
- `clarificationQuestions`: 澄清问题列表（如果需要）

**前端使用**:
- 显示解析结果供用户确认
- 如果需要澄清，显示澄清问题让用户回答

---

### 13.2 自然语言创建行程
**接口**: `POST /trips/from-natural-language`

**使用场景**:
- **场景 1**: 用户通过语音或文字输入自然语言，直接创建行程
- **场景 2**: 智能助手场景，用户说"帮我规划行程"，系统自动处理
- **场景 3**: 快速创建行程，无需填写表单

**请求示例**:
```typescript
const response = await fetch('http://localhost:3000/trips/from-natural-language', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: '帮我规划带娃去东京5天的行程，预算2万',
    llmProvider: 'openai', // 可选
  }),
}).then(r => r.json());
```

**返回内容**:
- 如果信息充足：返回创建的行程和解析的参数
- 如果信息不足：返回澄清问题和部分参数

**前端使用**:
- 如果 `needsClarification` 为 `true`，显示澄清问题
- 用户回答后，可以重新调用接口或直接使用部分参数创建行程

---

### 13.3 结果人性化转化
**接口**: `POST /llm/humanize-result`

**使用场景**:
- **场景 1**: 路线优化后，将技术化的结果转化为用户易懂的描述
- **场景 2**: What-If 评估后，生成自然语言的评估报告
- **场景 3**: 生成行程攻略文档，将结构化数据转化为流畅的文字

**请求示例**:
```typescript
// 转化路线优化结果
const response = await fetch('http://localhost:3000/llm/humanize-result', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    dataType: 'itinerary_optimization', // itinerary_optimization, what_if_evaluation, trip_schedule, transport_plan
    data: optimizationResult, // 从 /itinerary-optimization/optimize 获取的结果
    provider: 'openai', // 可选
  }),
}).then(r => r.json());
```

**支持的数据类型**:
- `itinerary_optimization`: 路线优化结果
- `what_if_evaluation`: What-If 评估结果
- `trip_schedule`: 行程计划
- `transport_plan`: 交通规划结果

**返回内容**:
- `description`: 自然语言描述

**前端使用**:
- 在结果页面显示人性化的描述
- 生成可分享的行程攻略文档

---

### 13.4 决策支持
**接口**: `POST /llm/decision-support`

**使用场景**:
- **场景 1**: What-If 评估后，获取智能决策建议
- **场景 2**: 行程优化时，获取多方案对比和推荐
- **场景 3**: 风险评估后，获取优化建议

**请求示例**:
```typescript
const response = await fetch('http://localhost:3000/llm/decision-support', {
  method: 'POST',
  headers: { 'Content-Type: application/json' },
  body: JSON.stringify({
    scenario: '评估当前行程的稳健度，并提供优化建议',
    contextData: {
      schedule: currentSchedule,
      riskMetrics: riskMetrics,
    },
    provider: 'openai', // 可选
  }),
}).then(r => r.json());
```

**返回内容**:
- `recommendations`: 推荐建议列表（每个包含 title, description, confidence, reasoning）
- `summary`: 总结

**前端使用**:
- 显示推荐建议卡片
- 根据置信度排序显示
- 提供"应用建议"按钮

---

## 14. 徒步路线（Trail）

### 14.1 创建徒步路线
**接口**: `POST /trails`

**使用场景**:
- **场景 1**: 导入 GPX 文件后创建 Trail 记录
- **场景 2**: 手动创建徒步路线
- **场景 3**: 从其他来源（如 AllTrails）导入路线数据

**请求示例**:
```typescript
const trail = await fetch('http://localhost:3000/trails', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nameCN: '武功山金顶路线',
    nameEN: 'Wugong Mountain Golden Summit Trail',
    description: '从沈子村到金顶的经典路线',
    distanceKm: 12.5,
    elevationGainM: 1800,
    elevationLossM: 200,
    difficultyLevel: 'HARD',
    startPlaceId: 1,
    endPlaceId: 2,
    gpxData: { /* GPX 数据 */ },
    source: 'gpx',
  }),
}).then(r => r.json());
```

**返回内容**:
- 创建的 Trail 记录（包含自动计算的疲劳分数、等效距离等）

**前端使用**:
- 导入 GPX 后创建 Trail
- 手动创建路线时调用

---

### 14.2 查询徒步路线列表
**接口**: `GET /trails`

**使用场景**:
- **场景 1**: 显示所有可用的徒步路线
- **场景 2**: 按地点筛选（起点、终点或途经点）
- **场景 3**: 按难度、距离、来源筛选

**请求示例**:
```typescript
// 查询所有路线
const trails = await fetch('http://localhost:3000/trails').then(r => r.json());

// 按地点筛选
const trails = await fetch('http://localhost:3000/trails?placeId=1').then(r => r.json());

// 按难度和距离筛选
const trails = await fetch('http://localhost:3000/trails?difficulty=MODERATE&minDistance=5&maxDistance=20').then(r => r.json());
```

**参数说明**:
- `placeId`: 关联的Place ID（起点、终点或途经点）
- `difficulty`: 难度等级（EXTREME, HARD, MODERATE, EASY）
- `minDistance`: 最小距离（公里）
- `maxDistance`: 最大距离（公里）
- `source`: 数据来源（alltrails, gpx, manual等）

**前端使用**:
- 显示路线列表页面
- 支持多条件筛选

---

### 14.3 根据ID查询徒步路线
**接口**: `GET /trails/:id`

**使用场景**:
- **场景 1**: 查看路线详情页
- **场景 2**: 获取路线的完整信息（距离、爬升、GPX数据等）
- **场景 3**: 在地图上显示路线轨迹

**请求示例**:
```typescript
const trail = await fetch(`http://localhost:3000/trails/${trailId}`).then(r => r.json());
```

**返回内容**:
- 完整的 Trail 信息（包括关联的起点、终点、途经点、GPX数据等）

**前端使用**:
- 显示路线详情页
- 在地图上绘制路线轨迹

---

### 14.4 更新徒步路线
**接口**: `PATCH /trails/:id`

**使用场景**:
- **场景 1**: 修正路线信息（名称、描述等）
- **场景 2**: 更新路线数据（距离、爬升等）
- **场景 3**: 更新 GPX 数据

**请求示例**:
```typescript
const updated = await fetch(`http://localhost:3000/trails/${trailId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    description: '更新后的描述',
    difficultyLevel: 'MODERATE',
  }),
}).then(r => r.json());
```

---

### 14.5 删除徒步路线
**接口**: `DELETE /trails/:id`

**使用场景**:
- **场景 1**: 删除错误的路线数据
- **场景 2**: 清理测试数据

**注意**: 如果路线已被行程使用，删除会失败。

---

### 14.6 根据多个景点推荐徒步路线
**接口**: `POST /trails/recommend-for-places`

**使用场景**:
- **场景 1**: 用户选择多个景点后，自动推荐能够串联这些景点的徒步路线
- **场景 2**: 优先推荐小众步道而非公路
- **场景 3**: 根据距离、难度筛选合适的路线

**请求示例**:
```typescript
const recommendations = await fetch('http://localhost:3000/trails/recommend-for-places', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    placeIds: [1, 2, 3, 4],
    maxDistance: 30, // 最大距离（公里）
    preferOffRoad: true, // 优先非公路步道
    maxDifficulty: 'HARD', // 最大难度
  }),
}).then(r => r.json());
```

**返回内容**:
- 推荐的 Trail 列表，按匹配度排序

**前端使用**:
- 用户选择景点后自动推荐路线
- 显示推荐理由和路线信息

---

### 14.7 识别Trail沿途的景点
**接口**: `GET /trails/:id/places-along`

**使用场景**:
- **场景 1**: 导入 GPX 轨迹后，自动识别沿途3公里内的景点
- **场景 2**: 推荐用户将沿途景点加入行程
- **场景 3**: 显示路线周边的景点分布

**请求示例**:
```typescript
const places = await fetch(`http://localhost:3000/trails/${trailId}/places-along?radiusKm=3`).then(r => r.json());
```

**参数说明**:
- `radiusKm`: 搜索半径（公里），默认3km

**返回内容**:
- 沿途的景点列表（包含距离、类别等信息）

**前端使用**:
- 导入轨迹后推荐沿途景点
- 显示路线周边的景点分布

---

### 14.8 拆分长徒步路线为多个分段
**接口**: `GET /trails/:id/split-segments`

**使用场景**:
- **场景 1**: 将长路线拆分成适合单日游玩的分段行程
- **场景 2**: 根据用户体力自动拆分
- **场景 3**: 规划多日徒步行程

**请求示例**:
```typescript
const segments = await fetch(`http://localhost:3000/trails/${trailId}/split-segments?maxSegmentLengthKm=15`).then(r => r.json());
```

**参数说明**:
- `maxSegmentLengthKm`: 每段最大长度（公里）

**返回内容**:
- 分段列表，每个分段包含起点、终点、距离、爬升等信息

**前端使用**:
- 显示分段行程规划
- 自动分配到不同的行程日期

---

### 14.9 推荐徒步路线配套服务
**接口**: `GET /trails/:id/support-services`

**使用场景**:
- **场景 1**: 根据路线难度推荐装备租赁或采购
- **场景 2**: 高海拔路线推荐高原反应保险
- **场景 3**: 推荐沿途补给点和应急服务
- **场景 4**: 显示医疗点和避难所位置

**请求示例**:
```typescript
const services = await fetch(`http://localhost:3000/trails/${trailId}/support-services`).then(r => r.json());
```

**返回内容**:
- `equipment`: 装备推荐
- `insurance`: 保险推荐
- `supplies`: 补给点推荐
- `emergency`: 应急服务推荐

**前端使用**:
- 显示配套服务推荐卡片
- 提供装备采购链接
- 显示补给点和应急服务位置

---

### 14.10 检查Trail是否适合用户的体力配置
**接口**: `POST /trails/:id/check-suitability`

**使用场景**:
- **场景 1**: 路线规划时，评估路线是否适合用户体力
- **场景 2**: 显示难度警告，避免用户选择超出能力的路线
- **场景 3**: 根据用户 pacingConfig 自动过滤不适合的路线

**请求示例**:
```typescript
const suitability = await fetch(`http://localhost:3000/trails/${trailId}/check-suitability`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    max_daily_hp: 100, // 每日最大HP上限
    walk_speed_factor: 1.0, // 步行速度系数
    terrain_filter: 'ALL', // 地形限制
  }),
}).then(r => r.json());
```

**返回内容**:
- `suitable`: 是否适合
- `fatigueCost`: 疲劳消耗
- `estimatedDurationHours`: 预计耗时
- `warnings`: 警告信息（如有）

**前端使用**:
- 显示路线适合性评估
- 显示警告信息
- 自动过滤不适合的路线

---

### 14.11 智能路线规划
**接口**: `POST /trails/smart-plan`

**使用场景**:
- **场景 1**: 根据用户体力和偏好，自动规划最优的景点+轨迹组合
- **场景 2**: 系统自动评估每个Trail的适合性
- **场景 3**: 根据体力限制自动拆分到多天
- **场景 4**: 优先推荐匹配度高且适合用户体力的路线

**请求示例**:
```typescript
const plan = await fetch('http://localhost:3000/trails/smart-plan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    placeIds: [1, 2, 3],
    pacingConfig: {
      max_daily_hp: 100,
      walk_speed_factor: 1.0,
      terrain_filter: 'ALL',
    },
    preferences: {
      maxTotalDistanceKm: 30,
      maxSegmentDistanceKm: 15,
      preferredDifficulty: 'MODERATE',
      preferOffRoad: true,
      allowSplit: true,
    },
  }),
}).then(r => r.json());
```

**返回内容**:
- `recommendedTrails`: 推荐的Trail组合
- `assessment`: 总体评估
- `suggestedItinerary`: 建议的行程安排

**前端使用**:
- 一键生成智能路线规划
- 显示推荐的路线组合和行程安排

---

### 14.12 开始实时轨迹追踪
**接口**: `POST /trails/tracking/start`

**使用场景**:
- **场景 1**: 开始追踪用户位置，与计划轨迹对比
- **场景 2**: 实时显示用户位置和计划轨迹的偏差
- **场景 3**: 记录实际行走轨迹

**请求示例**:
```typescript
const session = await fetch('http://localhost:3000/trails/tracking/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    trailId: 1,
    itineraryItemId: 'item-uuid', // 可选
  }),
}).then(r => r.json());
```

**返回内容**:
- `sessionId`: 追踪会话ID，用于后续添加追踪点和结束追踪

**前端使用**:
- 开始追踪时调用
- 保存 `sessionId` 用于后续操作

---

### 14.13 添加追踪点
**接口**: `POST /trails/tracking/:sessionId/point`

**使用场景**:
- **场景 1**: 定期添加当前位置点（如每10秒或每50米）
- **场景 2**: 实时显示与计划轨迹的偏差
- **场景 3**: 更新统计信息（总距离、爬升、速度等）

**请求示例**:
```typescript
const result = await fetch(`http://localhost:3000/trails/tracking/${sessionId}/point`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    latitude: 27.5,
    longitude: 114.2,
    elevation: 1200, // 可选
    accuracy: 10, // 可选，精度（米）
    speed: 1.2, // 可选，速度（米/秒）
  }),
}).then(r => r.json());
```

**返回内容**:
- `deviationMeters`: 与计划轨迹的偏差（米）
- `statistics`: 实时统计信息（总距离、爬升、速度等）

**前端使用**:
- 定期调用（建议每10秒或每50米）
- 显示实时偏差和统计信息

---

### 14.14 结束追踪
**接口**: `POST /trails/tracking/:sessionId/stop`

**使用场景**:
- **场景 1**: 结束追踪会话
- **场景 2**: 获取完整的统计信息
- **场景 3**: 生成追踪报告

**请求示例**:
```typescript
const summary = await fetch(`http://localhost:3000/trails/tracking/${sessionId}/stop`, {
  method: 'POST',
}).then(r => r.json());
```

**返回内容**:
- `totalDistanceKm`: 总距离（公里）
- `totalElevationGainM`: 总爬升（米）
- `averageSpeedKmh`: 平均速度（公里/小时）
- `maxSpeedKmh`: 最大速度（公里/小时）
- `durationMinutes`: 持续时间（分钟）
- `points`: 所有追踪点列表

**前端使用**:
- 结束追踪时调用
- 显示完整的统计信息和追踪报告

---

### 14.15 获取追踪会话
**接口**: `GET /trails/tracking/:sessionId`

**使用场景**:
- **场景 1**: 获取当前追踪会话的状态和统计信息
- **场景 2**: 查看所有轨迹点
- **场景 3**: 恢复追踪会话（如应用重启后）

**请求示例**:
```typescript
const session = await fetch(`http://localhost:3000/trails/tracking/${sessionId}`).then(r => r.json());
```

**返回内容**:
- 完整的追踪会话信息（包括所有轨迹点、实时统计等）

**前端使用**:
- 查看追踪状态
- 在地图上显示已记录的轨迹点

---

## 15. 旅行准备度检查（Readiness）

### 模块概述
旅行准备度检查模块帮助用户在出发前了解目的地需要做的准备工作，包括必须事项（must）、建议事项（should）和可选事项（optional）。系统基于目的地、行程信息和地理特征，智能评估并返回个性化的准备清单。

### 核心功能
- **国家能力包**：5 个通用能力包（高海拔、补给稀疏、季节性道路、许可检查站、应急）
- **国家特定规则**：挪威的 9 个特定规则
- **地理特征增强**：基于河网、山脉、道路、海岸线、POI 等地理数据智能评估
- **智能分类**：自动将准备事项分类为 blocker/must/should/optional

---

### 15.1 检查旅行准备度
**接口**: `POST /readiness/check`

**使用场景**:
- **场景 1**: 用户创建行程后，系统自动检查目的地需要做的准备工作
- **场景 2**: 用户在行程详情页点击"准备清单"，查看个性化准备事项
- **场景 3**: 用户修改行程（如更改季节、活动类型），系统重新评估准备度
- **场景 4**: 用户在出发前一周，系统提醒未完成的 must 事项

**请求示例**:
```typescript
const response = await fetch('http://localhost:3000/readiness/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    destinationId: 'NO-TROMSO', // 目的地ID（格式：国家代码-城市）
    traveler: {
      nationality: 'CN',
      residencyCountry: 'CN',
      tags: ['photography', 'nature'],
      budgetLevel: 'medium',
      riskTolerance: 'medium',
    },
    trip: {
      startDate: '2025-01-15',
      endDate: '2025-01-20',
    },
    itinerary: {
      countries: ['NO'],
      activities: ['aurora', 'photography', 'self_drive'],
      season: 'winter',
    },
    geo: {
      lat: 69.6492, // 可选：目的地坐标
      lng: 18.9553,
      enhanceWithGeo: true, // 是否启用地理特征增强
    },
  }),
});

const result = await response.json();
```

**返回内容**:
```typescript
{
  success: true,
  data: {
    findings: [
      {
        destinationId: 'NO-TROMSO',
        packId: 'capability.seasonal_road',
        packVersion: '1.0.0',
        blockers: [], // 阻止行程的事项（如缺少必要证件）
        must: [
          {
            id: 'rule.norway.ferry_dependent',
            category: 'transport',
            severity: 'high',
            level: 'must',
            message: '行程依赖渡轮。必须提前查询渡轮时刻表，并预留充足时间。',
            tasks: [
              {
                title: '查询渡轮时刻表和预订信息',
                dueOffsetDays: -14,
                tags: ['transport', 'ferry'],
              },
            ],
            askUser: [
              '是否已查询渡轮时刻表？',
              '是否已预订渡轮票？',
            ],
          },
        ],
        should: [
          {
            id: 'rule.norway.winter_mountain_pass',
            category: 'safety_hazards',
            severity: 'medium',
            level: 'should',
            message: '冬季自驾经过山口。建议准备防滑链、冬季轮胎，并查询道路封闭情况。',
            tasks: [
              {
                title: '准备防滑链和冬季轮胎',
                dueOffsetDays: -7,
                tags: ['safety', 'driving'],
              },
            ],
          },
        ],
        optional: [],
        risks: [
          {
            type: 'weather',
            severity: 'medium',
            summary: '冬季天气变化快，可能影响行程',
            mitigations: [
              '关注天气预报',
              '准备备用方案',
            ],
          },
        ],
        missingInfo: [], // 需要用户提供的信息
      },
    ],
    summary: {
      totalBlockers: 0,
      totalMust: 3,
      totalShould: 5,
      totalOptional: 2,
      totalRisks: 2,
    },
  },
}
```

**前端使用**:
- 显示准备清单卡片，按 must/should/optional 分类展示
- 显示任务列表，按截止日期排序（dueOffsetDays 表示出发前 N 天）
- 显示风险提示，用不同颜色标识严重程度
- 提供"标记完成"功能，跟踪准备进度
- 对于 askUser 中的问题，提供交互式问答界面

**注意事项**:
- `destinationId` 格式：`国家代码-城市`（如 `NO-TROMSO`、`IS-REYKJAVIK`）
- `enhanceWithGeo: true` 会启用地理特征增强，提供更准确的评估（需要提供坐标）
- `season` 可选值：`spring`、`summer`、`autumn`、`winter`
- `activities` 常见值：`self_drive`、`hiking`、`aurora`、`photography`、`boat_tour` 等

---

### 15.2 获取能力包列表
**接口**: `GET /readiness/capability-packs`

**使用场景**:
- **场景 1**: 前端展示所有可用的能力包，让用户了解系统支持哪些场景
- **场景 2**: 帮助用户理解系统如何评估准备度

**请求示例**:
```typescript
const response = await fetch('http://localhost:3000/readiness/capability-packs');
const result = await response.json();
```

**返回内容**:
```typescript
{
  success: true,
  data: {
    packs: [
      {
        type: 'high_altitude',
        displayName: 'High Altitude Readiness',
        description: '适用于高海拔地区（海拔 > 3000m）',
      },
      {
        type: 'sparse_supply',
        displayName: 'Sparse Supply Readiness',
        description: '适用于补给稀疏、偏远地区',
      },
      {
        type: 'seasonal_road',
        displayName: 'Seasonal Road Readiness',
        description: '适用于季节性封路、山口地区',
      },
      {
        type: 'permit_checkpoint',
        displayName: 'Permit Checkpoint Readiness',
        description: '适用于需要许可或检查站的地区',
      },
      {
        type: 'emergency',
        displayName: 'Emergency Preparedness Readiness',
        description: '适用于偏远、高海拔、长距离无人区',
      },
    ],
  },
}
```

**前端使用**:
- 在准备度检查页面显示能力包说明
- 帮助用户理解系统评估逻辑

---

### 15.3 评估能力包
**接口**: `POST /readiness/capability-packs/evaluate`

**使用场景**:
- **场景 1**: 用户想了解哪些能力包会被触发，用于调试和理解评估逻辑
- **场景 2**: 前端展示评估过程，让用户看到系统如何判断

**请求示例**:
```typescript
const response = await fetch('http://localhost:3000/readiness/capability-packs/evaluate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    destinationId: 'NO-TROMSO',
    traveler: {
      nationality: 'CN',
    },
    trip: {
      startDate: '2025-01-15',
    },
    itinerary: {
      countries: ['NO'],
      activities: ['self_drive'],
      season: 'winter',
    },
    geo: {
      lat: 69.6492,
      lng: 18.9553,
    },
  }),
});

const result = await response.json();
```

**返回内容**:
```typescript
{
  success: true,
  data: {
    total: 5, // 总能力包数
    triggered: 2, // 触发的能力包数
    results: [
      {
        packType: 'seasonal_road',
        triggered: true,
        rules: [
          {
            id: 'rule.seasonal_road.mountain_pass_winter',
            triggered: true,
            level: 'must',
            message: '冬季山口自驾。必须准备防滑链、冬季轮胎，并查询道路封闭情况。',
          },
        ],
        hazards: [
          {
            type: 'weather',
            severity: 'high',
            summary: '冬季山口可能因天气封闭',
            mitigations: [
              '查询道路封闭情况',
              '准备备用路线',
            ],
          },
        ],
      },
      {
        packType: 'emergency',
        triggered: true,
        rules: [
          {
            id: 'rule.emergency.contact',
            triggered: true,
            level: 'must',
            message: '偏远地区必须准备紧急联系方式。',
          },
        ],
        hazards: [],
      },
    ],
  },
}
```

**前端使用**:
- 显示评估结果，展示哪些能力包被触发
- 帮助用户理解系统评估逻辑
- 用于调试和问题排查

---

## 📞 技术支持

如有问题，请查看：
- Swagger 文档：`http://localhost:3000/api`
- LLM 功能测试指南：`docs/LLM功能测试指南.md`
- 项目 README
- 代码注释
