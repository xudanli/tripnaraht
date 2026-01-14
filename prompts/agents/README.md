# 系统 Agent 文档

## 概述

本目录包含 **TripNARA 系统运行时使用的 Agent**（系统 Agent），这些 Agent 是系统架构的一部分，在运行时被调用执行具体任务。

**位置**：`prompts/agents/`

## 系统 Agent 列表

### 核心决策 Agent

1. **Planner** (`Planner.md`)
   - 任务拆解、缺口清单识别、候选方案结构设计
   - 在 INTAKE 阶段被调用
   - 实现位置：`src/agent/services/sub-agents/planner-agent.service.ts`

2. **Gatekeeper** (`Gatekeeper.md`)
   - 安全与现实守门（Should-Exist Gate）
   - 在 GATE_EVAL 阶段被调用
   - 映射到三人格：**Abu**
   - 实现位置：`src/agent/services/sub-agents/gatekeeper-agent.service.ts`

3. **CoreDecision** (`CoreDecision.md`)
   - 节奏与体感（人体可执行性）
   - 在 VERIFY 阶段被调用
   - 映射到三人格：**Dr.Dre**
   - 实现位置：`src/agent/services/sub-agents/core-decision-agent.service.ts`

4. **LocalInsight** (`LocalInsight.md`)
   - 空间结构修复（路线哲学与自洽）
   - 在 REPAIR 阶段被调用
   - 映射到三人格：**Neptune**
   - 实现位置：`src/agent/services/sub-agents/local-insight-agent.service.ts`

### 辅助 Agent

5. **Compliance** (`Compliance.md`)
   - 合规检查（RAG + 文档库）
   - 实现位置：`src/agent/services/sub-agents/compliance-agent.service.ts`

6. **Narrator** (`Narrator.md`)
   - 结果润色、故事层文案
   - 在 NARRATE 阶段被调用
   - 实现位置：`src/agent/services/sub-agents/narrator-agent.service.ts`

### 场景 Agent

7. **PlanningWorkbench** (`PlanningWorkbench.md`)
   - 规划工作台的主 Agent
   - 负责编排所有规划技能
   - 实现位置：`src/agent/services/planning-workbench-agent.service.ts`

8. **Execution** (`Execution.md`)
   - 执行阶段的 Agent
   - 负责提醒、变更与兜底
   - 实现位置：`src/agent/services/execution-agent.service.ts`

9. **TripDetail** (`TripDetail.md`)
   - 行程详情页的 Agent
   - 负责理解与掌控旅行现状
   - 实现位置：`src/agent/services/trip-detail-agent.service.ts`

## 与辅助角色的区别

### 系统 Agent（本目录）

- **用途**：系统运行时执行具体任务
- **位置**：`prompts/agents/`
- **特点**：
  - 是系统架构的一部分
  - 在运行时被调用
  - 有具体的实现代码（`src/agent/services/sub-agents/`）
  - 映射到三人格系统（Abu、Dr.Dre、Neptune）

### 辅助角色（`.claude/roles/`）

- **用途**：帮助用户写代码、做设计、做决策
- **位置**：`.claude/roles/`
- **特点**：
  - 是开发协作工具
  - 在开发时被调用
  - 没有具体的实现代码
  - 包括：产品经理、架构师、工程师等

## 参考文档

- `.claude/roles/AGENT_COLLABORATION.md` - Agent 协作机制（技术层面）
- `.claude/roles/MULTI_AGENT_COLLABORATION.md` - 多角色协作机制
- `docs/ROLES_AND_COLLABORATION.md` - 角色定义与协作关系文档
