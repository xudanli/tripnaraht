# 路线优化算法文档（节奏感算法）

## 概述

路线优化算法是一个基于"节奏感"的智能路线规划系统，使用**4 维平衡算法**和**模拟退火算法**，确保用户玩得开心而不是"一直在坐车"。

## 核心策略

### 1. 空间聚类策略：拒绝"折返跑" (Geographical Clustering)

**痛点：** 早上在城东，中午去城西吃饭，下午又回城东。用户会觉得"一直在坐车"。

**算法思路：** DBSCAN / K-Means 聚类 + 区域锁定

**实现：**
- 使用 PostGIS 的 `ST_ClusterDBSCAN` 函数进行空间聚类
- 将物理距离相近的点打包成一个"Zone（游玩区）"
- 规则：同一个半天（上午/下午）的时间块，必须锁定在同一个 Zone 内

**快乐值贡献：** 减少通勤时间产生的焦虑感，增加沉浸感

### 2. 节奏控制策略：心流曲线 (Pacing & Flow)

**痛点：** 连续去三个博物馆，脚断了，脑子也僵了；或者连续三个小时都在走路。

**算法思路：** 强度交替 (Intensity Interleaving) + 罚函数 (Penalty Function)

**罚函数定义：**

| 惩罚类型 | 条件 | 扣分 | 说明 |
|---------|------|------|------|
| 疲劳惩罚 (P_tired) | 连续两个高强度活动 | -50 分 | 避免体力透支 |
| 厌倦惩罚 (P_bored) | 连续两个相同类别 | -30 分 | 避免审美疲劳 |
| 饥饿惩罚 (P_starve) | 12:00-13:30 没有餐厅 | -100 分 | 硬伤，必须避免 |

**快乐值贡献：** 就像一首好歌，有高潮（环球影城）也有低谷（咖啡厅休息）

### 3. 生物钟锚定：饭点优先 (Bio-Clock Anchoring)

**痛点：** 玩得正开心发现 2 点了还没吃饭，周围全是荒地。

**算法思路：** 时间窗约束 (Time Windows)

**实现逻辑：**
1. 先锁定午餐时间窗 (12:00 - 13:30)
2. 以用户偏好的餐厅（或高分餐厅）为圆心，搜索半径 15 分钟步行圈内的景点
3. 逆向规划：既然中午必须在这里，那么上午的最后一个景点，必须在餐厅附近

**快乐值贡献：** 保证用户在饿的时候，美食就在路对面

### 4. 容错与留白：松弛感 (Buffer & Slack)

**痛点：** 哪怕只迟到了 10 分钟，后面所有行程都对不上，用户产生巨大的心理压力。

**算法思路：** 弹性因子 (Elasticity Factor)

**公式：**
```
实际预留 = 地图时间 × 弹性因子 + 15分钟
```

**弹性因子配置：**
- 标准节奏：1.0
- 慢节奏（带小孩/老人）：1.5
- 快节奏（特种兵）：0.7

**快乐值贡献：** 用户可以安心地排队买个冰淇淋，或者在路边拍只猫

## 算法实现

### 模拟退火算法 (Simulated Annealing)

对于这种带有多重复杂约束（软约束）的问题，使用模拟退火算法：

**伪代码：**

```typescript
// 1. 生成初始解
let currentRoute = generateRandomRoute(spots);
let currentScore = calculateHappinessScore(currentRoute);

// 2. 开始退火循环
let temperature = 1000;
while (temperature > 1) {
    // 3. 随机扰动：交换两个景点的位置
    const newRoute = swapTwoSpots(currentRoute);
    const newScore = calculateHappinessScore(newRoute);
    
    // 4. 决定是否接受新路线
    if (newScore > currentScore) {
        currentRoute = newRoute; // 更好，接受
        currentScore = newScore;
    } else {
        // 即使更差，也有概率接受（为了跳出局部最优）
        if (Math.random() < Math.exp((newScore - currentScore) / temperature)) {
            currentRoute = newRoute;
            currentScore = newScore;
        }
    }
    
    // 5. 降温
    temperature *= 0.99;
}
```

**参数配置：**
- 初始温度：1000
- 冷却率：0.99
- 最低温度：1
- 最大迭代次数：10000

## API 接口

### POST /itinerary-optimization/optimize

**请求示例：**

