# RL Infrastructure 快速启动指南

**创建日期**：2025-01-20  
**最后更新**：2025-01-21  
**状态**：✅ **基础架构已完成**  
**目标**：帮助各角色快速开始实施RL Infrastructure

> 📋 **实施完成总结**：详见 [`IMPLEMENTATION_COMPLETE_SUMMARY.md`](./IMPLEMENTATION_COMPLETE_SUMMARY.md)  
> 📋 **API参考**：详见 [`API_REFERENCE.md`](./API_REFERENCE.md)

---

## 🚀 立即开始

### 对于 Data Engineer（轨迹数据工程）

**你的任务**：实施阶段2 - 数据工程管道

**第一步**：阅读角色文档
```
📖 .claude/roles/rl-infra/data-engineer-trajectory.md
```

**第二步**：理解当前实现
```bash
# 查看现有训练数据准备服务
src/agent/training/services/training-data-preparation.service.ts

# 查看轨迹收集服务
src/agent/training/services/trajectory-collection.service.ts

# 查看轨迹接口定义
src/agent/training/interfaces/trajectory.interface.ts
```

**第三步**：开始实施
1. **创建TrajectoryETLService**
   - 位置：`src/agent/training/services/trajectory-etl.service.ts`
   - 参考：`.claude/roles/rl-infra/data-engineer-trajectory.md` - 轨迹ETL设计章节

2. **创建DataQualityCheckerService**
   - 位置：`src/agent/training/services/data-quality-checker.service.ts`
   - 参考：`.claude/roles/rl-infra/data-engineer-trajectory.md` - 数据质量规则章节

3. **创建PIIAnonymizerService**
   - 位置：`src/agent/training/services/pii-anonymizer.service.ts`
   - 参考：`.claude/roles/rl-infra/data-engineer-trajectory.md` - PII脱敏章节

4. **创建DatasetVersionManagerService**
   - 位置：`src/agent/training/services/dataset-version-manager.service.ts`
   - 参考：`.claude/roles/rl-infra/data-engineer-trajectory.md` - 数据集版本化章节

