# TripNARA - 世界级路线认知 Agent

> **我们不是在规划旅行，而是在替用户判断：在这个世界的这个角落，他该不该这样走。**

TripNARA 是一个基于 NestJS 的智能旅行规划系统，从"系统已完成"跃迁为"世界级路线认知 Agent"。它不是一个简单的行程生成器，而是一个会替用户承担"判断责任"的决策系统。

## 核心定位

TripNARA 不是：
- ❌ AI 行程生成器
- ❌ 攻略推荐系统
- ❌ Chat Bot

TripNARA 是：
- ✅ **一个知道"世界怎么运作"的旅行 Agent**
- ✅ **地理 × 体力 × 风险的联合决策系统**
- ✅ **会替用户承担"判断责任"的世界级路线认知引擎**

## 产品边界（写死）

TripNARA **不进入交易履约层**：

- ❌ 不替用户交易、不承诺库存、不执行预订
- ❌ 不做 GDS / NDC / ONE Order / PMS / CRS 深集成
- ❌ 不提供「一键预订 / 自动改签 / 自动下单」

TripNARA **只做旅行决策与路线认知**：

- ✅ 判断路线是否值得走、是否可执行
- ✅ 识别风险并给出调整建议（影响分析，非代订）
- ✅ 表达数据来源、覆盖边界与不确定性

核心内部模型见 `src/travel-cognition/`：

| 建设重点 | 类型 | 作用 |
|---------|------|------|
| 实体统一 | `TravelEntityRef` | 消除同名地点/机场/道路歧义 |
| 事实可信度 | `EvidenceEnvelope<T>` | 来源、时效、置信度 |
| 覆盖声明 | `CoverageDisclosure` | 基于哪些数据判断、哪些未覆盖 |
| 级联影响 | `TravelDependencyImpact` | 延误/封路 → 接驳/入住/当日路线风险 |

## 技术栈

- **框架**: NestJS 11
- **数据库**: PostgreSQL + PostGIS
- **ORM**: Prisma 6
- **缓存**: Redis
- **API 文档**: Swagger/OpenAPI
- **语言**: TypeScript 5
- **LangGraph**: @langchain/langgraph（多 Agent 编排）
- **图数据库**: Neo4j 接口设计（未来迁移）

## 环境搭建

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env` 文件，配置数据库连接和其他服务密钥：

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/tripnara"
REDIS_URL="redis://localhost:6379"
GOOGLE_PLACES_API_KEY="your_key"
GOOGLE_VISION_API_KEY="your_key"
MAPBOX_API_KEY="your_key"

# LLM 配置（用于 LangGraph Agent）
OPENAI_API_KEY="sk-..."  # OpenAI API Key（可选，未配置时使用规则匹配回退）
OPENAI_MODEL="gpt-4o"    # OpenAI Model（可选，默认 gpt-3.5-turbo）
OPENAI_BASE_URL="https://api.openai.com/v1"  # OpenAI Base URL（可选）

# ... 其他环境变量
```

**注意**：
- ✅ 项目使用 NestJS 的 `ConfigModule`（全局配置），会自动从 `.env` 文件加载
- ✅ 不需要手动 `export`，直接在 `.env` 文件中配置即可
- ✅ 如果未配置 `OPENAI_API_KEY`，LangGraph Agent 会自动回退到规则匹配/模板模式

### 3. 数据库迁移

```bash
npm run prisma:generate
npm run prisma:migrate
```

## 开发流程

```bash
# 启动开发服务器（热重载）
npm run dev

# 构建生产版本
npm run build

# 运行生产服务器
npm run start
```

## 构建与 CI（类型检查说明）

当前主干合并与回归验证以 **定向 CI** 为主：Multi-Agent 策略桥等核心链路由 GitHub Actions **`.github/workflows/world-model-bridge.yml`** 与脚本 **`npm run test:world-model-bridge`** 保护（变更触及 `src/skills/world/**`、`src/agent/services/**` 等路径时触发）。

**Full-repo `tsc`**（`npm run typecheck:src` / `tsconfig.build.json`）仍存在历史模块的存量报错；清理后可恢复「全仓库类型检查即绿」。在此之前：

> **Current build health for the Decision Bridge path is validated via targeted CI (`world-model-bridge` workflow). Full-repo `tsc` is pending legacy debt clearing.**

详见 [`docs/agent/MULTI_AGENT_COLLABORATION_BRIDGE.md`](./docs/agent/MULTI_AGENT_COLLABORATION_BRIDGE.md)。

## API 文档

