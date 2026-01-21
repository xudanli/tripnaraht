# TripNARA 角色目录

本文档提供TripNARA项目中所有角色的完整分类和说明。

**最后更新**：2025-01-20

---

## 📋 目录

1. [核心决策与设计角色](#1-核心决策与设计角色)
2. [基础设施与工程角色](#2-基础设施与工程角色)
3. [RL基础设施角色](#3-rl基础设施角色)
4. [协作机制文档](#4-协作机制文档)
5. [工具与配置文件](#5-工具与配置文件)

---

## 1. 核心决策与设计角色

这些角色负责系统的核心决策、架构设计和业务逻辑。

### 1.1 产品与业务

| 角色 | 文件 | 优先级 | 职责 |
|------|------|--------|------|
| **产品经理** | `product-manager.md` | ⭐⭐⭐ | PRD文档撰写、需求定义、验收标准、产品规划 |
| **PM（RL产品负责人）** | `rl-infra/pm-rl-product.md` | ⭐⭐⭐ | Reward定义、用户反馈闭环、A/B实验设计、可解释输出 |

### 1.2 架构与设计

| 角色 | 文件 | 优先级 | 职责 |
|------|------|--------|------|
| **架构师** | `architect.md` | ⭐⭐⭐ | 系统架构设计、技术决策、风险控制、Iterative Deployment架构 |
| **运维架构师** | `ops-architect.md` | ⭐⭐⭐ | 部署架构设计、部署策略决策、高可用性架构、可扩展性设计 |
| **智能体工程师** | `skills-engineer.md` | ⭐⭐⭐ | Agent层设计、接口定义、状态机集成、多智能体编排 |

### 1.3 AI与算法

| 角色 | 文件 | 优先级 | 职责 |
|------|------|--------|------|
| **首席AI科学家** | `chief-ai-scientist.md` | ⭐⭐⭐ | AI技术评估、模型选择与优化、多智能体系统设计、RAG系统优化、Iterative Deployment |
| **路线优化算法工程师** | `route-optimization-engineer.md` | ⭐⭐ | 路线优化算法、约束规则、评估指标 |
| **LangGraph工程师** | `langgraph.md` | ⭐⭐ | LangGraph编排、状态机设计 |
| **量子计算领域科学家** | `quantum-computing-scientist.md` | ⭐ | 量子算法评估、问题映射（QUBO/Ising）、量子-经典混合优化架构设计 |

### 1.4 领域专家

| 角色 | 文件 | 优先级 | 职责 |
|------|------|--------|------|
| **地理科学家** | `geographic-scientist.md` | ⭐⭐ | 地理空间数据分析、地形建模、可达性评估、地理风险评估 |
| **Domain Expert Network** | `rl-infra/domain-expert-network.md` | ⭐⭐ | 红线规则、季节性风险、评测集标注、反例库（顾问制） |

### 1.5 用户体验

| 角色 | 文件 | 优先级 | 职责 |
|------|------|--------|------|
| **用户体验专家** | `ux-expert.md` | ⭐⭐ | 用户研究、信息架构设计、交互设计、可用性评估 |
| **UX Writer / Interaction Designer** | `rl-infra/ux-writer.md` | ⭐⭐ | 追问话术、风险提示、决策解释、反馈入口 |
| **心理学家** | `psychologist.md` | ⭐⭐ | 用户决策心理分析、认知负荷评估、信任建立机制设计 |

---

## 2. 基础设施与工程角色

这些角色负责系统的技术实现、基础设施和工程实践。

### 2.1 数据与存储

| 角色 | 文件 | 优先级 | 职责 |
|------|------|--------|------|
| **数据库工程师** | `database-engineer.md` | ⭐⭐⭐ | 数据库架构设计、查询性能优化、数据迁移策略、Iterative Deployment数据库设计 |
| **数据工程师** | `data-engineer.md` | ⭐⭐ | 数据管道设计（ETL）、数据质量监控、地理空间数据处理 |
| **Data Engineer（轨迹数据工程）** | `rl-infra/data-engineer-trajectory.md` | ⭐⭐⭐ | 轨迹ETL、数据质量、PII脱敏、数据集版本化 |

### 2.2 开发与测试

| 角色 | 文件 | 优先级 | 职责 |
|------|------|--------|------|
| **全局工程系统** | `GLOBAL_ENGINEERING_SYSTEM_PROMPT.md` | ⭐⭐⭐ | 代码实现、测试编写、工程约束 |
| **测试工程师** | `test-engineer.md` | ⭐⭐ | 测试策略设计、测试用例编写、回归测试集维护、Iterative Deployment测试 |
| **前端工程师** | `frontend-engineer.md` | ⭐⭐ | 前端架构设计、API接口对接、状态管理 |

### 2.3 运维与安全

| 角色 | 文件 | 优先级 | 职责 |
|------|------|--------|------|
| **DevOps工程师** | `devops-engineer.md` | ⭐⭐⭐ | CI/CD流程设计、容器化策略、监控系统设计 |
| **安全工程师** | `security-engineer.md` | ⭐ | 安全架构设计、认证和授权策略、API安全 |
| **Safety/Compliance Lead** | `rl-infra/safety-compliance-lead.md` | ⭐⭐ | Constraints Engine、风险事件分级、合规审计、安全红队 |

### 2.4 RL基础设施（工程）

| 角色 | 文件 | 优先级 | 职责 |
|------|------|--------|------|
| **RL/ML Platform Engineer** | `rl-infra/rl-ml-platform-engineer.md` | ⭐⭐⭐ | 训练流水线、模型注册表、在线Serving、特征存储 |
| **Backend/Infra Engineer** | `rl-infra/backend-infra-engineer.md` | ⭐⭐ | Orchestrator接入、统一观测、熔断限流、成本治理 |
| **Evaluation Engineer** | `rl-infra/evaluation-engineer.md` | ⭐⭐ | Eval Suite、OPE实现、回放对照、回归门槛 |
| **LLM Judge / RM Engineer** | `rl-infra/llm-judge-rm-engineer.md` | ⭐⭐ | Judge Prompts、RM训练/蒸馏、诊断标签、质量评分 |

---

## 3. RL基础设施角色

这些角色专门负责RL（强化学习）基础设施的构建和运营。详见 `rl-infra/README.md`。

### 3.1 P0角色（立即实施）

- **RL/ML Platform Engineer** - 训练与服务平台工程
- **Data Engineer（轨迹数据工程）** - 轨迹数据ETL和质量保证

### 3.2 P1角色（1-2个月）

- **Evaluation Engineer** - 离线评测与反事实评估
- **Backend/Infra Engineer** - 核心编排与观测

### 3.3 P2角色（2-3个月）

- **Safety/Compliance Lead** - 安全合规负责人
- **PM（RL产品负责人）** - Decision Quality PM

### 3.4 P3角色（强烈建议）

- **UX Writer / Interaction Designer** - 解释与信任体验
- **Domain Expert Network** - 目的地/户外安全顾问（顾问制）
- **LLM Judge / RM Engineer** - 奖励模型工程

### 3.5 评估报告

- **RL基础设施评估报告** - `rl-infra/RL_INFRASTRUCTURE_ASSESSMENT.md`

---

## 4. 协作机制文档

这些文档定义了角色间的协作机制和工作流程。

| 文档 | 文件 | 说明 |
|------|------|------|
| **Agent协作机制** | `AGENT_COLLABORATION.md` | Agent协作机制（技术层面） |
| **多角色协作机制** | `MULTI_AGENT_COLLABORATION.md` | 多角色协作机制 |
| **全局工程系统** | `GLOBAL_ENGINEERING_SYSTEM_PROMPT.md` | 代码实现、测试编写、工程约束 |

---

## 5. 工具与配置文件

这些文件是特定场景的工具提示词，不是角色。

| 文件 | 说明 |
|------|------|
| `poi.md` | Iceland POI数据清洗工程师（特定任务工具） |

---

## 📊 角色统计

### 按优先级分类

- **⭐⭐⭐ 高优先级**：15个角色
- **⭐⭐ 中优先级**：12个角色
- **⭐ 低优先级/研究**：2个角色

### 按类别分类

- **核心决策与设计**：13个角色
- **基础设施与工程**：12个角色
- **RL基础设施**：9个角色（含评估报告）
- **协作机制文档**：3个文档
- **工具**：1个工具

### 总计

- **角色总数**：34个角色
- **文档总数**：37个文件（含协作机制和工具）

---

## 🗂️ 文件组织

```
.claude/roles/
├── README.md                          # 主README（辅助角色概述）
├── ROLES_CATALOG.md                  # 本文件（角色目录）
│
├── 核心决策与设计角色/
│   ├── product-manager.md
│   ├── architect.md
│   ├── ops-architect.md
│   ├── skills-engineer.md
│   ├── chief-ai-scientist.md
│   ├── route-optimization-engineer.md
│   ├── langgraph.md
│   ├── quantum-computing-scientist.md
│   ├── geographic-scientist.md
│   ├── ux-expert.md
│   └── psychologist.md
│
├── 基础设施与工程角色/
│   ├── database-engineer.md
│   ├── data-engineer.md
│   ├── devops-engineer.md
│   ├── test-engineer.md
│   ├── frontend-engineer.md
│   ├── security-engineer.md
│   └── GLOBAL_ENGINEERING_SYSTEM_PROMPT.md
│
├── RL基础设施角色/
│   └── rl-infra/
│       ├── README.md
│       ├── RL_INFRASTRUCTURE_ASSESSMENT.md
│       ├── rl-ml-platform-engineer.md
│       ├── data-engineer-trajectory.md
│       ├── evaluation-engineer.md
│       ├── backend-infra-engineer.md
│       ├── safety-compliance-lead.md
│       ├── pm-rl-product.md
│       ├── ux-writer.md
│       ├── domain-expert-network.md
│       └── llm-judge-rm-engineer.md
│
├── 协作机制文档/
│   ├── AGENT_COLLABORATION.md
│   └── MULTI_AGENT_COLLABORATION.md
│
└── 工具/
    └── poi.md
```

---

## 🔍 快速查找

### 按职责查找

- **需要设计系统架构？** → `architect.md`, `ops-architect.md`
- **需要AI技术评估？** → `chief-ai-scientist.md`
- **需要数据库设计？** → `database-engineer.md`
- **需要RL基础设施？** → `rl-infra/README.md`
- **需要用户体验设计？** → `ux-expert.md`, `rl-infra/ux-writer.md`
- **需要安全合规？** → `rl-infra/safety-compliance-lead.md`

### 按优先级查找

- **高优先级（⭐⭐⭐）**：核心决策、基础设施、RL基础设施P0角色
- **中优先级（⭐⭐）**：领域专家、工程角色、RL基础设施P1-P3角色
- **低优先级（⭐）**：研究性角色、可选角色

---

## 📝 使用指南

1. **新加入团队成员**：
   - 先阅读 `README.md` 了解角色概述
   - 根据职责阅读对应的角色文档
   - 查看 `rl-infra/README.md` 了解RL基础设施

2. **架构师和技术负责人**：
   - 阅读 `architect.md` 和 `ops-architect.md`
   - 查看 `rl-infra/RL_INFRASTRUCTURE_ASSESSMENT.md` 了解RL架构
   - 参考协作机制文档了解角色协作

3. **产品经理**：
   - 阅读 `product-manager.md` 和 `rl-infra/pm-rl-product.md`
   - 查看用户体验相关角色文档

---

## 🔄 更新日志

- **2025-01-20**：创建角色目录，整理所有34个角色
- **2025-01-20**：新增RL基础设施角色（9个角色+评估报告）

---

## 📧 反馈与建议

如有问题或建议，请联系：
- **架构师**：负责系统架构和角色协作
- **产品经理**：负责产品规划和角色需求

---

**记住**：角色文档是开发协作工具，帮助团队成员理解职责和协作方式。定期更新角色文档，确保与实际工作保持一致。
