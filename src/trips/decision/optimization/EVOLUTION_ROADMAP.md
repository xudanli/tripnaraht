# TripNARA 系统进化路线图

## 进化总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TripNARA Evolution                              │
│                                                                     │
│  ┌───────────┐     ┌───────────┐     ┌───────────┐                 │
│  │  Phase 1  │────▶│  Phase 2  │────▶│  Phase 3  │                 │
│  │           │     │           │     │           │                 │
│  │ 目标函数  │     │ 概率模型  │     │ 多智能体  │                 │
│  │ 显式优化  │     │ Monte     │     │ 协商系统  │                 │
│  │           │     │ Carlo     │     │           │                 │
│  └───────────┘     └───────────┘     └───────────┘                 │
│       │                 │                 │                         │
│       ▼                 ▼                 ▼                         │
│  ┌───────────┐     ┌───────────┐     ┌───────────┐                 │
│  │ 规则系统  │     │ 不确定性  │     │ 自进化    │                 │
│  │     ↓     │     │  建模     │     │ 决策体    │                 │
│  │ 优化系统  │     │           │     │           │                 │
│  └───────────┘     └───────────┘     └───────────┘                 │
│                                                                     │
│              技术升级 ──────────────▶ 物种跃迁                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 各阶段核心变化

### Phase 1: 从规则系统到优化系统

| 组件 | 旧版 | Phase 1 |
|------|------|---------|
| Abu | 布尔判断（ALLOW/REJECT） | 约束满足度优化器（0-1 分数） |
| Dre | 贪心调整 | 多候选方案比较 |
| 目标 | 无统一目标 | 八维度效用函数 |
| 输出 | 是/否 | 效用分数 + 权衡分析 |

**核心公式：**
```
ExpectedUtility = w1×Safety + w2×Experience + w3×Philosophy + w4×TimeSlack
                - w5×FatigueRisk - w6×WeatherRisk - w7×BudgetOverrun - w8×PacingVariance
```

### Phase 2: 从点估计到概率分布

| 组件 | Phase 1 | Phase 2 |
|------|---------|---------|
| 天气 | windSpeedMs = 15 | windSpeed ~ N(μ=15, σ²=25) |
| 人体 | maxDailyAscent = 800 | maxDailyAscent ~ N(μ=800, σ²=14400) |
| 效用 | 单点值 | 期望值 + 置信区间 + 风险指标 |
| 决策 | 确定性 | P(feasible), P(U < threshold) |

**核心算法：Monte Carlo 积分**
```
E[U(plan)] ≈ (1/N) × Σᵢ U(plan|sᵢ)  where sᵢ ~ P(WorldState)
```

### Phase 3: 从单一决策到多智能体协商

| 组件 | Phase 2 | Phase 3 |
|------|---------|---------|
| 决策者 | 单一优化器 | 三种人格辩论 |
| 权重 | 固定配置 | 从反馈学习 |
| 输出 | 推荐方案 | 协商结果 + 人类判断点 |
| 系统 | 工具 | 自进化智能系统 |

**核心机制：**
1. 独立评估 → 检测分歧 → 多轮辩论 → 协商投票
2. 收集反馈 → 计算梯度 → 更新权重 → 持续优化

## 文件结构