启动服务后，访问 `http://localhost:3000/api-docs` 查看完整的 Swagger API 文档。

**主要 API 文档**：
- [Agent 统一入口 API](./docs/AGENT_UNIFIED_ENTRY_API.md) - `POST /api/agent/route_and_run`
- [Iterative Deployment API](./docs/API_ITERATIVE_DEPLOYMENT.md) ⭐ - `/api/training/*`（模型训练与迭代部署）
- [规划工作台提交 API](./docs/API_PLANNING_WORKBENCH_COMMIT.md) - `POST /planning-workbench/plans/:planId/commit`

**Iterative Deployment 快速开始**：
- [快速开始指南](./docs/ITERATIVE_DEPLOYMENT_QUICK_START.md) - 3 步快速启动
- [功能验证指南](./docs/ITERATIVE_DEPLOYMENT_VERIFICATION_GUIDE.md) - 详细验证步骤
- [测试总结](./docs/ITERATIVE_DEPLOYMENT_TEST_SUMMARY.md) - 测试结果和覆盖率

## 项目结构

```
.
├── src/                           # 源代码目录
│   ├── main.ts                    # 应用入口
│   ├── app.module.ts              # 根模块
│   ├── trips/                     # 行程管理模块
│   │   ├── decision/              # 决策引擎（核心）
│   │   │   ├── strategies/        # 三人格策略
│   │   │   │   ├── abu-strategy.service.ts
│   │   │   │   ├── dr-dre-strategy.service.ts
│   │   │   │   └── neptune-strategy.service.ts
│   │   │   ├── services/          # 决策服务
│   │   │   │   ├── strategy-orchestrator.service.ts
│   │   │   │   ├── dem-decision-evidence.service.ts
│   │   │   │   ├── weather-decision-evidence.service.ts
│   │   │   │   ├── spatial-replacement.service.ts
│   │   │   │   └── spatial-issue-detector.service.ts
│   │   │   ├── tools/             # TripNARA Core Tool（LangGraph 集成）
│   │   │   │   ├── tripnara-core-tool.interface.ts
│   │   │   │   └── tripnara-core-tool.service.ts
│   │   │   ├── orchestration/     # LangGraph 编排层
│   │   │   │   ├── langgraph-orchestrator.service.ts
│   │   │   │   ├── planner-agent.service.ts
│   │   │   │   └── narrator-agent.service.ts
│   │   │   ├── graph-db/          # 图数据库接口
│   │   │   │   ├── graph-db.interface.ts
│   │   │   │   └── graph-data-converter.service.ts
│   │   │   ├── prediction/       # MoBagel 预测模型接口
│   │   │   │   ├── mobagel-forecast.interface.ts
│   │   │   │   └── mobagel-forecast.service.ts
│   │   │   ├── shared/            # 共享类型
│   │   │   │   ├── world-model.types.ts
│   │   │   │   └── decision-result.types.ts
│   │   │   ├── tot/               # 思维树框架
│   │   │   │   ├── tot-evaluator.service.ts
│   │   │   │   ├── beam-search.service.ts
│   │   │   │   └── dimension-scorers.ts
│   │   │   └── __tests__/         # 策略测试
│   │   └── e2e/                   # 端到端测试
│   │       └── iceland-highlands.e2e.spec.ts
│   ├── route-directions/          # RouteDirection 系统
│   │   ├── fixtures/             # 测试数据
│   │   │   └── is_highlands_froad.fixture.ts
│   │   └── services/             # RouteDirection 服务
│   ├── places/                    # 地点管理模块
│   ├── itinerary-optimization/    # 路线优化模块
│   ├── transport/                 # 交通规划模块
│   ├── planning-policy/           # 规划策略模块（What-If）
│   ├── agent/                     # Agent 系统
│   ├── voice/                     # 语音解析模块
│   └── vision/                    # 视觉识别模块
├── prisma/                        # 数据库配置和迁移
├── scripts/                       # 数据导入和处理脚本
│   ├── seed-switzerland-route-directions.ts
│   ├── seed-norway-route-directions.ts
│   ├── seed-iceland-route-directions.ts
│   ├── seed-peru-route-directions.ts
│   └── demo-full-pipeline-iceland.ts
├── docs/                          # 项目文档
│   ├── COMPLETE_SUMMARY.md
│   ├── STRATEGY_CONTRACT_SYSTEM.md
│   ├── ICELAND_HIGHLANDS_E2E.md
│   └── ...
└── package.json                   # 项目依赖
```

## 核心能力

