# TripNARA 架构融合指南：LangGraph + MoBagel + 图数据库

## 核心原则：坚硬内核 + 柔软外壳

**黄金法则：核心是心脏，LangGraph 是神经系统，MoBagel 是外部感知雷达。**

### 架构全景图

```
┌─────────────────────────────────────────────────────────────┐
│                    外层：LangGraph 编排层                      │
│  (Planner Agent / Narrator Agent / Compliance Agent)        │
│  负责：意图识别、任务拆解、结果润色、工具分发                    │
└─────────────────────────────────────────────────────────────┘
                            ↓ 调用
┌─────────────────────────────────────────────────────────────┐
│              中间层：TripNARA Core Tool (封装)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Abu Tool   │  │  Dr.Dre Tool │  │ Neptune Tool │      │
│  │  (安全否决)   │  │  (节奏修复)   │  │  (空间修复)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓ 基于
┌─────────────────────────────────────────────────────────────┐
│            🎯 坚硬内核（不能被任何框架稀释）                      │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │PhysicalReality   │  │HumanCapability   │               │
│  │     Model        │  │     Model        │               │
│  └──────────────────┘  └──────────────────┘               │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │RoutePhilosophy  │  │RouteDirection    │               │
│  │     Model        │  │     Pack         │               │
│  └──────────────────┘  └──────────────────┘               │
│  ┌──────────────────┐                                       │
│  │DEM / OSM / 全球  │                                       │
│  │   矢量底座       │                                       │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
                            ↑ 输入
┌─────────────────────────────────────────────────────────────┐
│            📈 外圈：MoBagel 预测层（动态权重源）                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │PriceForecast │  │CrowdForecast │  │RiskForecast  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## 第一部分：LangGraph 融合策略

### 1.1 设计原则

**✅ 应该做的事：**
- LangGraph 作为"调度员"而非"驾驶员"
- 把 TripNARA Core 封装成 Standardized Tool Protocol (MCP / OpenAPI)
- 让 LLM 只负责"听懂人话"、"拆解任务"、"安抚用户"
- 保护 Hard Core：Abu / Dr.Dre / Neptune 的确定性逻辑

**❌ 不应该做的事：**
- ❌ 不要用 LangGraph 直接决定"路线怎么走"
- ❌ 不要把 Abu / Dr.Dre / Neptune 写成"纯 LLM Agent"
- ❌ 不要让 LLM 的幻觉污染确定性决策

### 1.2 典型调用链

```
用户查询："我不想太累，想去冰岛，但我膝盖不好"
    ↓
┌─────────────────────────────────────────┐
│ Planner Agent (LangGraph Node)          │
│ - 分析语义                                │
│ - 提取参数：knees_bad=True               │
│ - 映射到 HumanCapabilityModel            │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ TripNARA Core Tool (封装调用)            │
│ - 传入参数到 Dr.Dre                      │
│ - Dr.Dre 调整 pacing                     │
│ - Neptune 检查 DEM，剔除爬升过大的路段     │
│ - 返回：计算好的 JSON 路线                │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Narrator Agent (LangGraph Node)         │
│ - 拿到 JSON 路线                          │
│ - 生成："考虑到您的膝盖状况，Dr.Dre 特意   │
│   避开了 Landmannalaugar 的陡峭徒步..."   │
└─────────────────────────────────────────┘
```

### 1.3 多 Agent 协作场景

**场景：需要合规检查的路线规划**

```
1. User Query → Planner Agent (LLM)
2. Planner 调用：
   - RouteDirectionSelector（你的代码）
   - WorldModelBuilder（DEM / OSM / Pack 数据）
3. Abu / Dr.Dre / Neptune 决策（你的核心）
4. 如果涉及 Eurail / 合规：
   - 调 ComplianceRAG Agent（基于 RAG + Eurail 条款索引）
   - 得到 Rule → 写入 ComplianceEvidence
   - 再交回 Safety / Neptune 复核
