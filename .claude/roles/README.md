# 辅助角色提示词

## 概述

本目录包含 **帮助用户写代码、做设计、做决策的辅助角色**，这些角色是开发协作工具，在开发时被调用，帮助用户完成各种开发任务。

**位置**：`.claude/roles/`

## 辅助角色列表

### 核心决策与设计角色

1. **产品经理** (`product-manager.md`)
   - PRD 文档撰写、需求定义、验收标准

2. **架构师** (`architect.md`)
   - 系统架构设计、技术决策、风险控制

3. **智能体工程师** (`skills-engineer.md`)
   - Agent 层设计、接口定义、状态机集成

4. **路线优化算法工程师** (`route-optimization-engineer.md`)
   - 路线优化算法、约束规则、评估指标

5. **LangGraph 工程师** (`langgraph.md`)
   - LangGraph 编排、状态机设计

6. **全局工程系统** (`GLOBAL_ENGINEERING_SYSTEM_PROMPT.md`)
   - 代码实现、测试编写

### 基础设施与工程角色

7. **数据库工程师** (`database-engineer.md`) ⭐ 高优先级
   - 数据库架构设计、查询性能优化、数据迁移策略

8. **DevOps 工程师** (`devops-engineer.md`) ⭐ 高优先级
   - CI/CD 流程设计、容器化策略、监控系统设计

9. **测试工程师** (`test-engineer.md`) ⭐ 中优先级
   - 测试策略设计、测试用例编写、回归测试集维护

10. **数据工程师** (`data-engineer.md`) ⭐ 中优先级
    - 数据管道设计（ETL）、数据质量监控、地理空间数据处理

11. **前端工程师** (`frontend-engineer.md`) ⭐ 中优先级
    - 前端架构设计、API 接口对接、状态管理

12. **安全工程师** (`security-engineer.md`) ⭐ 低优先级（但重要）
    - 安全架构设计、认证和授权策略、API 安全

### 特定场景工具（非角色）

以下文件是特定场景的工具提示词，不是角色：

- `Iceland POI.md` - 冰岛 POI 翻译专家（特定任务工具）
- `poi.md` - Iceland POI 数据清洗工程师（特定任务工具）

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
