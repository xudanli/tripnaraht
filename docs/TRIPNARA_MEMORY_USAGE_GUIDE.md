# TripNARA Memory System 使用指南

## 快速开始

### 1. 基本使用

```typescript
import { MemoryService } from './agent/memory/services/memory.service';
import { UserProfileMapperService } from './agent/memory/services/user-profile-mapper.service';
import { DecisionParamsInjectorService } from './agent/memory/services/decision-params-injector.service';

// 注入服务
constructor(
  private readonly memoryService: MemoryService,
  private readonly profileMapper: UserProfileMapperService,
  private readonly decisionInjector: DecisionParamsInjectorService,
) {}

// 使用
async planTrip(userId: string) {
  // 1. 读取用户画像
  const profile = await this.memoryService.getUserTravelProfile(userId);
  
  // 2. 映射为决策参数
  const decisionParams = this.profileMapper.mapUserProfileToDecisionParams(profile);
  
  // 3. 注入到决策引擎
  await this.decisionInjector.injectConstraintsToWorldModel(worldState, decisionParams);
  
  // 4. 生成计划...
  
  // 5. 保存决策记忆
  await this.memoryService.saveRouteDirectionDecision({
    id: generateUUID(),
    userId,
    tripId: 'trip-123',
    countryCode: 'IS',
    month: 7,
    selectedRouteDirectionId: 1,
    rejectedRouteDirectionIds: [2, 3],
    keyConstraints: {},
    scoreBreakdown: {},
    explanation: {},
    createdAt: new Date(),
  });
}
```

## L1: 用户旅行人格

### 创建/更新用户画像

```typescript
// 创建新画像
await memoryService.saveUserTravelProfile({
  userId: 'user-123',
  pacePreference: 'SLOW',
  altitudeTolerance: 'LOW',
  riskTolerance: 'LOW',
  travelPhilosophy: 'SCENIC',
  preferredRouteTypes: ['HIKING', 'NATURE'],
  confidence: 0.8,
  source: 'explicit',
  updatedAt: new Date(),
});

// 更新画像
await memoryService.updateUserTravelProfile('user-123', {
  confidence: 0.9,
  pacePreference: 'MODERATE',
});
```

### 读取用户画像

```typescript
const profile = await memoryService.getUserTravelProfile('user-123');
// 如果不存在，返回默认画像（confidence = 0.5）
```

## L2: 路线决策记忆

### 保存决策记忆

```typescript
await memoryService.saveRouteDirectionDecision({
  id: generateUUID(),
  userId: 'user-123',
  tripId: 'trip-456',
  countryCode: 'IS',
  month: 7,
  selectedRouteDirectionId: 1,
  rejectedRouteDirectionIds: [2, 3, 4],
  keyConstraints: {
    maxElevationM: 3500,
    maxDailyAscentM: 500,
  },
  scoreBreakdown: {
    tagMatch: { score: 80, weight: 0.4 },
    seasonality: { score: 90, weight: 0.3 },
  },
  explanation: {
    whySelected: '匹配用户偏好：风景、低海拔、稳定路线',
    whyRejected: [
      { id: 2, reason: '海拔过高' },
      { id: 3, reason: '风险过高' },
    ],
  },
  createdAt: new Date(),
});
```

### 查询决策历史

```typescript
// 查询用户的所有决策
const decisions = await memoryService.getUserRouteDirectionDecisions('user-123');

// 查询特定国家的决策
const isDecisions = await memoryService.getUserRouteDirectionDecisions('user-123', 'IS');
```

## L3: 路线健康度

### 更新路线健康度

```typescript
// 成功案例
await memoryService.updateRouteDirectionHealth(
  1, // routeDirectionId
  'IS', // countryCode
  true, // success
  undefined, // failureReason
  undefined // repair
);

// 失败案例
await memoryService.updateRouteDirectionHealth(
  1,
  'IS',
  false, // failure
  '海拔过高导致高反', // failureReason
  '降低海拔或增加适应日' // repair
);
```

### 读取路线健康度

```typescript
const health = await memoryService.getRouteDirectionHealth(1, 'IS');
// 返回: { totalRuns, successRuns, failureRuns, commonFailureReasons, commonRepairs }
```

## L4: 行为反馈

### 保存反馈

```typescript
await memoryService.saveTripOutcomeFeedback({
  tripId: 'trip-456',
  userId: 'user-123',
  overallSuccess: true,
  fatigueLevel: 3,
  satisfaction: 4,
  abandoned: false,
  failurePoints: [],
  notes: '整体体验良好，但第3天有些累',
  createdAt: new Date(),
});
```

### 查询反馈历史

```typescript
const feedbacks = await memoryService.getUserTripFeedbacks('user-123');
```

### 自动学习

保存反馈后，系统会自动：
- 更新用户画像的置信度
- 根据疲劳度调整 pace 偏好
- 根据满意度提高置信度

