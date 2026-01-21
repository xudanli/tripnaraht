# ROLL 架构迁移 POC 计划

**目标**: 验证 ROLL 架构迁移的可行性  
**时间**: 2-3周  
**团队**: RL Infrastructure 核心成员

---

## 📋 POC 目标

1. ✅ 验证 TypeScript → Ray 集成可行性
2. ✅ 验证 ROLL Worker 角色划分合理性
3. ✅ 评估性能提升（vs 当前架构）
4. ✅ 识别技术风险和难点

---

## 🎯 POC 范围

### 包含的功能

1. ✅ **简单的 Actor-Worker**
   - 从 TypeScript 接收请求
   - 生成模拟轨迹
   - 返回轨迹数据

2. ✅ **简单的 Reward-Worker**
   - 接收轨迹数据
   - 计算奖励（模拟）
   - 返回奖励分数

3. ✅ **TypeScript → Ray 桥接**
   - Ray Client API 封装
   - 错误处理和重试
   - 基本监控

### 不包含的功能

- ❌ 完整的训练流程
- ❌ MLflow 集成
- ❌ Megatron/DeepSpeed 集成
- ❌ 生产级稳定性

---

## 📅 时间表

### Week 1: 环境搭建和基础实现

**Day 1-2: 环境搭建**
- [ ] 搭建 Ray 开发环境
- [ ] 安装 ROLL
- [ ] 运行 ROLL 示例

**Day 3-5: 基础 Worker 实现**
- [ ] 实现简单的 Actor-Worker
- [ ] 实现简单的 Reward-Worker
- [ ] 实现基本的 Ray 任务调度

### Week 2: TypeScript 集成

**Day 1-3: Ray Client 封装**
- [ ] 实现 Ray Client API 封装
- [ ] 实现 Worker 调用接口
- [ ] 实现错误处理

**Day 4-5: 集成测试**
- [ ] 端到端测试
- [ ] 性能测试
- [ ] 稳定性测试

### Week 3: 评估和报告

**Day 1-3: 性能对比**
- [ ] 对比当前架构 vs ROLL
- [ ] 评估资源利用率
- [ ] 评估训练速度

**Day 4-5: 报告编写**
- [ ] 技术评估报告
- [ ] 性能对比报告
- [ ] 风险评估报告
- [ ] 迁移建议

---

## 🛠️ 技术实现

### 1. Actor-Worker (Python)

```python
# scripts/rl-infra/roll-poc/actor_worker.py
import ray
from typing import Dict, Any

@ray.remote
class ActorWorker:
    def generate_trajectory(self, request: Dict[str, Any]) -> Dict[str, Any]:
        # 模拟轨迹生成
        trajectory = {
            "steps": [
                {"state": "...", "action": "...", "reward": 0.5}
            ]
        }
        return trajectory
```

### 2. Reward-Worker (Python)

```python
# scripts/rl-infra/roll-poc/reward_worker.py
@ray.remote
class RewardWorker:
    def compute_reward(self, trajectory: Dict[str, Any]) -> float:
        # 模拟奖励计算
        return 0.8
```

### 3. TypeScript Ray Client

```typescript
// src/agent/training/services/roll-client.service.ts
import { Ray } from 'ray';

@Injectable()
export class RollClientService {
  private ray: Ray;

  async callActorWorker(request: any): Promise<any> {
    const actor = await this.ray.getActor('ActorWorker');
    return await actor.generate_trajectory.remote(request);
  }
}
```

---

## 📊 评估指标

### 性能指标

- **延迟**: Actor-Worker 响应时间
- **吞吐**: 每秒处理的请求数
- **资源利用率**: CPU/GPU 使用率

### 稳定性指标

- **错误率**: 请求失败率
- **重试次数**: 平均重试次数
- **故障恢复时间**: 服务恢复时间

### 集成复杂度

- **代码量**: 新增代码行数
- **配置复杂度**: 配置文件数量
- **学习曲线**: 团队学习时间

---

## ✅ 成功标准

### 必须满足（P0）

- [ ] ✅ Ray 集群可以正常运行
- [ ] ✅ TypeScript → Ray 通信成功
- [ ] ✅ Worker 可以正常执行任务
- [ ] ✅ 性能不低于当前架构

### 期望满足（P1）

- [ ] ✅ 性能提升 >10%
- [ ] ✅ 资源利用率提升 >15%
- [ ] ✅ 代码复杂度可接受

---

## 📝 交付物

1. ✅ **POC 代码**
   - Actor-Worker 实现
   - Reward-Worker 实现
   - TypeScript Ray Client

2. ✅ **测试报告**
   - 性能对比数据
   - 稳定性测试结果
   - 集成复杂度评估

3. ✅ **评估报告**
   - 技术可行性结论
   - 迁移建议
   - 风险评估

---

## 🚀 下一步

**POC 完成后**:
1. 团队评审 POC 结果
2. 基于结果决定是否迁移
3. 如迁移，制定详细迁移计划
