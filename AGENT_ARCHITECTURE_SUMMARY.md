# TripNARA Agent 架构总结

基于标准 Agent Infrastructure 框架，我们的系统采用 **6 层架构**：

---

## 1. 模型层 Model

**职责**: 让系统"会想、会说、会判断"——LLM 本体 + 提示词 + 输出约束

### ✅ 已实现

#### PLANNER Agent
- **服务**: `PlannerAgentService` (`src/trips/decision/orchestration/planner-agent.service.ts`)
- **职责**: 意图识别、任务拆解、参数提取
- **LLM 集成**: ✅ 已集成（使用 `LlmService.callLlmWithSchema()`）
- **回退机制**: 规则匹配（LLM 失败时）

#### NARRATOR Agent
- **服务**: `NarratorAgentService` (`src/trips/decision/orchestration/narrator-agent.service.ts`)
- **职责**: 结果润色、故事层文案生成
- **LLM 集成**: ✅ 已集成（使用 `LlmService.callLlmWithSchema()`）
- **回退机制**: 模板生成（LLM 失败时）

#### OrchestratorService (System2)
- **服务**: `OrchestratorService` (`src/agent/services/orchestrator.service.ts`)
- **职责**: ReAct 循环里做推理、反思、再调用工具
- **LLM 集成**: ✅ 支持 LLM Plan（通过 `LlmPlanService`）

#### COMPLIANCE / LOCAL_INSIGHT
- **职责**: 合规检查、本地洞察（RAG + 文档库）
- **状态**: ✅ 基础设施已就绪，可集成 LLM 做摘要/归纳

#### CORE_DECISION（决策能力层）
- **服务**: `TripNaraCoreToolService` (`src/trips/decision/tools/tripnara-core-tool.service.ts`)
- **设计原则**: 以规则/算法为主，LLM 为辅（解释、挑选候选、生成理由）
- **三个子模块**:
  - **Abu** (安全评估): 检查 DEM 硬违规、道路状态、危险区域
  - **Dr.Dre** (节奏调整): 基于人体能力模型调整行程节奏
  - **Neptune** (空间修复): 在保持路线哲学的前提下替换不可用路段

### 🔧 建议沉淀的资产（配置/模块）

- **Provider 适配**: OpenAI/DeepSeek/Claude 等（已有 `LlmService`）
- **Prompt 模板**:
  - Planner 参数提取模板
  - Narrator 文案模板
  - Neptune/DrDre/Abu 的解释风格模板
- **输出 Schema**: JSON schema 强约束，避免幻觉（已实现）
- **Safety/System prompts**: "只能从候选 POI 选，不得编造"这种硬约束

---

## 2. 调度层 Orchestration / Scheduling

**职责**: 决定"先做什么、走快路还是慢路、调谁、调几次"

### ✅ 已实现

#### RouterService（入口路由决策）
- **服务**: `RouterService` (`src/agent/services/router.service.ts`)
- **职责**: 智能路由到 System1 vs System2
- **策略**:
  - 硬规则短路（支付/退款/浏览器 → System2）
  - 特征提取与打分
  - 置信度阈值判断
  - Fallback 机制

#### System1ExecutorService（快路径执行）
- **服务**: `System1ExecutorService` (`src/agent/services/system1-executor.service.ts`)
- **职责**: 规则/DB/确定性工具优先，快速响应
- **路由类型**:
  - `SYSTEM1_API`: 标准 API / CRUD / 简单查询 (< 3s)
  - `SYSTEM1_RAG`: 知识库/向量检索

#### OrchestratorService（慢路径执行）
- **服务**: `OrchestratorService` (`src/agent/services/orchestrator.service.ts`)
- **职责**: ReAct 多步、多工具、多轮修复
- **流程**: Plan → Act → Observe → Critic → Repair
- **特性**:
  - ✅ 预算控制（max_seconds, max_steps, max_browser_steps）
  - ✅ 超时检测和处理
  - ✅ 并行 Action 执行支持
  - ✅ 状态更新和同步
  - ✅ Action 结果缓存
  - ✅ 决策日志记录

#### LangGraph 多 Agent 编排
- **服务**: `LangGraphOrchestratorService` (`src/trips/decision/orchestration/langgraph-orchestrator.service.ts`)
- **流程**: PLANNER → (tools) → CORE_DECISION → (RAG) → NARRATOR
- **设计原则**:
  - LangGraph 作为"调度员"而非"驾驶员"
  - 保护 Hard Core 的确定性逻辑

### 🔧 调度层的"产物/协议"

