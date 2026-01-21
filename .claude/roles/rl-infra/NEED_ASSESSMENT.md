# RL Infrastructure 需求评估

**评估日期**：2025-01-20  
**评估人**：首席AI科学家

---

## 🎯 核心结论

**这个项目需要RL infra，但需要分阶段实施。**

**理由**：
1. ✅ **项目已实现Iterative Deployment基础组件**（轨迹收集、验证、Reward提取）
2. ✅ **架构设计明确包含Iterative Deployment流程**
3. ⚠️ **缺少完整的生产级RL平台**（训练、Serving、评测）
4. ⚠️ **当前实现无法完成完整的迭代循环**（收集→训练→部署）

---

## 📊 当前状态分析

### ✅ 已有实现（基础组件）

**轨迹收集系统**：
- ✅ `TrajectoryCollectionService` - 收集规划轨迹
- ✅ `ValidatedTrajectory` 数据库模型 - 存储已验证轨迹
- ✅ 轨迹收集点已集成到Orchestrator

**验证器系统**：
- ✅ `TrajectoryValidatorService` - 验证轨迹质量
- ✅ 验证标准：validationStatus = 'VALIDATED', validationScore >= 0.8

**Reward信号提取**：
- ✅ `RewardSignalExtractorService` - 从用户行为提取reward
- ✅ Reward来源：用户审批、规划提交、决策对齐、执行成功

**训练数据准备**：
- ✅ `TrainingDataPreparationService` - 筛选高质量轨迹，导出SFT格式
- ✅ 筛选标准：validationScore >= 0.8, totalReward > 0

**训练相关服务**：
- ✅ `TrainingBatchProcessorService` - 训练批次处理
- ✅ `TrainingQualityAnalyzerService` - 训练质量分析
- ✅ `ModelCollapseMonitorService` - 模型坍塌监控
- ✅ `TrainingMetricsService` - 训练指标收集

### ❌ 缺失能力（生产级RL平台）

**训练与服务平台**：
- ❌ **训练流水线**：缺少自动化训练CI/CD（Ray/K8s/MLflow）
- ❌ **模型注册表**：缺少Model Registry（版本管理、元数据、可回滚）
- ❌ **在线Serving**：缺少PolicyService的在线推理服务
- ❌ **模型微调**：缺少实际的模型微调实现（FineTuneService）