```
src/trips/decision/optimization/
│
├── Phase 1: 目标函数 + 显式优化器
│   ├── objective-function.interface.ts    # 目标函数接口
│   ├── objective-function.service.ts      # 目标函数实现
│   ├── abu-optimizer.service.ts           # Abu 约束优化器
│   ├── dre-optimizer.service.ts           # Dre 时序优化器
│   ├── strategy-orchestrator-v2.service.ts # V2 编排器
│   └── PHASE_1_ARCHITECTURE.md            # Phase 1 文档
│
├── probabilistic/  Phase 2: 概率模型
│   ├── distribution.interface.ts          # 分布类型定义
│   ├── probabilistic-world-model.interface.ts # 概率世界模型接口
│   ├── probabilistic-world-model.service.ts   # 概率世界模型实现
│   ├── expected-utility.service.ts        # Monte Carlo 期望效用
│   └── PHASE_2_ARCHITECTURE.md            # Phase 2 文档
│
├── learning/  Phase 3: 多智能体 + 学习
│   ├── guardian-persona.interface.ts      # 人格接口定义
│   ├── guardian-debate.service.ts         # 辩论服务
│   ├── weight-learner.service.ts          # 权重学习服务
│   └── PHASE_3_ARCHITECTURE.md            # Phase 3 文档
│
├── collaboration/  中期: 多用户协同
│   ├── multi-user-collaboration.interface.ts  # 团队协同接口
│   └── team-collaboration.service.ts          # 团队协同服务
│
├── realtime/  中期: 实时状态更新
│   ├── realtime-world-state.interface.ts  # 实时状态接口
│   └── realtime-world-state.service.ts    # 实时状态服务
│
├── experiments/  中期: A/B 测试
│   ├── ab-testing.interface.ts            # A/B 测试接口
│   └── ab-testing.service.ts              # A/B 测试服务
│
├── axioms/  公理系统
│   ├── axiom-system.ts                    # 七公理定义
│   ├── axiom-validator.service.ts         # 公理验证服务
│   └── hierarchical-utility.service.ts    # 分层效用服务
│
├── controllers/  API 控制器
│   ├── optimization.controller.ts         # 优化核心 API
│   ├── team-collaboration.controller.ts   # 团队协同 API
│   ├── realtime-state.controller.ts       # 实时状态 API
│   ├── ab-testing.controller.ts           # A/B 测试 API
│   └── axiom-validation.controller.ts     # 公理验证 API
│
├── index.ts                               # 模块导出
└── EVOLUTION_ROADMAP.md                   # 本文档
```

## 代码行数统计

| 阶段 | 文件数 | 代码行数 | 核心能力 |
|------|--------|----------|----------|
| Phase 1 | 6 | ~2,500 | 目标函数、约束优化、候选比较 |
| Phase 2 | 5 | ~2,000 | 概率分布、Monte Carlo、贝叶斯更新 |
| Phase 3 | 4 | ~1,500 | 人格评估、辩论协商、权重学习 |
| **总计** | **15** | **~6,000** | |

## 使用示例：完整流程

```typescript
import {
  // Phase 1
  ObjectiveFunctionService,
  AbuOptimizerService,
  DreOptimizerService,
  
  // Phase 2
  ProbabilisticWorldModelService,
  ExpectedUtilityService,
  
  // Phase 3
  GuardianDebateService,
  WeightLearnerService,
} from './optimization';

// ========== 完整决策流程 ==========

// 1. Phase 1: 基础效用评估
const baseEvaluation = objectiveFunction.evaluate(plan, world);
console.log(`基础效用: ${baseEvaluation.totalUtility}`);

// 2. Phase 2: 概率化评估
const probContext = probabilisticWorldModel.fromDeterministicModel(world);
const expectedUtility = expectedUtilityService.computeExpectedUtility(
  plan, probContext, weights
);
console.log(`期望效用: ${expectedUtility.expectedUtility}`);
console.log(`95% CI: [${expectedUtility.confidenceInterval.lower}, ${expectedUtility.confidenceInterval.upper}]`);
console.log(`可行性概率: ${expectedUtility.feasibilityProbability}`);

// 3. Phase 3: 多智能体协商
const negotiation = await guardianDebate.negotiate(plan, world);
console.log(`决策: ${negotiation.decision}`);
console.log(`共识度: ${negotiation.consensusLevel}`);
for (const eval of negotiation.evaluations) {
  console.log(`  ${eval.persona}: ${eval.stance}`);
}

// 4. Phase 3: 记录反馈并学习
weightLearner.recordFeedback({
  userId: 'user_123',
  tripId: plan.tripId,
  type: 'SATISFACTION_RATING',
  data: { overallSatisfaction: 4, pacingComfort: 3 },
  weightsAtTime: weights,
  utilityAtTime: baseEvaluation.totalUtility,
});

const feedbackHistory = weightLearner.getUserFeedbackHistory('user_123');
if (feedbackHistory.length >= 10) {
  const learning = await weightLearner.learnFromFeedback('user_123', feedbackHistory);
  console.log(`权重更新: ${JSON.stringify(learning.weightChanges)}`);
  console.log(`学习置信度: ${learning.confidence}`);
}
```

