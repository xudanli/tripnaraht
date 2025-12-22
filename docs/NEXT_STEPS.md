# 下一步工作计划

## 当前状态

✅ **已完成的工作**:
1. ✅ 创建国家能力包系统（5个核心能力包）
2. ✅ 扩展挪威规则（9个规则）
3. ✅ 创建测试用例（7个测试全部通过）
4. ✅ 性能优化（缓存服务）
5. ✅ 创建API控制器
6. ✅ 创建文档

## 下一步建议

### 优先级 1: 集成到主应用

#### 1.1 将 ReadinessModule 添加到 AppModule

**文件**: `src/app.module.ts`

```typescript
import { ReadinessModule } from './trips/readiness/readiness.module';

@Module({
  imports: [
    // ... 现有模块
    ReadinessModule, // 新增
  ],
})
export class AppModule {}
```

**原因**: 使 Readiness API 端点可用，并允许其他模块使用 ReadinessService。

#### 1.2 确保 DecisionModule 导入 ReadinessModule

**文件**: `src/trips/decision/decision.module.ts`

检查是否已导入，如果没有则添加：

```typescript
import { ReadinessModule } from '../readiness/readiness.module';

@Module({
  imports: [
    // ... 现有模块
    ReadinessModule, // 确保已导入
  ],
})
export class DecisionModule {}
```

**原因**: TripDecisionEngineService 已经引用了 ReadinessService，需要确保依赖注入正常工作。

### 优先级 2: 集成到决策层

#### 2.1 在 TripDecisionEngineService 中使用 Readiness

**文件**: `src/trips/decision/trip-decision-engine.service.ts`

当前代码已经有 `readinessService` 的引用，但可能没有实际使用。建议：

1. **在生成计划前检查准备度**:
   ```typescript
   async generatePlan(state: TripWorldState): Promise<{ plan: TripPlan; log: DecisionRunLog }> {
     // 1. 检查准备度
     const context = this.readinessService?.extractTripContext(state);
     if (context && this.readinessService) {
       const readinessResult = await this.readinessService.checkFromDestination(
         state.context.destination,
         context,
         {
           enhanceWithGeo: true,
           geoLat: state.context.startLocation?.lat,
           geoLng: state.context.startLocation?.lng,
         }
       );
       
       // 2. 将准备度约束转换为决策约束
       const constraints = await this.readinessService.getConstraints(readinessResult);
       
       // 3. 在决策时考虑这些约束
       // ...
     }
     
     // 继续原有逻辑
   }
   ```

2. **在修复计划时考虑准备度约束**:
   ```typescript
   async repairPlan(plan: TripPlan, state: TripWorldState): Promise<TripPlan> {
     // 检查准备度，识别 blocker 和 must 项
     // 在修复时优先处理 blocker
   }
   ```

#### 2.2 创建 Readiness → Constraints 转换

**文件**: `src/trips/readiness/compilers/readiness-to-constraints.compiler.ts`

确保编译器能够将 Readiness Findings 转换为 Decision Constraints：

```typescript
compile(result: ReadinessCheckResult): Constraints {
  return {
    blockers: result.findings.flatMap(f => f.blockers),
    must: result.findings.flatMap(f => f.must),
    should: result.findings.flatMap(f => f.should),
    risks: result.findings.flatMap(f => f.risks),
  };
}
```

### 优先级 3: 扩展和优化

#### 3.1 添加更多国家/地区的 Pack

- [ ] 冰岛 Pack（基于已有的 POI 数据）
- [ ] 格陵兰 Pack
- [ ] 其他北欧国家 Pack

#### 3.2 创建 E2E 测试

- [ ] API 端点 E2E 测试
- [ ] 决策层集成测试
- [ ] 完整流程测试（从 World State → Readiness → Constraints → Decision）

#### 3.3 性能监控

- [ ] 添加缓存命中率监控
- [ ] 添加地理特征查询性能监控
- [ ] 添加规则评估性能监控

#### 3.4 文档完善

- [ ] API 文档（Swagger）
- [ ] 集成指南（如何与 Decision 层集成）
- [ ] 最佳实践文档

### 优先级 4: 功能增强

#### 4.1 支持更多地理特征

- [ ] 天气数据集成
- [ ] 实时路况数据
- [ ] 季节性活动数据

#### 4.2 智能推荐

- [ ] 基于准备度的活动推荐
- [ ] 基于准备度的装备推荐
- [ ] 基于准备度的路线优化

#### 4.3 用户反馈循环

- [ ] 收集用户对准备度建议的反馈
- [ ] 基于反馈优化规则
- [ ] A/B 测试不同规则版本

## 推荐执行顺序

1. **立即执行**（优先级 1）:
   - 将 ReadinessModule 添加到 AppModule
   - 确保 DecisionModule 正确导入 ReadinessModule
   - 测试 API 端点是否可访问

2. **短期执行**（优先级 2）:
   - 在 TripDecisionEngineService 中集成 Readiness
   - 完善 Readiness → Constraints 转换
   - 测试决策层集成

3. **中期执行**（优先级 3）:
   - 添加更多国家 Pack
   - 创建 E2E 测试
   - 添加性能监控

4. **长期执行**（优先级 4）:
   - 功能增强
   - 智能推荐
   - 用户反馈循环

## 快速开始

### 步骤 1: 集成到 AppModule

```bash
# 编辑 src/app.module.ts
# 添加 ReadinessModule 到 imports
```

### 步骤 2: 测试 API

```bash
# 启动服务
npm run dev

# 测试 API
curl -X POST http://localhost:3000/readiness/check \
  -H "Content-Type: application/json" \
  -d '{
    "destinationId": "NO-NORWAY",
    "itinerary": {
      "countries": ["NO"],
      "activities": ["self_drive"],
      "season": "winter"
    },
    "geo": {
      "lat": 69.6492,
      "lng": 18.9553,
      "enhanceWithGeo": true
    }
  }'
```

### 步骤 3: 集成到决策层

```bash
# 编辑 src/trips/decision/decision.module.ts
# 确保导入 ReadinessModule

# 编辑 src/trips/decision/trip-decision-engine.service.ts
# 在 generatePlan 中使用 ReadinessService
```

## 相关文档

- [API 使用指南](./READINESS_API_USAGE.md)
- [能力包使用指南](./CAPABILITY_PACKS_GUIDE.md)
- [测试结果](./READINESS_TEST_RESULTS.md)
- [挪威规则测试指南](./NORWAY_RULES_TESTING.md)

