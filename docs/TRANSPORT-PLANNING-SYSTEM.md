# 智能交通规划系统文档

## 概述

智能交通规划系统是一个多模态决策系统，能够根据用户画像、环境因素和场景条件，智能推荐最佳交通方式。系统采用**分层决策**和**加权代价函数**，确保推荐方案既经济又舒适。

## 核心特性

### 1. 分层决策 (Layered Decision Making)

#### 🚅 大交通（城市间）
- **默认推荐**：铁路/高铁（准时、市中心对市中心）
- **预算敏感型**：长途巴士（时间 > 5 小时且是年轻人，推荐夜行巴士）
- **时间敏感型**：飞机（仅当飞行时间 + 安检通勤 < 高铁时间时推荐）

#### 🚕 小交通（市内）
- **步行**：< 1.5km 且天气好且无老人
- **公共交通**：> 1.5km 且无大件行李
- **打车**：有大件行李 OR 有老人 OR 下雨 OR 换乘 > 2 次

### 2. 加权代价函数 (Weighted Cost Function)

**公式：**
```
TotalCost = 金钱成本 + (时间成本 × 时间价值) + 体力惩罚 + 场景惩罚
```

**惩罚项配置：**

| 场景条件 | 交通方式 | 惩罚逻辑 | 解释 |
|---------|---------|---------|------|
| 有大件行李 | 地铁/公交 | +500~1000分 | 拖箱子上下楼梯是地狱体验 |
| 有大件行李 | 打车 | -100~200分 | 奖励打车（Door-to-Door） |
| 下雨 | 步行 | +9999分 | 禁止安排步行超过 300米 |
| 下雨 | 打车 | -200分 | 推荐打车 |
| 有老人 | 地铁（需换乘） | +100分/次 | 换乘意味着迷路和走路 |
| 换酒店日 | 公共交通 | +1000分 | 强制门到门策略 |

### 3. 特殊场景：换酒店日 (Moving Day)

**触发条件：**
- `currentCity != targetCity` 或 `isMovingDay = true`

**强制策略：**
1. **门到门 (Door-to-Door)**：首选 TAXI 到车站 → 大交通 → TAXI 到新酒店
2. **行李寄存建议**：
   - 日本行程：建议使用宅急便（Yamato）将行李直接寄到下一家酒店
   - 其他地区：建议先去酒店存行李，再开始游玩

### 4. 技术优化

#### 短距离优化（< 1km）
- 使用 PostGIS 直接计算距离，不调用外部 API
- 步行速度：80 米/分钟

#### Google Routes API 集成（可选）
- 支持真实路线数据（如果配置了 `GOOGLE_ROUTES_API_KEY`）
- 支持多种交通模式：TRANSIT, WALKING, DRIVING
- 支持偏好设置：LESS_WALKING（适合老人模式）

#### 缓存机制（未来扩展）
- 热门路线缓存（如"成田机场 → 新宿站"）
- 缓存有效期：24 小时
- 减少 API 调用成本

## API 接口

### POST /transport/plan

**请求示例：**

```json
{
  "fromLat": 35.6762,
  "fromLng": 139.6503,
  "toLat": 35.6812,
  "toLng": 139.7671,
  "hasLuggage": false,
  "hasElderly": false,
  "isRaining": false,
  "budgetSensitivity": "MEDIUM",
  "timeSensitivity": "MEDIUM",
  "isMovingDay": false
}
```

**响应示例：**

```json
{
  "options": [
    {
      "mode": "TAXI",
      "durationMinutes": 15,
      "cost": 1200,
      "walkDistance": 0,
      "score": 150,
      "recommendationReason": "适合携带行李、避免淋雨",
      "warnings": []
    },
    {
      "mode": "TRANSIT",
      "durationMinutes": 35,
      "cost": 420,
      "walkDistance": 800,
      "transfers": 1,
      "score": 600,
      "recommendationReason": "经济实惠",
      "warnings": [
        "需要换乘 1 次",
        "需要步行 800 米到车站"
      ]
    }
  ],
  "recommendationReason": "您带着行李，且外面正在下雨，建议打车出行",
  "specialAdvice": [
    "💡 建议使用宅急便（Yamato）将行李直接寄到下一家酒店，今日轻装游玩"
  ]
}
```

