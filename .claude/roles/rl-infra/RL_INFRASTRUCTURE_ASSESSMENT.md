# RL基础设施构建评估报告

**评估人**：首席AI科学家  
**评估日期**：2025-01-20  
**评估目标**：评估TripNARA RL基础设施构建方案，确定角色分工和实施路径

---

## 执行摘要

**关键结论**：当前项目已具备RL基础设施的**核心组件**（轨迹收集、验证、Reward提取），但缺少**完整的生产级RL平台**。建议采用**分阶段实施**策略，优先构建**训练与服务平台**和**数据工程管道**，再逐步完善**评测体系**和**安全合规**能力。

**优先级**：
- **P0（立即实施）**：RL/ML Platform Engineer、Data Engineer（轨迹数据工程）
- **P1（1-2个月）**：Evaluation Engineer、Backend/Infra Engineer
- **P2（2-3个月）**：Safety/Compliance Lead、PM（RL产品负责人）
- **P3（按需）**：UX Writer、Domain Expert Network、LLM Judge/RM Engineer

---

## 1. 当前状态评估

### 1.1 已有基础设施 ✅

**轨迹收集系统**：
- ✅ `TrajectoryCollectionService`：收集规划轨迹（plan、decisionTrace、researchData）
- ✅ `ValidatedTrajectory` 数据库模型：存储已验证轨迹
- ✅ 轨迹收集点：PLAN_GEN完成、用户审批、执行完成

**验证器系统**：
- ✅ `TrajectoryValidatorService`：验证轨迹质量（Gate、Compliance、用户审批、执行结果）
- ✅ 验证标准：validationStatus = 'VALIDATED', validationScore >= 0.8

**Reward信号提取**：
- ✅ `RewardSignalExtractorService`：从用户行为提取reward信号
- ✅ Reward来源：用户审批（+1.0/-0.5）、规划提交（+0.8）、决策对齐（0-1）、执行成功（+0.8）

**训练数据准备**：
- ✅ `TrainingDataPreparationService`：筛选高质量轨迹，导出SFT格式
- ✅ 筛选标准：validationScore >= 0.8, totalReward > 0, usedForTrainingCount < 3

**模型版本管理**：
- ✅ `ValidatedTrajectory.modelVersion`：模型版本字段
- ✅ `ValidatedTrajectory.trainingBatchId`：训练批次关联

### 1.2 缺失的关键能力 ⚠️

**训练与服务平台**：
- ❌ **训练流水线**：缺少自动化训练CI/CD（Ray/K8s/MLflow）
- ❌ **模型注册表**：缺少Model Registry（版本管理、元数据、可回滚）
- ❌ **在线Serving**：缺少PolicyService的在线推理服务（QPS/延迟/回退）
- ❌ **特征存储**：缺少Feature Store / Embedding Store

