# RL Infrastructure 实施计划

**创建日期**：2025-01-20  
**批准日期**：2025-01-20  
**状态**：✅ 已批准，准备实施  
**预计完成时间**：7-8个月（分阶段实施，含缓冲时间）

---

## ✅ 批准记录

**批准日期**：2025-01-20  
**批准人**：Chief AI Scientist  
**评估报告**：`.claude/roles/rl-infra/IMPLEMENTATION_ASSESSMENT.md`

**批准条件**：
- ✅ 技术可行性评估通过
- ✅ 时间估算已调整（7-8个月，含缓冲）
- ✅ 风险缓解措施已加强
- ✅ 验收标准已分阶段定义
- ✅ 并行实施优化已规划

**关键优化建议已采纳**：
1. 时间估算调整：总时间从3-6个月调整为7-8个月（考虑缓冲）
2. 验收标准分阶段：基本功能 → 性能达标 → 生产级优化
3. 依赖关系明确：在实施计划中标注依赖关系
4. 风险缓解加强：数据质量监控、Model Collapse检测、性能监控、Reward验证
5. 并行实施优化：阶段2和阶段3可并行，阶段4和阶段6可提前准备

---

## 📋 执行摘要

本计划按照优先级分阶段实施RL Infrastructure，从P0（立即实施）到P3（可选增强），确保系统能够完成完整的Iterative Deployment循环。

**当前状态**：
- ✅ **阶段1已完成**：轨迹收集、验证、Reward提取、训练数据准备
- ⚠️ **阶段2-8待实施**：数据工程、训练平台、评测体系、编排接入、安全合规、产品化、增强能力

---

## 🎯 实施路线图

```
当前状态 (阶段1完成)
    ↓
阶段2: 数据工程管道 (P0 - 1个月)
    ↓
阶段3: 训练平台 (P0 - 1个月)
    ↓
阶段4: 评测体系 (P1 - 1个月)
    ↓
阶段5: 编排接入与观测 (P1 - 1个月)
    ↓
阶段6: 安全合规 (P2 - 1个月)
    ↓
阶段7: 产品化 (P2 - 1个月)
    ↓
阶段8: 增强能力 (P3 - 按需)
```

---

## 📅 阶段2: 数据工程管道 (P0 - 立即实施)

### 负责人：Data Engineer（轨迹数据工程）

### 任务清单

#### 2.1 轨迹ETL实现

