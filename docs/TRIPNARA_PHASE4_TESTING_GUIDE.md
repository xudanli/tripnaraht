# TripNARA Phase 4 测试指南

## 概述

本文档提供 Phase 4 功能的测试指南，包括单元测试、集成测试和 E2E 测试示例。

## 测试范围

### 1. DEM Decision Evidence Pipeline

#### 测试连续疲劳检测（Rolling Window）

```typescript
describe('Rolling Fatigue Detection', () => {
  it('should detect rolling fatigue when 3-day ascent exceeds threshold', async () => {
    const plan: TripPlan = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2024-01-01',
          timeSlots: [],
          terrainFacts: { totalAscent: 800, maxElevation: 3000 },
        },
        {
          day: 2,
          date: '2024-01-02',
          timeSlots: [],
          terrainFacts: { totalAscent: 700, maxElevation: 3200 },
        },
        {
          day: 3,
          date: '2024-01-03',
          timeSlots: [],
          terrainFacts: { totalAscent: 600, maxElevation: 3400 },
        },
      ],
    };

    const service = new DemDecisionEvidenceService(...);
    const result = await service.generateEvidencePipeline(plan, routeDirection);

    expect(result.rollingFatigue?.detected).toBe(true);
    expect(result.rollingFatigue?.startDay).toBe(1);
    expect(result.rollingFatigue?.endDay).toBe(3);
    expect(result.rollingFatigue?.suggestedAction).toBe('INSERT_REST_DAY');
  });
});
```

#### 测试走廊质量评分

```typescript
describe('Corridor Quality Scoring', () => {
  it('should calculate corridor quality score correctly', async () => {
    const routeSegmentation: RouteSegmentation = {
      elevationProfile: [
        { distance: 0, elevation: 1000, slope: 0, cumulativeAscent: 0 },
        { distance: 1000, elevation: 2000, slope: 10, cumulativeAscent: 1000 },
        { distance: 2000, elevation: 1500, slope: -5, cumulativeAscent: 1000 },
      ],
      // ... other fields
    };

    const service = new DemDecisionEvidenceService(...);
    const result = await service.generateEvidencePipeline(plan, routeDirection, routeSegmentation);

    expect(result.corridorQuality).toBeDefined();
    expect(result.corridorQuality?.totalScore).toBeGreaterThan(0);
    expect(result.corridorQuality?.totalScore).toBeLessThanOrEqual(100);
  });
});
```

### 2. 强制规则验证

#### 测试：没有 DEM evidence → plan 不可 finalize

```typescript
describe('DEM Evidence Enforcer', () => {
  it('should prevent finalize when no DEM evidence', () => {
    const enforcer = new DemEvidenceEnforcerService();
    const emptyResult: DemEvidencePipelineResult = {
      segmentEvidences: [],
      hasHardViolation: false,
      hasSoftViolation: false,
      canProceed: false,
    };

    const result = enforcer.canFinalizePlan(emptyResult);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('缺少 DEM 证据');
  });

  it('should prevent finalize when HARD violation exists', () => {
    const enforcer = new DemEvidenceEnforcerService();
    const resultWithHardViolation: DemEvidencePipelineResult = {
      segmentEvidences: [
        {
          segmentId: 'day-1',
          violation: 'HARD',
          explanation: '海拔超过限制',
          // ... other fields
        },
      ],
      hasHardViolation: true,
      hasSoftViolation: false,
      canProceed: false,
    };

    const result = enforcer.canFinalizePlan(resultWithHardViolation);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('硬约束违规');
  });
});
```

#### 测试：Neptune 不允许修复没有 DEM evidence 的 segment