## UI 展示建议

### 推荐卡片格式

```
10:00 🏨 移动到下一个景点

推荐：🚕 打车 (优选)
- 原因：您带着老人，且外面正在下雨
- 预估：15分钟 | ¥1200

备选：🚇 地铁
- 警告：需要步行 800米，且换乘 1 次
- 预估：35分钟 | ¥420
```

## 配置说明

### 环境变量

```bash
# Google Routes API Key（可选）
GOOGLE_ROUTES_API_KEY=your_api_key_here
```

如果没有配置 Google Routes API Key，系统会使用估算数据，仍然可以正常工作。

### 时间价值配置

系统默认时间价值：
- **基础值**：1 分钟 = 2 元
- **时间敏感（HIGH）**：1 分钟 = 5 元
- **时间不敏感（LOW）**：1 分钟 = 1 元

## 使用场景示例

### 场景 1：正常市内交通

```json
{
  "fromLat": 35.6762,
  "fromLng": 139.6503,
  "toLat": 35.6812,
  "toLng": 139.7671,
  "hasLuggage": false,
  "hasElderly": false,
  "isRaining": false
}
```

**推荐结果：**
- 如果距离 < 1.5km：步行
- 如果距离 > 1.5km：公共交通

### 场景 2：换酒店日

```json
{
  "fromLat": 34.6937,
  "fromLng": 135.5023,
  "toLat": 35.6762,
  "toLng": 139.6503,
  "hasLuggage": true,
  "isMovingDay": true,
  "currentCity": "OS",
  "targetCity": "TY"
}
```

**推荐结果：**
- 首选：TAXI（门到门）
- 特殊建议：使用宅急便寄行李

### 场景 3：有老人同行 + 下雨

```json
{
  "fromLat": 35.6762,
  "fromLng": 139.6503,
  "toLat": 35.6812,
  "toLng": 139.7671,
  "hasElderly": true,
  "isRaining": true,
  "budgetSensitivity": "LOW"
}
```

**推荐结果：**
- 首选：TAXI（避免淋雨，适合老人）
- 公共交通：被大幅惩罚（步行到车站 + 换乘）

## 算法细节

### 痛苦指数计算流程

1. **基础分**：金钱成本 + 时间成本 × 时间价值
2. **行李惩罚**：根据是否有行李和是否换酒店日调整
3. **老人惩罚**：换乘次数 × 100 + 步行距离 / 10
4. **天气惩罚**：下雨时步行 +9999 分
5. **行动不便惩罚**：步行 +5000 分
6. **预算敏感度调整**：高费用选项额外惩罚
7. **换乘惩罚**：换乘 > 2 次时 +500 分

### 排序规则

- 按 `score`（痛苦指数）从小到大排序
- 分数越低越好
- 第一个选项为最优推荐

## 未来扩展

### 1. 数据库缓存表

可以创建 `RouteCache` 表来存储热门路线：

```prisma
model RouteCache {
  id        Int      @id @default(autoincrement())
  cacheKey  String   @unique
  routeData Json     @db.JsonB
  expiresAt DateTime
  createdAt DateTime @default(now())
  
  @@index([expiresAt])
}
```

### 2. 实时路况集成

- 集成 Google Traffic API
- 根据实时路况调整推荐

### 3. 多语言支持

- 推荐理由和警告信息的多语言版本
- 根据用户语言偏好返回

## 总结

智能交通规划系统通过**分层决策**、**加权代价函数**和**场景感知**，确保推荐的交通方式既经济又舒适。系统特别关注**换酒店日**和**特殊人群**（老人、行动不便）的需求，避免"翻车"体验。

