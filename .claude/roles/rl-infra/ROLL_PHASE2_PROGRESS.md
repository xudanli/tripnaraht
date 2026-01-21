# ROLL 架构迁移 Phase 2 进展

**开始日期**: 2026-01-21  
**方案**: 方案 B - 混合架构  
**状态**: 🟡 **Phase 2 进行中 (40%)**

---

## 📊 Phase 2 完成情况

### ✅ 已完成工作

#### 1. Policy-Worker 迁移
- [x] ✅ 实现 Policy-Worker (`policy_worker.py`)
- [x] ✅ 更新 Bridge Service 支持 Policy-Worker
- [x] ✅ 创建 RollPolicyAdapterService
- [x] ✅ 集成到 TrainingModule

#### 2. 轨迹生成适配器
- [x] ✅ 创建 RollTrajectoryAdapterService
- [x] ✅ 适配 TrajectoryCollectionService 接口
- [x] ✅ 集成到 TrainingModule

#### 3. 奖励计算适配器
- [x] ✅ 创建 RollRewardAdapterService
- [x] ✅ 适配 QualityScorerService 接口
- [x] ✅ 集成到 TrainingModule

### ⏳ 待完成工作

#### 1. 实际迁移集成
- [ ] ⏳ 更新 TrajectoryCollectionService 使用 RollTrajectoryAdapterService（可选）
- [ ] ⏳ 更新 QualityScorerService 使用 RollRewardAdapterService（可选）
- [ ] ⏳ 更新 RLIntegrationService 使用 RollPolicyAdapterService（可选）

#### 2. 训练管道迁移
- [ ] ⏳ 实现 Training Pipeline Worker
- [ ] ⏳ 集成 ROLL Training Pipeline
- [ ] ⏳ 配置 Megatron/DeepSpeed 后端
- [ ] ⏳ MLflow 集成

---

## 🏗️ 当前架构

```
TypeScript (NestJS)
  ├─ TrajectoryCollectionService
  │   └─ RollTrajectoryAdapterService ✅ (可选)
  ├─ QualityScorerService
  │   └─ RollRewardAdapterService ✅ (可选)
  ├─ PolicyServiceManagerService
  │   └─ RollPolicyAdapterService ✅ (可选)
  └─ RollClientService ✅
      ↕ HTTP API
Python Bridge Service ✅
  ↕ Ray API
Ray Workers
  ├─ Actor-Worker ✅
  ├─ Reward-Worker ✅
  └─ Policy-Worker ✅
```

---

## 🔧 适配器模式说明

### 设计原则

**渐进式迁移**: 使用适配器模式，允许现有服务选择性地使用 ROLL Workers

**配置控制**: 通过环境变量控制是否启用 ROLL：
- `ROLL_TRAJECTORY_ENABLED` - 启用轨迹生成适配器
- `ROLL_REWARD_ENABLED` - 启用奖励计算适配器
- `ROLL_POLICY_ENABLED` - 启用策略推理适配器

**向后兼容**: 现有服务保持不变，适配器作为可选增强

---

## 📝 使用示例

### 1. 启用轨迹生成适配器

```typescript
// 在 TrajectoryCollectionService 中
constructor(
  private readonly prisma: PrismaService,
  private readonly validator: TrajectoryValidatorService,
  private readonly rewardExtractor: RewardSignalExtractorService,
  @Optional() private readonly rollTrajectoryAdapter?: RollTrajectoryAdapterService,
) {}

async collectTrajectory(data: TrajectoryCollectionData) {
  // 如果启用 ROLL，使用 Actor-Worker 生成轨迹
  if (this.rollTrajectoryAdapter) {
    const rollResult = await this.rollTrajectoryAdapter.generateTrajectory(data);
    // 使用生成的轨迹数据
  }
  
  // 继续原有的数据库存储逻辑
  // ...
}
```

### 2. 启用奖励计算适配器

```typescript
// 在 QualityScorerService 中
constructor(
  @Optional() private readonly rollRewardAdapter?: RollRewardAdapterService,
) {}

async score(plan, userRequest, evidence, decisionLog) {
  // 如果启用 ROLL，使用 Reward-Worker 计算基础奖励
  if (this.rollRewardAdapter) {
    const rewardResult = await this.rollRewardAdapter.computeReward(
      plan, userRequest, evidence, decisionLog
    );
    // 融合 Reward-Worker 结果和 LLM Judge 结果
  }
  
  // 继续原有的 LLM Judge 逻辑
  // ...
}
```

---

## 📈 进度统计

| 组件 | 状态 | 进度 |
|------|------|------|
| Policy-Worker | ✅ 完成 | 100% |
| RollPolicyAdapterService | ✅ 完成 | 100% |
| RollTrajectoryAdapterService | ✅ 完成 | 100% |
| RollRewardAdapterService | ✅ 完成 | 100% |
| 实际集成 | ⏳ 待完成 | 0% |
| Training Pipeline | ⏳ 待开始 | 0% |

**总体进度**: 40%

---

## 🚀 下一步行动

### 立即行动（本周）

1. **测试适配器**
   - [ ] 编写单元测试
   - [ ] 编写集成测试
   - [ ] 验证端到端流程

2. **可选集成**
   - [ ] 更新 TrajectoryCollectionService（可选）
   - [ ] 更新 QualityScorerService（可选）
   - [ ] 更新 RLIntegrationService（可选）

### 短期行动（1-2周）

3. **Training Pipeline**
   - [ ] 设计 Training Pipeline Worker
   - [ ] 实现基础训练流程
   - [ ] 集成 MLflow

---

## 📚 参考资料

- [适配器模式](https://refactoring.guru/design-patterns/adapter)
- [ROLL Training Pipeline](https://github.com/alibaba/ROLL)

---

**最后更新**: 2026-01-21  
**负责人**: RL Infrastructure 团队
