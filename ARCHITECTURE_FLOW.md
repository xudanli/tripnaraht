# TripNARA 架构流程图

## 🎯 快速理解：三个核心问题

### 1. 用户请求如何被处理？

```
用户请求
    ↓
POST /api/agent/route_and_run
    ↓
AgentService.routeAndRun()
    ├─ 路由决策: System 1 (快速) vs System 2 (推理)
    └─ System 2 → Claude状态机编排
        INTAKE → RESEARCH → GATE → PLAN → VERIFY → REPAIR → NARRATE
```

### 2. 行程如何被生成和决策？

```
选择RouteDirection (路线方向)
    ↓
构建世界模型 (WorldModelContext)
    ├─ 物理现实 (DEM/天气/合规)
    ├─ 人体能力 (体力/节奏)
    └─ 路线哲学 (RouteDirection)
    ↓
三人格决策流程
    Abu (安全) → Dr.Dre (节奏) → Neptune (空间)
    ↓
最终行程
```

### 3. RouteDirection、RouteTemplate、Trip 的关系？

```
RouteDirection (路线人格母本)
    └─ 包含: 路线哲学、失败画像、硬约束
        ↓
    RouteTemplate (路线模板)
        └─ 包含: 天数、日计划结构、POI候选
            ↓
        Trip (用户行程)
            └─ 包含: 具体日期、选定的POI、ItineraryItems
```

---

## 📊 完整架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    用户请求层                                │
│  POST /api/agent/route_and_run                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Agent Layer (编排层)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ AgentService.routeAndRun()                           │  │
│  │   ├─ RouterService: 路由决策                          │  │
│  │   │   ├─ System 1: 快速路径 (CRUD/RAG)                │  │
│  │   │   └─ System 2: 推理路径 (规划/决策)                │  │
│  │   └─ OrchestratorService: 执行编排                     │  │
│  │       ├─ LEGACY: 传统ReAct循环                        │  │
│  │       ├─ CLAUDE_DYNAMIC: Claude动态编排                │  │
│  │       └─ CLAUDE_SM: Claude状态机编排 ⭐               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              CLAUDE_SM 状态机流程 (System 2)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. INTAKE (PlannerAgent)                             │  │
│  │    └─ 解析用户请求、识别信息缺口                       │  │
│  │ 2. RESEARCH (Skills并行调用)                          │  │
│  │    └─ transport/poi/dem/geo/hazard                    │  │
│  │ 3. GATE_EVAL (GatekeeperAgent → Abu)                 │  │
│  │    └─ 硬门控检查、三人格评审                           │  │
│  │ 4. PLAN_GEN (PlannerAgent)                           │  │
│  │    └─ 生成结构化行程草案                               │  │
│  │ 5. VERIFY (验证Skills)                                │  │
│  │    └─ 开放时间/换乘buffer/可达性/疲劳阈值              │  │
│  │ 6. REPAIR (LocalInsightAgent → Neptune) [条件执行]   │  │
│  │    └─ 替换POI/改路线/加buffer                         │  │
│  │ 7. NARRATE (NarratorAgent)                            │  │
│  │    └─ 生成用户可读解释（只读）                          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Skills Layer (能力颗粒层)                      │
│  ┌──────────┬──────────┬──────────┬──────────┐           │
│  │ decision │   plan   │   geo    │ transport │           │
│  │  abuCheck│ selectSli│ dem.getPr│  search   │           │
│  │ drdrePace│   ces    │  ofile   │           │           │
│  │neptuneRep│ generate │ hazard   │           │           │
│  │   air    │          │          │           │           │
│  └──────────┴──────────┴──────────┴──────────┘           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│           三人格决策系统 (核心决策引擎)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ StrategyOrchestrator.run()                            │  │
│  │                                                       │  │
│  │  1. Abu (安全否决者)                                  │  │
│  │     └─ 硬约束检查、DEM证据验证                          │  │
│  │         ├─ ALLOW → 继续                               │  │
│  │         └─ REJECT → 终止                             │  │
│  │                                                       │  │
│  │  2. Dr.Dre (节奏修复者)                                │  │
│  │     └─ 连续疲劳检测、日拆分、缓冲日插入                 │  │
│  │         └─ ADJUST (可调整，不可替换)                    │  │
│  │                                                       │  │
│  │  3. Neptune (空间修复者)                               │  │
│  │     └─ 入口替换、POI替换、路段绕行                      │  │
│  │         └─ REPLACE (保持RouteDirection哲学)           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│          Core Services Layer (核心服务层)                    │
│  ┌──────────────┬──────────────┬──────────────┐            │
│  │ TripsService │ PlacesService│RouteDirection│            │
│  │              │              │   Service     │            │
│  │ - CRUD       │ - 地点查询    │ - 路线选择    │            │
│  │ - 预算计算    │ - 向量搜索    │ - 模板管理    │            │
│  │ - 洞察分析    │ - 实体解析    │              │            │
│  └──────────────┴──────────────┴──────────────┘            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   数据层 (PostgreSQL)                       │
│  Trip → TripDay → ItineraryItem → Place                    │
│  RouteDirection → RouteTemplate                            │
│  DecisionLog → ApprovalRequest                             │
│  ValidatedTrajectory (Iterative Deployment) ⭐             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│        Iterative Deployment 训练层 (Training Layer) ⭐      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. 轨迹收集 (TrajectoryCollectionPipeline)            │  │
│  │    └─ PLAN_GEN完成后、用户审批后、执行完成后收集轨迹    │  │
│  │ 2. 轨迹验证 (TrajectoryValidationPipeline)            │  │
│  │    └─ 验证轨迹质量，筛选通过验证的高质量轨迹            │  │
│  │ 3. Reward提取 (RewardExtractionPipeline)              │  │
│  │    └─ 从用户行为提取reward信号                         │  │
│  │ 4. 训练数据准备 (TrainingDataPreparationPipeline)     │  │
│  │    └─ 筛选高质量轨迹，准备SFT训练数据                  │  │
│  │ 5. 模型训练 (FineTuneService)                          │  │
│  │    └─ 执行模型微调，生成新模型版本                     │  │
│  │ 6. 模型部署 (ModelDeploymentService)                  │  │
│  │    └─ 模型版本管理和部署                               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 关键数据流