## 系统特性对照

| 特性 | 旧版 TripNARA | 进化后 TripNARA |
|------|---------------|-----------------|
| 决策逻辑 | 规则引擎 | 期望效用最大化 |
| 世界模型 | 结构化数据 | 概率分布 + 可推理空间 |
| 目标函数 | 隐式（分散在各策略中） | 显式 + 可学习 |
| 不确定性 | 点估计 + 置信区间 | 完整概率分布 |
| 决策过程 | 单一路径 | 多智能体协商 |
| 优化能力 | 启发式调整 | 多候选比较 + 梯度优化 |
| 适应能力 | 固定参数 | 从反馈学习 |

## 物种跃迁标志

当 TripNARA 同时具备以下能力时，完成物种跃迁：

1. ✅ **概率世界模型** - Phase 2
2. ✅ **可学习目标函数** - Phase 3
3. ✅ **多人格决策协商** - Phase 3
4. ✅ **局部修复能力** - Phase 1 (Neptune)
5. ⏳ **世界状态持续更新** - 贝叶斯更新机制（已实现，待集成）

## 未来扩展

### 短期（3个月）
- [x] 与现有系统集成测试 ✓ `OptimizationModule` 已集成到 `DecisionModule`
- [x] 权重学习的持久化存储 ✓ `WeightPersistenceService` (文件/数据库双模式)
- [x] 协商结果的 UI 展示 ✓ `OptimizationController` REST API 完成

### 中期（6个月）
- [x] 多用户协同（家庭/团队） ✓ `TeamCollaborationService` 完成
- [x] 实时世界状态更新 ✓ `RealtimeWorldStateService` (贝叶斯更新 + RxJS 推送)
- [x] A/B 测试框架 ✓ `ABTestingService` (实验管理 + 统计检验)

### 长期（12个月）
- [ ] 迁移到其他领域（户外赛事、物流路径）
- [ ] 大规模分布式计算
- [ ] 联邦学习（跨用户权重共享）

---

## 公理系统

七条核心公理定义了 TripNARA 的决策理论基础：

### 公理一：标准化公理 (Normalization Axiom)
所有可优化指标必须映射到 [0,1] 区间。
- `createNormalizedScore()` 强制验证
- `Normalizers` 提供标准化函数库

### 公理二：分层组合公理 (Hierarchical Composition Axiom)
总效用通过二级线性组合构成。
- 顶层维度: SAFETY, EXPERIENCE, EFFICIENCY, PHILOSOPHY
- `HierarchicalUtilityService` 实现分层计算

### 公理三：硬约束优先公理 (Feasibility Precedence Axiom)
违反硬约束的计划效用 = -∞。
- `computeUtilityWithFeasibility()` 强制执行

### 公理四：不确定性一致公理 (Uncertainty Consistency Axiom)
概率层包装确定性层，不替代。
- Monte Carlo 使用相同的 `evaluate()` 函数

### 公理五：稳健性优先公理 (Robustness Axiom)
最优方案 = 风险约束下的最大期望效用。
- `evaluateRobustness()` 检查 P_feasible ≥ θ₁, P(U<τ) ≤ θ₂
- `RobustnessConstraints` 可配置阈值

### 公理六：自适应一致公理 (Adaptive Consistency Axiom)
参数可学习，结构不可变。
- 权重边界: `LearnableParameterBounds`
- `validateParameterUpdate()` 强制边界

