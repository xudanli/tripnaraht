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

---

## 1. 行程管理

### 1.1 创建行程
**接口**: `POST /trips`

**使用场景**: 用户创建新行程时调用

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

**使用场景**: 行程列表页面

**前端使用**:
```typescript
const trips = await fetch('http://localhost:3000/trips').then(r => r.json());
// 显示行程列表
```

---

### 1.3 获取行程详情（全景视图）
**接口**: `GET /trips/:id`

**使用场景**: 查看单个行程的完整信息

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

**使用场景**: 语音问"下一站"、按钮操作需要知道当前进行到哪一项

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

**使用场景**: 从数据库读取指定日期的 Schedule（算法视图）

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

**使用场景**: 撤销最后一次操作，返回操作前的 Schedule

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

## 2. 地点查询与推荐

### 2.1 获取地点详情
**接口**: `GET /places/:id`

**使用场景**: 时间轴、地点详情页、加入行程前的确认弹窗（营业时间/门票/地址/图片）

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

**使用场景**: 批量拉取地点信息，避免前端 N 次请求

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

**使用场景**: 地图上显示附近的地点

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

### 2.2 查找附近餐厅
**接口**: `GET /places/nearby/restaurants`

**使用场景**: 查找附近的餐厅，支持按支付方式筛选

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

### 2.3 酒店推荐（综合隐形成本）
**接口**: `POST /places/hotels/recommend`

**使用场景**: 根据行程或景点列表推荐酒店

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

### 2.5 计算路线难度
**接口**: `POST /places/metrics/difficulty`

**使用场景**: 计算两点间路线的难度等级（用于评估是否适合用户）

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

### 2.6 查找附近的自然 POI
**接口**: `GET /places/nature-poi/nearby`

**使用场景**: 查找附近的自然景点（火山、冰川、瀑布等）

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

**使用场景**: 用户选择多个地点后，自动优化路线顺序和时间安排

**请求示例**:
```typescript
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
    },
  }),
}).then(r => r.json());
```

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

---

## 4. 交通规划

### 4.1 规划交通路线（智能推荐）
**接口**: `POST /transport/plan`

**使用场景**: 规划两点间的交通方式

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

**使用场景**: 行程创建时估算大交通成本

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

**使用场景**: 国内旅行时估算机票价格

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

**使用场景**: 估算酒店价格，用于预算规划

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

**使用场景**: 展示不同星级的价格对比

**前端使用**:
- 显示 1-5 星的价格对比表
- 帮助用户选择合适档次的酒店

---

## 6. 国家档案

### 6.1 获取所有国家列表
**接口**: `GET /countries`

**使用场景**: 国家选择器

**前端使用**:
- 显示国家列表供用户选择

---

### 6.2 获取国家的货币策略
**接口**: `GET /countries/:countryCode/currency-strategy`

**使用场景**: 显示目的地的货币和支付信息

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

**使用场景**: 快速评估当前计划的稳健度，不生成候选方案。用于分段 loading，UI 可以先秒出 base 风险。

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

**使用场景**: 根据 base 评估结果生成候选方案，但不运行 MC 评估。用于分段 loading。

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

**使用场景**: 对候选方案运行 MC 评估，返回评估结果。用于分段 loading，UI 可以最后出 winner。

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

**使用场景**: 评估行程计划的稳健度，生成优化建议

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

### 7.2 应用候选方案
**接口**: `POST /planning-policy/what-if/apply`

**使用场景**: 用户点击"应用该方案"按钮

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

### 7.3 一键复评（确认推荐方案）
**接口**: `POST /planning-policy/what-if/re-evaluate`

**使用场景**: 应用方案后，用更高 samples 复评确认

**前端使用**:
- 显示更稳定的确认结果
- 用于最终确认优化效果

---

## 8. 系统状态

### 8.1 获取系统能力/状态
**接口**: `GET /system/status`

**使用场景**: 查询系统各功能模块的状态，用于前端提示"某能力暂不可用"

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

### 8.1 转写音频文件为文字（ASR）
**接口**: `POST /voice/transcribe`

**使用场景**: 将用户录制的音频转换为文字 transcript

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

### 8.2 将文字转换为语音（TTS）
**接口**: `POST /voice/speak`

**使用场景**: 将文字转换为语音，用于语音助手回复

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

### 8.3 解析语音文本
**接口**: `POST /voice/parse`

**使用场景**: 用户通过语音输入指令（需要先调用 transcribe 获取 transcript）

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

### 8.2 查询 Vision 服务能力
**接口**: `GET /vision/capabilities`

**使用场景**: 上传前验证文件是否符合要求，保证稳定

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

### 8.3 拍照识别 POI 推荐
**接口**: `POST /vision/poi-recommend`

**使用场景**: 用户拍照识别招牌/菜单，推荐附近 POI

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

### 9.1 预览行程动作（dry-run）
**接口**: `POST /schedule/preview-action`

**使用场景**: 预览动作执行结果，不实际修改 schedule。避免"一点就乱了"。

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

### 9.2 应用行程动作
**接口**: `POST /schedule/apply-action`

**使用场景**: 执行助手建议的动作（如移动 POI、添加 POI 等）

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

### 10.1 创建行程项
**接口**: `POST /itinerary-items`

**使用场景**: 在指定日期添加行程项（活动、用餐、休息、交通等）

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

### 10.2 获取行程项列表
**接口**: `GET /itinerary-items?tripDayId=xxx`

**使用场景**: 获取指定日期的所有行程项

**前端使用**:
- 显示当天的行程时间轴

---

### 10.3 更新行程项
**接口**: `PATCH /itinerary-items/:id`

**使用场景**: 修改行程项信息

**前端使用**:
- 如果更新了时间，系统会重新校验营业时间

---

### 10.4 删除行程项
**接口**: `DELETE /itinerary-items/:id`

**使用场景**: 删除行程项

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

## 📞 技术支持

如有问题，请查看：
- Swagger 文档：`http://localhost:3000/api`
- 项目 README
- 代码注释