### 🧠 三人格决策系统（Strategy Pattern）

TripNARA 采用三人格决策架构，每个角色承担不同的职责：

#### Abu（安全否决者）
- **职责**：硬约束检查，安全把关
- **能力**：DEM 证据验证、硬违规检测、合规检查
- **特点**：只能 ALLOW 或 REJECT，不可调整
- **文件**：`src/trips/decision/strategies/abu-strategy.service.ts`

#### Dr.Dre（节奏修复者）
- **职责**：结构修复，节奏管理
- **能力**：连续疲劳检测、日拆分、缓冲日插入
- **特点**：可以 ADJUST，不能 REPLACE
- **文件**：`src/trips/decision/strategies/dr-dre-strategy.service.ts`

#### Neptune（空间修复者）
- **职责**：空间替换，路线修复
- **能力**：入口替换、POI 替换、路段绕行
- **特点**：可以 REPLACE，保持 RouteDirection 哲学
- **文件**：`src/trips/decision/strategies/neptune-strategy.service.ts`

**决策流程：**
```
Abu → Dr.Dre → Neptune → Finalize
```

### 🗺️ RouteDirection 系统（路线人格母本）

**15 个生产级 RouteDirection（4 个国家）：**

| 国家 | RouteDirection 数量 | 核心价值 |
|------|-------------------|---------|
| 🇨🇭 瑞士 | 4 | 「秩序即安全」型国家 |
| 🇳🇴 挪威 | 4 | 海岸 × DEM 联合决策 |
| 🇮🇸 冰岛 | 4 | 「自然高于人类」型国家 |
| 🇵🇪 秘鲁 | 3 | 「生理适应型」国家 |

**核心特性：**
- 路线哲学（Philosophy）
- 失败画像（Failure Profile）
- 硬约束/软约束
- 季节性规则
- 签名 POI 权重

### 📊 DEM 决策证据（立法级升级）

**强制规则：**
1. ❌ 没有 DEM evidence 的路线，不允许 finalize
2. ❌ Neptune 不得修复"没有 DEM 证据"的段
3. ❌ Abu 不允许忽略 HARD violation

**核心能力：**
- ✅ 连续疲劳检测（rolling window 3天）
- ✅ 走廊质量评分（viewExposure + elevationVariance - slopePenalty）
- ✅ 可解释失败原因

### 🌪️ 天气决策证据

- 风速 > 15 m/s → 禁止侧风路段
- 能见度检查
- 降水风险评估
- **能去 ≠ 应该去**

### 📝 决策日志系统（责任账本）

**这是 TripNARA 与所有 LLM/OTA 的根本差异**

- ✅ 完整的证据链（DEM + Weather + Compliance）
- ✅ 三人格的日志风格（Abu / Dr.Dre / Neptune）
- ✅ 可审计、可回放
- ✅ 人格化解释语言

### 🧪 端到端测试

**冰岛高地 F-Road Expedition E2E 测试：**
- ✅ 场景 1：理想夏季高地穿越（正常通过）
- ✅ 场景 2：5 月高地入口封闭 → 直接被否决
- ⚠️ 场景 3：局部 F 路封闭，有绕行 → Neptune 替换（Neptune 策略测试设置问题）

**测试文件：** `src/trips/e2e/iceland-highlands.e2e.spec.ts`

**LangGraph 编排器 E2E 测试：**
- ✅ 8/8 测试通过
- ✅ Planner Agent 参数提取正常
- ✅ Narrator Agent 解释生成正常
- ✅ 完整编排流程正常

**测试文件：** `src/trips/decision/orchestration/__tests__/langgraph-orchestrator.e2e.spec.ts`

### 🌳 思维树框架（Tree of Thoughts）

**当前状态：** 已实现 ToT 评估器，用于多候选方案评估

**文件：**
- `src/trips/decision/tot/tot-evaluator.service.ts`
- `src/trips/decision/tot/beam-search.service.ts`
- `src/trips/decision/tot/dimension-scorers.ts`

**文档：** `docs/ARCHITECTURE_ANALYSIS_TREE_OF_THOUGHTS.md`

### 🤖 LangGraph 多 Agent 编排（Phase 2）

**架构设计：坚硬内核 + 柔软外壳**

- **LangGraph Orchestrator**: 多 Agent 协作编排，负责状态管理、分支控制
- **Planner Agent**: 意图识别、任务拆解、参数提取
- **Narrator Agent**: 结果润色、故事层文案生成
- **TripNARA Core Tool**: 将核心决策引擎封装为工具，保护 Hard Core 的确定性逻辑

