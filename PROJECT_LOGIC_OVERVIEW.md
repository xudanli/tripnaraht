# TripNARA 项目逻辑梳理

## 📋 目录
1. [项目定位](#项目定位)
2. [核心架构](#核心架构)
3. [数据流](#数据流)
4. [模块职责](#模块职责)
5. [关键流程](#关键流程)
6. [技术栈](#技术栈)

---

## 🎯 项目定位

**TripNARA** 是一个**世界级路线认知 Agent**，不是简单的行程生成器。

### 核心价值主张
> "我们不是在规划旅行，而是在替用户判断：在这个世界的这个角落，他该不该这样走。"

### 与普通旅行App的区别
- ❌ **不是** AI 行程生成器
- ❌ **不是** 攻略推荐系统  
- ❌ **不是** Chat Bot
- ✅ **是** 知道"世界怎么运作"的旅行 Agent
- ✅ **是** 地理 × 体力 × 风险的联合决策系统
- ✅ **是** 会替用户承担"判断责任"的世界级路线认知引擎

---

## 🏗️ 核心架构

### 三层架构

```
┌─────────────────────────────────────────┐
│         Agent Layer (编排层)            │
│  - RouterService (路由决策)             │
│  - OrchestratorService (执行编排)        │
│  - ClaudeOrchestratorService (Claude编排)│
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      Skills Layer (能力颗粒层)          │
│  - 决策 Skills (Abu/Dr.Dre/Neptune)      │
│  - 规划 Skills (plan/itinerary)          │
│  - 地理 Skills (geo/dem)                 │
│  - 工具 Skills (transport/poi)           │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      Core Services (核心服务层)         │
│  - TripsService (行程管理)               │
│  - PlacesService (地点查询)               │
│  - RouteDirectionsService (路线方向)      │
│  - DecisionEngine (决策引擎)             │
└─────────────────────────────────────────┘
```

### 双系统架构（System 1 vs System 2）

```
用户请求
    ↓
RouterService 路由决策
    ├─ System 1 (快速路径)
    │   ├─ SYSTEM1_API: CRUD操作、简单查询
    │   └─ SYSTEM1_RAG: 知识库检索
    │
    └─ System 2 (推理路径)
        ├─ LEGACY: 传统ReAct循环
        ├─ CLAUDE_DYNAMIC: Claude动态编排
        └─ CLAUDE_SM: Claude状态机编排
```

---

## 🔄 数据流

### 1. 统一入口流程

```
POST /api/agent/route_and_run
    ↓
AgentController.routeAndRun()
    ↓
AgentService.routeAndRun()
    ├─ 提取信号 (signalsFromRequest)
    ├─ 路由策略决策 (routePolicy)
    │   ├─ LEGACY → 传统路由
    │   ├─ CLAUDE_DYNAMIC → Claude动态编排
    │   └─ CLAUDE_SM → Claude状态机编排
    └─ 执行并返回结果
```

### 2. CLAUDE_SM 状态机流程（主要流程）

```
INTAKE (PlannerAgent)
    ↓ 解析用户请求、识别信息缺口
RESEARCH (Skills并行调用)
    ↓ 获取硬数据 (transport/poi/dem/geo)
GATE_EVAL (GatekeeperAgent → Abu)
    ↓ 硬门控检查、三人格评审
    ├─ BLOCK → 直接返回拒绝
    ├─ ALLOW → 继续
    └─ ADJUST_REQUIRED → 标记需要修复
PLAN_GEN (PlannerAgent)
    ↓ 生成结构化行程草案
VERIFY (验证Skills)
    ↓ 验证开放时间/换乘buffer/可达性/疲劳阈值
REPAIR (LocalInsightAgent → Neptune) [条件执行]
    ↓ 仅在需要时执行：替换POI/改路线/加buffer
NARRATE (NarratorAgent)
    ↓ 生成用户可读解释（只读，不改硬字段）
DONE
```

### 3. 三人格决策流程（核心决策引擎）

```
用户请求 → RouteDirection选择
    ↓
TripDecisionEngine.generatePlan()
    ↓
构建世界模型 (WorldModelContext)
    ├─ PhysicalRealityModel (DEM/天气/合规)
    ├─ HumanCapabilityModel (体力/节奏)
    └─ RouteDirection (路线哲学)
    ↓
StrategyOrchestrator.run()
    ├─ 1. Abu (安全否决者)
    │   └─ 硬约束检查、DEM证据验证
    │       ├─ ALLOW → 继续
    │       └─ REJECT → 终止
    │
    ├─ 2. Dr.Dre (节奏修复者)
    │   └─ 连续疲劳检测、日拆分、缓冲日插入
    │       └─ ADJUST (可调整，不可替换)
    │
    └─ 3. Neptune (空间修复者)
        └─ 入口替换、POI替换、路段绕行
            └─ REPLACE (保持RouteDirection哲学)
    ↓
Finalize → 生成最终行程
```

---

## 📦 模块职责

### 核心模块

#### 1. **Agent Module** (`src/agent/`)
- **职责**: 智能体编排和路由
- **核心服务**:
  - `AgentService`: 统一入口服务
  - `RouterService`: 路由决策（System 1 vs System 2）
  - `OrchestratorService`: 传统ReAct编排
  - `ClaudeOrchestratorService`: Claude状态机编排
- **子Agent**:
  - `ClaudePlannerAgentService`: 规划Agent
  - `ClaudeGatekeeperAgentService`: 门控Agent
  - `ClaudeCoreDecisionAgentService`: 核心决策Agent
  - `ClaudeNarratorAgentService`: 叙事Agent

#### 2. **Trips Module** (`src/trips/`)
- **职责**: 行程管理和业务逻辑
- **核心服务**:
  - `TripsService`: 行程CRUD
  - `TripDecisionEngineService`: 决策引擎（调用三人格）
  - `TripBudgetService`: 预算计算
  - `TripInsightService`: 行程洞察

#### 3. **Decision Module** (`src/trips/decision/`)
- **职责**: 三人格决策系统
- **核心策略**:
  - `AbuStrategyService`: 安全否决（硬约束）
  - `DrDreStrategyService`: 节奏修复（疲劳检测）
  - `NeptuneStrategyService`: 空间修复（POI替换）
- **编排**:
  - `StrategyOrchestratorService`: 三人格编排器
  - `LangGraphOrchestratorService`: LangGraph编排（可选）

#### 4. **RouteDirections Module** (`src/route-directions/`)
- **职责**: 路线方向（RouteDirection）管理
- **核心概念**:
  - **RouteDirection**: 路线人格母本（15个生产级，覆盖4个国家）
  - **RouteTemplate**: 基于RouteDirection的行程模板
- **核心服务**:
  - `RouteDirectionsService`: RouteDirection CRUD
  - `RouteDirectionSelectorService`: 路线选择（根据用户意图）
  - `VectorSearchService`: 向量搜索（POI匹配）

#### 5. **Places Module** (`src/places/`)
- **职责**: 地点（POI）查询和管理
- **核心服务**:
  - `PlacesService`: 地点CRUD
  - `VectorSearchService`: 向量搜索
  - `EntityResolutionService`: 实体解析

#### 6. **Skills Module** (`src/skills/`)
- **职责**: 能力颗粒（最小可复用单元）
- **分类**:
  - `decision/`: 决策Skills (abuCheck/drdrePace/neptuneRepair)
  - `plan/`: 规划Skills (selectSlices/generate)
  - `geo/`: 地理Skills (dem/getProfile/hazard)
  - `route-direction/`: 路线选择Skills
  - `readiness/`: 准备度Skills

#### 7. **Planning Policy Module** (`src/planning-policy/`)
- **职责**: 规划策略（What-If分析）
- **核心服务**:
  - `FeasibilityService`: 可行性评估
  - `RobustnessService`: 稳健度评估

#### 8. **Transport Module** (`src/transport/`)
- **职责**: 交通规划
- **核心服务**:
  - `TransportRoutingService`: 路线规划
  - `SmartRoutesService`: 智能路线推荐

#### 9. **LLM Module** (`src/llm/`)
- **职责**: LLM服务封装
- **核心服务**:
  - `LlmService`: LLM调用封装（支持OpenAI/Claude）

---

## 🔑 关键流程

### 流程1: 创建行程（从RouteTemplate）

```
用户选择RouteTemplate
    ↓
RouteDirectionsService.createTripFromTemplate()
    ├─ 读取RouteTemplate和RouteDirection
    ├─ 解析dayPlans结构
    ├─ 匹配地点候选 (retrievePlaceCandidates)
    ├─ LLM编排选择placeId (orchestrateWithLLM)
    └─ 创建Trip和ItineraryItems
```

### 流程2: 生成行程计划（Agent编排）

```
用户请求: "我想7月去冰岛，但我膝盖不好"
    ↓
AgentService.routeAndRun()
    ├─ 路由决策 → CLAUDE_SM
    └─ ClaudeOrchestratorService.orchestrateWithStateMachine()
        ├─ INTAKE: 解析请求
        ├─ RESEARCH: 获取冰岛数据
        ├─ GATE_EVAL: Abu检查（膝盖不好 → 调整DEM阈值）
        ├─ PLAN_GEN: 生成行程草案
        ├─ VERIFY: 验证可达性
        ├─ REPAIR: Neptune替换高难度路段
        └─ NARRATE: 生成解释文案
```

### 流程3: 三人格决策（核心）

```
TripDecisionEngine.generatePlan()
    ├─ 选择RouteDirection (根据国家/季节/用户意图)
    ├─ 构建WorldModelContext
    │   ├─ PhysicalRealityModel (DEM/天气/合规)
    │   ├─ HumanCapabilityModel (体力/节奏)
    │   └─ RouteDirection (路线哲学)
    └─ StrategyOrchestrator.run()
        ├─ Abu: 硬约束检查
        │   └─ DEM证据验证 → ALLOW/REJECT
        ├─ Dr.Dre: 节奏修复
        │   └─ 连续疲劳检测 → ADJUST
        └─ Neptune: 空间修复
            └─ POI替换 → REPLACE
```

### 流程4: RouteDirection选择

```
用户意图: { countryCode: "IS", month: 7, preferences: ["nature", "photography"] }
    ↓
RouteDirectionSelectorService.pickRouteDirections()
    ├─ 查询RouteDirection (按国家/标签/季节)
    ├─ 评分排序 (考虑用户画像/决策参数)
    └─ 返回Top 3推荐
```

---

## 🗄️ 数据模型关系

```
User
    ↓ (1:N)
Trip
    ├─ (1:N) TripDay
    └─ (1:N) ItineraryItem → Place
            ↓
    RouteDirection (路线方向)
        └─ (1:N) RouteTemplate (路线模板)
                ↓
            Trip (从模板创建)

Place
    ├─ (N:1) City
    └─ (N:1) CountryProfile
```

### 核心数据模型

1. **Trip**: 行程主表
2. **RouteDirection**: 路线方向（路线人格母本）
3. **RouteTemplate**: 路线模板（基于RouteDirection）
4. **Place**: 地点（POI）
5. **ItineraryItem**: 行程项（TripDay + Place的关联）
6. **City**: 城市
7. **CountryProfile**: 国家档案

---

## 🛠️ 技术栈

### 后端框架
- **NestJS 11**: 主框架
- **TypeScript 5**: 开发语言
- **Prisma 6**: ORM
- **PostgreSQL + PostGIS**: 数据库（地理数据支持）

### AI/LLM
- **LangGraph**: 多Agent编排
- **OpenAI API**: LLM服务（可选）
- **Claude API**: LLM服务（可选）

### 缓存
- **Redis**: 缓存服务（可选，可降级到内存缓存）

### 其他
- **Swagger/OpenAPI**: API文档
- **Jest**: 测试框架

---

## 📝 关键概念解释

### 1. RouteDirection（路线方向）
- **定义**: 路线人格母本，包含路线哲学、失败画像、硬约束/软约束
- **作用**: 为行程生成提供"世界观"和"判断标准"
- **示例**: 冰岛高地F-Road、挪威海岸线、瑞士阿尔卑斯

### 2. 三人格系统
- **Abu**: 安全否决者，只能ALLOW或REJECT
- **Dr.Dre**: 节奏修复者，可以ADJUST但不能REPLACE
- **Neptune**: 空间修复者，可以REPLACE但保持RouteDirection哲学

### 3. DEM决策证据
- **定义**: 数字高程模型（Digital Elevation Model）证据
- **作用**: 验证路线的物理可行性（坡度、累计爬升、疲劳指数）
- **规则**: 没有DEM证据的路线不允许finalize
- **质量标记**: Agentic 路径下 `dem.get_profile` 返回 `data_quality`；为 `low`/`unknown` 时不应将「零爬升」默认可信，verify 链宜结合其它证据。
- **定义**: 最小可复用的能力单元
- **特点**: 可测试、可复用、对Agent友好
- **示例**: `skill.decision.abuCheck`, `skill.dem.get_profile`

### 4b. Skill 命名契约（Registry vs MCP）

- **Registry 名**：`SkillsRegistry` 中 `metadata.name` 的唯一真源（例：`dem.get_profile`），编排与 RESEARCH 必须以此为准。
- **MCP 工具名**：`tripnara.*` 可与 Registry 不同，用于对外协议兼容（例：`tripnara.dem.getProfile` ↔ `dem.get_profile`）。文档与示例须 **双标并列**，避免「代码已改名、文档仍写旧名」的认知负荷。
- **遗留别名**：仅在 Registry 边界解析（如 `dem.getProfile`、`dem.get.profile` → `dem.get_profile`）；新 Skill **禁止**再引入第三种拼写。

### 5. System 1 vs System 2
- **System 1**: 快速路径（CRUD、简单查询、RAG检索）
- **System 2**: 推理路径（规划、多约束、需要LLM推理）

---

## 🔍 代码入口点

### API入口
- `POST /api/agent/route_and_run`: 统一Agent入口
- `POST /api/trips`: 行程管理
- `POST /api/route-directions`: 路线方向管理
- `GET /api/places`: 地点查询

### 核心服务入口
- `AgentService.routeAndRun()`: Agent统一入口
- `TripDecisionEngineService.generatePlan()`: 决策引擎
- `StrategyOrchestratorService.run()`: 三人格编排
- `RouteDirectionSelectorService.pickRouteDirections()`: 路线选择

---

## 📚 相关文档

- [README.md](./README.md): 项目总览
- [src/agent/README.md](./src/agent/README.md): Agent模块文档
- [src/trips/decision/README.md](./src/trips/decision/README.md): 决策系统文档
- [src/skills/README.md](./src/skills/README.md): Skills架构文档
- [src/route-directions/README.md](./src/route-directions/README.md): RouteDirection文档

---

## 🎯 总结

TripNARA的核心逻辑是：

1. **用户请求** → Agent路由决策（System 1 vs System 2）
2. **System 2路径** → Claude状态机编排（INTAKE → RESEARCH → GATE → PLAN → VERIFY → REPAIR → NARRATE）
3. **核心决策** → 三人格系统（Abu → Dr.Dre → Neptune）
4. **路线基础** → RouteDirection提供"世界观"和"判断标准"
5. **能力支撑** → Skills提供可复用的能力颗粒

整个系统围绕"替用户承担判断责任"这一核心价值，通过物理现实（DEM/天气）、人体能力（体力/节奏）、路线哲学（RouteDirection）三个维度进行联合决策。