**数据工程管道**：
- ❌ **轨迹ETL**：缺少将DecisionLog/State/ToolCall拼接成(s,a,r,s')格式的ETL
- ❌ **数据质量规则**：缺少数据质量检查（缺字段、重复、异常）
- ❌ **PII脱敏**：缺少去标识化策略
- ❌ **数据集版本化**：缺少可复现的数据集版本管理

**离线评测体系**：
- ❌ **Eval Suite**：缺少Router/Gate/Itinerary的指标与测试集
- ❌ **OPE实现**：缺少Offline Policy Evaluation（DR/WDR等）
- ❌ **回放对照**：缺少baseline vs 新策略的回放对比
- ❌ **回归门槛**：缺少上线gate（性能阈值）

**安全合规系统**：
- ❌ **Constraints Engine**：缺少硬约束规则引擎（禁区/风险/consent）
- ❌ **风险事件分级**：缺少SEV分级与处置流程
- ❌ **合规审计**：缺少审计字段与证据链要求
- ❌ **安全红队**：缺少高风险用例库

**编排与观测**：
- ⚠️ **Policy接入**：缺少Policy decision → action → execution的接入点
- ⚠️ **统一观测**：缺少统一的tracing/metrics/logs（含实验号、模型版本）
- ⚠️ **熔断限流**：缺少熔断、限流、重试、降级策略
- ⚠️ **成本治理**：缺少token/tool/latency budget管理

---

## 2. RL基础设施架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    RL Infrastructure                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Data Pipeline│  │ Training     │  │ Evaluation   │      │
│  │ (ETL/Quality)│→ │ Platform     │→ │ Suite        │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │             │
│         ↓                  ↓                  ↓             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Model Registry & Serving Platform            │  │
│  └──────────────────────────────────────────────────────┘  │
│         │                  │                  │             │
│         ↓                  ↓                  ↓             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Orchestrator │  │ Constraints  │  │ Observability │      │
│  │ Integration  │  │ Engine       │  │ & Monitoring │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
生产环境
  ↓
轨迹收集（TrajectoryCollectionService）
  ↓
轨迹验证（TrajectoryValidatorService）
  ↓
Reward提取（RewardSignalExtractorService）
  ↓
数据工程管道（Data Engineer）
  ├─ ETL：DecisionLog/State → (s,a,r,s')
  ├─ 数据质量检查
  ├─ PII脱敏
  └─ 数据集版本化
  ↓
训练数据准备（TrainingDataPreparationService）
  ↓
训练平台（RL/ML Platform Engineer）
  ├─ 训练流水线（Ray/K8s）
  ├─ 模型注册表（MLflow）
  └─ 模型版本管理
  ↓
评测体系（Evaluation Engineer）
  ├─ Eval Suite
  ├─ OPE（DR/WDR）
  └─ 回放对照
  ↓
模型Serving（RL/ML Platform Engineer）
  ├─ PolicyService在线推理
  ├─ QPS/延迟监控
  └─ 回退策略
  ↓
编排接入（Backend/Infra Engineer）
  ├─ Orchestrator集成
  ├─ 统一观测
  └─ 熔断限流
```

---

## 3. 角色分工与职责

### 3.1 P0角色（立即实施）

#### 1) RL/ML Platform Engineer（训练与服务平台工程）

**职责**：
- 构建训练流水线（Ray/K8s/MLflow）
- 实现模型注册表（版本管理、元数据、可回滚）
- 实现PolicyService在线推理服务（QPS/延迟/回退）
- 实现Feature Store / Embedding Store（若需要）

**关键交付物**：
- ✅ Trajectory数据管道（离线→训练集）
- ✅ 训练/评测/发布CI（Model Registry + rollout）
- ✅ PolicyService在线推理服务（QPS/延迟/回退）
- ✅ Feature store / embedding store（若用）

**技术栈**：Python + Ray/K8s/MLflow(或等价)、数据并行、模型部署

**与现有系统集成**：
- 输入：`TrainingDataPreparationService`导出的SFT训练数据
- 输出：训练好的模型 → Model Registry → PolicyService

#### 2) Data Engineer（轨迹数据工程）

**职责**：
- 将DecisionLog/State/ToolCall拼接成可训练"轨迹"（s,a,r,s'）
- 保证数据质量（缺字段、重复、异常）
- 实现PII/合规脱敏策略
- 实现数据集版本化（可复现训练）

**关键交付物**：
- ✅ Trajectory Schema（s,a,r,s'）与ETL
- ✅ 数据质量规则（缺字段、重复、异常）
- ✅ PII/合规脱敏策略
- ✅ 数据集版本（可复现训练）

**技术栈**：Kafka/CDC、Spark/DBT、数据治理

**与现有系统集成**：
- 输入：`ValidatedTrajectory`、`DecisionLog`、`OrchestratorState`
- 输出：清洗后的轨迹数据集（s,a,r,s'格式）→ `TrainingDataPreparationService`

### 3.2 P1角色（1-2个月）

#### 3) Evaluation Engineer（离线评测 & 反事实评估）

**职责**：
- 构建Eval Suite：Router/Gate/Itinerary的指标与测试集
- 实现OPE（DR/WDR等）与报告模板
- 实现回放对照（baseline vs 新策略）
- 实现回归门槛（上线gate）

**关键交付物**：
- ✅ Eval Suite：Router/Gate/Itinerary的指标与测试集
- ✅ OPE（DR/WDR等）实现与报告模板
- ✅ 回放对照（baseline vs 新策略）
- ✅ 回归门槛（上线gate）

**技术栈**：统计、实验设计、可重复评测框架

**与现有系统集成**：
- 输入：训练好的模型、测试集、历史轨迹
- 输出：评测报告 → 上线决策

#### 4) Backend/Infra Engineer（核心编排与观测）

**职责**：
- 将策略接入Orchestrator（Policy decision → action → execution）
- 实现统一tracing / metrics / logs（含实验号、模型版本）
- 实现熔断、限流、重试、降级策略
- 实现成本治理（token/tool/latency budget）

**关键交付物**：
- ✅ Orchestrator接入：Policy decision → action → execution
- ✅ 统一tracing / metrics / logs（含实验号、模型版本）
- ✅ 熔断、限流、重试、降级策略
- ✅ 成本治理（token/tool/latency budget）

**技术栈**：NestJS/Go/Java任一 + 可观测体系

**与现有系统集成**：
- 输入：PolicyService推理结果
- 输出：集成到`ClaudeOrchestratorService`、统一观测数据

### 3.3 P2角色（2-3个月）

#### 5) Safety/Compliance Lead（安全合规负责人）

**职责**：
- 实现Constraints Engine规则与阈值（禁区/风险/consent）
- 实现风险事件分级与处置流程（SEV）
- 实现合规审计字段与证据链要求
- 构建安全红队用例（高风险目的地/季节）

**关键交付物**：
- ✅ Constraints Engine规则与阈值（禁区/风险/consent）
- ✅ 风险事件分级与处置流程（SEV）
- ✅ 合规审计字段与证据链要求
- ✅ 安全红队用例（高风险目的地/季节）

**技术栈**：安全策略、合规流程、风控体系

**与现有系统集成**：
- 输入：规划请求、Gate结果、Compliance结果
- 输出：硬约束规则 → `GatekeeperAgent`、`ComplianceAgent`

#### 6) PM（RL产品负责人 / Decision Quality PM）

**职责**：
- 定义reward的业务含义、成功指标、灰度策略
- 实现埋点与用户反馈闭环（采纳/编辑/导出/放弃）
- 设计A/B实验、灰度节奏、上线标准
- 定义"可解释输出"的产品规范（证据链、决策日志）

**关键交付物**：
- ✅ 目标函数权重（成功率/返工/成本/合规）
- ✅ 埋点与用户反馈闭环（采纳/编辑/导出/放弃）
- ✅ A/B实验设计、灰度节奏、上线标准
- ✅ "可解释输出"的产品规范（证据链、决策日志）

**技术栈**：实验、指标体系、风险产品化

**与现有系统集成**：
- 输入：用户行为数据、决策日志
- 输出：Reward定义 → `RewardSignalExtractorService`、A/B实验配置

### 3.4 P3角色（强烈建议，会显著降低试错成本）

#### 7) UX Writer / Interaction Designer（解释与信任体验）

**职责**：
- 设计追问话术模板（缺信息时怎么问）
- 设计拒绝/风险提示/替代方案表达
- 设计决策日志的UI信息层级（可信感）
- 设计用户反馈入口（轻量而有效）

**关键交付物**：
- ✅ 追问话术模板（缺信息时怎么问）
- ✅ 拒绝/风险提示/替代方案表达
- ✅ 决策日志的UI信息层级（可信感）
- ✅ 用户反馈入口（轻量而有效）

**技术栈**：B2C/B2B复杂系统文案与交互

**与现有系统集成**：
- 输入：澄清问题、Gate结果、风险警告
- 输出：用户友好的提示文案 → 前端UI

#### 8) Domain Expert Network（目的地/户外安全顾问）

**职责**：
- 定义高风险路线的红线规则、季节性风险
- 标注评测集（可执行性/危险建议识别）
- 构建典型事故模式与反例库

**关键交付物**：
- ✅ 高风险路线的红线规则、季节性风险
- ✅ 评测集标注（可执行性/危险建议识别）
- ✅ 典型事故模式与反例库

**形式**：不一定全职，可以顾问制

**与现有系统集成**：
- 输入：规划请求、路线数据
- 输出：安全规则 → `Constraints Engine`、评测集标注

#### 9) LLM Judge / RM Engineer（奖励模型工程）

**职责**：
- 设计Judge prompts + 校准集
- 实现RM训练/蒸馏（偏好对比）
- 构建诊断标签体系（证据缺失/幻觉风险/不可执行）

**关键交付物**：
- ✅ Judge prompts + 校准集
- ✅ RM训练/蒸馏（偏好对比）
- ✅ 诊断标签体系（证据缺失/幻觉风险/不可执行）

**技术栈**：偏好建模、对齐、评估校准

**与现有系统集成**：
- 输入：规划结果、用户反馈
- 输出：质量评分 → `RewardSignalExtractorService`

### 3.5 可选增强（规模化后再补）

#### 10) Frontend Engineer（评测与灰度可视化台）

**职责**：实验看板、回放工具、策略对比UI、审核台（human-in-the-loop）

#### 11) SRE / FinOps（成本与可靠性）

**职责**：GPU/推理成本优化、容量规划、SLO、告警、预算守门人

#### 12) Legal / Privacy Counsel（数据与责任边界）

**职责**：日志训练授权、地区合规、免责声明策略、责任界定

---

## 4. 实施路径

### 阶段1：数据管道与训练平台（1-2个月）

**目标**：建立完整的轨迹数据管道和训练平台

**任务**：
1. Data Engineer：实现轨迹ETL（DecisionLog → s,a,r,s'）
2. Data Engineer：实现数据质量规则和PII脱敏
3. RL/ML Platform Engineer：搭建训练流水线（Ray/K8s）
4. RL/ML Platform Engineer：实现Model Registry（MLflow）

**成功标准**：
- ✅ 能够从生产环境收集轨迹并转换为训练格式
- ✅ 能够自动化训练模型并注册到Model Registry
- ✅ 训练数据质量检查通过率 > 95%

### 阶段2：评测体系与Serving（1-2个月）

**目标**：建立离线评测体系和在线Serving能力

**任务**：
1. Evaluation Engineer：构建Eval Suite（Router/Gate/Itinerary）
2. Evaluation Engineer：实现OPE（DR/WDR）
3. RL/ML Platform Engineer：实现PolicyService在线推理
4. Backend/Infra Engineer：接入Orchestrator

**成功标准**：
- ✅ Eval Suite覆盖Router/Gate/Itinerary三个关键组件
- ✅ OPE能够准确评估策略性能（与在线A/B测试相关性 > 0.8）
- ✅ PolicyService QPS > 1000, P95延迟 < 100ms
- ✅ 能够无缝集成到现有Orchestrator

### 阶段3：安全合规与产品化（1-2个月）

**目标**：建立安全合规体系和产品化能力

**任务**：
1. Safety/Compliance Lead：实现Constraints Engine
2. Safety/Compliance Lead：构建安全红队用例库
3. PM：定义Reward业务含义和A/B实验设计
4. UX Writer：设计用户友好的提示和反馈入口

**成功标准**：
- ✅ Constraints Engine能够阻止高风险规划（误报率 < 1%）
- ✅ 安全红队用例库覆盖高风险目的地/季节
- ✅ A/B实验能够准确评估策略效果
- ✅ 用户反馈收集率 > 30%

### 阶段4：优化与规模化（持续）

**目标**：持续优化和规模化

**任务**：
1. LLM Judge/RM Engineer：实现质量评分模型
2. Domain Expert Network：扩展安全规则和评测集
3. Frontend Engineer：构建可视化工具
4. SRE/FinOps：优化成本和可靠性

---

## 5. 风险与缓解策略

### 5.1 技术风险

**风险1**：训练数据质量不足
- **缓解**：Data Engineer严格数据质量检查，Evaluation Engineer构建评测集

**风险2**：模型性能退化（Model Collapse）
- **缓解**：Evaluation Engineer实现回归门槛，持续监控模型性能

**风险3**：在线Serving延迟过高
- **缓解**：RL/ML Platform Engineer优化推理性能，Backend/Infra Engineer实现降级策略

### 5.2 业务风险

**风险1**：Reward定义不准确
- **缓解**：PM与Domain Expert Network协作，定义清晰的业务目标

**风险2**：安全合规问题
- **缓解**：Safety/Compliance Lead建立硬约束，Legal/Privacy Counsel审查合规性

**风险3**：用户体验下降
- **缓解**：UX Writer设计友好的交互，PM设计A/B实验验证

### 5.3 组织风险

**风险1**：角色职责不清
- **缓解**：明确角色职责边界，建立协作机制

**风险2**：资源不足
- **缓解**：分阶段实施，优先P0角色，P3角色可考虑外部顾问

---

## 6. 成功指标

### 6.1 技术指标

- **训练数据质量**：数据质量检查通过率 > 95%
- **模型性能**：规划成功率提升 > 10%，平均plan长度提升 > 20%
- **Serving性能**：QPS > 1000, P95延迟 < 100ms
- **评测准确性**：OPE与在线A/B测试相关性 > 0.8

### 6.2 业务指标

- **用户满意度**：用户反馈收集率 > 30%，平均满意度 > 4.0/5.0
- **安全合规**：高风险规划阻止率 > 99%，误报率 < 1%
- **成本控制**：训练成本 < $X/月，推理成本 < $Y/请求

---

## 7. 结论与建议

**关键结论**：
1. **当前项目已具备RL基础设施的核心组件**，但缺少完整的生产级RL平台
2. **建议采用分阶段实施策略**，优先构建训练与服务平台和数据工程管道
3. **角色分工清晰**，P0角色（RL/ML Platform Engineer、Data Engineer）是基础，必须立即实施
4. **安全合规是RL系统的生命线**，Safety/Compliance Lead和PM角色至关重要

**下一步行动**：
1. **立即启动**：RL/ML Platform Engineer、Data Engineer角色招聘/分配
2. **1个月内**：完成数据管道和训练平台搭建
3. **2个月内**：完成评测体系和Serving能力
4. **3个月内**：完成安全合规和产品化能力

---

**评估人签名**：首席AI科学家  
**日期**：2025-01-20