## 用户画像 → 决策参数映射

### 基本映射

```typescript
const profile = await memoryService.getUserTravelProfile('user-123');
const decisionParams = profileMapper.mapUserProfileToDecisionParams(profile);

// decisionParams 包含：
// - routeDirectionBias: { difficultyWeight, sceneryWeight, adventureWeight, stabilityWeight }
// - constraints: { maxElevationM, maxDailyAscentM, bufferTimeMin, avoidRapidAscent }
// - strategyPreference: { abuWeight, drDreWeight, neptuneWeight }
// - repairPolicy: { preferSplitDays, preferAltRoute, preferRestDay }
```

### 映射规则

| 用户画像 | 决策参数影响 |
|---------|------------|
| pacePreference: SLOW | bufferTimeMin += 60, preferRestDay = true |
| altitudeTolerance: LOW | maxElevationM = 3500, avoidRapidAscent = true |
| riskTolerance: LOW | stabilityWeight += 0.3, abuWeight += 0.3 |
| travelPhilosophy: SCENIC | sceneryWeight += 0.4 |

## 决策参数注入

### 注入到 RouteDirection 选择

```typescript
// 在 RouteDirectionSelectorService 中
const decisionParams = await decisionInjector.getDecisionParamsForUser(userId);
const adjustedScore = await decisionInjector.adjustRouteDirectionScore(
  routeDirectionId,
  countryCode,
  baseScore,
  decisionParams,
  routeDirection
);
```

### 注入到 World Model

```typescript
// 在 TripDecisionEngineService 中
const decisionParams = await decisionInjector.getDecisionParamsForUser(userId);
decisionInjector.injectConstraintsToWorldModel(worldState, decisionParams);
```

## Dry-run Planner

### 使用 Dry-run 检测失败

```typescript
// 在 TripDecisionEngineService 中自动执行
const dryRunResult = await dryRunPlanner.simulatePlan(state, plan, decisionParams);

if (dryRunResult.willFail) {
  console.log(`预计在第 ${dryRunResult.failureDay} 天失败：${dryRunResult.failureReason}`);
  const suggestions = dryRunPlanner.generateAdjustmentSuggestions(dryRunResult);
  // 应用建议...
}
```

## 最佳实践

### 1. 用户画像初始化

```typescript
// 新用户首次规划时，使用默认画像
const profile = await memoryService.getUserTravelProfile(userId);
// 如果不存在，自动返回默认值（confidence = 0.5）

// 用户明确表达偏好后，更新画像
if (userExplicitlySetPreferences) {
  await memoryService.saveUserTravelProfile({
    ...profile,
    pacePreference: userPace,
    source: 'explicit',
    confidence: 0.8,
  });
}
```

### 2. 决策记忆保存

```typescript
// 每次生成计划后，保存决策记忆
await memoryService.saveRouteDirectionDecision({
  // ... 包含完整的决策上下文
  explanation: {
    whySelected: '基于评分和用户偏好选择',
    whyRejected: rejectedRDs.map(rd => ({
      id: rd.id,
      reason: rd.rejectionReason,
    })),
  },
});
```

### 3. 反馈收集

```typescript
// 行程结束后，收集用户反馈
await memoryService.saveTripOutcomeFeedback({
  tripId,
  userId,
  overallSuccess: true,
  fatigueLevel: userFatigueLevel,
  satisfaction: userSatisfaction,
  abandoned: false,
  failurePoints: ['day3-too-tired'],
  notes: userNotes,
});
```

### 4. 路线健康度监控

```typescript
// 每次路线执行后，更新健康度
const success = tripCompletedWithoutIssues;
await memoryService.updateRouteDirectionHealth(
  selectedRouteDirectionId,
  countryCode,
  success,
  success ? undefined : failureReason,
  success ? undefined : appliedRepair
);
```

## 测试

运行测试脚本验证系统：

```bash
npx tsx scripts/test-memory-simple.ts
```

## 故障排查

### 数据库连接问题

如果看到 "Database not available, using in-memory storage"：
1. 检查数据库连接配置
2. 确认 PrismaService 已正确初始化
3. 系统会自动 fallback 到内存存储

### 数据不持久化

如果数据没有保存到数据库：
1. 检查 PrismaService.isDbConnected() 返回值
2. 查看日志确认使用的是数据库还是内存存储
3. 验证数据库表是否已创建

## 总结

TripNARA Memory System 提供了完整的记忆层能力：

- ✅ **L1**: 记住用户的旅行人格
- ✅ **L2**: 记住每次决策的原因
- ✅ **L3**: 记住路线的成功/失败
- ✅ **L4**: 从反馈中学习

系统会自动：
- 将用户画像映射为决策参数
- 根据历史数据调整推荐
- 从反馈中学习并改进

🎉 现在可以开始使用记忆层系统了！