```typescript
describe('Neptune Repair Rules', () => {
  it('should prevent Neptune from repairing segment without evidence', () => {
    const enforcer = new DemEvidenceEnforcerService();
    const result: DemEvidencePipelineResult = {
      segmentEvidences: [],
      hasHardViolation: false,
      hasSoftViolation: false,
      canProceed: true,
    };

    const canRepair = enforcer.canNeptuneRepairSegment('day-1', result);
    expect(canRepair.allowed).toBe(false);
    expect(canRepair.reason).toContain('没有 DEM 证据');
  });
});
```

#### 测试：Abu 不允许忽略 HARD violation

```typescript
describe('Abu Ignore Rules', () => {
  it('should prevent Abu from ignoring HARD violation', () => {
    const enforcer = new DemEvidenceEnforcerService();
    const result: DemEvidencePipelineResult = {
      segmentEvidences: [
        {
          segmentId: 'day-1',
          violation: 'HARD',
          explanation: '海拔超过限制',
          // ... other fields
        },
      ],
      hasHardViolation: true,
      hasSoftViolation: false,
      canProceed: false,
    };

    const canIgnore = enforcer.canAbuIgnoreViolation('day-1', result);
    expect(canIgnore.allowed).toBe(false);
    expect(canIgnore.reason).toContain('HARD violation');
  });
});
```

### 3. 策略集成测试

#### 测试 Dr.Dre 自动插入休息日

```typescript
describe('Dr.Dre Rest Day Insertion', () => {
  it('should automatically insert rest day when rolling fatigue detected', async () => {
    const decisionEngine = new TripDecisionEngineService(...);
    
    // 创建一个会导致连续疲劳的计划
    const state: TripWorldState = {
      context: {
        destination: 'NP',
        startDate: '2024-01-01',
        durationDays: 5,
        preferences: { /* ... */ },
      },
      candidatesByDate: { /* ... */ },
      signals: { lastUpdatedAt: new Date().toISOString() },
    };

    const { plan, log } = await decisionEngine.generatePlan(state);

    // 检查是否有连续疲劳检测
    expect(log.demEvidence?.rollingFatigue?.detected).toBe(true);
    
    // 检查是否自动插入了休息日
    const restDay = log.demEvidence?.rollingFatigue?.startDay! + 1;
    const dayToCheck = plan.days[restDay - 1];
    
    // 应该有一个休息 slot
    const restSlots = dayToCheck.timeSlots.filter(s => s.type === 'rest');
    expect(restSlots.length).toBeGreaterThan(0);
    expect(restSlots[0].reasons?.[0]).toContain('连续疲劳');
  });
});
```

### 4. E2E 测试场景

#### 场景 1: 高海拔路线导致连续疲劳

```typescript
describe('E2E: High Altitude Route with Rolling Fatigue', () => {
  it('should detect and handle rolling fatigue in high altitude route', async () => {
    // 1. 创建高海拔路线计划（如 EBC）
    const state = createHighAltitudeState();
    
    // 2. 生成计划
    const { plan, log } = await decisionEngine.generatePlan(state);
    
    // 3. 验证 DEM evidence 生成
    expect(log.demEvidence).toBeDefined();
    expect(log.demEvidence?.segmentEvidences.length).toBeGreaterThan(0);
    
    // 4. 验证连续疲劳检测
    expect(log.demEvidence?.rollingFatigue?.detected).toBe(true);
    
    // 5. 验证自动插入休息日
    const restDay = log.demEvidence?.rollingFatigue?.startDay! + 1;
    const day = plan.days[restDay - 1];
    expect(day.timeSlots.some(s => s.type === 'rest')).toBe(true);
    
    // 6. 验证可解释失败生成
    expect(log.demEvidence?.explainableFailure).toBeDefined();
    expect(log.demEvidence?.explainableFailure?.userImpact).toContain('不是因为你不行');
  });
});
```

#### 场景 2: 硬约束违反导致计划不能 finalize

