# ROLL 架构迁移实施计划（方案 B：混合架构）

**决策日期**: 2026-01-21  
**方案**: 方案 B - 混合架构  
**预计时间**: 3-4个月  
**状态**: 🚀 **已批准，开始实施**

---

## 📋 方案 B 架构设计

```
┌─────────────────────────────────────────┐
│  TypeScript/NestJS (生产环境)            │
│  ├─ DAGOrchestratorService              │
│  ├─ RLIntegrationService                 │
│  └─ RollClientService (新增)            │
└─────────────────────────────────────────┘
              ↕ Ray API (新增)
┌─────────────────────────────────────────┐
│  ROLL (训练环境)                        │
│  ├─ Actor-Workers (轨迹生成)            │
│  ├─ Reward-Workers (奖励计算)           │
│  ├─ Policy-Workers (策略推理)           │
│  └─ Training Pipeline (Ray + Megatron) │
└─────────────────────────────────────────┘
```

**核心原则**:
- ✅ 保留 TypeScript 生产环境的稳定性
- ✅ 通过 Ray API 桥接调用 ROLL Workers
- ✅ 渐进式迁移，风险可控

---

## 📅 实施时间线

### Phase 1: 环境搭建与 POC（3-4周）

**目标**: 验证技术可行性

**Week 1-2: 环境搭建**
- [ ] 搭建 Ray 开发环境
- [ ] 安装 ROLL
- [ ] 运行 ROLL 示例
- [ ] 创建基础项目结构

**Week 3-4: POC 实现**
- [ ] 实现简单的 Actor-Worker
- [ ] 实现简单的 Reward-Worker
- [ ] 实现 TypeScript → Ray 桥接
- [ ] 端到端测试

**交付物**:
- ✅ Ray 开发环境
- ✅ POC 代码
- ✅ 性能对比报告

---

### Phase 2: 核心组件迁移（6-8周）

**目标**: 迁移核心 RL 组件到 ROLL Workers

**Week 1-2: 轨迹生成迁移**
- [ ] 将 `TrajectoryCollectionService` 迁移到 Actor-Worker
- [ ] 实现 Ray Object Store 存储
- [ ] 更新 `RLIntegrationService` 调用

**Week 3-4: 奖励计算迁移**
- [ ] 将 `QualityScorerService` 迁移到 Reward-Worker
- [ ] 实现 ROLL Reward-Worker 接口
- [ ] 集成测试

**Week 5-6: 策略推理迁移**
- [ ] 将 `PolicyServiceManagerService` 迁移到 Policy-Worker
- [ ] 实现模型加载和推理
- [ ] 性能优化

**Week 7-8: 训练管道迁移**
- [ ] 集成 ROLL Training Pipeline
- [ ] 配置 Megatron/DeepSpeed 后端
- [ ] MLflow 集成

**交付物**:
- ✅ Actor-Worker 实现
- ✅ Reward-Worker 实现
- ✅ Policy-Worker 实现
- ✅ Training Pipeline 集成

---

### Phase 3: 集成与优化（4-6周）

**目标**: 完善集成，优化性能

**Week 1-2: TypeScript 集成**
- [ ] 完善 `RollClientService`
- [ ] 统一错误处理和重试
- [ ] 实现连接池和负载均衡

**Week 3-4: 监控与观测**
- [ ] 集成 Ray Dashboard
- [ ] 统一 metrics/tracing
- [ ] 实现故障恢复

**Week 5-6: 性能优化**
- [ ] 优化 Worker 资源配置
- [ ] 优化数据传输
- [ ] 性能调优

**交付物**:
- ✅ 完整的 TypeScript 集成
- ✅ 统一监控系统
- ✅ 性能优化报告

---

## 🛠️ 技术实施细节

### 1. RollClientService (TypeScript)

**位置**: `src/agent/training/services/roll-client.service.ts`

**职责**:
- Ray Client API 封装
- Worker 调用接口
- 错误处理和重试
- 连接管理

**接口设计**:
```typescript
@Injectable()
export class RollClientService {
  // 调用 Actor-Worker
  async callActorWorker(request: ActorRequest): Promise<Trajectory>;
  
  // 调用 Reward-Worker
  async callRewardWorker(trajectory: Trajectory): Promise<Reward>;
  
  // 调用 Policy-Worker
  async callPolicyWorker(state: State): Promise<PolicyAction>;
  
  // 启动训练任务
  async startTraining(config: TrainingConfig): Promise<TrainingJob>;
}
```

---

### 2. Actor-Worker (Python/ROLL)

**位置**: `scripts/rl-infra/roll/actor_worker.py`

**职责**:
- 接收 TypeScript 请求
- 生成轨迹数据
- 存储到 Ray Object Store

**实现**:
```python
@ray.remote
class ActorWorker:
    def generate_trajectory(self, request: Dict) -> Dict:
        # 生成轨迹
        trajectory = self._generate(request)
        # 存储到 Ray Object Store
        ref = ray.put(trajectory)
        return ref
```

---

### 3. Reward-Worker (Python/ROLL)

**位置**: `scripts/rl-infra/roll/reward_worker.py`