**使用方式**:
```bash
POST /decision/langgraph-query
{
  "query": "我想在7月去冰岛，但我膝盖不好，不想太累"
}
```

**设计原则**:
- ✅ LangGraph 作为"调度员"而非"驾驶员"
- ✅ 保护 Hard Core（Abu / Dr.Dre / Neptune）的确定性逻辑
- ✅ 向后兼容（保留原有 `generatePlan` 端点）

**文档**: [架构融合指南](./docs/ARCHITECTURE_FUSION_LANGGRAPH_MOBAGEL.md)

### 📊 图数据库支持（Phase 1）

**数据结构设计**:
- ✅ RouteSegment 支持图关系字段
- ✅ Place 模型支持图节点属性
- ✅ GraphDataConverter 服务（数据转换）

**未来迁移**:
- 支持迁移到 Neo4j
- 支持图算法查询（Dijkstra、A* 等）
- 支持高效的关系查询

**文档**: [Phase 1 完成总结](./docs/PHASE1_COMPLETED.md)

### 📈 预测模型接口（Phase 3 预留）

**MoBagel 预测模型接口**:
- PriceForecast: 价格预测
- CrowdForecast: 拥挤度预测
- RouteRiskForecast: 路线风险预测
- RouteAbandonmentForecast: 路线放弃率预测
- FatigueFailureForecast: 疲劳失败率预测

**设计原则**:
- MoBagel 作为"动态权重源"，不直接输出路线
- 预测结果注入到 PhysicalRealityModel / ObjectiveWeights

**文档**: [架构融合指南](./docs/ARCHITECTURE_FUSION_LANGGRAPH_MOBAGEL.md)

### 传统功能

#### 行程管理
- 创建行程（自动计算预算和节奏策略）
- 获取行程详情和当前状态
- Schedule 读写（算法视图和数据库视图转换）

#### 地点查询与推荐
- 附近地点查询（基于 PostGIS）
- 关键词搜索和自动补全
- 酒店推荐（综合隐形成本）
- 路线难度计算

#### 路线优化
- 节奏感算法优化（4维平衡算法）
- 支持多种场景（标准、带老人/小孩、快节奏）

#### 规划策略（What-If）
- 稳健度评估
- 候选方案生成和评估
- 拆分接口支持分段 loading

#### 语音与视觉
- 语音转写（ASR）
- 文字转语音（TTS）
- 拍照识别 POI 推荐

#### 其他功能
- 交通规划（智能推荐）
- 价格估算（机票、酒店）
- 国家档案（货币、支付、签证信息）
- 操作历史和撤销

## 核心文档

### 系统架构
- [完整升级总结](./docs/COMPLETE_SUMMARY.md) - 从"系统已完成"到"世界级路线认知 Agent"
- [策略契约系统](./docs/STRATEGY_CONTRACT_SYSTEM.md) - 三人格策略架构
- [策略生产就绪](./docs/STRATEGY_PRODUCTION_READY_COMPLETE.md) - 策略系统完成状态
- [架构分析：思维树框架](./docs/ARCHITECTURE_ANALYSIS_TREE_OF_THOUGHTS.md) - ToT 集成情况
- [架构融合指南](./docs/ARCHITECTURE_FUSION_LANGGRAPH_MOBAGEL.md) - LangGraph + MoBagel 融合架构
- [实施路线图](./docs/IMPLEMENTATION_ROADMAP.md) - Phase 1/2/3 详细实施计划
- [Phase 1 完成总结](./docs/PHASE1_COMPLETED.md) - 图数据库思想 + TripNARA Core Tool
- [Phase 2 完成总结](./docs/PHASE2_COMPLETED.md) - LangGraph 外层编排

### RouteDirection 系统
- [RouteDirection 原型](./docs/ROUTE_DIRECTION_ARCHETYPES.md) - 6 个世界级原型
- [国家 Pack 指南](./docs/COUNTRY_PACK_GUIDE.md) - 如何创建国家 Pack
- [瑞士 RouteDirection Pack](./docs/SWITZERLAND_ROUTE_DIRECTION_PACK.md)
- [挪威 RouteDirection Pack](./docs/NORWAY_ROUTE_DIRECTION_PACK.md)
- [冰岛 RouteDirection Pack](./docs/ICELAND_ROUTE_DIRECTION_PACK.md)
- [秘鲁 RouteDirection Pack](./docs/PERU_ROUTE_DIRECTION_PACK.md)