**验收标准**：
- ✅ 能够从`ValidatedTrajectory`抽取数据并转换为(s,a,r,s')格式
- ✅ 数据质量检查通过率 > 95%
- ✅ PII字段已脱敏
- ✅ 能够创建数据集版本v1.0.0

**预计时间**：1个月

---

### 对于 RL/ML Platform Engineer

**你的任务**：实施阶段3 - 训练平台

**第一步**：阅读角色文档
```
📖 .claude/roles/rl-infra/rl-ml-platform-engineer.md
```

**第二步**：准备环境
```bash
# 1. 搭建Ray集群（本地开发）
pip install ray[default]
ray start --head

# 2. 搭建MLflow
pip install mlflow
mlflow server --backend-store-uri sqlite:///mlflow.db --default-artifact-root ./mlruns

# 3. 准备K8s环境（生产）
# 部署Ray Cluster on K8s
```

**第三步**：开始实施
1. **创建训练流水线（Python）**
   - 位置：`scripts/rl-infra/training_pipeline.py`
   - 参考：`.claude/roles/rl-infra/rl-ml-platform-engineer.md` - 训练流水线设计章节

2. **创建模型注册服务（Python）**
   - 位置：`scripts/rl-infra/model_registry.py`
   - 参考：`.claude/roles/rl-infra/rl-ml-platform-engineer.md` - 模型注册表章节

3. **创建PolicyService（Python FastAPI）**
   - 位置：`scripts/rl-infra/policy_service.py`
   - 参考：`.claude/roles/rl-infra/rl-ml-platform-engineer.md` - PolicyService章节

**验收标准**：
- ✅ Ray集群正常运行（本地+K8s）
- ✅ MLflow Tracking Server正常运行
- ✅ 能够启动分布式训练
- ✅ 能够注册模型到Model Registry
- ✅ PolicyService QPS > 1000, P95延迟 < 100ms

**预计时间**：1个月

---

### 对于 Evaluation Engineer

**你的任务**：实施阶段4 - 评测体系

**第一步**：阅读角色文档
```
📖 .claude/roles/rl-infra/evaluation-engineer.md
```

**第二步**：理解现有Agent组件
```bash
# 查看Gatekeeper Agent
src/agent/services/sub-agents/gatekeeper-agent.service.ts

# 查看Planner Agent
src/agent/services/sub-agents/planner-agent.service.ts

# 查看Claude Orchestrator
src/agent/services/claude-orchestrator.service.ts
```

**第三步**：开始实施
1. **构建测试集**
   - Router测试集：100+测试用例
   - Gate测试集：100+测试用例
   - Itinerary测试集：100+测试用例

2. **创建EvalSuiteService**
   - 位置：`src/agent/training/services/eval-suite.service.ts`
   - 参考：`.claude/roles/rl-infra/evaluation-engineer.md` - Eval Suite设计章节

3. **创建OfflinePolicyEvaluatorService**
   - 位置：`src/agent/training/services/offline-policy-evaluator.service.ts`
   - 参考：`.claude/roles/rl-infra/evaluation-engineer.md` - OPE实现章节

**验收标准**：
- ✅ Eval Suite覆盖Router/Gate/Itinerary三个组件
- ✅ 每个组件100+测试用例
- ✅ 实现IS、DR、WDR三种OPE方法
- ✅ OPE与在线A/B测试相关性 > 0.8

**预计时间**：1个月

---

### 对于 Backend/Infra Engineer

**你的任务**：实施阶段5 - 编排接入与观测

**第一步**：阅读角色文档
```
📖 .claude/roles/rl-infra/backend-infra-engineer.md
```

**第二步**：理解现有编排器
```bash
# 查看Claude Orchestrator
src/agent/services/claude-orchestrator.service.ts

# 查看Agent Service
src/agent/services/agent.service.ts
```

**第三步**：开始实施
1. **创建PolicyOrchestratorIntegrationService**
   - 位置：`src/agent/services/policy-orchestrator-integration.service.ts`
   - 参考：`.claude/roles/rl-infra/backend-infra-engineer.md` - Orchestrator接入章节

2. **集成OpenTelemetry**
   - 安装：`npm install @opentelemetry/api @opentelemetry/sdk-node`
   - 实现：Tracing、Metrics、Logs

3. **创建熔断限流服务**
   - 位置：`src/agent/infra/circuit-breaker.service.ts`
   - 参考：`.claude/roles/rl-infra/backend-infra-engineer.md` - 熔断限流章节

**验收标准**：
- ✅ 能够在GATE_EVAL步骤调用PolicyService
- ✅ Tracing覆盖所有关键操作
- ✅ Metrics覆盖QPS、延迟、错误率
- ✅ 熔断器能够自动触发和恢复

**预计时间**：1个月

---

### 对于 Safety/Compliance Lead

**你的任务**：实施阶段6 - 安全合规

**第一步**：阅读角色文档
```
📖 .claude/roles/rl-infra/safety-compliance-lead.md
```

**第二步**：理解现有安全组件
```bash
# 查看Gatekeeper Agent
src/agent/services/sub-agents/gatekeeper-agent.service.ts

# 查看Compliance Agent
src/agent/services/sub-agents/compliance-agent.service.ts

# 查看HazardZone模型
prisma/schema.prisma (HazardZone)
```

**第三步**：开始实施
1. **创建ConstraintsEngineService**
   - 位置：`src/agent/services/constraints-engine.service.ts`
   - 参考：`.claude/roles/rl-infra/safety-compliance-lead.md` - Constraints Engine章节

2. **创建RiskEventManagerService**
   - 位置：`src/agent/services/risk-event-manager.service.ts`
   - 参考：`.claude/roles/rl-infra/safety-compliance-lead.md` - 风险事件分级章节

**验收标准**：
- ✅ 能够检查地理、时间、合规、用户约束
- ✅ 硬约束规则强制执行
- ✅ 能够分级风险事件（SEV-1/2/3/4）
- ✅ 安全红队用例库包含40+测试用例

**预计时间**：1个月

---

### 对于 PM（RL产品负责人）

**你的任务**：实施阶段7 - 产品化

**第一步**：阅读角色文档
```
📖 .claude/roles/rl-infra/pm-rl-product.md
```

**第二步**：理解现有Reward提取
```bash
# 查看Reward提取服务
src/agent/training/services/reward-signal-extractor.service.ts

# 查看决策日志服务
src/trips/decision/services/decision-logging.service.ts
```

**第三步**：开始实施
1. **定义Reward函数**
   - 创建Reward定义文档
   - 定义业务目标和权重

2. **创建UserFeedbackLoopService**
   - 位置：`src/agent/services/user-feedback-loop.service.ts`
   - 参考：`.claude/roles/rl-infra/pm-rl-product.md` - 用户反馈闭环章节

3. **创建ABTestManagerService**
   - 位置：`src/agent/services/ab-test-manager.service.ts`
   - 参考：`.claude/roles/rl-infra/pm-rl-product.md` - A/B实验设计章节

**验收标准**：
- ✅ Reward函数定义清晰（业务目标、计算公式、权重）
- ✅ 能够追踪用户行为（ADOPT、EDIT、EXPORT、ABANDON）
- ✅ 能够创建A/B实验
- ✅ 能够按灰度节奏逐步上线

**预计时间**：1个月

---

## 📋 实施检查清单

### 阶段2: 数据工程管道

- [ ] 创建`TrajectoryETLService`
- [ ] 实现轨迹ETL（DecisionLog → s,a,r,s'）
- [ ] 创建`DataQualityCheckerService`
- [ ] 实现数据质量检查（缺字段、重复、异常）
- [ ] 创建`PIIAnonymizerService`
- [ ] 实现PII脱敏（用户标识、位置、时间）
- [ ] 创建`DatasetVersionManagerService`
- [ ] 实现数据集版本化（版本号、元数据、可复现性）
- [ ] 导出数据集版本v1.0.0

### 阶段3: 训练平台

- [ ] 搭建Ray集群（本地+K8s）
- [ ] 搭建MLflow Tracking Server + Model Registry
- [ ] 创建训练流水线（Python）
- [ ] 实现分布式训练（Ray）
- [ ] 实现超参数调优（Ray Tune）
- [ ] 创建模型注册服务（Python）
- [ ] 实现模型版本管理
- [ ] 创建PolicyService（Python FastAPI）
- [ ] 实现在线推理（QPS > 1000, P95 < 100ms）
- [ ] 训练第一个模型版本（v1.0.0）

### 阶段4: 评测体系

- [ ] 构建Router测试集（100+测试用例）
- [ ] 构建Gate测试集（100+测试用例）
- [ ] 构建Itinerary测试集（100+测试用例）
- [ ] 创建`EvalSuiteService`
- [ ] 实现Router/Gate/Itinerary评测
- [ ] 创建`OfflinePolicyEvaluatorService`
- [ ] 实现IS、DR、WDR三种OPE方法
- [ ] 创建`ReplayComparatorService`
- [ ] 实现回放对照（baseline vs 新策略）
- [ ] 创建`RegressionGateService`
- [ ] 实现回归门槛（上线gate）

### 阶段5: 编排接入与观测

- [ ] 创建`PolicyOrchestratorIntegrationService`
- [ ] 集成PolicyService到GATE_EVAL步骤
- [ ] 集成PolicyService到PLAN_GEN步骤
- [ ] 集成PolicyService到VERIFY步骤
- [ ] 集成OpenTelemetry（Tracing）
- [ ] 集成Prometheus（Metrics）
- [ ] 实现结构化日志（Logs）
- [ ] 创建`CircuitBreakerService`
- [ ] 创建`RateLimiterService`
- [ ] 创建`RetryPolicyService`
- [ ] 创建`FallbackStrategyService`
- [ ] 创建`CostGovernanceService`

### 阶段6: 安全合规

- [ ] 创建`ConstraintsEngineService`
- [ ] 定义硬约束规则（地理、时间、合规、用户）
- [ ] 集成Constraints Engine到GatekeeperAgent
- [ ] 创建`RiskEventManagerService`
- [ ] 实现风险事件分级（SEV-1/2/3/4）
- [ ] 创建`ComplianceAuditService`
- [ ] 实现合规审计（审计字段、证据链）
- [ ] 创建`SecurityRedTeamService`
- [ ] 构建安全红队用例库（40+测试用例）

### 阶段7: 产品化

- [ ] 定义Reward函数（业务目标、计算公式、权重）
- [ ] 创建`UserFeedbackLoopService`
- [ ] 实现用户行为追踪（ADOPT、EDIT、EXPORT、ABANDON）
- [ ] 实现用户反馈收集和分析
- [ ] 创建`ABTestManagerService`
- [ ] 实现A/B实验（实验组、流量分配、结果分析）
- [ ] 定义灰度节奏（10% → 25% → 50% → 100%）
- [ ] 创建`ExplainableOutputService`
- [ ] 实现可解释输出（信息层级、可视化）

### 阶段8: 增强能力（可选）

- [ ] 创建`ClarificationPromptDesignerService`
- [ ] 设计追问话术模板（10+场景）
- [ ] 创建`RiskPromptDesignerService`
- [ ] 设计风险提示模板（SEV-1/2/3/4）
- [ ] 定义红线规则（10+规则）
- [ ] 定义季节性风险（5+目的地）
- [ ] 标注评测集（100+测试用例）
- [ ] 构建反例库（10+事故模式）
- [ ] 创建`JudgePromptDesignerService`
- [ ] 创建`RewardModelTrainerService`
- [ ] 创建`DiagnosticLabelSystemService`
- [ ] 创建`QualityScorerService`

---

## 🔗 关键资源

### 代码参考

- `src/agent/training/` - 训练相关代码
- `src/agent/services/claude-orchestrator.service.ts` - Claude编排器
- `src/agent/services/sub-agents/` - Sub-Agents实现
- `prisma/schema.prisma` - 数据模型定义

### 文档参考

- `IMPLEMENTATION_PLAN.md` - 详细实施计划
- `SYSTEM_ARCHITECTURE.md` - 系统架构图
- `RL_INFRASTRUCTURE_ASSESSMENT.md` - RL基础设施评估报告
- `NEED_ASSESSMENT.md` - RL Infrastructure需求评估

### 角色文档

- `.claude/roles/rl-infra/data-engineer-trajectory.md` - Data Engineer
- `.claude/roles/rl-infra/rl-ml-platform-engineer.md` - RL/ML Platform Engineer
- `.claude/roles/rl-infra/evaluation-engineer.md` - Evaluation Engineer
- `.claude/roles/rl-infra/backend-infra-engineer.md` - Backend/Infra Engineer
- `.claude/roles/rl-infra/safety-compliance-lead.md` - Safety/Compliance Lead
- `.claude/roles/rl-infra/pm-rl-product.md` - PM（RL产品负责人）

---

## 💬 协作与沟通

### 每日站会

- **时间**：每天上午10:00
- **参与者**：所有RL Infrastructure相关角色
- **内容**：进度更新、阻塞问题、协作需求

### 周会

- **时间**：每周五下午3:00
- **参与者**：所有RL Infrastructure相关角色 + 架构师 + 产品经理
- **内容**：周进度总结、下周计划、风险讨论

### 文档更新

- **实施进度**：更新`IMPLEMENTATION_PLAN.md`中的进度跟踪表
- **问题记录**：在`IMPLEMENTATION_PLAN.md`中记录风险和问题
- **交付物**：在`IMPLEMENTATION_PLAN.md`中标记交付物完成状态

---

## 🎯 成功标准

### 阶段2完成标准

- ✅ 能够从`ValidatedTrajectory`抽取数据并转换为(s,a,r,s')格式
- ✅ 数据质量检查通过率 > 95%
- ✅ PII字段已脱敏
- ✅ 能够创建数据集版本v1.0.0（包含1000+高质量轨迹）

### 阶段3完成标准

- ✅ Ray集群正常运行（本地+K8s）
- ✅ MLflow Tracking Server + Model Registry正常运行
- ✅ 能够启动分布式训练
- ✅ 能够注册模型到Model Registry
- ✅ PolicyService QPS > 1000, P95延迟 < 100ms
- ✅ 训练第一个模型版本（v1.0.0）

### 阶段4完成标准

- ✅ Eval Suite覆盖Router/Gate/Itinerary三个组件
- ✅ 每个组件100+测试用例
- ✅ 实现IS、DR、WDR三种OPE方法
- ✅ OPE与在线A/B测试相关性 > 0.8
- ✅ 回归门槛集成到CI/CD

### 阶段5完成标准

- ✅ 能够在GATE_EVAL/PLAN_GEN/VERIFY步骤调用PolicyService
- ✅ Tracing覆盖所有关键操作
- ✅ Metrics覆盖QPS、延迟、错误率、成本
- ✅ 熔断器、限流器、重试、降级策略正常工作

### 阶段6完成标准

- ✅ Constraints Engine能够检查地理、时间、合规、用户约束
- ✅ 硬约束规则强制执行
- ✅ 能够分级风险事件（SEV-1/2/3/4）
- ✅ 安全红队用例库包含40+测试用例
- ✅ 能够生成合规审计报告

### 阶段7完成标准

- ✅ Reward函数定义清晰（业务目标、计算公式、权重）
- ✅ 能够追踪用户行为（ADOPT、EDIT、EXPORT、ABANDON）
- ✅ 能够创建A/B实验
- ✅ 能够按灰度节奏逐步上线
- ✅ 能够生成用户友好的决策解释

---

---

## ✅ 实施完成状态

**基础架构已完成**（2025-01-21）

所有8个阶段的核心服务已实现：
- ✅ 阶段1：轨迹收集与验证（原有实现）
- ✅ 阶段2：数据工程管道（4个服务）
- ✅ 阶段3：训练平台（3个服务）
- ✅ 阶段4：评测体系（4个服务）
- ✅ 阶段5：编排接入与观测（7个服务）
- ✅ 阶段6：安全合规（4个服务）
- ✅ 阶段7：产品化（4个服务）
- ✅ 阶段8：增强能力（8个服务）

**总计**：30+核心服务，40+ API端点

**下一步**：完善实现细节、集成Python服务、扩展数据源和知识库

---

**记住**：RL Infrastructure的实施是一个长期过程，需要各角色的紧密协作。当前阶段基础架构已完成，下一步应完善细节、集成Python服务、扩展数据源。

**如有问题，请参考**：
- [`IMPLEMENTATION_COMPLETE_SUMMARY.md`](./IMPLEMENTATION_COMPLETE_SUMMARY.md) - 实施完成总结
- [`API_REFERENCE.md`](./API_REFERENCE.md) - API参考文档
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) - 详细实施计划
- 各角色文档 - 具体实施指南