- **phase/progress**: 给进度页用（已有 `PlanningPhase`: DRAFTING, SAFETY_CHECK, PACING_ADJUSTMENT, FINALIZING）
- **任务状态机**: COLLECT_PARAMS / BUILD_POOL / DRAFT / EVALUATE / READY（部分实现）
- **超时与中断策略**: 已有超时检测，建议完善用户改参数时 cancel 前一次 draft

---

## 3. 记忆层 Memory

**职责**: 让系统"记得住、可复用、可追溯"——短期上下文 + 长期知识 + 用户偏好

### 3.1 短期记忆（一次会话内）

#### ✅ 已实现

- **Orchestrator 的 scratchpad / 当前任务上下文**
  - **服务**: `AgentStateService` (`src/agent/services/agent-state.service.ts`)
  - **状态管理**: `AgentState` (Working Memory)
- **TripContext**: readiness 用的上下文增强结构
- **Draft 生成中的候选池、评估结果、patch 列表**
  - 存储在 `AgentState` 中

#### 🔧 典型落点

- Orchestrator 的 state
- LangGraph 的 graph state
- Redis（可选，当前未使用）

### 3.2 长期结构化记忆（可查询、可更新）

#### ✅ 已实现

- **DB**: 
  - Trips / ItineraryItems / Places（place 表、trip 表）
  - 使用 Prisma ORM 访问
- **ReadinessPack（规则包）**: 
  - 结构化知识库（不是向量库）
  - 存储在数据库中
- **用户偏好**: 
  - 部分实现（UserProfile, preferredRouteTypes 等）
  - 建议完善为完整的 `UserPreferenceProfile` 表或 JSONB

#### 🔧 关键能力

- **记忆写入策略**: 什么时候把"拒绝缓冲日"写进 profile（部分实现）
- **记忆版本**: 偏好被覆盖/撤销（待完善）
- **可解释引用**: RAG 命中文档证据链（部分实现）

### 3.3 长期语义记忆（RAG/向量）

#### ✅ 已实现

- **Place.embedding**: 地点向量嵌入（已实现）
- **COMPLIANCE 文档库**: RAG 基础设施已就绪
- **LOCAL_INSIGHT 本地洞察库**: RAG 基础设施已就绪
- **RAG 模块**: `RagModule` (`src/rag/rag.module.ts`)

---

## 4. 工具层 Tools

**职责**: 让 agent "能做事"——可调用的能力接口（内部/外部）

### ✅ 已实现

#### MCP Server Tools
- **服务**: MCP Server (`src/mcp/mcp-server.ts`)
- **工具**:
  - `hello`: 测试工具
  - `get_server_info`: 获取服务器信息
  - `list_trips`: 列出所有行程
  - `get_trip`: 获取单个行程
  - `search_places`: 搜索地点
  - `get_place`: 获取单个地点信息

#### Action Registry（内部工具集）
- **服务**: `ActionRegistryService` (`src/agent/services/action-registry.service.ts`)
- **Action 类别**:
  1. **Trip Actions** (`trip.*`): 行程相关操作
  2. **Places Actions** (`places.*`): 地点搜索、实体解析、POI 事实
  3. **Transport Actions** (`transport.*`): 交通路由、时间矩阵
  4. **Itinerary Actions** (`itinerary.*`): 行程优化（VRPTW算法）、跨天修复
  5. **Policy Actions** (`policy.*`): 可行性验证、稳健度评估
  6. **Readiness Actions** (`readiness.*`): 旅行准备度检查
  7. **WebBrowse Actions** (`webbrowse.*`): 无头浏览器操作（需要授权）
  8. **RailPass Actions** (`railpass.*`): RailPass 相关操作

#### TripNARA Core Tool（内部工具集）
- **服务**: `TripNaraCoreToolService` (`src/trips/decision/tools/tripnara-core-tool.service.ts`)
- **用途**: 封装核心决策引擎（Abu/Dr.Dre/Neptune）

#### Readiness Engine
- **服务**: `ReadinessService` (`src/trips/readiness/services/readiness.service.ts`)
- **职责**: rule-engine / checker（可调用工具能力）

### 🔜 未来工具

- **机票/酒店**: 更适合作为 MCP tool（`search_flights`/`search_hotels`），由调度层决定何时调用

### 🔧 工具层工程要求

- ✅ **稳定输入输出**: DTO/Schema（已实现）
- ✅ **幂等性**: apply_patch 可重放（部分实现）
- 🔧 **权限与限流**: 防止 agent 滥用工具（待完善）
- 🔧 **错误码规范**: 让 System2 会"自我修复"（部分实现）

---

## 5. 运维 & 治理 Ops & Governance

**职责**: 让系统"可上线、可控、可评估、可回滚、可审计"

### 5.1 可观测性 Observability