```json
{
  "placeIds": [1, 2, 3, 4, 5],
  "config": {
    "date": "2024-05-01",
    "startTime": "2024-05-01T09:00:00.000Z",
    "endTime": "2024-05-01T18:00:00.000Z",
    "pacingFactor": 1.0,
    "hasChildren": false,
    "hasElderly": false,
    "lunchWindow": {
      "start": "12:00",
      "end": "13:30"
    }
  }
}
```

**响应示例：**

```json
{
  "nodes": [
    {
      "id": 1,
      "name": "浅草寺",
      "category": "ATTRACTION",
      "location": { "lat": 35.7148, "lng": 139.7967 },
      "intensity": "MEDIUM"
    }
  ],
  "schedule": [
    {
      "nodeIndex": 0,
      "startTime": "2024-05-01T09:00:00.000Z",
      "endTime": "2024-05-01T10:30:00.000Z",
      "transportTime": 20
    }
  ],
  "happinessScore": 850,
  "scoreBreakdown": {
    "interestScore": 500,
    "distancePenalty": 50,
    "tiredPenalty": 0,
    "boredPenalty": 0,
    "starvePenalty": 0,
    "clusteringBonus": 100,
    "bufferBonus": 30
  },
  "zones": [
    {
      "id": 0,
      "centroid": { "lat": 35.7148, "lng": 139.7967 },
      "places": [...],
      "radius": 1500
    }
  ]
}
```

## 分数计算详解

### 快乐值公式

```
TotalScore = InterestScore 
           - DistancePenalty 
           - TiredPenalty 
           - BoredPenalty 
           - StarvePenalty 
           + ClusteringBonus 
           + BufferBonus
```

### 各项分数说明

1. **InterestScore（兴趣分）**
   - 基础分：每个地点 100 分
   - 目的：鼓励安排更多地点

2. **DistancePenalty（距离惩罚）**
   - 如果最大单段距离超过平均距离的 2 倍，说明有折返
   - 惩罚：每 100 米折返扣 1 分

3. **TiredPenalty（疲劳惩罚）**
   - 连续两个高强度活动：-50 分
   - 连续三个中等强度活动：-30 分

4. **BoredPenalty（厌倦惩罚）**
   - 连续两个相同类别：-30 分
   - 跳过休息和用餐节点

5. **StarvePenalty（饥饿惩罚）**
   - 午餐时间窗（12:00-13:30）内没有餐厅：-100 分（硬伤）

6. **ClusteringBonus（聚类奖励）**
   - 上午在同一 Zone：+50 分
   - 下午在同一 Zone：+50 分

7. **BufferBonus（留白奖励）**
   - 有足够缓冲时间：+10 分/段
   - 缓冲不足：-20 分/段

## 使用场景

### 场景 1：标准行程

```json
{
  "placeIds": [1, 2, 3, 4, 5],
  "config": {
    "pacingFactor": 1.0,
    "lunchWindow": { "start": "12:00", "end": "13:30" }
  }
}
```

**优化结果：**
- 上午：Zone A 的景点
- 中午：Zone A 的餐厅
- 下午：Zone B 的景点
- 强度交替：高 → 低 → 中

### 场景 2：带老人/小孩

```json
{
  "config": {
    "pacingFactor": 1.5,
    "hasElderly": true,
    "hasChildren": true
  }
}
```

**优化结果：**
- 缓冲时间增加 50%
- 避免高强度活动连续
- 更多休息点

### 场景 3：特种兵模式

```json
{
  "config": {
    "pacingFactor": 0.7
  }
}
```

**优化结果：**
- 缓冲时间减少 30%
- 可以安排更多地点
- 但仍保证强度交替

## 技术细节

### 空间聚类实现

使用 PostGIS 的 `ST_ClusterDBSCAN` 函数：

```sql
SELECT 
  place_id,
  ST_ClusterDBSCAN(
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
    2000,  -- epsilon: 2 公里
    2      -- minPoints: 最少 2 个点
  ) OVER () as cluster_id
FROM place_points
```

### 降级策略

如果 PostGIS 聚类失败，使用简化的 K-Means 聚类：
- 遍历所有点
- 找到距离在 epsilon 内的所有点
- 形成一个 Zone

## 总结

路线优化算法的核心是**"节奏感"**，而不是简单的距离优化。通过空间聚类、节奏控制、生物钟锚定和容错留白，确保用户玩得开心，而不是"一直在坐车"。

**AI 规划师的"良心"：**
1. 先问谁去（老人/特种兵）→ 确定 Pacing Factor
2. 再定吃饭（民以食为天）→ 确定 Anchors
3. 最后连线（景点）→ 使用聚类 + 模拟退火