### 决策系统
- [DEM 决策证据](./docs/DEM_REGRESSION_SCENARIOS.md) - DEM 升级说明
- [天气决策证据](./docs/WEATHER_DECISION_EVIDENCE.md) - 天气作为第一变量
- [决策日志系统](./docs/DECISION_LOG_SYSTEM.md) - 责任账本
- [用户画像映射](./docs/USER_PERSONA_MAPPING.md) - 感受 → 物理规则

### 策略实现
- [Dr.Dre 节奏大脑](./docs/DR_DRE_RHYTHM_BRAIN.md) - 节奏管理算法
- [Neptune 空间替换](./docs/NEPTUNE_SPATIAL_REPLACEMENT.md) - 空间修复算法
- [空间问题检测](./docs/SPATIAL_ISSUE_DETECTION.md) - 问题检测逻辑

### 测试
- [冰岛高地 E2E 测试](./docs/ICELAND_HIGHLANDS_E2E.md) - 完整链路测试

### API 接口
- [Agent 统一入口 API](./docs/AGENT_UNIFIED_ENTRY_API.md) - 智能体统一入口接口
- [Iterative Deployment API](./docs/API_ITERATIVE_DEPLOYMENT.md) ⭐ - 模型训练与迭代部署接口
- [规划工作台提交 API](./docs/API_PLANNING_WORKBENCH_COMMIT.md) - 规划方案提交接口
- [API 接口文档 - 前端使用指南](./docs/API-接口文档-前端使用指南.md)
- [项目结构说明](./docs/项目结构说明.md)

## 数据模型

主要数据模型：
- `Place`: 地点（景点、餐厅、酒店等）
- `Trip`: 行程
- `TripDay`: 行程日期
- `ItineraryItem`: 行程项
- `City`: 城市
- `CountryProfile`: 国家档案

详细说明请查看 [数据模型边界说明](./docs/API-接口文档-前端使用指南.md#12-数据模型边界说明)

## 开发脚本

```bash
# 数据导入
npm run import:cities        # 导入城市数据
npm run import:airports      # 导入机场数据
npm run import:nature-poi    # 导入自然 POI

# 数据爬取
npm run scrape:alltrails     # 爬取 AllTrails 数据
npm run scrape:mafengwo     # 爬取马蜂窝景点数据

# 数据更新
npm run enrich:amap          # 从高德地图丰富景点信息
npm run update:alltrails:elevation  # 更新高程数据

# 测试
npm run test:optimize        # 测试路线优化 API
```

## 问题排查

**端口冲突：**
```bash
lsof -ti:3000 | xargs kill -9    # 清理 3000 端口
```

**清理并重装依赖：**
```bash
rm -rf node_modules dist
npm install
```

## 技术护城河

1. **DEM 立法级升级**
   - 没有 DEM evidence → 不允许 finalize
   - 连续疲劳检测（没有任何 OTA/LLM 会做）
   - 走廊质量评分（路线"高级感"的来源）

2. **天气决策证据**
   - 风速 > 15 m/s → 禁止侧风路段
   - 能去 ≠ 应该去

3. **极端国家模板**
   - 可复用的世界观
   - 自动适配机制（新西兰 80%、智利 85%、阿拉斯加 90%）

4. **用户画像映射**
   - 感受 → 物理规则
   - 个性化决策参数

5. **决策日志系统**
   - 责任账本
   - 可审计、可回放
   - 三人格差异化风格

6. **人格化解释语言**
   - 用户感知："不是你不行，是世界不允许这样走"
   - 高端感

## 产品定位

### 一句话介绍

> 我们不是在规划旅行，而是在替用户判断：在这个世界的这个角落，他该不该这样走。

### 三句话叙事

1. **我们不是 POI 驱动** - POI 是路线走出来的结果
2. **我们不是模板行程** - 行程是路线哲学的展开
3. **我们不是推荐算法** - 我们是地理 × 体力 × 风险的联合决策系统

## 快速开始

### 1. 运行测试

```bash
# 运行所有策略测试
npm run test:strategies

# 运行 E2E 测试
npm test -- iceland-highlands.e2e.spec.ts
```

### 2. 查看演示

```bash
# 运行完整链路演示
npm run demo:full-pipeline
```

### 3. Seed RouteDirection Packs

```bash
# 导入瑞士 Pack
npm run seed:switzerland

# 导入挪威 Pack
npm run seed:norway

# 导入冰岛 Pack
npm run seed:iceland

# 导入秘鲁 Pack
npm run seed:peru
```

## 许可证

MIT
