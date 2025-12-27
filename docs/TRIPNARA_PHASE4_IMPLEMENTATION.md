# TripNARA Phase 4 实现总结

## 概述

Phase 4 实现了"让三件东西成为不可替代"的核心功能：

1. **PART 1: 世界级 RouteDirection Pack** - 增强 RouteDirection 数据结构
2. **PART 2: DEM 升级为「否决级证据源」** - 强制 DEM 证据检查和连续疲劳检测
3. **PART 3: 真正的叙事护城河** - 文档和定位（无需代码实现）
4. **PART 4: 推荐执行顺序** - 路线图（无需代码实现）

## PART 1: 世界级 RouteDirection Pack

### 已实现

1. **失败画像（Failure Profile）**
   - 接口定义：`src/route-directions/interfaces/route-direction.interface.ts`
   - 包含：`commonFailureDays`, `typicalFailureReason`, `rescueDifficulty`, `failureScenarios`
   - 用途：直接喂给 Neptune 修复优先级

2. **路线叙事（Route Narrative）**
   - 接口定义：`RouteNarrative`
   - 包含：`internal`（内部叙事）、`userFacing`（用户面向叙事）、`philosophy`（路线哲学）
   - 用途：决策解释、用户教育、防止误用

3. **不适合的用户画像（Anti-Persona）**
   - 字段：`antiPersona: string[]`
   - 用途：防止误用，这是和 OTA 的本质差异

4. **DTO 更新**
   - `src/route-directions/dto/create-route-direction.dto.ts` 已更新，支持新字段

### 待完成

- Prisma schema 更新（可选，可以存储在 `metadata` JSON 中）
- 更新 RouteDirection 创建/更新 API 以支持新字段

## PART 2: DEM 升级为「否决级证据源」

### 已实现

1. **DEM Decision Evidence 接口**
   - 文件：`src/trips/decision/interfaces/dem-decision-evidence.interface.ts`
   - 包含：
     - `DemDecisionEvidence` - 路段证据
     - `CorridorQualityScore` - 走廊质量评分
     - `RollingFatigueDetection` - 连续疲劳检测
     - `DemEvidencePipelineResult` - 管道输出

2. **DEM Decision Evidence Pipeline 服务**
   - 文件：`src/trips/decision/services/dem-decision-evidence-pipeline.service.ts`
   - 功能：
     - `generateEvidenceForPlan()` - 为整个计划生成证据
     - `generateEvidenceForDay()` - 为单天生成证据
     - `detectRollingFatigue()` - 检测连续疲劳（Rolling Window）
     - `calculateCorridorQuality()` - 计算走廊质量评分
     - `generateExplainableFailure()` - 生成可解释失败说明
     - `validatePlanHasEvidence()` - 验证计划是否有证据

3. **DEM Evidence Enforcer 服务**
   - 文件：`src/trips/decision/services/dem-evidence-enforcer.service.ts`
   - 强制规则执行：
     - `canFinalizePlan()` - 检查是否可以 finalize（没有 DEM evidence → 不可 finalize）
     - `canNeptuneRepairSegment()` - Neptune 不允许修复没有 DEM evidence 的 segment
     - `canAbuIgnoreViolation()` - Abu 不允许忽略 HARD violation

4. **模块注册**
   - `src/trips/decision/decision.module.ts` 已更新，注册新服务

### 强制规则（已实现）

✅ **没有 DEM evidence → plan 不可 finalize**
- 实现位置：`DemEvidenceEnforcerService.canFinalizePlan()`

✅ **Neptune 不允许修复没有 DEM evidence 的 segment**
- 实现位置：`DemEvidenceEnforcerService.canNeptuneRepairSegment()`

✅ **Abu 不允许忽略 HARD violation**
- 实现位置：`DemEvidenceEnforcerService.canAbuIgnoreViolation()`

### 核心功能

1. **连续疲劳检测（Rolling Window）**
   - 检测 3 天滚动窗口累计爬升
   - 超过阈值时建议插入休息日
   - 这是 99% 行程产品做不到的护城河功能

2. **走廊质量评分**
   - 公式：`corridorScore = viewExposureScore * 0.4 + elevationVariance * 0.3 - slopePenalty * 0.3`
   - 同一 RouteDirection 的不同走廊可以直接比较优劣

3. **可解释失败**
   - 生成用户友好的失败说明
   - 格式："不是因为你不行，而是因为第 4–6 天连续 28% 坡度，与你的体力模型冲突。"

### 待集成