### 公理七：多智能体一致性公理 (Multi-Agent Consistency Axiom)
所有智能体共享同一效用函数。
- Abu = ConstraintValidator
- Dre = LocalSearchOperator
- Neptune = VarianceMinimizer
- 执行顺序: Abu → Dre → Neptune

### 系统本质

```
argmax_plan E_s[U(plan, s)]
subject to:
  P_feasible ≥ θ₁
  P(U < τ) ≤ θ₂
```

TripNARA = Risk-Constrained Hierarchical Utility Maximizer

---

## REST API 接口

> 完整接口文档见 `/docs/API_REFERENCE.md`

### 路由架构

| 前缀 | 说明 | 鉴权 |
|------|------|------|
| `/api/v2/user/*` | 用户端 API | Bearer Token (用户) |
| `/api/v2/admin/*` | 管理端 API | Bearer Token (管理员) |

### 用户端 API (`/api/v2/user/`)

#### 计划优化 (`/api/v2/user/optimization`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/evaluate` | 评估计划得分（8 维度） |
| POST | `/compare` | 比较两个计划 |
| POST | `/optimize` | 一键优化计划 |
| POST | `/risk-assessment` | 风险评估（Monte Carlo） |
| POST | `/negotiation` | 获取协商结论 |
| POST | `/feedback` | 提交反馈 |
| GET | `/preferences/:userId` | 获取个性化偏好 |

#### 团队协同 (`/api/v2/user/team`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/` | 创建团队 |
| GET | `/:teamId` | 获取团队信息 |
| POST | `/:teamId/members` | 添加成员 |
| DELETE | `/:teamId/members/:userId` | 移除成员 |
| POST | `/:teamId/negotiate` | 团队协商 |
| GET | `/:teamId/weights` | 团队综合权重 |
| GET | `/:teamId/constraints` | 团队约束（最弱链） |

#### 实时状态 (`/api/v2/user/realtime`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/subscribe` | 订阅状态更新 |
| DELETE | `/subscribe/:subscriptionId` | 取消订阅 |
| GET | `/state/:tripId` | 获取当前状态 |
| GET | `/state/:tripId/predict?hoursAhead=N` | 预测未来状态 |
| POST | `/report` | 提交实地报告 |

### 管理端 API (`/api/v2/admin/`)

#### 系统管理 (`/api/v2/admin/optimization`)

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/stats` | 系统统计 |
| GET | `/health` | 健康检查 |
| POST | `/learn/batch` | 批量权重学习 |
| POST | `/learn/:userId` | 单用户学习 |
| GET | `/learning-history/:userId` | 学习历史 |
| GET | `/default-weights` | 获取默认权重 |
| POST | `/default-weights` | 更新默认权重 |

#### 数据导入 (`/api/v2/admin/realtime`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/observations/batch` | 批量导入观测 |
| POST | `/state/initialize` | 初始化行程状态 |
| GET | `/state/:tripId/raw` | 获取原始状态 |
| GET | `/subscriptions/stats` | 订阅统计 |

#### A/B 测试 (`/api/v2/admin/experiments`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/` | 创建实验 |
| GET | `/` | 实验列表 |
| GET | `/:experimentId` | 实验详情 |
| PATCH | `/:experimentId/start` | 启动实验 |
| PATCH | `/:experimentId/pause` | 暂停实验 |
| PATCH | `/:experimentId/stop` | 停止实验 |
| GET | `/:experimentId/analysis` | 实验分析 |
| GET | `/:experimentId/early-stopping` | 早停检查 |

#### 公理验证 (`/api/v2/admin/axioms`)

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/report` | 公理验证报告 |
| GET | `/health` | 公理健康检查 |
| POST | `/validate/weights` | 验证权重配置 |
| GET | `/utility/structure` | 效用结构 |
| POST | `/utility/weights` | 更新效用权重 |
| POST | `/utility/evaluate` | 计算分层效用 |
| GET | `/essence` | 系统核心公式 |

---

*TripNARA 已从"有哲学的规则系统"进化为"在不确定世界中持续自我优化的决策体"。*

*这不仅是技术升级，更是系统智能的质变。*
