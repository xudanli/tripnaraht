# Neptune 空间替换算法（生产级实现）

## 概述

Neptune 的空间替换算法已设计成"能上生产的东西"，而不是简单的"换个点就行了"。

## Neptune 的职责边界（法律）

### Neptune 只能做三件事

1. **换入口 / 换节点 / 换局部走廊（REPLACE）**
2. **保持 RouteDirection 不变**
3. **永远不突破硬约束（Abu 的法律）**

### 不能做的事

- ❌ 不能把"冰岛高地 F 路探险"换成"环岛一号公路"
- ❌ 不能帮用户偷偷忽略封路 / 禁止入内
- ❌ 不能在没有 DEM / 无证据的地方瞎修

**Neptune 是"路线哲学的守护者 + 空间补丁的作者"。**

## Neptune 解决的具体问题

Neptune 要处理的典型场景：

1. **F-Road / 山路封闭**（季节/暴雨/雪）
2. **某个 POI 暂时关闭/施工/危险**
3. **渡轮停运、桥梁关闭**
4. **高风险区域**（雪崩带、泥石流带）被标记不可通行

**但：RouteDirection 不变。**

例如：
- 冰岛高地"从内陆穿过到南岸"这件事还成立，只是不能从原入口进了
- 瑞士高阿尔卑斯"山口串联山村"这件事还成立，只是某一段翻不过去

## 算法整体 Pipeline 设计

### 输入

```typescript
interface NeptuneInput {
  world: WorldModelContext;
  plan: RoutePlanDraft;
  spatialIssues: SpatialIssue[];
  routeDirection: RouteDirection;
}
```

### 输出

- 更新后的 plan（只做 REPLACE，不改 RD）
- 一组 Neptune 的 DecisionLog

### 高层流程

1. **收集所有 spatialIssues**
2. **分类处理**：
   - 入口问题 → 入口替换
   - 单点问题 → POI 替换
   - 路段问题 → 局部走廊重选
3. **每个问题**：
   - 在相同 corridor / region 内找候选
   - 用评分函数排序
   - 选 Top1 / TopK
   - 写入 updatedPlan + 产生 Neptune 日志

## 核心：候选点搜索 & 评分逻辑

### 候选 POI / 入口搜索（PostGIS 视角）

**目标：**
在同一个 RouteDirection 的走廊内，找到：
- 同类型/同标签的点
- 距离原点不太远
- DEM 梯度不要让 Dr.Dre 崩溃
- 满足基本开放条件（openingHours / access）

**PostGIS SQL 查询：**

```sql
SELECT
  p.id,
  p.lat,
  p.lng,
  p.type,
  p.tags,
  p.popularity,
  ST_Distance(p.geom::geography, ST_GeogFromText($1)) AS dist_m,
  ST_LineLocatePoint(
    ST_GeomFromText($2, 4326),
    p.geom
  ) AS corridor_t
FROM poi_canonical p
WHERE
  p.country_code = $3
  AND p.type = $4
  AND ST_DWithin(
    p.geom::geography,
    ST_GeomFromText($2, 4326)::geography,
    $5
  )
ORDER BY dist_m ASC
LIMIT 100;
```

### 评分函数设计

我们希望选出的替代点：
- 像原来的点（功能与体验）
- 不破坏节奏（距离 / DEM / 天数）
- 仍在同一条"故事线"上

**综合得分函数：**

```typescript
function scoreReplacement(
  original: ReplacementCandidate,
  cand: ReplacementCandidate,
  routeDirection: RouteDirection,
): number {
  const tagScore = jaccard(original.tags, cand.tags); // 0-1
  const distScore = Math.exp(-cand.distM / 20000);    // 20km 衰减
  const demScore =
    cand.demDeltaM <= 0
      ? 1  // 更低或相似 → 安全
      : Math.exp(-cand.demDeltaM / 300); // 高太多扣分

  const corridorScore =
    1 - Math.abs(cand.corridorT - original.corridorT); // 在走廊同一段越近越好

  const popularityScore = cand.popularity; // 0-1

  // 可以根据 RouteDirection 的哲学微调权重
  return (
    0.30 * tagScore +
    0.20 * distScore +
    0.20 * demScore +
    0.20 * corridorScore +
    0.10 * popularityScore
  );
}
```

**对于"哲学严格"的 RD**（比如 F 路穿越），tagScore 和 corridorScore 权重更高。

## 三类典型替换场景设计

### 1. 入口替换（ENTRY_UNREACHABLE）

**目标：**
入口不可达时，找到"同一条长线的另一个入口"。

**步骤：**
1. 找出 Entrance POI 的 corridor_t
2. 在 corridor 上，往前/后一定范围（比如 ±0.2）找同类入口点
3. 使用评分函数选 Top1
4. 调整 plan 的 Day1/起点相关 segment

### 2. 单个 POI 替换（POI_UNAVAILABLE）

**目标：**
封一个点，补一个"同功能"的点。

**逻辑：**
- 通常不改变天数
- 不改变大致节奏（同日距离 & 爬升）
- 加一个节奏约束：变化不超过 20%

### 3. 局部走廊替换（SEGMENT_BLOCKED / HAZARD_ZONE）

**思路：**
1. corridor 视为一条主线（LINESTRING）
2. 被封区间"切掉"
3. 在缓冲区内寻找一条"绕行子走廊"

**简化方案（第一版）：**
- 找到被封 segment 位置的 corridor_t 范围 [tStart, tEnd]
- 在该区间附近（例如 ±0.1）的 POI / 路段中寻找可替代路网
- 用现有路网计算一条距离短 / 坡度温和 / 不进入 hazardZone 的折线路径
- 把原 segment 替换为 2–3 段新 segment

## NeptuneStrategy 实现骨架

### 核心方法

1. **`evaluate(world, plan)`** - 主入口
2. **`detectSpatialIssues(world, plan)`** - 检测空间问题
3. **`handleIssue(issue, world, plan, routeDirection)`** - 处理单个问题
4. **`applyReplacement(plan, operation)`** - 应用替换操作

### 替换操作类型

- `ENTRY_REPLACEMENT` - 入口替换
- `POI_REPLACEMENT` - POI 替换
- `SEGMENT_REPLACEMENT` - 路段替换

## Neptune 输出的"解释话术"模板

给用户看的解释可以直接由 `describeReplacement` 生成，例如：

- 「原计划入口因道路封闭不可达，已为你在同一走廊内选择海拔更低、设施更完善的入口，路线方向与体验类型保持不变。」
- 「原计划观景点因施工关闭，已替换为同一山脊线上的另一处观景点，步行距离变化 < 1km。」
- 「原计划跨越的山谷存在雪崩风险，已为你在同一走廊内选择一条绕行路径，整体天数不变。」

## 文件结构

```
src/trips/decision/
├── interfaces/
│   ├── spatial-issue.interface.ts          # 空间问题接口
│   └── replacement-candidate.interface.ts  # 替代候选点接口
├── services/
│   └── spatial-replacement.service.ts      # 空间替换核心算法
└── strategies/
    └── neptune-strategy.service.ts         # Neptune 策略实现
```

## 一句话总结

**Neptune 的任务不是"让计划完成"，而是在不背叛路线哲学的前提下，为现实世界的封闭与风险打一块空间补丁。**

## 相关文档

- [Strategy Contract System](./STRATEGY_CONTRACT_SYSTEM.md)
- [Decision Log System](./DECISION_LOG_SYSTEM.md)