#### ✅ 已实现

- **EventTelemetryService**: 
  - **服务**: `EventTelemetryService` (`src/agent/services/event-telemetry.service.ts`)
  - **功能**: 事件埋点与追踪
- **Log**: 
  - 工具调用参数、返回摘要、耗时、失败原因（部分实现）
- **Metrics**: 
  - 成功率、平均耗时、重试次数（部分实现）

#### 🔧 待完善

- **Trace**: 一次生成 draft 的全链路（Router→System1/2→MCP→LLM）
- **Metrics**: 幻觉率（如"生成了 DB 不存在的 POI"）
- **可视化**: 可观测性数据的可视化展示

### 5.2 治理 Governance

#### 🔧 建议实现

- **Prompt / Pack / Tool 的版本管理**: 线上 A/B 测试
- **安全策略**: 
  - 合规拦截
  - 敏感数据脱敏
  - 输出审查
- **成本治理**: 
  - ✅ Token 预算（已有 `cost_budget_usd`）
  - ✅ 缓存策略（已有 `ActionCacheService`）
  - 🔧 分层模型（小模型先跑）
- **评测体系**: 
  - 离线 eval（固定场景集）
  - 回归测试（readiness 规则匹配不能坏）

### 5.3 运维运转 Runbook

#### 🔧 建议实现

- **降级策略**: System2 失败→回退 System1 草案；RAG 不可用→只输出 DB 证据
- **熔断/隔离**: 外部 API（票务）故障不影响核心行程草案
- **故障恢复**: 自动重试、失败重试策略

---

## 6. 社会层 Society

**职责**: 多角色协作与规范——"谁对谁负责、怎么协同、怎么给用户呈现"

### ✅ 已实现

#### 三人格系统（角色协议）
- **Abu** (安全评估): 检查 DEM 硬违规、道路状态、危险区域
- **Dr.Dre** (节奏调整): 基于人体能力模型调整行程节奏
- **Neptune** (空间修复): 在保持路线哲学的前提下替换不可用路段
- **职责边界**: 三个子模块有明确的职责划分
- **协同顺序**: 在 CORE_DECISION 中按顺序执行

#### 建议系统 Suggestion 协议
- **服务**: Suggestion System（建议系统）
- **功能**: 
  - 谁能发 blocker
  - 谁能发 patch
  - 谁能覆盖谁
- **状态**: ✅ 基础设施已就绪

#### 用户参与机制
- **反馈机制**: 用户拒绝/接受建议→写入偏好→下一次行为变化
- **状态**: 部分实现（用户偏好存储）

### 🔧 社会层的"制度/协议"（建议完善）

- **冲突仲裁**: Abu blocker > Dr.Dre 节奏 > Neptune 路线（或定义的优先级）
- **责任归因**: 每条建议都带 sourcePersona + evidence + impact
- **学习闭环**: 用户 feedback 写入 PreferenceProfile，影响下一次 Dr.Dre 的策略
- **统一助手中心**: 聚合三人格建议，不靠切换视图

---

## 总结

### 架构层次
✅ **6 层架构**：
1. **模型层**: LLM 集成（PLANNER, NARRATOR, System2 Orchestrator）
2. **调度层**: Router → System1/System2 → LangGraph 多 Agent 编排
3. **记忆层**: 短期记忆（AgentState） + 长期结构化记忆（DB） + 长期语义记忆（RAG）
4. **工具层**: MCP Tools + Action Registry + TripNARA Core Tool
5. **运维 & 治理**: 可观测性（部分） + 治理（待完善） + Runbook（待完善）
6. **社会层**: 三人格系统 + 建议系统 + 用户参与机制（部分实现）

### 关键特性

- ✅ **双系统架构**: System 1（快速路径）vs System 2（推理路径）
- ✅ **ReAct 循环**: Plan → Act → Observe → Critic → Repair
- ✅ **Action Registry**: 8 个 Action 类别，支持元数据管理、Schema 验证、缓存
- ✅ **LLM 集成**: Planner 和 Narrator 已集成 LLM
- ✅ **记忆系统**: 短期记忆（AgentState）+ 长期记忆（DB + RAG）
- 🔧 **治理能力**: 可观测性部分实现，治理和 Runbook 待完善

### 相关文档

- `src/agent/README.md` - Agent 模块详细文档
- `src/agent/AGENT_INFRA_CHECKLIST.md` - Agent Infrastructure 框架检查清单
- `src/trips/decision/orchestration/LLM_INTEGRATION_GUIDE.md` - LLM 集成指南
- `src/trips/decision/README.md` - 决策层文档
- `docs/三人格系统计算逻辑 - 不同页面详解.md` - 三人格系统详解