5. 最后交给 Narrator Agent：生成可读解释＋故事层文案
```

**LangGraph 的价值：**
- ✅ 状态管理（memory / context）
- ✅ 分支控制（失败重试 / fallback）
- ✅ 工具调用树（Tool Calling 的显式图结构）

## 第二部分：MoBagel 融合策略

### 2.1 设计原则

**MoBagel 作为"动态权重源"（Dynamic Weight Source）**

**❌ 不要让 MoBagel 直接输出路线**
**✅ 让 MoBagel 输出 Feature Flags / Meta Tags**

### 2.2 融合点

**输入核心：ObjectiveWeights 和 PhysicalRealityModel**

**操作示例：**
```
MoBagel 预测："10月冰岛北部 F-road 封路概率 80%"
    ↓
注入到 PhysicalRealityModel：
  - 添加 Tag: { riskLevel: "HIGH", closureProbability: 0.8 }
    ↓
Abu (安全官) 读取到高风险 Tag
    ↓
在确定性逻辑层直接否决该路径
```

### 2.3 预测模型类型

#### 1. 价格/预算层预测
- **PriceForecast**: 某国家某月份，某类行程的大致预算区间
- **RouteCostForecast**: 某路线方向下：机票/酒店/车租/向导成本的概率分布

#### 2. 风险/需求层预测
- **CrowdForecast**: 旺季拥挤程度预测 → 决定是否建议错峰
- **RouteRiskForecast**: 某些 F-road / 山路在某月份被封/不可达的概率

#### 3. 用户行为层预测
- **RouteAbandonmentForecast**: 哪种 RouteDirection 被放弃/改动的概率
- **FatigueFailureForecast**: 不同 HumanCapability + RD 组合的「失败率/超疲劳率」

### 2.4 何时引入 MoBagel？

**判断标准：**
1. ✅ 有足够时间序列数据/历史订单/价格数据
2. ✅ 最大瓶颈是"预测不准"（而非 DEM / RouteDirection / 决策人格）
3. ✅ 想做"预算预测 + 体验质量"的差异化功能

**建议时机：**
- **Priority 3**：在你有首批真实用户数据、或接入 OTA 价格/API 后
- 作为 V2/V3 的"加权优化层"引入

## 第三部分：图数据库（Neo4j）集成

### 3.1 为什么需要图数据库？

**你现在做 RouteDirection 和 Country Pack，本质上是在构建一张巨大的知识图谱**

**优势：**
- ✅ 关系查询比 SQL/NoSQL 快得多
  - 例如：查询"距离 A 点 200km 内所有适合 Dr.Dre 节奏的 B 点"
- ✅ 图算法（Graph Algorithms）
  - 可以直接在数据库层面跑 Dijkstra 或 A* 算法的变体
  - 结合你的 HumanCapabilityModel 权重，比纯 Python 内存计算更强

### 3.2 数据结构设计

**节点类型：**
- `Place` (POI)
- `RouteDirection`
- `RouteSegment`
- `Country`
- `Region`

**关系类型：**
- `CONNECTS_TO` (Place → Place)
- `BELONGS_TO` (Place → RouteDirection)
- `HAS_SEGMENT` (RouteDirection → RouteSegment)
- `IN_COUNTRY` (Place → Country)
- `IN_REGION` (Place → Region)
- `SUITABLE_FOR` (Place → HumanCapabilityProfile)

**属性：**
- Place: `elevation`, `slope`, `distance`, `demEvidence`
- RouteSegment: `ascentM`, `fatigueIndex`, `rollingAscent3Days`

### 3.3 Cypher 查询示例

```cypher
// 查询适合 Dr.Dre 节奏的替代路径
MATCH (start:Place {id: $startId})
MATCH (end:Place {id: $endId})
MATCH path = (start)-[:CONNECTS_TO*..5]-(end)
WHERE ALL(segment IN path.segments WHERE 
  segment.fatigueIndex < $maxFatigue AND
  segment.rollingAscent3Days < $maxRollingAscent
)
RETURN path
ORDER BY path.totalAscent ASC
LIMIT 10
```

## 第四部分：其他推荐技术栈

### 4.1 DSPy（Declarative Self-Improving Language Programs）

**为什么需要：**
- 你有很多 Agent (Abu, Dr.Dre, Neptune)
- 目前可能在手动调 Prompt ("You are a strict safety officer...")
- DSPy 允许你定义"意图"和"度量标准"
- 自动优化 Prompt，让 Prompt 变成可编译、可优化的代码

**价值：**
- 让 Prompt 工程从"玄学"变成"严肃工程"
- 例如：Abu 的决策必须 100% 符合 PhysicalReality

### 4.2 LangSmith / Arize Phoenix（评估与监控）

**为什么需要：**
- TripNARA 的决策不仅要"跑通"，还要"正确"
- 需要追踪 DecisionLog
- 当 Abu 拒绝了一条路，是因为 DEM 数据缺失，还是因为 LLM 误判？

**价值：**
- 可视化整个 Chain
- 回溯每一次 Abu 发飙的原因
- 对于 Debug 你的"三人格"至关重要

## 第五部分：优先级排序

### ✅ Priority 1（马上干）
- [ ] 冰岛 / 尼泊尔 / 瑞士 E2E 打通
- [ ] RouteDirection Country Pack 持续扩充
- [ ] 决策日志 & decisionSource 监控 / 分析
- [ ] （可选）RAG 引入规则文档 & 体验文案层
- [ ] **引入图数据库思想**（即便现在不上库，也要按图的数据结构去设计你的 Data Object）

### 🟡 Priority 2（E2E 稳定后）
- [ ] 引 LangGraph/DeepAgents 做「多 Agent 协调层」
  - 把 TripNARA 核心当一个 `core_decision_tool` 来调用
- [ ] 让 ComplianceAgent / LocalInsightAgent / RAGAgent 和 Core Engine 在图里协作
- [ ] 引入 DSPy 优化 Prompt 工程

### 🟢 Priority 3（有真实数据后）
- [ ] 接 MoBagel 或自建简单预测模型
  - 先做 1–2 个高价值预测，如：
    - 「某路线方向 × 某月份的预算区间」
    - 「某路线方向在某月份的封路/天气风险等级」
- [ ] 引入 LangSmith / Arize Phoenix 做评估与监控

## 第六部分：实施路线图

### Phase 1: 图数据库思想（立即）
1. 重构 Data Object，按图结构设计
2. 定义节点和关系的 Schema
3. 为未来迁移到 Neo4j 做准备

### Phase 2: LangGraph 外层编排（E2E 稳定后）
1. 封装 TripNARA Core 为 Tool
2. 创建 Planner Agent
3. 创建 Narrator Agent
4. 创建 Compliance Agent（可选）
5. 用 LangGraph 编排这些 Agent

### Phase 3: 预测模型层（有真实数据后）
1. 定义预测模型接口
2. 接入 MoBagel 或自建模型
3. 将预测结果注入 PhysicalRealityModel / ObjectiveWeights

## 总结

**一句话帮你收个口：**

TripNARA 不需要靠 LangGraph 或 MoBagel 才"成活"，它们更像是你 V2/V3 的"外挂增强包"。

- **LangGraph / DeepAgents**：👉 适合做 "多角色协作 + 工具编排" 的外层剧情导演
- **MoBagel / 预测模型**：👉 适合做 "价格/风险/拥挤度" 的数值优化层
- **图数据库（Neo4j）**：👉 适合做 "关系查询 + 图算法" 的底层加速器

而 **真正的灵魂**——已经在你三大模型 + 三人格 + DEM + RouteDirection 里了。

**保护内核，增强外壳，这就是融合的黄金法则。**