需要在以下服务中集成 DEM evidence 检查：

1. **TripDecisionEngineService**
   - 在 `generatePlan()` 中调用 `DemDecisionEvidencePipelineService.generateEvidenceForPlan()`
   - 在 finalize 前调用 `DemEvidenceEnforcerService.canFinalizePlan()`

2. **Neptune 策略服务**
   - 在修复 segment 前调用 `DemEvidenceEnforcerService.canNeptuneRepairSegment()`

3. **Abu 策略服务**
   - 在忽略 violation 前调用 `DemEvidenceEnforcerService.canAbuIgnoreViolation()`

4. **Dr.Dre 策略服务**
   - 在插入休息日时，使用 `RollingFatigueDetection.suggestedAction`

## 集成示例

### 在 TripDecisionEngineService 中集成

```typescript
// 在 generatePlan() 方法中
async generatePlan(state: TripWorldState, requestId?: string): Promise<{ plan: TripPlan; log: DecisionRunLog }> {
  // ... 现有逻辑生成 plan ...

  // PART 2: 生成 DEM evidence
  const decisionParams = await this.decisionParamsInjector.getDecisionParamsForUser(userId);
  const demEvidence = await this.demEvidencePipeline.generateEvidenceForPlan(plan, {
    maxDailyAscentM: decisionParams.constraints.maxDailyAscentM,
    maxElevationM: decisionParams.constraints.maxElevationM,
    maxSlopePct: decisionParams.constraints.maxSlopePct,
    rollingAscent3DaysThreshold: 2000, // 或从 user profile 获取
  });

  // 强制检查：不能 finalize 有 HARD violation 的计划
  const canFinalize = this.demEvidenceEnforcer.canFinalizePlan(demEvidence);
  if (!canFinalize.allowed) {
    this.logger.warn(`Plan cannot be finalized: ${canFinalize.reason}`);
    // 触发修复流程或返回错误
  }

  // 记录到 DecisionRunLog
  log.demEvidence = demEvidence;

  return { plan, log };
}
```

### 在 Neptune 策略中集成

```typescript
// 在修复 segment 前
async repairSegment(segmentId: string, plan: TripPlan, demEvidence: DemEvidencePipelineResult) {
  const canRepair = this.demEvidenceEnforcer.canNeptuneRepairSegment(segmentId, demEvidence);
  if (!canRepair.allowed) {
    throw new Error(`Cannot repair segment ${segmentId}: ${canRepair.reason}`);
  }

  // 使用 evidence 进行修复
  const evidence = canRepair.evidence!;
  // ... 修复逻辑 ...
}
```

### 在 Abu 策略中集成

```typescript
// 在忽略 violation 前
async ignoreViolation(segmentId: string, demEvidence: DemEvidencePipelineResult) {
  const canIgnore = this.demEvidenceEnforcer.canAbuIgnoreViolation(segmentId, demEvidence);
  if (!canIgnore.allowed) {
    throw new Error(`Cannot ignore violation for segment ${segmentId}: ${canIgnore.reason}`);
  }

  // 可以忽略 SOFT violation，但记录
  // ... 处理逻辑 ...
}
```

## 下一步

1. **集成到决策引擎**：在 `TripDecisionEngineService` 中调用 DEM evidence pipeline
2. **集成到策略服务**：在 Abu、Dr.Dre、Neptune 中添加强制规则检查
3. **测试验证**：编写 E2E 测试验证强制规则生效
4. **文档完善**：更新 API 文档和使用指南

## 文件清单

### 新增文件

- `src/trips/decision/interfaces/dem-decision-evidence.interface.ts`
- `src/trips/decision/services/dem-decision-evidence-pipeline.service.ts`
- `src/trips/decision/services/dem-evidence-enforcer.service.ts`
- `docs/TRIPNARA_PHASE4_IMPLEMENTATION.md`

### 修改文件

- `src/route-directions/interfaces/route-direction.interface.ts` - 添加 FailureProfile, RouteNarrative, antiPersona
- `src/route-directions/dto/create-route-direction.dto.ts` - 添加新字段支持
- `src/trips/decision/decision.module.ts` - 注册新服务

## 总结

Phase 4 的核心功能已经实现：
- ✅ RouteDirection Pack 增强（失败画像、叙事、anti-persona）
- ✅ DEM 证据管道（连续疲劳检测、走廊质量评分、可解释失败）
- ✅ 强制规则执行器（三个强制规则）

待完成的是集成工作，将新功能接入现有的决策流程。