### 流程1: 从RouteTemplate创建Trip

```
用户选择RouteTemplate
    ↓
RouteDirectionsService.createTripFromTemplate()
    ├─ 读取RouteTemplate (包含dayPlans结构)
    ├─ 读取RouteDirection (路线哲学)
    ├─ 匹配地点候选 (retrievePlaceCandidates)
    │   └─ 从Place表查询候选POI
    ├─ LLM编排选择 (orchestrateWithLLM)
    │   └─ 根据RouteDirection哲学选择具体POI
    └─ 创建Trip和ItineraryItems
        └─ 保存到数据库
```

### 流程2: 生成新行程计划

```
用户请求: "我想7月去冰岛，但我膝盖不好"
    ↓
AgentService.routeAndRun() → CLAUDE_SM
    ↓
ClaudeOrchestratorService.orchestrateWithStateMachine()
    ├─ INTAKE: 解析请求
    │   └─ 识别: countryCode="IS", month=7, 膝盖不好
    ├─ RESEARCH: 获取数据
    │   ├─ skill.routeDirection.pickForIntent → 选择RouteDirection
    │   ├─ skill.geo.dem.getProfile → 获取DEM数据
    │   └─ skill.poi.search → 搜索POI
    ├─ GATE_EVAL: Abu检查
    │   └─ skill.decision.abuCheck → 根据膝盖不好调整DEM阈值
    ├─ PLAN_GEN: 生成行程
    │   └─ skill.plan.generate → 生成dayPlans
    ├─ VERIFY: 验证
    │   └─ skill.itinerary.verify → 检查可达性/开放时间
    ├─ REPAIR: Neptune修复
    │   └─ skill.decision.neptuneRepair → 替换高难度路段
    └─ NARRATE: 生成解释
        └─ NarratorAgent → 生成用户可读文案
```

### 流程3: 三人格决策详细流程

```
TripDecisionEngine.generatePlan()
    ├─ 1. 选择RouteDirection
    │   └─ RouteDirectionSelectorService.pickRouteDirections()
    │       └─ 根据国家/季节/用户意图评分排序
    │
    ├─ 2. 构建WorldModelContext
    │   ├─ PhysicalRealityModel
    │   │   ├─ DEM数据 (坡度/累计爬升)
    │   │   ├─ 天气数据 (风速/能见度)
    │   │   └─ 合规数据 (签证/驾驶规则)
    │   ├─ HumanCapabilityModel
    │   │   ├─ 体力水平 (从用户画像)
    │   │   ├─ 节奏偏好 (relaxed/normal/intense)
    │   │   └─ 风险容忍度
    │   └─ RouteDirection
    │       ├─ 路线哲学 (不可背叛的规则)
    │       ├─ 失败画像 (常见失败原因)
    │       └─ 硬约束/软约束
    │
    └─ 3. StrategyOrchestrator.run()
        ├─ Abu.run()
        │   └─ 检查硬约束
        │       ├─ DEM证据验证
        │       ├─ 天气风险检查
        │       └─ 合规检查
        │           ├─ ALLOW → 继续
        │           └─ REJECT → 终止，返回拒绝原因
        │
        ├─ Dr.Dre.run() [仅在Abu=ALLOW时]
        │   └─ 节奏修复
        │       ├─ 连续疲劳检测 (rolling window 3天)
        │       ├─ 日拆分 (如果单日行程过长)
        │       └─ 缓冲日插入 (如果连续高强度)
        │           └─ ADJUST → 返回调整后的计划
        │
        └─ Neptune.run() [仅在需要修复时]
            └─ 空间修复
                ├─ 入口替换 (如果入口不可达)
                ├─ POI替换 (如果POI不可用)
                └─ 路段绕行 (如果路段封闭)
                    └─ REPLACE → 返回修复后的计划，保持RouteDirection哲学
```