**职责**:
- 接收轨迹数据
- 计算奖励分数
- 返回奖励结果

**实现**:
```python
@ray.remote
class RewardWorker:
    def compute_reward(self, trajectory_ref: ray.ObjectRef) -> float:
        trajectory = ray.get(trajectory_ref)
        reward = self._compute(trajectory)
        return reward
```

---

### 4. Policy-Worker (Python/ROLL)

**位置**: `scripts/rl-infra/roll/policy_worker.py`

**职责**:
- 加载模型
- 执行策略推理
- 返回动作建议

**实现**:
```python
@ray.remote
class PolicyWorker:
    def __init__(self, model_path: str):
        self.model = self._load_model(model_path)
    
    def predict(self, state: Dict) -> Dict:
        action = self.model.predict(state)
        return action
```

---

## 📊 集成点

### 1. RLIntegrationService 更新

**当前**: 直接调用 `PolicyServiceManagerService`  
**更新后**: 通过 `RollClientService` 调用 ROLL Workers

```typescript
// 更新前
const policyResponse = await this.policyService.predict(request);

// 更新后
const policyResponse = await this.rollClient.callPolicyWorker(state);
```

---

### 2. TrajectoryCollectionService 更新

**当前**: 直接收集轨迹  
**更新后**: 调用 Actor-Worker

```typescript
// 更新前
const trajectory = await this.collectTrajectory(context);

// 更新后
const trajectory = await this.rollClient.callActorWorker(context);
```

---

### 3. QualityScorerService 更新

**当前**: 直接计算奖励  
**更新后**: 调用 Reward-Worker

```typescript
// 更新前
const score = await this.computeQualityScore(trajectory);

// 更新后
const score = await this.rollClient.callRewardWorker(trajectory);
```

---

## 🔧 配置管理

### 环境变量

```bash
# Ray 配置
RAY_ADDRESS=ray://localhost:10001
RAY_NAMESPACE=tripnara-rl

# ROLL 配置
ROLL_ENABLED=true
ROLL_ACTOR_WORKER_NUM=2
ROLL_REWARD_WORKER_NUM=2
ROLL_POLICY_WORKER_NUM=1

# 训练配置
ROLL_TRAINING_BACKEND=megatron  # megatron | deepspeed
ROLL_INFERENCE_BACKEND=vllm     # vllm | sglang
```

---

## 📈 性能目标

### 延迟目标

| 操作 | 当前 | 目标 | 提升 |
|------|------|------|------|
| 策略推理 | 200ms | 150ms | 25% |
| 轨迹生成 | 500ms | 300ms | 40% |
| 奖励计算 | 300ms | 200ms | 33% |

### 吞吐目标

| 指标 | 当前 | 目标 | 提升 |
|------|------|------|------|
| QPS | 500 | 1000 | 100% |
| 资源利用率 | 60% | 80% | 33% |

---

## ✅ 验收标准

### Phase 1 验收

- [ ] ✅ Ray 集群正常运行
- [ ] ✅ TypeScript → Ray 通信成功
- [ ] ✅ POC Workers 正常执行
- [ ] ✅ 性能不低于当前架构

### Phase 2 验收

- [ ] ✅ 所有核心组件迁移完成
- [ ] ✅ 性能提升 >10%
- [ ] ✅ 资源利用率提升 >15%
- [ ] ✅ 集成测试通过

### Phase 3 验收

- [ ] ✅ 生产环境稳定运行
- [ ] ✅ 监控系统完整
- [ ] ✅ 故障恢复机制有效
- [ ] ✅ 性能达到目标

---

## 🚨 风险与缓解

### 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Ray 集群不稳定 | 高 | 使用 Ray 故障恢复，实现检查点 |
| TypeScript ↔ Ray 集成复杂 | 中 | 充分测试，使用 Ray Client API |
| 性能回退 | 中 | 持续性能监控，及时优化 |

### 业务风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 迁移期间服务中断 | 高 | 渐进式迁移，保留旧系统 |
| 开发进度延迟 | 中 | 分阶段实施，设置里程碑 |

---

## 📝 下一步行动

### 立即开始（本周）

1. ✅ **环境搭建**
   - [ ] 安装 Ray（开发环境）
   - [ ] 安装 ROLL
   - [ ] 运行 ROLL 示例

2. ✅ **项目结构**
   - [ ] 创建 `scripts/rl-infra/roll/` 目录
   - [ ] 创建 `src/agent/training/services/roll-client.service.ts`
   - [ ] 更新 `training.module.ts`

3. ✅ **POC 实现**
   - [ ] 实现简单的 Actor-Worker
   - [ ] 实现简单的 Reward-Worker
   - [ ] 实现 TypeScript → Ray 桥接

---

## 📚 参考资料

- [ROLL GitHub](https://github.com/alibaba/ROLL)
- [Ray 官方文档](https://docs.ray.io/)
- [RollArc 论文](https://arxiv.org/abs/2512.22560)

---

**文档版本**: v1.0  
**最后更新**: 2026-01-21  
**负责人**: RL Infrastructure 团队