**数据工程管道**：
- ❌ **轨迹ETL**：缺少将DecisionLog/State转换为(s,a,r,s')格式的ETL
- ❌ **数据质量规则**：缺少数据质量检查（缺字段、重复、异常）
- ❌ **PII脱敏**：缺少去标识化策略
- ❌ **数据集版本化**：缺少可复现的数据集版本管理

**离线评测体系**：
- ❌ **Eval Suite**：缺少Router/Gate/Itinerary的指标与测试集
- ❌ **OPE实现**：缺少Offline Policy Evaluation（DR/WDR等）
- ❌ **回放对照**：缺少baseline vs 新策略的回放对比
- ❌ **回归门槛**：缺少上线gate（性能阈值）

**编排与观测**：
- ⚠️ **Policy接入**：缺少Policy decision → action → execution的接入点
- ⚠️ **统一观测**：缺少统一的tracing/metrics/logs（含实验号、模型版本）
- ⚠️ **熔断限流**：缺少熔断、限流、重试、降级策略

---

## 🤔 是否需要RL Infra？

### 情况1：如果目标是"持续改进规划质量"

**答案：需要RL Infra**

**理由**：
- ✅ 项目已实现Iterative Deployment基础组件
- ✅ 架构设计明确包含Iterative Deployment流程
- ✅ 有用户反馈机制（Approval、Decision Log）
- ✅ 有轨迹收集和验证能力
- ⚠️ **但缺少训练和部署能力，无法完成迭代循环**

**建议**：
- **立即实施P0角色**：RL/ML Platform Engineer、Data Engineer（轨迹数据工程）
- **1-2个月内实施P1角色**：Evaluation Engineer、Backend/Infra Engineer
- **2-3个月内实施P2角色**：Safety/Compliance Lead、PM（RL产品负责人）

### 情况2：如果目标是"只收集数据，不训练模型"

**答案：不需要完整的RL Infra**

**理由**：
- ✅ 当前实现已足够收集和验证轨迹
- ✅ 可以导出训练数据供外部使用
- ❌ 但无法完成Iterative Deployment的完整循环

**建议**：
- **保持当前实现**：轨迹收集、验证、Reward提取
- **简化训练数据准备**：只导出数据，不训练模型
- **未来扩展**：当需要训练模型时，再实施RL Infra

### 情况3：如果目标是"快速上线，不考虑长期改进"

**答案：不需要RL Infra**

**理由**：
- ✅ 当前系统已可以工作
- ❌ RL Infra是长期投资，需要持续投入
- ❌ 会增加系统复杂度

**建议**：
- **暂不实施RL Infra**
- **专注于核心功能**：规划生成、决策支持、用户体验
- **未来评估**：当有足够数据和需求时，再考虑RL Infra

---

## 💡 推荐方案

### 方案A：完整RL Infra（推荐）

**适用场景**：
- 项目有长期规划
- 需要持续改进规划质量
- 有足够的资源和团队

**实施路径**：
1. **P0（立即）**：RL/ML Platform Engineer、Data Engineer
2. **P1（1-2个月）**：Evaluation Engineer、Backend/Infra Engineer
3. **P2（2-3个月）**：Safety/Compliance Lead、PM（RL产品负责人）
4. **P3（按需）**：UX Writer、Domain Expert Network、LLM Judge/RM Engineer

**预期收益**：
- ✅ 持续改进规划质量（Emergent Generalization）
- ✅ 自动化迭代循环（收集→训练→部署）
- ✅ 可观测的模型性能
- ✅ 可回滚的模型版本

**成本**：
- ⚠️ 需要2-3个工程师（P0+P1角色）
- ⚠️ 需要3-6个月实施时间
- ⚠️ 需要训练和Serving基础设施

### 方案B：简化RL Infra（折中）

**适用场景**：
- 项目有中期规划
- 需要改进规划质量，但资源有限
- 可以先收集数据，后续再训练

**实施路径**：
1. **立即**：完善轨迹收集和验证（已有基础）
2. **1-2个月**：实现训练数据导出（简化版）
3. **3-6个月**：评估是否需要完整RL Infra

**预期收益**：
- ✅ 收集高质量轨迹数据
- ✅ 可以导出训练数据供外部使用
- ⚠️ 无法完成自动化迭代循环

**成本**：
- ✅ 成本较低（主要是数据工程）
- ✅ 实施时间短（1-2个月）
- ⚠️ 需要后续评估是否扩展

### 方案C：暂不实施（保守）

**适用场景**：
- 项目处于早期阶段
- 需要快速上线核心功能
- 资源有限，优先核心功能

**实施路径**：
1. **保持当前实现**：轨迹收集、验证、Reward提取
2. **专注于核心功能**：规划生成、决策支持、用户体验
3. **未来评估**：当有足够数据和需求时，再考虑RL Infra

**预期收益**：
- ✅ 快速上线核心功能
- ✅ 降低系统复杂度
- ❌ 无法持续改进规划质量

**成本**：
- ✅ 成本最低
- ✅ 实施时间最短
- ⚠️ 需要后续重新评估

---

## 📈 决策矩阵

| 因素 | 方案A（完整） | 方案B（简化） | 方案C（暂不） |
|------|--------------|--------------|--------------|
| **实施时间** | 3-6个月 | 1-2个月 | 0个月 |
| **资源需求** | 高（2-3个工程师） | 中（1-2个工程师） | 低（0个工程师） |
| **系统复杂度** | 高 | 中 | 低 |
| **持续改进能力** | ✅ 强 | ⚠️ 弱 | ❌ 无 |
| **长期收益** | ✅ 高 | ⚠️ 中 | ❌ 低 |
| **短期成本** | ❌ 高 | ⚠️ 中 | ✅ 低 |

---

## 🎯 最终建议

### 如果项目处于以下情况，**建议实施RL Infra**：

1. ✅ **已有Iterative Deployment基础组件**（当前状态）
2. ✅ **架构设计明确包含Iterative Deployment流程**
3. ✅ **有用户反馈机制**（Approval、Decision Log）
4. ✅ **有足够的资源和团队**（2-3个工程师）
5. ✅ **有长期规划**（需要持续改进规划质量）

### 如果项目处于以下情况，**建议暂不实施RL Infra**：

1. ❌ **项目处于早期阶段**（MVP阶段）
2. ❌ **资源有限**（优先核心功能）
3. ❌ **需要快速上线**（时间紧迫）
4. ❌ **不确定是否需要持续改进**（需求不明确）

---

## 📝 下一步行动

### 如果选择方案A（完整RL Infra）：

1. **立即启动**：
   - 招聘/分配RL/ML Platform Engineer
   - 招聘/分配Data Engineer（轨迹数据工程）

2. **1个月内**：
   - 完成数据管道搭建（轨迹ETL、数据质量）
   - 完成训练平台搭建（Ray/K8s、MLflow）

3. **2个月内**：
   - 完成评测体系（Eval Suite、OPE）
   - 完成Serving能力（PolicyService）

4. **3个月内**：
   - 完成安全合规（Constraints Engine）
   - 完成产品化（A/B实验、灰度策略）

### 如果选择方案B（简化RL Infra）：

1. **立即**：
   - 完善轨迹收集和验证（已有基础）
   - 实现训练数据导出（简化版）

2. **1-2个月**：
   - 评估是否需要完整RL Infra
   - 根据评估结果决定是否扩展

### 如果选择方案C（暂不实施）：

1. **保持当前实现**：
   - 轨迹收集、验证、Reward提取（已有）
   - 专注于核心功能开发

2. **未来评估**：
   - 当有足够数据和需求时，重新评估RL Infra需求

---

## 🔗 相关文档

- `RL_INFRASTRUCTURE_ASSESSMENT.md` - RL基础设施评估报告
- `rl-infra/README.md` - RL基础设施角色文档
- `.claude/roles/architect.md` - Iterative Deployment架构设计
- `.claude/roles/chief-ai-scientist.md` - Iterative Deployment理论基础

---

**评估人签名**：首席AI科学家  
**日期**：2025-01-20