---

## 🎨 模块依赖关系

```
AgentModule
    ├─ TripsModule
    │   └─ DecisionModule
    │       ├─ RouteDirectionsModule
    │       ├─ PlacesModule
    │       └─ PlanningPolicyModule
    ├─ SkillsModule
    │   ├─ DecisionModule (使用决策Skills)
    │   ├─ RouteDirectionsModule (使用路线选择Skills)
    │   └─ PlacesModule (使用POI Skills)
    ├─ LlmModule
    └─ MemoryModule
```

---

## 📝 关键文件位置

### 入口文件
- `src/main.ts`: 应用启动入口
- `src/app.module.ts`: 根模块
- `src/agent/agent.controller.ts`: Agent API入口

### 核心服务
- `src/agent/services/agent.service.ts`: Agent统一入口服务
- `src/agent/services/claude-orchestrator.service.ts`: Claude状态机编排
- `src/trips/decision/trip-decision-engine.service.ts`: 决策引擎
- `src/trips/decision/services/strategy-orchestrator.service.ts`: 三人格编排器

### 策略实现
- `src/trips/decision/strategies/abu-strategy.service.ts`: Abu策略
- `src/trips/decision/strategies/dr-dre-strategy.service.ts`: Dr.Dre策略
- `src/trips/decision/strategies/neptune-strategy.service.ts`: Neptune策略

### 路线系统
- `src/route-directions/route-directions.service.ts`: RouteDirection服务
- `src/route-directions/services/route-direction-selector.service.ts`: 路线选择器

### Skills
- `src/skills/decision/`: 决策Skills
- `src/skills/plan/`: 规划Skills
- `src/skills/geo/`: 地理Skills

---

## 🚀 快速开始

### 1. 理解核心概念
- **RouteDirection**: 路线人格母本（世界观）
- **三人格**: Abu/Dr.Dre/Neptune（决策流程）
- **Skills**: 能力颗粒（可复用单元）
- **System 1 vs System 2**: 快速路径 vs 推理路径

### 2. 跟踪一个请求
从 `POST /api/agent/route_and_run` 开始，跟踪到最终返回结果

### 3. 理解数据模型
- Trip → TripDay → ItineraryItem → Place
- RouteDirection → RouteTemplate → Trip

### 4. 查看关键文档
- `PROJECT_LOGIC_OVERVIEW.md`: 详细逻辑梳理
- `README.md`: 项目总览
- `src/agent/README.md`: Agent模块文档
- `src/trips/decision/README.md`: 决策系统文档
- `docs/ITERATIVE_DEPLOYMENT_APPLICATION.md`: Iterative Deployment应用分析 ⭐

---

## 🔄 Iterative Deployment 流程（新增）

### Iterative Deployment 循环

```
部署模型 M₁
    ↓
收集规划轨迹（PLAN_GEN、用户审批、执行完成）
    ↓
验证轨迹质量（GateResult = ALLOW、无CRITICAL风险、用户审批 = APPROVED）
    ↓
筛选高质量轨迹（validationScore >= 0.8, totalReward > 0）
    ↓
提取Reward信号（用户审批、规划提交、决策对齐）
    ↓
准备训练数据（筛选、标注、导出SFT格式）
    ↓
模型微调（Fine-tune M₁ → M₂）
    ↓
部署模型 M₂
    ↓
重复循环（持续迭代）
```

### 轨迹收集点

```
CLAUDE_SM 状态机流程
    ↓
PLAN_GEN 步骤完成
    ├─ 收集轨迹：plan、decisionTrace、researchData、gateResult
    └─ 存储到 ValidatedTrajectory（待验证）
    ↓
用户审批（ApprovalRequest）
    ├─ 收集轨迹：用户审批结果（APPROVED/REJECTED）
    └─ 更新轨迹：添加userApproval字段
    ↓
执行完成（ExecutorService）
    ├─ 收集轨迹：执行结果（success/failed）
    └─ 更新轨迹：添加executionResult字段
    ↓
轨迹验证（TrajectoryValidatorService）
    ├─ 验证轨迹质量
    └─ 标记为 VALIDATED（如果通过验证）
```

### Reward信号提取

```
用户行为
    ├─ 用户审批 APPROVED → +1.0
    ├─ 用户审批 REJECTED → -0.5
    ├─ 规划工作台提交 → +0.8
    └─ 决策对齐（alignmentScore）→ 0-1
    ↓
RewardSignalExtractorService
    └─ 提取reward信号，关联到trajectoryId
    ↓
更新轨迹reward
    └─ 计算totalReward，用于训练数据筛选
```

**参考**：
- `docs/ITERATIVE_DEPLOYMENT_APPLICATION.md` - Iterative Deployment应用分析
- `.claude/roles/architect.md` - Iterative Deployment架构设计
