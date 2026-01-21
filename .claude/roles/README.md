# 辅助角色提示词

## 概述

本目录包含 **帮助用户写代码、做设计、做决策的辅助角色**，这些角色是开发协作工具，在开发时被调用，帮助用户完成各种开发任务。

**位置**：`.claude/roles/`

**完整角色目录**：请查看 [`ROLES_CATALOG.md`](./ROLES_CATALOG.md) 获取所有角色的详细分类和说明。

## 角色分类概览

### 1. 核心决策与设计角色（13个）

**产品与业务**：
- `product-manager.md` ⭐⭐⭐ - 产品经理
- `rl-infra/pm-rl-product.md` ⭐⭐⭐ - PM（RL产品负责人）

**架构与设计**：
- `architect.md` ⭐⭐⭐ - 架构师
- `ops-architect.md` ⭐⭐⭐ - 运维架构师
- `skills-engineer.md` ⭐⭐⭐ - 智能体工程师

**AI与算法**：
- `chief-ai-scientist.md` ⭐⭐⭐ - 首席AI科学家
- `route-optimization-engineer.md` ⭐⭐ - 路线优化算法工程师
- `langgraph.md` ⭐⭐ - LangGraph工程师
- `quantum-computing-scientist.md` ⭐ - 量子计算领域科学家

**领域专家**：
- `geographic-scientist.md` ⭐⭐ - 地理科学家
- `rl-infra/domain-expert-network.md` ⭐⭐ - Domain Expert Network

**用户体验**：
- `ux-expert.md` ⭐⭐ - 用户体验专家
- `rl-infra/ux-writer.md` ⭐⭐ - UX Writer / Interaction Designer
- `psychologist.md` ⭐⭐ - 心理学家

### 2. 基础设施与工程角色（12个）

**数据与存储**：
- `database-engineer.md` ⭐⭐⭐ - 数据库工程师
- `data-engineer.md` ⭐⭐ - 数据工程师
- `rl-infra/data-engineer-trajectory.md` ⭐⭐⭐ - Data Engineer（轨迹数据工程）

**开发与测试**：
- `GLOBAL_ENGINEERING_SYSTEM_PROMPT.md` ⭐⭐⭐ - 全局工程系统
- `test-engineer.md` ⭐⭐ - 测试工程师
- `frontend-engineer.md` ⭐⭐ - 前端工程师

**运维与安全**：
- `devops-engineer.md` ⭐⭐⭐ - DevOps工程师
- `security-engineer.md` ⭐ - 安全工程师
- `rl-infra/safety-compliance-lead.md` ⭐⭐ - Safety/Compliance Lead

**RL基础设施（工程）**：
- `rl-infra/rl-ml-platform-engineer.md` ⭐⭐⭐ - RL/ML Platform Engineer
- `rl-infra/backend-infra-engineer.md` ⭐⭐ - Backend/Infra Engineer
- `rl-infra/evaluation-engineer.md` ⭐⭐ - Evaluation Engineer
- `rl-infra/llm-judge-rm-engineer.md` ⭐⭐ - LLM Judge / RM Engineer

### 3. RL基础设施角色（9个角色+评估报告）

详见 `rl-infra/README.md`

**P0角色（立即实施）**：
- `rl-infra/rl-ml-platform-engineer.md` - RL/ML Platform Engineer
- `rl-infra/data-engineer-trajectory.md` - Data Engineer（轨迹数据工程）

**P1角色（1-2个月）**：
- `rl-infra/evaluation-engineer.md` - Evaluation Engineer
- `rl-infra/backend-infra-engineer.md` - Backend/Infra Engineer

**P2角色（2-3个月）**：
- `rl-infra/safety-compliance-lead.md` - Safety/Compliance Lead
- `rl-infra/pm-rl-product.md` - PM（RL产品负责人）

**P3角色（强烈建议）**：
- `rl-infra/ux-writer.md` - UX Writer / Interaction Designer
- `rl-infra/domain-expert-network.md` - Domain Expert Network
- `rl-infra/llm-judge-rm-engineer.md` - LLM Judge / RM Engineer

**评估报告**：
- `rl-infra/RL_INFRASTRUCTURE_ASSESSMENT.md` - RL基础设施评估报告

### 4. 协作机制文档（3个）

- `AGENT_COLLABORATION.md` - Agent协作机制（技术层面）
- `MULTI_AGENT_COLLABORATION.md` - 多角色协作机制
- `GLOBAL_ENGINEERING_SYSTEM_PROMPT.md` - 全局工程系统

### 5. 工具与配置文件（1个）

- `poi.md` - Iceland POI数据清洗工程师（特定任务工具）

## 角色统计

- **总角色数**：34个角色
- **总文件数**：37个文件（含协作机制和工具）
- **高优先级（⭐⭐⭐）**：15个角色
- **中优先级（⭐⭐）**：12个角色
- **低优先级（⭐）**：2个角色

## 与系统 Agent 的区别

### 辅助角色（本目录）

- **用途**：帮助用户写代码、做设计、做决策
- **位置**：`.claude/roles/`
- **特点**：
  - 是开发协作工具
  - 在开发时被调用
  - 没有具体的实现代码
  - 包括：产品经理、架构师、工程师等

### 系统 Agent（`prompts/agents/`）

- **用途**：系统运行时执行具体任务
- **位置**：`prompts/agents/`
- **特点**：
  - 是系统架构的一部分
  - 在运行时被调用
  - 有具体的实现代码（`src/agent/services/sub-agents/`）
  - 映射到三人格系统（Abu、Dr.Dre、Neptune）

## 输出文档存储

**重要**：辅助角色输出的方案、总结报告、分析文档等，应统一存储在 `.claude/改动资料/` 文件夹中。

**命名规范**：`[角色]-[类型]-[主题]-[日期].md`

**示例**：
- `产品经理-方案-前端API变更-2025-01-14.md`
- `架构师-分析-依赖注入问题-2025-01-14.md`
- `智能体工程师-总结-TransportSkill修复-2025-01-14.md`

**详细说明**：请参考 `.claude/改动资料/README.md`

---

## 参考文档

- `.claude/roles/AGENT_COLLABORATION.md` - Agent 协作机制（技术层面）
- `.claude/roles/MULTI_AGENT_COLLABORATION.md` - 多角色协作机制
- `.claude/改动资料/README.md` - 改动资料文件夹说明
- `docs/ROLES_AND_COLLABORATION.md` - 角色定义与协作关系文档
- `prompts/agents/README.md` - 系统 Agent 文档
