# ROLL 架构快速参考

> 📋 **完整评估**: [`ROLL_ARCHITECTURE_MIGRATION_ASSESSMENT.md`](./ROLL_ARCHITECTURE_MIGRATION_ASSESSMENT.md)  
> 📋 **角色评估**: [`ROLL_MIGRATION_ROLE_ASSESSMENTS.md`](./ROLL_MIGRATION_ROLE_ASSESSMENTS.md)  
> 📋 **POC 计划**: [`ROLL_MIGRATION_POC_PLAN.md`](./ROLL_MIGRATION_POC_PLAN.md)

---

## 🎯 ROLL 是什么？

**ROLL** = Reinforcement Learning Optimization for Large-Scale Learning

- **开发者**: 阿里巴巴
- **GitHub**: https://github.com/alibaba/ROLL
- **定位**: 大规模 LLM RL 训练框架
- **核心**: 基于 Ray 的多角色分布式架构

---

## 🏗️ ROLL 核心架构

### 多角色 Worker 架构

```
┌─────────────────────────────────┐
│     Ray Head (Controller)       │
│  - 任务调度                      │
│  - 资源管理                      │
│  - 状态同步                      │
└─────────────────────────────────┘
           ↕ Ray API
┌─────────────────────────────────┐
│  Actor-Workers  → 生成轨迹       │
│  Critic-Workers → 估计价值       │
│  Reward-Workers → 计算奖励       │
│  Policy-Workers → 策略推理       │
└─────────────────────────────────┘
```

### 关键特性

1. **异步训练**: Rollout 和 Training 解耦
2. **灵活资源配置**: AutoDeviceMapping
3. **多 Pipeline**: AgenticPipeline, RLVRPipeline, DPOPipeline
4. **策略抽象**: 支持 Megatron/DeepSpeed, vLLM/SGLang

---

## 🔄 当前架构 → ROLL 架构映射

| 当前组件 | ROLL 对应 | 迁移难度 |
|---------|-----------|----------|
| `TrajectoryCollectionService` | Actor-Worker | ⭐⭐ |
| `PolicyServiceManagerService` | Policy-Worker | ⭐⭐ |
| `QualityScorerService` | Reward-Worker | ⭐ |
| `OfflinePolicyEvaluatorService` | Critic-Worker | ⭐⭐⭐ |
| `TrainingPipelineService` | ROLL Training Pipeline | ⭐⭐⭐ |

---

## 💡 迁移思路

### 方案 B：混合架构（推荐）

```
TypeScript (生产环境)
  ├─ DAGOrchestratorService
  └─ 通过 Ray API 调用 ROLL Workers
        ↕
ROLL (训练环境)
  ├─ Actor-Workers
  ├─ Reward-Workers
  └─ Training Pipeline
```

**优势**:
- ✅ 保留生产环境稳定性
- ✅ 利用 ROLL 训练能力
- ✅ 渐进式迁移

---

## 📊 预期收益

- **训练速度**: 1.35× - 2.05× 提升
- **资源利用率**: 提升 20-30%
- **可扩展性**: 支持更大规模训练

---

## ⚠️ 关键挑战

1. **Ray 集群基础设施** - 需要搭建和维护
2. **TypeScript ↔ Ray 集成** - 需要桥接层
3. **学习曲线** - 团队需要学习 Ray/ROLL
4. **迁移成本** - 4-6个月工作量

---

## 🚀 下一步

1. **阅读完整评估文档**
2. **填写角色评估模板**
3. **参与团队评审**
4. **决定是否开始 POC**

---

**快速链接**:
- [ROLL GitHub](https://github.com/alibaba/ROLL)
- [RollArc 论文](https://arxiv.org/abs/2512.22560)
