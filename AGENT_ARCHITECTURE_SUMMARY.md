# TripNARA Agent 架构总结

## 一、架构层次 (Architecture Layers)

我们的 Agent 采用 **双系统架构 (Dual-System Architecture)**，共 **3 层**：

### 1. Router 层（路由决策层）
- **服务**: `RouterService` (`src/agent/services/router.service.ts`)
- **职责**: 根据用户输入智能路由到 System 1 或 System 2
- **策略**:
  - 硬规则短路（支付/退款/浏览器 → System2）
  - 特征提取与打分
  - 置信度阈值判断
  - Fallback 机制

### 2. System 1 层（快速路径）
- **特点**: 快速响应，不需要复杂推理
- **路由类型**:
  - `SYSTEM1_API`: 标准 API / CRUD / 简单查询 (< 3s)
  - `SYSTEM1_RAG`: 知识库/向量检索
- **执行器**: `System1ExecutorService` (`src/agent/services/system1-executor.service.ts`)

### 3. System 2 层（推理路径）
- **特点**: 需要多步骤推理和工具调用
- **路由类型**:
  - `SYSTEM2_REASONING`: ReAct + 工具 + TravelPlanner/Critic
  - `SYSTEM2_WEBBROWSE`: 无头浏览器兜底（仅授权后）
- **执行器**: `OrchestratorService` (`src/agent/services/orchestrator.service.ts`)
- **流程**: Plan → Act → Observe → Critic → Repair

---

## 二、Tools（工具/Actions）

我们有一个完整的 **Action Registry 系统**，用于注册、发现和执行工具。

### Action Registry
- **服务**: `ActionRegistryService` (`src/agent/services/action-registry.service.ts`)
- **职责**: 管理所有可用的 Actions，提供注册、发现、执行能力
- **特性**:
  - Action 注册和发现
  - Action 元数据管理（kind, cost, side_effect, preconditions, idempotent, cacheable）
  - Input/Output Schema 验证
  - Action 执行器

### 已注册的 Action 类别

#### 1. Trip Actions (`trip.*`)
- **文件**: `src/agent/services/actions/trip.actions.ts`
- **Actions**:
  - `trip.load_draft`: 加载行程草稿
  - 其他 Trip 相关操作

#### 2. Places Actions (`places.*`)
- **文件**: `src/agent/services/actions/places.actions.ts`
- **Actions**:
  - `places.resolve_entities`: 实体解析（从用户输入中提取 POI）
  - `places.get_poi_facts`: 获取 POI 事实信息
  - `places.search`: 搜索地点
  - 其他 Places 相关操作

#### 3. Transport Actions (`transport.*`)
- **文件**: `src/agent/services/actions/transport.actions.ts`
- **Actions**:
  - `transport.build_time_matrix`: 构建时间矩阵
  - 其他交通相关操作

#### 4. Itinerary Actions (`itinerary.*`)
- **文件**: `src/agent/services/actions/itinerary.actions.ts`
- **Actions**:
  - `itinerary.optimize_day_vrptw`: 行程优化（VRPTW算法）
  - 其他行程相关操作

#### 5. Policy Actions (`policy.*`)
- **文件**: `src/agent/services/actions/policy.actions.ts`
- **Actions**:
  - `policy.validate_feasibility`: 可行性验证
  - 其他策略相关操作

#### 6. Readiness Actions (`readiness.*`)
- **文件**: `src/agent/services/actions/readiness.actions.ts`
- **Actions**:
  - `readiness.check`: 旅行准备度检查
  - 其他准备度相关操作

#### 7. WebBrowse Actions (`webbrowse.*`)
- **文件**: `src/agent/services/actions/webbrowse.actions.ts`
- **Actions**:
  - `webbrowse.browse`: 无头浏览器操作（需要授权）
  - 其他浏览器相关操作

#### 8. RailPass Actions (`railpass.*`)
- **文件**: `src/railpass/actions/railpass-agent-actions.ts`
- **Actions**: RailPass 相关操作

### TripNARA Core Tool（高级工具）

除了上述 Actions，还有一个特殊的 **TripNARA Core Tool**，用于封装核心决策引擎：

- **服务**: `TripNaraCoreToolService` (`src/trips/decision/tools/tripnara-core-tool.service.ts`)
- **接口**: `ITripNaraCoreTool` (`src/trips/decision/tools/tripnara-core-tool.interface.ts`)
- **用途**: 将 TripNARA 核心决策引擎（Abu/Dr.Dre/Neptune）封装为可被 LangGraph 调用的工具
- **功能**:
  - 安全评估（Abu）：检查 DEM 硬违规、道路状态、危险区域
  - 节奏调整（Dr.Dre）：基于人体能力模型调整行程节奏
  - 空间修复（Neptune）：在保持路线哲学的前提下替换不可用路段

