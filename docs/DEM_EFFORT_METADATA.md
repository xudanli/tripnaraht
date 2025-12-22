# DEM 体力消耗元数据文档

## 概述

基于 DEM 数据计算路线的体力消耗特征，为行程规划提供精确的体力消耗评估和决策支持。

## 核心功能

### DEMEffortMetadataService

提供以下核心功能：

1. **路线体力消耗计算** - 基于 DEM 数据计算路线的完整体力消耗特征
2. **路线对比** - 比较两条路线的消耗差异
3. **关键点检测** - 识别路线中的最高点、最陡坡段、山口/垭口

## 体力消耗元数据

### EffortMetadata 接口

```typescript
interface EffortMetadata {
  totalAscent: number;           // 累计爬升（米）
  totalDescent: number;          // 累计下降（米）
  netElevationGain: number;      // 净爬升（米）
  maxElevation: number;          // 最高海拔（米）
  minElevation: number;          // 最低海拔（米）
  avgElevation: number;          // 平均海拔（米）
  maxSlope: number;              // 最大坡度（百分比）
  avgSlope: number;              // 平均坡度（百分比）
  totalDistance: number;         // 总距离（米）
  effortScore: number;           // 体力消耗评分（0-100）
  difficulty: string;            // 难度等级（easy/moderate/hard/extreme）
  estimatedDuration: number;     // 预计时长（分钟）
  suggestedRestPoints: number;    // 建议休息点数量
  terrainComplexity: number;    // 地形复杂度（0-1）
  elevationProfile?: Array<...>; // 详细海拔剖面（可选）
}
```

## 使用场景

### 场景1：同样10km，消耗完全不同

**问题**：两条同距离路线，一个平缓，一个爬升大，消耗完全不同。

**解决方案**：
- 计算每条路线的 `totalAscent`、`maxSlope`、`effortScore`
- 根据消耗差异调整 `estimatedDuration` 和 `suggestedRestPoints`
- 提供可解释的证据链："因为爬升大，所以..."

**验收标准**：
- ✅ `totalAscent` 明显不同（如 200m vs 1200m）
- ✅ 推荐时长/休息点/补给提醒跟着变化
- ✅ 可解释：展示"因为爬升大，所以…"（证据链）

### 场景2：同一景点不同入口的消耗差异

**问题**：一个景点有多个入口POI，需要选择"更可达/更省力"的入口。

**解决方案**：
- 使用 `compareRoutes()` 对比不同入口路线
- 生成入口对比表：距离 + 爬升 + 预计时长 + 风险提示
- 根据用户偏好推荐最佳入口

**验收标准**：
- ✅ 入口对比表包含完整信息
- ✅ 系统给出推荐入口
- ✅ 支持两种入口对比

### 场景3：海拔上升过快 → 自动插入"适应日"

**问题**：行程从低海拔城市跳到高海拔城市（如 500m → 3600m）并安排高强度活动。

**解决方案**：
- 计算 `maxElevation`、`dailyElevationGain`、`deltaAltitude`
- 如果海拔上升 > 2000m，触发高海拔适应建议
- Dr.Dre 调整顺序：第一天轻量、第二天再上强度

**验收标准**：
- ✅ 输出包含 `maxElevation`、`dailyElevationGain`、`deltaAltitude`
- ✅ Readiness 输出"高海拔适应建议"并带具体数值
- ✅ "替换/降级"动作可追溯（Neptune 的最小改动修复）

### 场景4：路线经过垭口/高点 → 夜间转场自动拦截

**问题**：一天内长距离转场，且路线海拔最高点很高（如 >4000m）并预计在夜间通过。

**解决方案**：
- 使用 `detectKeyPoints()` 检测山口/垭口
- 如果最高点 > 4000m 且预计夜间通过，触发拦截
- Abu：降低当日强度 / 增加 buffer
- Dr.Dre：提前出发或拆分成两天

**验收标准**：
- ✅ 输出明确："因为路线最高点 X m，且预计夜间通过，所以建议…"
- ✅ 系统提供具体建议（提前出发/拆分/增加buffer）

### 场景5：路线优化的"地形成本函数"

**问题**：距离最短路线 ≠ 最佳路线（引入坡度惩罚）。

**解决方案**：
- 计算每条路线的 `effortScore`（基于距离、爬升、坡度）
- 根据用户偏好（轻松/挑战）选择路线
- 解释里出现"坡度/爬升"作为主要证据