**任务**：实现将DecisionLog/State/ToolCall转换为(s,a,r,s')格式的ETL管道

**实施步骤**：
1. **设计轨迹Schema**
   - 定义State格式（规划请求上下文）
   - 定义Action格式（Agent决策动作）
   - 定义Reward格式（用户反馈和验证结果）
   - 定义Next State格式（执行后的新状态）

2. **实现ETL服务**
   - 创建`TrajectoryETLService`
   - 实现`extractTrajectories()`：从数据库抽取轨迹数据
   - 实现`transformToRLFormat()`：转换为(s,a,r,s')格式
   - 实现`loadToDataset()`：加载到训练数据集

3. **集成到现有系统**
   - 在`TrainingDataPreparationService`中调用ETL服务
   - 确保ETL输出格式与训练数据格式兼容

**验收标准**：
- ✅ 能够从`ValidatedTrajectory`和`DecisionLog`抽取数据
- ✅ 能够转换为标准的(s,a,r,s')格式
- ✅ 能够导出为Parquet/JSONL格式
- ✅ ETL性能：处理1000条轨迹 < 5分钟

**参考文档**：
- `.claude/roles/rl-infra/data-engineer-trajectory.md` - Data Engineer角色文档
- `src/agent/training/services/training-data-preparation.service.ts` - 训练数据准备服务

#### 2.2 数据质量规则实现

**任务**：实现数据质量检查（缺字段、重复、异常）

**实施步骤**：
1. **实现数据质量检查器**
   - 创建`DataQualityCheckerService`
   - 实现`validateTrajectory()`：验证单个轨迹质量
   - 实现`validateDataset()`：验证数据集质量

2. **定义质量规则**
   - 必需字段检查（trajectoryId、plan、decisionTrace等）
   - 重复检查（基于trajectoryId）
   - 异常检查（reward超出范围、state格式错误等）
   - 完整性检查（s→a→r→s'链条完整性）

3. **集成到ETL流程**
   - 在ETL过程中自动进行质量检查
   - 生成质量报告

**验收标准**：
- ✅ 必需字段完整率 > 99%
- ✅ 重复率 < 1%
- ✅ 异常率 < 5%
- ✅ 完整性率 > 95%
- ✅ 能够生成质量报告

**参考文档**：
- `.claude/roles/rl-infra/data-engineer-trajectory.md` - 数据质量规则章节

#### 2.3 PII脱敏实现

**任务**：实现PII/合规脱敏策略

**实施步骤**：
1. **实现PII脱敏器**
   - 创建`PIIAnonymizerService`
   - 实现`anonymizeTrajectory()`：脱敏轨迹数据
   - 实现`anonymizeField()`：脱敏单个字段

2. **定义脱敏规则**
   - userId → hash(userId) → "user_xxx"
   - email → hash(email) → "email_xxx"
   - phone → 移除或hash
   - 精确坐标 → (country_code, city_name)
   - 精确时间 → date（保留日期，移除时间）

3. **集成到ETL流程**
   - 在ETL过程中自动进行PII脱敏
   - 确保脱敏后的数据仍可用于训练

**验收标准**：
- ✅ 所有PII字段已脱敏
- ✅ 脱敏后的数据仍可用于训练
- ✅ 符合GDPR、CCPA合规要求
- ✅ 脱敏性能：处理1000条轨迹 < 2分钟

**参考文档**：
- `.claude/roles/rl-infra/data-engineer-trajectory.md` - PII脱敏章节

#### 2.4 数据集版本化实现

**任务**：实现数据集版本管理（版本号、元数据、可复现性）

**实施步骤**：
1. **实现数据集版本管理器**
   - 创建`DatasetVersionManagerService`
   - 实现`createDatasetVersion()`：创建数据集版本
   - 实现`getDatasetVersion()`：获取指定版本
   - 实现`listDatasetVersions()`：列出所有版本
   - 实现`compareVersions()`：对比两个版本

2. **定义版本元数据**
   - 数据来源（日期范围、筛选条件）
   - 质量报告（质量分数、问题统计）
   - 代码版本（ETL代码的git commit hash）
   - 配置哈希（ETL配置的哈希值）

3. **集成到ETL流程**
   - 在ETL完成后自动创建数据集版本
   - 确保版本可追溯和可复现

**验收标准**：
- ✅ 能够创建数据集版本（v1.0.0格式）
- ✅ 版本元数据完整（数据来源、质量报告、代码版本）
- ✅ 版本可追溯和可复现
- ✅ 能够对比不同版本的数据集

**参考文档**：
- `.claude/roles/rl-infra/data-engineer-trajectory.md` - 数据集版本化章节

### 预计时间：1个月

### 交付物：
- ✅ `TrajectoryETLService` - 轨迹ETL服务
- ✅ `DataQualityCheckerService` - 数据质量检查服务
- ✅ `PIIAnonymizerService` - PII脱敏服务
- ✅ `DatasetVersionManagerService` - 数据集版本管理服务
- ✅ 数据集版本v1.0.0（包含1000+高质量轨迹）

---

## 📅 阶段3: 训练平台 (P0 - 立即实施)

### 负责人：RL/ML Platform Engineer

### 任务清单

#### 3.1 训练流水线搭建

**任务**：搭建自动化训练CI/CD（Ray/K8s/MLflow）

**实施步骤**：
1. **搭建Ray集群**
   - 本地开发环境（Ray Local）
   - K8s生产环境（Ray Cluster on K8s）
   - 配置资源管理（CPU、GPU、内存）

2. **集成MLflow**
   - 搭建MLflow Tracking Server
   - 配置MLflow Model Registry
   - 实现训练指标记录

3. **实现训练流水线**
   - 创建`TrainingPipelineService`（Python）
   - 实现`trainModel()`：分布式训练
   - 实现`tuneHyperparameters()`：超参数调优（Ray Tune）
   - 实现`saveCheckpoint()`：模型检查点保存

4. **集成到现有系统**
   - 在`TrainingDataPreparationService`中调用训练流水线
   - 确保训练数据格式兼容

**验收标准**：
- ✅ Ray集群正常运行（本地+K8s）
- ✅ MLflow Tracking Server正常运行
- ✅ 能够启动分布式训练
- ✅ 能够进行超参数调优
- ✅ 训练指标实时记录到MLflow

**参考文档**：
- `.claude/roles/rl-infra/rl-ml-platform-engineer.md` - 训练流水线章节

#### 3.2 模型注册表实现

**任务**：实现Model Registry（版本管理、元数据、可回滚）

**实施步骤**：
1. **实现模型注册服务**
   - 创建`ModelRegistryService`（Python）
   - 实现`registerModel()`：注册模型到MLflow
   - 实现`getModelVersion()`：获取指定版本
   - 实现`listModelVersions()`：列出所有版本
   - 实现`rollbackToVersion()`：回滚到指定版本

2. **定义模型元数据**
   - 版本号（语义化版本：v1.0.0）
   - 训练配置（超参数、数据集版本）
   - 训练指标（loss、reward、accuracy）
   - 评测指标（Eval Suite结果）

3. **集成到训练流程**
   - 在训练完成后自动注册模型
   - 确保模型版本可追溯和可回滚

**验收标准**：
- ✅ 能够注册模型到MLflow Model Registry
- ✅ 模型版本可追溯（版本号、元数据）
- ✅ 模型版本可回滚（保留历史版本）
- ✅ 能够对比不同版本的性能指标

**参考文档**：
- `.claude/roles/rl-infra/rl-ml-platform-engineer.md` - 模型注册表章节

#### 3.3 PolicyService在线推理实现

**任务**：实现PolicyService的在线推理服务（QPS/延迟/回退）

**实施步骤**：
1. **实现PolicyService**
   - 创建`PolicyService`（Python FastAPI）
   - 实现`predict()`：策略推理API
   - 实现`healthCheck()`：健康检查
   - 实现`metrics()`：服务指标

2. **实现模型加载和推理**
   - 加载模型（ONNX、TorchScript、TensorFlow SavedModel）
   - 实现推理逻辑（输入预处理、模型推理、输出后处理）
   - 实现推理优化（TensorRT、ONNX Runtime、模型量化）

3. **实现A/B测试支持**
   - 支持多版本模型同时在线
   - 实现流量分配（一致性哈希）
   - 实现实验追踪（experiment_id）

4. **实现回退策略**
   - 模型失败时回退到baseline
   - 模型失败时回退到历史版本
   - 实现自动回退机制

**验收标准**：
- ✅ PolicyService QPS > 1000
- ✅ P95延迟 < 100ms
- ✅ 可用性 > 99.9%
- ✅ 支持A/B测试（多版本模型）
- ✅ 支持自动回退（baseline/历史版本）

**参考文档**：
- `.claude/roles/rl-infra/rl-ml-platform-engineer.md` - PolicyService章节

### 预计时间：1个月

### 交付物：
- ✅ Ray集群（本地+K8s）
- ✅ MLflow Tracking Server + Model Registry
- ✅ `TrainingPipelineService` - 训练流水线服务
- ✅ `ModelRegistryService` - 模型注册服务
- ✅ `PolicyService` - 在线推理服务
- ✅ 第一个训练模型版本（v1.0.0）

---

## 📅 阶段4: 评测体系 (P1 - 1-2个月)

### 负责人：Evaluation Engineer

### 任务清单

#### 4.1 Eval Suite构建

**任务**：构建Router/Gate/Itinerary的指标与测试集

**实施步骤**：
1. **构建测试集**
   - Router测试集（100+测试用例）
   - Gate测试集（100+测试用例）
   - Itinerary测试集（100+测试用例）

2. **实现Eval Suite**
   - 创建`EvalSuiteService`
   - 实现`evaluateRouter()`：Router组件评测
   - 实现`evaluateGate()`：Gate组件评测
   - 实现`evaluateItinerary()`：Itinerary组件评测
   - 实现`evaluateFullPipeline()`：完整流程评测

3. **定义评测指标**
   - Router：准确率、覆盖率、延迟、错误率
   - Gate：精确率、召回率、误报率、漏报率
   - Itinerary：成功率、平均plan长度、可执行性分数

**验收标准**：
- ✅ 测试集覆盖Router/Gate/Itinerary三个组件
- ✅ 每个组件100+测试用例
- ✅ 能够自动化运行Eval Suite
- ✅ 能够生成评测报告

**参考文档**：
- `.claude/roles/rl-infra/evaluation-engineer.md` - Eval Suite章节

#### 4.2 OPE实现

**任务**：实现Offline Policy Evaluation（DR/WDR等）

**实施步骤**：
1. **实现OPE方法**
   - 创建`OfflinePolicyEvaluatorService`
   - 实现`evaluateWithIS()`：Importance Sampling
   - 实现`evaluateWithDR()`：Doubly Robust
   - 实现`evaluateWithWDR()`：Weighted Doubly Robust

2. **实现报告生成**
   - 实现`generateReport()`：生成OPE报告
   - 包含：估计reward、置信区间、统计显著性

3. **集成到评测流程**
   - 在模型训练后自动运行OPE
   - 确保OPE结果用于上线决策

**验收标准**：
- ✅ 实现IS、DR、WDR三种OPE方法
- ✅ OPE与在线A/B测试相关性 > 0.8
- ✅ 能够生成OPE报告
- ✅ OPE结果用于上线决策

**参考文档**：
- `.claude/roles/rl-infra/evaluation-engineer.md` - OPE章节

#### 4.3 回放对照实现

**任务**：实现baseline vs 新策略的回放对比

**实施步骤**：
1. **实现回放服务**
   - 创建`ReplayComparatorService`
   - 实现`replayBaseline()`：回放baseline策略
   - 实现`replayNewPolicy()`：回放新策略
   - 实现`compareResults()`：对比两个策略的结果

2. **集成到评测流程**
   - 在模型训练后自动运行回放对照
   - 确保回放结果用于性能评估

**验收标准**：
- ✅ 能够回放baseline策略
- ✅ 能够回放新策略
- ✅ 能够对比两个策略的性能差异
- ✅ 回放结果用于性能评估

**参考文档**：
- `.claude/roles/rl-infra/evaluation-engineer.md` - 回放对照章节

#### 4.4 回归门槛实现

**任务**：实现上线gate（性能阈值）

**实施步骤**：
1. **实现回归门槛检查**
   - 创建`RegressionGateService`
   - 实现`checkRegression()`：检查是否通过回归门槛
   - 实现`checkStatisticalSignificance()`：检查统计显著性

2. **定义性能阈值**
   - 成功率：新策略 >= baseline * 0.95
   - 平均Reward：新策略 >= baseline * 0.95
   - Gate误报率：< 1%
   - 延迟：P95 <= baseline * 1.1

3. **集成到CI/CD**
   - 在模型部署前自动检查回归门槛
   - 未通过门槛时阻止部署

**验收标准**：
- ✅ 能够检查回归门槛
- ✅ 能够检查统计显著性
- ✅ 集成到CI/CD流程
- ✅ 未通过门槛时阻止部署

**参考文档**：
- `.claude/roles/rl-infra/evaluation-engineer.md` - 回归门槛章节

### 预计时间：1个月

### 交付物：
- ✅ `EvalSuiteService` - Eval Suite服务
- ✅ `OfflinePolicyEvaluatorService` - OPE服务
- ✅ `ReplayComparatorService` - 回放对照服务
- ✅ `RegressionGateService` - 回归门槛服务
- ✅ 测试集（300+测试用例）
- ✅ 第一个OPE报告

---

## 📅 阶段5: 编排接入与观测 (P1 - 1-2个月)

### 负责人：Backend/Infra Engineer

### 任务清单

#### 5.1 Orchestrator接入

**任务**：将Policy decision → action → execution接入Orchestrator

**实施步骤**：
1. **实现Policy集成服务**
   - 创建`PolicyOrchestratorIntegrationService`
   - 实现`integratePolicyDecision()`：在编排器中集成Policy决策
   - 实现`convertToAction()`：将Policy决策转换为Orchestrator action

2. **集成到关键决策点**
   - GATE_EVAL步骤：调用PolicyService
   - PLAN_GEN步骤：调用PolicyService
   - VERIFY步骤：调用PolicyService

3. **实现A/B测试支持**
   - 支持experiment_id传递
   - 支持流量分配（一致性哈希）
   - 支持多版本模型同时在线

**验收标准**：
- ✅ 能够在GATE_EVAL步骤调用PolicyService
- ✅ 能够在PLAN_GEN步骤调用PolicyService
- ✅ 能够在VERIFY步骤调用PolicyService
- ✅ 支持A/B测试（experiment_id、流量分配）
- ✅ Policy决策能够转换为Orchestrator action

**参考文档**：
- `.claude/roles/rl-infra/backend-infra-engineer.md` - Orchestrator接入章节
- `src/agent/services/claude-orchestrator.service.ts` - 现有编排器

#### 5.2 统一观测实现

**任务**：实现统一tracing / metrics / logs（含实验号、模型版本）

**实施步骤**：
1. **实现Tracing**
   - 集成OpenTelemetry
   - 实现trace_id生成和传递
   - 实现span记录（Agent调用、Tool调用、Policy推理）

2. **实现Metrics**
   - 集成Prometheus
   - 实现关键指标收集（QPS、延迟、错误率、成本）
   - 实现指标标签（experiment_id、model_version）

3. **实现Logs**
   - 实现结构化日志（JSON格式）
   - 实现日志字段（trace_id、experiment_id、model_version）
   - 集成日志聚合（ELK Stack或Loki）

**验收标准**：
- ✅ Tracing覆盖所有关键操作
- ✅ Metrics覆盖QPS、延迟、错误率、成本
- ✅ Logs包含trace_id、experiment_id、model_version
- ✅ 能够查询和可视化观测数据

**参考文档**：
- `.claude/roles/rl-infra/backend-infra-engineer.md` - 统一观测章节

#### 5.3 熔断限流实现

**任务**：实现熔断、限流、重试、降级策略

**实施步骤**：
1. **实现熔断器**
   - 创建`CircuitBreakerService`
   - 实现状态管理（CLOSED、OPEN、HALF_OPEN）
   - 实现触发条件（错误率、延迟阈值）

2. **实现限流器**
   - 创建`RateLimiterService`
   - 实现Token Bucket算法
   - 实现限流维度（用户、IP、API端点）

3. **实现重试策略**
   - 创建`RetryPolicyService`
   - 实现指数退避
   - 实现最大重试次数

4. **实现降级策略**
   - 创建`FallbackStrategyService`
   - 实现baseline模型降级
   - 实现历史版本降级

**验收标准**：
- ✅ 熔断器能够自动触发和恢复
- ✅ 限流器能够限制QPS
- ✅ 重试策略能够自动重试失败请求
- ✅ 降级策略能够自动降级到baseline

**参考文档**：
- `.claude/roles/rl-infra/backend-infra-engineer.md` - 熔断限流章节

#### 5.4 成本治理实现

**任务**：实现成本治理（token/tool/latency budget）

**实施步骤**：
1. **实现成本检查**
   - 创建`CostGovernanceService`
   - 实现`checkBudget()`：检查预算
   - 实现`trackCost()`：记录实际成本

2. **定义预算策略**
   - Token预算：根据请求复杂度动态调整
   - Tool预算：限制昂贵Tool的调用次数
   - 延迟预算：根据用户期望设置延迟预算

3. **集成到Orchestrator**
   - 在请求处理前检查预算
   - 在请求处理后记录成本

**验收标准**：
- ✅ 能够检查Token预算
- ✅ 能够检查Tool预算
- ✅ 能够检查延迟预算
- ✅ 能够记录实际成本
- ✅ 预算超限时能够告警

**参考文档**：
- `.claude/roles/rl-infra/backend-infra-engineer.md` - 成本治理章节

### 预计时间：1个月

### 交付物：
- ✅ `PolicyOrchestratorIntegrationService` - Policy集成服务
- ✅ `ObservabilityService` - 统一观测服务
- ✅ `CircuitBreakerService` - 熔断器服务
- ✅ `RateLimiterService` - 限流器服务
- ✅ `RetryPolicyService` - 重试策略服务
- ✅ `FallbackStrategyService` - 降级策略服务
- ✅ `CostGovernanceService` - 成本治理服务
- ✅ 统一观测Dashboard（Grafana）

---

## 📅 阶段6: 安全合规 (P2 - 2-3个月)

### 负责人：Safety/Compliance Lead

### 任务清单

#### 6.1 Constraints Engine实现

**任务**：实现硬约束规则引擎（禁区/风险/consent）

**实施步骤**：
1. **实现Constraints Engine**
   - 创建`ConstraintsEngineService`
   - 实现`checkConstraints()`：检查规划是否违反约束
   - 实现规则匹配和执行

2. **定义约束规则**
   - 地理约束（危险区域、禁区）
   - 时间约束（季节性风险、天气风险）
   - 合规约束（签证、许可、法规）
   - 用户约束（风险偏好、健康限制）

3. **集成到GatekeeperAgent**
   - 在GatekeeperAgent中调用Constraints Engine
   - 确保硬约束规则强制执行

**验收标准**：
- ✅ 能够检查地理、时间、合规、用户约束
- ✅ 硬约束规则强制执行
- ✅ 软约束规则警告但不阻止
- ✅ 集成到GatekeeperAgent

**参考文档**：
- `.claude/roles/rl-infra/safety-compliance-lead.md` - Constraints Engine章节
- `src/agent/services/sub-agents/gatekeeper-agent.service.ts` - Gatekeeper Agent

#### 6.2 风险事件分级实现

**任务**：实现风险事件分级与处置流程（SEV）

**实施步骤**：
1. **实现风险事件管理器**
   - 创建`RiskEventManagerService`
   - 实现`classifyRiskEvent()`：分级风险事件
   - 实现`handleRiskEvent()`：处置风险事件

2. **定义SEV分级标准**
   - SEV-1（Critical）：立即阻止
   - SEV-2（High）：需要用户明确批准
   - SEV-3（Medium）：警告用户
   - SEV-4（Low）：信息提示

3. **实现告警机制**
   - SEV-1/SEV-2事件自动告警
   - 告警通知到安全团队

**验收标准**：
- ✅ 能够分级风险事件（SEV-1/2/3/4）
- ✅ 能够处置风险事件（BLOCK/APPROVE/MITIGATE）
- ✅ SEV-1/SEV-2事件自动告警
- ✅ 风险事件可追溯

**参考文档**：
- `.claude/roles/rl-infra/safety-compliance-lead.md` - 风险事件分级章节

#### 6.3 合规审计实现

**任务**：实现合规审计字段与证据链要求

**实施步骤**：
1. **实现合规审计服务**
   - 创建`ComplianceAuditService`
   - 实现`recordDecision()`：记录决策审计信息
   - 实现`buildEvidenceChain()`：构建证据链

2. **定义审计字段**
   - 决策信息（决策类型、决策结果、决策时间）
   - 约束信息（约束检查结果、违反的约束、SEV级别）
   - 上下文信息（用户输入、规划请求、模型版本）
   - 证据链（完整的决策追溯链）

3. **实现合规报告生成**
   - 实现`generateComplianceReport()`：生成合规审计报告
   - 定期生成报告（每周/每月）

**验收标准**：
- ✅ 能够记录决策审计信息
- ✅ 能够构建完整的证据链
- ✅ 能够生成合规审计报告
- ✅ 审计数据可追溯

**参考文档**：
- `.claude/roles/rl-infra/safety-compliance-lead.md` - 合规审计章节

#### 6.4 安全红队用例构建

**任务**：构建安全红队用例（高风险目的地/季节）

**实施步骤**：
1. **实现安全红队服务**
   - 创建`SecurityRedTeamService`
   - 实现`createTestCase()`：创建安全测试用例
   - 实现`runRedTeamTests()`：运行红队测试

2. **构建测试用例库**
   - 高风险目的地测试用例（10+）
   - 高风险季节测试用例（10+）
   - 边缘案例测试用例（10+）
   - 已知漏洞测试用例（10+）

3. **集成到评测流程**
   - 在模型部署前自动运行红队测试
   - 未通过测试时阻止部署

**验收标准**：
- ✅ 测试用例库覆盖高风险场景（40+测试用例）
- ✅ 能够自动化运行红队测试
- ✅ 未通过测试时阻止部署
- ✅ 测试结果用于安全评估

**参考文档**：
- `.claude/roles/rl-infra/safety-compliance-lead.md` - 安全红队用例章节

### 预计时间：1个月

### 交付物：
- ✅ `ConstraintsEngineService` - Constraints Engine服务
- ✅ `RiskEventManagerService` - 风险事件管理服务
- ✅ `ComplianceAuditService` - 合规审计服务
- ✅ `SecurityRedTeamService` - 安全红队服务
- ✅ 安全红队用例库（40+测试用例）
- ✅ 第一个合规审计报告

---

## 📅 阶段7: 产品化 (P2 - 2-3个月)

### 负责人：PM（RL产品负责人）

### 任务清单

#### 7.1 Reward定义实现

**任务**：定义reward的业务含义、成功指标、目标函数权重

**实施步骤**：
1. **定义Reward函数**
   - 创建`RewardDefinitionService`
   - 定义业务目标（成功率、满意度、成本、合规率）
   - 定义Reward计算公式
   - 定义权重设置

2. **集成到Reward提取**
   - 在`RewardSignalExtractorService`中使用Reward定义
   - 确保Reward计算符合业务目标

3. **验证Reward效果**
   - 分析Reward分布
   - 验证Reward与业务指标的相关性

**验收标准**：
- ✅ Reward函数定义清晰（业务目标、计算公式、权重）
- ✅ Reward计算符合业务目标
- ✅ Reward分布合理
- ✅ Reward与业务指标相关性 > 0.7

**参考文档**：
- `.claude/roles/rl-infra/pm-rl-product.md` - Reward定义章节
- `src/agent/training/services/reward-signal-extractor.service.ts` - Reward提取服务

#### 7.2 用户反馈闭环实现

**任务**：实现埋点与用户反馈闭环（采纳/编辑/导出/放弃）

**实施步骤**：
1. **实现用户行为追踪**
   - 创建`UserFeedbackLoopService`
   - 实现`trackUserAction()`：追踪用户行为
   - 实现`collectFeedback()`：收集用户反馈

2. **实现反馈分析**
   - 实现`analyzeFeedback()`：分析用户反馈
   - 实现反馈统计和趋势分析

3. **实现反馈应用**
   - 实现`applyFeedbackToReward()`：将反馈应用到Reward计算
   - 确保反馈数据用于模型训练

**验收标准**：
- ✅ 能够追踪用户行为（ADOPT、EDIT、EXPORT、ABANDON）
- ✅ 能够收集用户反馈（满意度、评论、问题）
- ✅ 能够分析用户反馈（统计、趋势）
- ✅ 反馈数据用于Reward计算和模型训练

**参考文档**：
- `.claude/roles/rl-infra/pm-rl-product.md` - 用户反馈闭环章节

#### 7.3 A/B实验设计实现

**任务**：设计A/B实验、灰度节奏、上线标准

**实施步骤**：
1. **实现A/B测试管理器**
   - 创建`ABTestManagerService`
   - 实现`createExperiment()`：创建A/B实验
   - 实现`assignToGroup()`：分配用户到实验组
   - 实现`analyzeResults()`：分析实验结果

2. **定义灰度节奏**
   - Phase 1: 10%流量，3天
   - Phase 2: 25%流量，3天
   - Phase 3: 50%流量，3天
   - Phase 4: 100%流量，持续

3. **定义上线标准**
   - 性能阈值（成功率、reward、延迟）
   - 统计显著性（p-value < 0.05）
   - 最小样本量（1000+）

**验收标准**：
- ✅ 能够创建A/B实验
- ✅ 能够分配用户到实验组（一致性哈希）
- ✅ 能够分析实验结果（性能对比、统计显著性）
- ✅ 能够按灰度节奏逐步上线

**参考文档**：
- `.claude/roles/rl-infra/pm-rl-product.md` - A/B实验设计章节

#### 7.4 可解释输出规范实现

**任务**：定义"可解释输出"的产品规范（证据链、决策日志）

**实施步骤**：
1. **定义可解释输出格式**
   - 创建`ExplainableOutputService`
   - 定义信息层级（摘要、过程、详细证据）
   - 定义可视化格式（决策树、证据图、时间线）

2. **实现解释生成**
   - 实现`generateExplanation()`：生成决策解释
   - 实现用户友好的解释格式

3. **集成到现有系统**
   - 在NarratorAgent中使用可解释输出
   - 确保解释与决策一致

**验收标准**：
- ✅ 可解释输出格式清晰（信息层级、可视化）
- ✅ 能够生成用户友好的解释
- ✅ 解释与决策一致
- ✅ 解释可追溯（证据链）

**参考文档**：
- `.claude/roles/rl-infra/pm-rl-product.md` - 可解释输出规范章节

### 预计时间：1个月

### 交付物：
- ✅ `RewardDefinitionService` - Reward定义服务
- ✅ `UserFeedbackLoopService` - 用户反馈闭环服务
- ✅ `ABTestManagerService` - A/B测试管理服务
- ✅ `ExplainableOutputService` - 可解释输出服务
- ✅ 第一个A/B实验配置
- ✅ 第一个可解释输出示例

---

## 📅 阶段8: 增强能力 (P3 - 按需)

### 负责人：UX Writer、Domain Expert Network、LLM Judge/RM Engineer

### 任务清单

#### 8.1 UX设计实现（可选）

**任务**：设计追问话术、风险提示、决策解释、反馈入口

**实施步骤**：
1. **设计追问话术模板**
   - 创建`ClarificationPromptDesignerService`
   - 设计10+场景的话术模板
   - 实现多语言支持（中英文）

2. **设计风险提示模板**
   - 创建`RiskPromptDesignerService`
   - 设计SEV-1/2/3/4级别的提示模板
   - 实现用户友好的风险表达

3. **设计决策解释UI**
   - 创建`DecisionExplanationDesignerService`
   - 设计信息层级和可视化格式
   - 实现用户友好的解释

**验收标准**：
- ✅ 追问话术模板覆盖10+场景
- ✅ 风险提示模板覆盖SEV-1/2/3/4级别
- ✅ 决策解释UI清晰友好
- ✅ 多语言支持（中英文）

**参考文档**：
- `.claude/roles/rl-infra/ux-writer.md` - UX Writer角色文档

#### 8.2 领域专家知识库构建（可选）

**任务**：构建红线规则、季节性风险、评测集标注、反例库

**实施步骤**：
1. **定义红线规则**
   - 创建10+红线规则（高风险目的地）
   - 定义规则条件和阈值

2. **定义季节性风险**
   - 创建5+目的地的季节性风险定义
   - 定义风险月份和缓解措施

3. **标注评测集**
   - 标注100+测试用例（可执行性、危险建议）
   - 确保标注质量和一致性

4. **构建反例库**
   - 收集10+典型事故模式
   - 提取反例和教训

**验收标准**：
- ✅ 红线规则覆盖10+高风险场景
- ✅ 季节性风险覆盖5+目的地
- ✅ 评测集标注100+测试用例
- ✅ 反例库包含10+事故模式

**参考文档**：
- `.claude/roles/rl-infra/domain-expert-network.md` - Domain Expert Network角色文档

#### 8.3 LLM Judge/RM实现（可选）

**任务**：实现Judge Prompts、RM训练/蒸馏、诊断标签、质量评分

**实施步骤**：
1. **设计Judge Prompts**
   - 创建`JudgePromptDesignerService`
   - 设计评分标准和Prompt模板
   - 构建校准集（100+ golden examples）

2. **实现RM训练**
   - 创建`RewardModelTrainerService`
   - 实现偏好对比训练
   - 实现评分回归训练

3. **实现诊断标签**
   - 创建`DiagnosticLabelSystemService`
   - 实现5+标签类型的检测
   - 实现标签对评分的影响

4. **实现质量评分**
   - 创建`QualityScorerService`
   - 实现LLM Judge + RM融合评分
   - 实现评分解释生成

**验收标准**：
- ✅ Judge Prompts设计清晰（评分标准、模板、校准集）
- ✅ RM训练成功（准确性、校准、鲁棒性）
- ✅ 诊断标签检测准确（5+标签类型）
- ✅ 质量评分准确（与人工评分一致性 > 0.8）

**参考文档**：
- `.claude/roles/rl-infra/llm-judge-rm-engineer.md` - LLM Judge/RM Engineer角色文档

### 预计时间：按需（1-2个月）

### 交付物：
- ✅ `ClarificationPromptDesignerService` - 追问话术设计服务
- ✅ `RiskPromptDesignerService` - 风险提示设计服务
- ✅ `DecisionExplanationDesignerService` - 决策解释设计服务
- ✅ 红线规则库（10+规则）
- ✅ 季节性风险库（5+目的地）
- ✅ 评测集标注（100+测试用例）
- ✅ 反例库（10+事故模式）
- ✅ `JudgePromptDesignerService` - Judge Prompt设计服务
- ✅ `RewardModelTrainerService` - RM训练服务
- ✅ `DiagnosticLabelSystemService` - 诊断标签系统服务
- ✅ `QualityScorerService` - 质量评分服务

---

## 📊 实施进度跟踪

### 当前进度

| 阶段 | 状态 | 负责人 | 预计完成时间 | 实际完成时间 |
|------|------|--------|--------------|--------------|
| 阶段1: 轨迹收集与验证 | ✅ 已完成 | - | - | 2025-01-20 |
| 阶段2: 数据工程管道 | ✅ 基础结构已完成 | Data Engineer | 2025-02-20 | 2025-01-21 |
| 阶段3: 训练平台 | ✅ 基础结构已完成 | RL/ML Platform Engineer | 2025-03-20 | 2025-01-21 |
| 阶段4: 评测体系 | ✅ 基础结构已完成 | Evaluation Engineer | 2025-04-20 | 2025-01-21 |
| 阶段5: 编排接入与观测 | ✅ 基础结构已完成 | Backend/Infra Engineer | 2025-05-20 | 2025-01-21 |
| 阶段6: 安全合规 | ✅ 基础结构已完成 | Safety/Compliance Lead | 2025-06-20 | 2025-01-21 |
| 阶段7: 产品化 | ✅ 基础结构已完成 | PM（RL产品负责人） | 2025-07-20 | 2025-01-21 |
| 阶段8: 增强能力 | ✅ 基础结构已完成 | UX Writer、Domain Expert、LLM Judge | 按需 | 2025-01-21 |

### 里程碑

- **里程碑1**（2025-02-20）：完成数据工程管道，能够导出训练数据
- **里程碑2**（2025-03-20）：完成训练平台，能够训练和部署模型
- **里程碑3**（2025-04-20）：完成评测体系，能够评估模型性能
- **里程碑4**（2025-05-20）：完成编排接入，PolicyService集成到生产环境
- **里程碑5**（2025-06-20）：完成安全合规，Constraints Engine上线
- **里程碑6**（2025-07-20）：完成产品化，A/B实验和用户反馈闭环上线

---

## 🚨 风险与缓解

### 技术风险

**风险1**：训练数据质量不足
- **缓解**：Data Engineer严格数据质量检查，Evaluation Engineer构建评测集

**风险2**：模型性能退化（Model Collapse）
- **缓解**：Evaluation Engineer实现回归门槛，ModelCollapseMonitorService持续监控

**风险3**：在线Serving延迟过高
- **缓解**：RL/ML Platform Engineer优化推理性能，Backend/Infra Engineer实现降级策略

### 业务风险

**风险1**：Reward定义不准确
- **缓解**：PM与Domain Expert Network协作，定义清晰的业务目标

**风险2**：安全合规问题
- **缓解**：Safety/Compliance Lead建立硬约束，Legal/Privacy Counsel审查合规性

**风险3**：用户体验下降
- **缓解**：UX Writer设计友好的交互，PM设计A/B实验验证

### 组织风险

**风险1**：角色职责不清
- **缓解**：明确角色职责边界，建立协作机制

**风险2**：资源不足
- **缓解**：分阶段实施，优先P0角色，P3角色可考虑外部顾问

---

## 📝 下一步行动

**状态**：✅ 已批准，可以开始实施

### 立即行动（本周 - 2025-01-20起）

1. **分配角色**：
   - 分配Data Engineer（轨迹数据工程）角色
   - 分配RL/ML Platform Engineer角色

2. **启动阶段2**：
   - Data Engineer开始实施轨迹ETL
   - 设计轨迹Schema（s,a,r,s'格式）

3. **准备阶段3**：
   - RL/ML Platform Engineer开始搭建Ray集群
   - 准备MLflow环境

### 1个月内

1. **完成阶段2**：
   - 完成轨迹ETL实现
   - 完成数据质量规则实现
   - 完成PII脱敏实现
   - 完成数据集版本化实现

2. **启动阶段3**：
   - 完成训练流水线搭建
   - 完成模型注册表实现
   - 开始PolicyService实现

### 2个月内

1. **完成阶段3**：
   - 完成PolicyService在线推理实现
   - 完成第一个模型训练和部署

2. **启动阶段4**：
   - Evaluation Engineer开始构建Eval Suite
   - 开始OPE实现

---

## 🔗 相关文档

- `RL_INFRASTRUCTURE_ASSESSMENT.md` - RL基础设施评估报告
- `IMPLEMENTATION_ASSESSMENT.md` - ⭐ 实施方案评估报告（首席AI科学家）
- `NEED_ASSESSMENT.md` - RL Infrastructure需求评估
- `SYSTEM_ARCHITECTURE.md` - 系统架构图
- `QUICK_START.md` - 快速启动指南
- `rl-infra/README.md` - RL基础设施角色文档

---

## ⚠️ 重要优化建议（基于AI科学家评估）

### 时间估算调整

**原计划**：3-6个月  
**建议调整**：7-8个月（考虑20-30%缓冲时间）

- 阶段2：1个月 → **1.2个月**
- 阶段3：1个月 → **1.3个月**
- 阶段4：1个月 → **1个月**（但需要提前准备测试集）
- 阶段5：1个月 → **1个月**
- 阶段6：1个月 → **1.5个月**（考虑规则定义时间）
- 阶段7：1个月 → **1个月**

### 验收标准分阶段

**建议**：分三个阶段设置验收标准

- **第一阶段（MVP）**：基本功能可用
  - 数据质量 > 90%
  - QPS > 500, P95 < 200ms
  - OPE相关性 > 0.6
  - Reward相关性 > 0.5

- **第二阶段（生产级）**：性能达到目标
  - 数据质量 > 95%
  - QPS > 1000, P95 < 150ms
  - OPE相关性 > 0.7
  - Reward相关性 > 0.7

- **第三阶段（优化）**：优化到生产级
  - 数据质量 > 99%
  - QPS > 1000, P95 < 100ms
  - OPE相关性 > 0.8
  - Reward相关性 > 0.7

### 并行实施优化

**建议**：
- ✅ **阶段2和阶段3可以并行**：Data Engineer和RL/ML Platform Engineer可以同时工作
- ✅ **阶段4可以提前准备**：Evaluation Engineer可以提前构建测试集
- ✅ **阶段6可以提前准备**：Safety/Compliance Lead可以提前定义规则

### 关键风险缓解

**建议加强**：
- ✅ **建立数据质量监控Dashboard**：实时监控数据质量指标
- ✅ **建立Model Collapse检测机制**：监控轨迹多样性和模型输出分布
- ✅ **建立性能监控**：实时监控推理延迟
- ✅ **建立Reward验证机制**：分析Reward分布和业务指标相关性

---

**创建人**：首席AI科学家  
**创建日期**：2025-01-20  
**最后更新**：2025-01-20  
**评估报告**：`IMPLEMENTATION_ASSESSMENT.md`