---

## 三、Orchestration（编排）

我们有两套 Orchestration 系统：

### 1. System 2 Orchestrator（ReAct 循环编排）

- **服务**: `OrchestratorService` (`src/agent/services/orchestrator.service.ts`)
- **用途**: System 2 的 ReAct 循环执行器
- **流程**: 
  1. **Plan**: 选择下一个 Action（支持 LLM 和规则两种模式）
  2. **Act**: 执行 Action（支持串行和并行执行）
  3. **Observe**: 收集观察结果
  4. **Critic**: 检查可行性（`CriticService`）
  5. **Repair**: 修复问题（在 Orchestrator 中实现）
- **特性**:
  - ✅ 预算控制（max_seconds, max_steps, max_browser_steps）
  - ✅ 超时检测和处理
  - ✅ 并行 Action 执行支持
  - ✅ 状态更新和同步
  - ✅ Action 结果缓存
  - ✅ 决策日志记录

### 2. LangGraph Orchestrator（多 Agent 编排）

- **服务**: `LangGraphOrchestratorService` (`src/trips/decision/orchestration/langgraph-orchestrator.service.ts`)
- **接口**: `ILangGraphOrchestrator` (`src/trips/decision/orchestration/langgraph-orchestrator.interface.ts`)
- **用途**: 多 Agent 协作编排，负责状态管理、分支控制
- **设计原则**:
  - LangGraph 作为"调度员"而非"驾驶员"
  - 保护 Hard Core（Abu / Dr.Dre / Neptune）的确定性逻辑
  - 负责多 Agent 协作、状态管理、分支控制

#### LangGraph Agent 类型

1. **PLANNER** (Planner Agent)
   - **服务**: `PlannerAgentService` (`src/trips/decision/orchestration/planner-agent.service.ts`)
   - **职责**: 意图识别、任务拆解、参数提取
   - **集成**: ✅ LLM 集成（使用 `LlmService.callLlmWithSchema()`）
   - **回退**: 规则匹配（LLM 失败时）

2. **NARRATOR** (Narrator Agent)
   - **服务**: `NarratorAgentService` (`src/trips/decision/orchestration/narrator-agent.service.ts`)
   - **职责**: 结果润色、故事层文案生成
   - **集成**: ✅ LLM 集成（使用 `LlmService.callLlmWithSchema()`）
   - **回退**: 模板生成（LLM 失败时）

3. **COMPLIANCE** (合规检查 Agent)
   - **职责**: 合规检查（RAG + 文档库）

4. **LOCAL_INSIGHT** (本地洞察 Agent)
   - **职责**: 本地洞察（RAG 负责）

5. **CORE_DECISION** (核心决策 Agent)
   - **职责**: TripNARA Core Tool（封装调用）

#### 规划阶段 (PlanningPhase)

- `DRAFTING`: 起草阶段
- `SAFETY_CHECK`: 安全检查阶段
- `PACING_ADJUSTMENT`: 节奏调整阶段
- `FINALIZING`: 最终化阶段

---

## 总结

### 架构层次
✅ **3 层架构**：
1. Router 层（路由决策）
2. System 1 层（快速路径：API/RAG）
3. System 2 层（推理路径：ReAct/WebBrowse）

### Tools
✅ **完整的 Action Registry 系统**：
- 8 个 Action 类别（Trip, Places, Transport, Itinerary, Policy, Readiness, WebBrowse, RailPass）
- TripNARA Core Tool（高级工具）
- 支持元数据管理、Schema 验证、缓存、并行执行

### Orchestration
✅ **两套编排系统**：
1. System 2 Orchestrator（ReAct 循环：Plan → Act → Observe → Critic → Repair）
2. LangGraph Orchestrator（多 Agent 编排：Planner, Narrator, Compliance, LocalInsight, CoreDecision）

### 相关文档

- `src/agent/README.md` - Agent 模块详细文档
- `src/agent/AGENT_INFRA_CHECKLIST.md` - Agent Infrastructure 框架检查清单
- `src/trips/decision/orchestration/LLM_INTEGRATION_GUIDE.md` - LLM 集成指南
- `src/trips/decision/README.md` - 决策层文档