```typescript
describe('E2E: Hard Constraint Violation', () => {
  it('should prevent finalize when hard constraint violated', async () => {
    // 1. 创建违反硬约束的计划（如超过最大海拔）
    const state = createViolationState();
    
    // 2. 生成计划
    const { plan, log } = await decisionEngine.generatePlan(state);
    
    // 3. 验证 HARD violation 检测
    expect(log.demEvidence?.hasHardViolation).toBe(true);
    expect(log.demEvidence?.canProceed).toBe(false);
    
    // 4. 验证不能 finalize
    const enforcer = new DemEvidenceEnforcerService();
    const canFinalize = enforcer.canFinalizePlan(log.demEvidence!);
    expect(canFinalize.allowed).toBe(false);
    
    // 5. 验证可解释失败
    expect(log.demEvidence?.explainableFailure?.reason).toContain('海拔');
  });
});
```

## 运行测试

### 单元测试

```bash
# 运行所有 Phase 4 相关测试
npm test -- --testPathPattern="phase4|dem-decision-evidence|dem-evidence-enforcer"

# 运行特定测试文件
npm test -- src/trips/decision/services/dem-decision-evidence.service.spec.ts
```

### 集成测试

```bash
# 运行集成测试
npm test -- --testPathPattern="integration.*phase4"

# 运行 E2E 测试
npm test -- --testPathPattern="e2e.*phase4"
```

## 测试数据准备

### 创建测试用的 RouteDirection

```typescript
const testRouteDirection: RouteDirectionData = {
  countryCode: 'NP',
  name: 'EBC Test Route',
  nameCN: 'EBC 测试路线',
  tags: ['hiking', 'high-altitude'],
  constraints: {
    hard: {
      maxElevationM: 5500,
      maxSlopePct: 25,
      rapidAscentForbidden: true,
    },
    soft: {
      maxDailyAscentM: 800,
      bufferTimeMin: 30,
    },
  },
  failureProfile: {
    commonFailureDays: [3, 4, 5],
    typicalFailureReason: ['fatigue', 'altitude'],
    rescueDifficulty: 'HIGH',
  },
  narrative: {
    internal: '这条路线假设用户愿意为风景牺牲城市便利',
    userFacing: '这是一条以自然为主线的纵贯路线，而不是城市打卡',
  },
  antiPersona: ['时间极度紧张', '不愿拆天', '低风险偏好'],
};
```

### 创建测试用的 Plan

```typescript
function createTestPlanWithRollingFatigue(): TripPlan {
  return {
    version: '1.0',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2024-01-01',
        timeSlots: [],
        terrainFacts: {
          maxElevation: 3000,
          totalAscent: 800,
          minElevation: 2800,
        },
      },
      {
        day: 2,
        date: '2024-01-02',
        timeSlots: [],
        terrainFacts: {
          maxElevation: 3500,
          totalAscent: 700,
          minElevation: 3000,
        },
      },
      {
        day: 3,
        date: '2024-01-03',
        timeSlots: [],
        terrainFacts: {
          maxElevation: 4000,
          totalAscent: 600,
          minElevation: 3500,
        },
      },
    ],
  };
}
```

## 测试检查清单

- [ ] 连续疲劳检测（Rolling Window）正常工作
- [ ] 走廊质量评分计算正确
- [ ] 可解释失败生成正确
- [ ] 强制规则 1: 没有 DEM evidence → plan 不可 finalize
- [ ] 强制规则 2: Neptune 不允许修复没有 DEM evidence 的 segment
- [ ] 强制规则 3: Abu 不允许忽略 HARD violation
- [ ] Dr.Dre 自动插入休息日
- [ ] Abu 在 HARD violation 时更保守
- [ ] E2E 场景测试通过

## 注意事项

1. **测试数据**: 确保测试数据符合实际场景，特别是海拔和爬升数据
2. **异步操作**: DEM 服务涉及异步操作，确保正确使用 `await`
3. **边界情况**: 测试边界情况，如只有 1-2 天的计划（无法检测连续疲劳）
4. **性能**: 注意测试性能，DEM 计算可能较慢