**验收标准**：
- ✅ 规划输出随 persona 改变
- ✅ 解释里出现"坡度/爬升"作为主要证据

## 使用方法

### 基础使用

```typescript
import { DEMEffortMetadataService } from './readiness/services/dem-effort-metadata.service';

// 注入服务
constructor(private readonly effortService: DEMEffortMetadataService) {}

// 计算路线消耗
const route: RoutePoint[] = [
  { lat: 30.6624, lng: 104.0633 },
  { lat: 30.7000, lng: 103.6000 },
  // ... 更多点
];

const metadata = await this.effortService.calculateEffortMetadata(route, {
  activityType: 'walking', // 'walking' | 'cycling' | 'driving'
  includeElevationProfile: true, // 可选：包含详细海拔剖面
});

console.log(`累计爬升: ${metadata.totalAscent}m`);
console.log(`体力消耗评分: ${metadata.effortScore}`);
console.log(`预计时长: ${metadata.estimatedDuration}分钟`);
```

### 路线对比

```typescript
const comparison = await this.effortService.compareRoutes(route1, route2, {
  activityType: 'walking',
});

console.log(`消耗差异: ${comparison.comparison.effortDifference}%`);
console.log(`推荐: ${comparison.comparison.recommendation}`);
```

### 关键点检测

```typescript
const keyPoints = await this.effortService.detectKeyPoints(route);

console.log(`最高点: ${keyPoints.highestPoint.elevation}m`);
console.log(`最陡坡: ${keyPoints.steepestSegment.slope}%`);
console.log(`山口数量: ${keyPoints.mountainPasses.length}`);
```

## 测试

### 运行所有场景

```bash
npm run test:dem:effort
```

### 运行指定场景

```bash
npm run test:dem:effort -- --scenario 1  # 场景1：同距离不同消耗
npm run test:dem:effort -- --scenario 2  # 场景2：不同入口对比
npm run test:dem:effort -- --scenario 3  # 场景3：海拔适应
npm run test:dem:effort -- --scenario 4  # 场景4：垭口夜间拦截
npm run test:dem:effort -- --scenario 5  # 场景5：地形成本函数
```

## 算法说明

### 体力消耗评分计算

```typescript
// 基于三个维度：
distanceScore = min(100, (totalDistance / 1000) * 10)  // 每公里10分
ascentScore = min(100, (totalAscent / 100) * 5)      // 每100米爬升5分
slopeScore = min(100, maxSlope * 2)                    // 每1%坡度2分

effortScore = (distanceScore + ascentScore + slopeScore) / 3
```

### 难度等级

- **easy**: effortScore < 30
- **moderate**: 30 <= effortScore < 60
- **hard**: 60 <= effortScore < 85
- **extreme**: effortScore >= 85

### 预计时长计算

```typescript
// 基础速度（米/小时）
baseSpeed = {
  walking: 4000,
  cycling: 15000,
  driving: 60000,
}[activityType]

// 爬升惩罚：每100米爬升增加10%时间
ascentPenalty = 1 + (totalAscent / 100) * 0.1
estimatedDuration = (totalDistance / baseSpeed) * 60 * ascentPenalty  // 分钟
```

## 集成点

### 与 Readiness 服务集成

体力消耗元数据可以用于：
- 高海拔适应规则：基于 `maxElevation` 和 `dailyElevationGain`
- 补给点建议：基于 `suggestedRestPoints`
- 风险提示：基于 `difficulty` 和 `terrainComplexity`

### 与决策引擎集成

- **Abu（约束生成）**：基于 `effortScore` 生成强度约束
- **Dr.Dre（行程调整）**：基于 `estimatedDuration` 调整时间安排
- **Neptune（路线优化）**：基于 `effortScore` 选择最佳路线

## 后续改进

### 场景6：视野与摄影价值（待实现）

- 计算观景点的可视域/地形遮挡
- 基于周边地形开阔度排序观景点
- 建议最佳摄影时间段

### 场景7：洪沟/河谷穿越风险（待实现）

- 结合河网数据和DEM数据
- 检测路线是否靠近河谷且坡面汇流强
- 雨季/暴雨时提示涉水风险

## 相关文档

- [DEM测试用例](./DEM_TEST_CASES.md)
- [DEM快速开始](./DEM_TEST_QUICKSTART.md)
- [西藏Readiness使用指南](./XIZANG_READINESS_USAGE.md)

