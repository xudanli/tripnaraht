# RAG 融合架构设计文档

## 概述

本文档定义 TripNARA 系统中 RAG（Retrieval-Augmented Generation）的使用边界和融合架构。核心原则：**物理世界是 source of truth，文本只是一种观察。**

---

## 一、底线：哪些地方 ❌ 不要用 RAG

### 核心安全 / 可达性判断

**硬规则：只能来自结构化 & 可验证数据，不能直接信 RAG 读到的一句话。**

#### 禁止 RAG 直接参与决策的场景

1. **道路状态判断**
   - ❌ 不能直接信 RAG："这条 F-road 是否封闭"
   - ✅ 必须来自：`PhysicalRealityModel.roadStates[]` + DEM + 路网数据 + season 字段

2. **季节性可达性**
   - ❌ 不能直接信 RAG："这个山口 1 月能不能走"
   - ✅ 必须来自：`PhysicalRealityModel.climateSeasonality` + DEM + 历史数据

3. **海域通航性**
   - ❌ 不能直接信 RAG："这段海域冬天能不能通航"
   - ✅ 必须来自：`PhysicalRealityModel.ferryStates[]` + 季节性数据

4. **体能阈值判断**
   - ❌ 不能直接信 RAG："EBC 某天的累计爬升是否超阈值"
   - ✅ 必须来自：`HumanCapabilityModel.maxDailyAscentM` + DEM 证据

5. **安全风险判断**
   - ❌ 不能直接信 RAG："这个区域是否有雪崩风险"
   - ✅ 必须来自：`PhysicalRealityModel.hazardZones[]` + 结构化风险评估

### 第一性原理版本

> **"物理世界是 source of truth，文本只是一种观察。"**

**三个一等公民模型（PhysicalRealityModel、HumanCapabilityModel、RoutePhilosophyModel）是决策的唯一可信来源。**

如果 RAG 检索到相关信息，必须：
1. 先写入对应的模型字段
2. 经过验证和结构化
3. 才能参与 Abu / Dr.Dre / Neptune 的硬决策

---

## 二、适合使用 RAG 的场景 ✅

### 场景 A：合规 / 票规 / 运营规则

**特点：**
- 信息在长文档里（Eurail、Interrail 条款、国家公园公告）
- 经常更新
- 结构化程度不高
- 对"能不能走 & 怎么订票"有影响

**RAG 的正确用法：**

#### 1. 建立"规则文档索引库"

```
文档类型：
- Rail Pass 条款（Eurail Global / One Country / Interrail）
- 各国铁路/巴士/徒步官方公告
- 国家公园准入规则
- 特殊区域许可要求
```

#### 2. 设计结构化规则对象

```typescript
interface RailPassRule {
  passType: "EURAIL_GLOBAL" | "EURAIL_ONE_COUNTRY" | "INTERRAIL_GLOBAL" | "INTERRAIL_ONE_COUNTRY";
  eligibleTraveler: {
    regions: string[];        // 允许使用的国家/地区
    citizenship?: string[];   // 公民身份限制
  };
  validCountries: string[];
  requiresReservation: boolean;
  seatReservationFee?: number;
  notValidOn: string[];      // 某些列车类型
  seasonalRestrictions?: {
    months: number[];
    reason: string;
  };
}

interface TrailAccessRule {
  trailId: string;
  requiresPermit: boolean;
  permitType?: "DAILY" | "SEASONAL" | "ANNUAL";
  permitCost?: number;
  bookingRequired: boolean;
  bookingAdvanceDays?: number;
  seasonalClosure?: {
    months: number[];
    reason: string;
  };
}

interface PermitRequirement {
  countryCode: string;
  region?: string;
  activityType: "HIKING" | "CAMPING" | "MOUNTAINEERING" | "WILD_CAMPING";
  requiresPermit: boolean;
  permitDetails?: {
    whereToGet: string;
    cost: number;
    advanceBooking: boolean;
    validityPeriod: string;
  };
}
```

#### 3. RAG → 结构化转换流程

```
Agent 在需要做「票种选择 / 是否允许 / 是否需要预约」时：

1. RAG 检索相关段落
   ↓
2. LLM 把自然语言规则归纳成结构化对象
   ↓
3. 写入 ComplianceEvidence / PhysicalRealityModel / RoutePhilosophyModel
   ↓
4. Abu / Neptune 用它做硬判断
```

**关键点：**
- RAG 在这里是"自动读说明书 + 帮你填配置"的工具
- **不是 runtime 直接说"可以 / 不可以"**
- 所有规则最终都写回三个一等公民模型

---

### 场景 B：体验层 & 叙事层

**特点：**
- 跟安全没直接关系，但对用户体验很重要
- 放进结构化模型意义不大
- 完全可以让 RAG + LLM 做「解释 & 润色」

#### 1. 行程故事化

**给行程中每一个关键 day / segment，生成：**
- 一小段故事感文案
- 一些摘自 UGC / 攻略的 tip（比如"记得自带拖鞋""提前买好零食"）

**示例：**

```typescript
interface SegmentNarrative {
  segmentId: string;
  dayIndex: number;
  storyText: string;           // 故事感文案
  practicalTips: string[];     // 实用建议
  localInsights: string[];      // 当地洞察
  evidenceSnippets: string[];    // 原文引用片段
}
```

#### 2. 路线哲学说明

**给 RouteDirection 生成：**
- 一段"路线哲学说明"：为什么要绕这条路
- 为什么不建议 day-trip rush
- 这段路线的独特之处

**示例：**

```typescript
interface RoutePhilosophyNarrative {
  routeDirectionId: string;
  philosophyExplanation: string;  // 路线哲学的文字说明
  whyThisRoute: string[];         // 为什么选择这条路
  whatToExpect: string[];         // 预期体验
  commonMistakes: string[];        // 常见错误
  evidenceSnippets: string[];      // 原文引用
}
```

#### 3. 用户问答增强

**回答用户问的细节问题：**
- "X 营地有热水澡吗？"
- "这个 Hut 需要提前几个月订？"
- "这段 F-road 大概是什么感觉？"

**这些不会改你的 plan，只是：**
- 让 TripNARA 从"冷酷路线 AI"变成"懂世界又会讲故事的向导"

---

### 场景 C：快速覆盖长尾国家 / 区域的"软知识"

**特点：**
- 你现在的硬核底座主要解决：哪可以走 / 不能走、大路线哲学、DEM + 爬升 + 节奏 + 风险
- 但像：当地公交买票细节、小镇之间习惯、某些山屋不成文规则、小众区域的一些安全提醒
- 完全手工维护成本太高

**RAG 非常适合做："Local Insights 层"**

#### 设计 LocalInsight 模型

```typescript
interface LocalInsight {
  countryCode: string;
  region?: string;
  tags: string[];              // alpine_hut, wild_camp, f_road, public_transport, etc.
  content: string;             // LLM 基于 RAG 生成的小段文字
  evidenceSnippets: string[];  // 原文引用片段
  confidence: "HIGH" | "MEDIUM" | "LOW";  // 置信度
  lastUpdated?: Date;
}

// 示例
const icelandFroadInsight: LocalInsight = {
  countryCode: "IS",
  region: "Highlands",
  tags: ["f_road", "wild_camp", "4x4_required"],
  content: "冰岛 F-road 通常在 6 月中旬到 9 月中旬开放，但具体日期取决于积雪情况。大多数 F-road 要求 4x4 车辆，且不允许拖车。高地露营需要遵守 Leave No Trace 原则，且某些区域禁止露营。",
  evidenceSnippets: [
    "F-roads are typically open from mid-June to mid-September...",
    "4x4 vehicles are required for all F-roads..."
  ],
  confidence: "HIGH",
};
```

**在 UI 里以「小提示 / 当地人说」的形式展示。**

---

## 三、推荐的融合架构（与现有结构对齐）

### 三层架构

```
┌─────────────────────────────────────────────────────────┐
│ L0: 核心决策引擎（不依赖 RAG）                          │
│                                                         │
│  - PhysicalRealityModel                                │
│  - HumanCapabilityModel                                 │
│  - RoutePhilosophyModel                                 │
│  - Abu / Dr.Dre / Neptune                               │
│                                                         │
│  认定：只相信结构化 + 可审计数据                         │
└─────────────────────────────────────────────────────────┘
                          ↑
                          │ 写入结构化数据
┌─────────────────────────────────────────────────────────┐
│ L1: 知识摄取 & 配置生成（RAG → 结构化）                  │
│                                                         │
│  1. ComplianceFactsAgent（合规/票规 Agent）             │
│     - 定期或按需读取：Eurail/Interrail 条款             │
│     - 国家公园/山路公告                                 │
│     - 铁路公司官网 FAQ                                  │
│     - 输出：RailPassRule[] / TrailAccessRule[]          │
│     - 写入：ComplianceEvidence / PhysicalRealityModel   │
│                                                         │
│  2. RouteKnowledgeCurator（路线知识整理 Agent）          │
│     - 给某条 RouteDirection 拉：真实游记、当地攻略       │
│     - Mountaineering / Hiking 报告                      │
│     - 生成：更丰富的 philosophy 文案                    │
│     - 推荐理由、用户看到的故事层描述                     │
└─────────────────────────────────────────────────────────┘
                          ↑
                          │ 提供上下文
┌─────────────────────────────────────────────────────────┐
│ L2: 用户对话层 / 描述层（RAG → 回答 & 解释）             │
│                                                         │
│  - 用户问「为什么不是另一条路线？」                      │
│    → 先用自带 Explanation + 决策日志回答                │
│                                                         │
│  - 用户再追问「那条路线夏天有什么特别的？」              │
│    → RAG 拉一段 UGC / 攻略补充                          │
│                                                         │
│  关键点：                                                │
│  - 安全 & 路线选择 = 内核逻辑                            │
│  - 氛围 & 细节 & 软知识 = RAG 加持                       │
└─────────────────────────────────────────────────────────┘
```

---

## 四、实现建议

### 1. ComplianceFactsAgent 设计

```typescript
// src/trips/rag/services/compliance-facts-agent.service.ts

@Injectable()
export class ComplianceFactsAgent {
  constructor(
    private readonly ragService: RagService,
    private readonly llmService: LlmService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 从 RAG 检索并提取 Rail Pass 规则
   */
  async extractRailPassRules(
    passType: string,
    countryCode: string
  ): Promise<RailPassRule[]> {
    // 1. RAG 检索相关文档段落
    const snippets = await this.ragService.retrieve({
      query: `Eurail ${passType} rules for ${countryCode}`,
      collection: 'rail_pass_rules',
      limit: 10,
    });

    // 2. LLM 提取结构化规则
    const rules = await this.llmService.extractStructured({
      prompt: `Extract rail pass rules from the following text...`,
      schema: RailPassRuleSchema,
      context: snippets.map(s => s.content).join('\n\n'),
    });

    // 3. 写入数据库（ComplianceEvidence 表）
    await this.prisma.complianceEvidence.createMany({
      data: rules.map(rule => ({
        countryCode,
        ruleType: 'RAIL_PASS',
        ruleData: rule,
        source: 'RAG_EXTRACTED',
      })),
    });

    return rules;
  }

  /**
   * 定期更新合规规则（定时任务）
   */
  @Cron('0 0 * * 0') // 每周日更新
  async refreshComplianceRules() {
    // 遍历所有支持的国家
    const countries = ['IS', 'NO', 'CH', 'NP', 'CN'];
    for (const country of countries) {
      await this.extractRailPassRules('EURAIL_GLOBAL', country);
      // ... 其他规则类型
    }
  }
}
```

### 2. RouteKnowledgeCurator 设计

```typescript
// src/trips/rag/services/route-knowledge-curator.service.ts

@Injectable()
export class RouteKnowledgeCurator {
  constructor(
    private readonly ragService: RagService,
    private readonly llmService: LlmService,
  ) {}

  /**
   * 为 RouteDirection 生成丰富的叙事内容
   */
  async enrichRouteNarrative(
    routeDirectionId: string
  ): Promise<RoutePhilosophyNarrative> {
    // 1. RAG 检索相关游记、攻略
    const snippets = await this.ragService.retrieve({
      query: `Iceland Highlands F-road experience travel guide`,
      collection: 'travel_guides',
      limit: 20,
    });

    // 2. LLM 生成叙事内容
    const narrative = await this.llmService.generate({
      prompt: `Based on the following travel guides, write a narrative explanation for the Iceland Highlands route...`,
      context: snippets.map(s => s.content).join('\n\n'),
    });

    return {
      routeDirectionId,
      philosophyExplanation: narrative.explanation,
      whyThisRoute: narrative.reasons,
      whatToExpect: narrative.expectations,
      commonMistakes: narrative.mistakes,
      evidenceSnippets: snippets.map(s => s.content.substring(0, 200)),
    };
  }
}
```

### 3. LocalInsight 服务设计

```typescript
// src/trips/rag/services/local-insight.service.ts

@Injectable()
export class LocalInsightService {
  constructor(
    private readonly ragService: RagService,
    private readonly llmService: LlmService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取或生成 LocalInsight
   */
  async getLocalInsight(
    countryCode: string,
    tags: string[]
  ): Promise<LocalInsight[]> {
    // 1. 先查数据库（缓存）
    const cached = await this.prisma.localInsight.findMany({
      where: {
        countryCode,
        tags: { hasSome: tags },
      },
    });

    if (cached.length > 0) {
      return cached;
    }

    // 2. RAG 检索
    const query = `${countryCode} ${tags.join(' ')} local tips insights`;
    const snippets = await this.ragService.retrieve({
      query,
      collection: 'local_insights',
      limit: 15,
    });

    // 3. LLM 生成 LocalInsight
    const insights = await this.llmService.generate({
      prompt: `Extract local insights from the following text...`,
      context: snippets.map(s => s.content).join('\n\n'),
    });

    // 4. 保存到数据库
    await this.prisma.localInsight.createMany({
      data: insights.map(insight => ({
        countryCode,
        tags: insight.tags,
        content: insight.content,
        evidenceSnippets: insight.evidenceSnippets,
        confidence: insight.confidence,
      })),
    });

    return insights;
  }
}
```

### 4. 用户对话层集成

```typescript
// src/trips/chat/services/enhanced-chat.service.ts

@Injectable()
export class EnhancedChatService {
  constructor(
    private readonly ragService: RagService,
    private readonly localInsightService: LocalInsightService,
  ) {}

  /**
   * 回答用户关于路线细节的问题
   */
  async answerRouteQuestion(
    question: string,
    context: {
      routeDirectionId: string;
      countryCode: string;
      segmentId?: string;
    }
  ): Promise<string> {
    // 1. 先尝试用结构化数据回答（核心决策逻辑）
    const structuredAnswer = await this.answerFromStructuredData(question, context);
    if (structuredAnswer.confident) {
      return structuredAnswer.answer;
    }

    // 2. 如果结构化数据不够，用 RAG 补充
    const ragSnippets = await this.ragService.retrieve({
      query: question,
      collection: 'travel_guides',
      limit: 5,
    });

    // 3. 结合结构化答案和 RAG 内容生成最终回答
    return await this.llmService.generate({
      prompt: `Answer the user's question based on: 1) structured data: ${structuredAnswer.answer}, 2) travel guides: ${ragSnippets.map(s => s.content).join('\n\n')}`,
    });
  }
}
```

---

## 五、数据流示例

### 示例 1：合规规则提取流程

```
用户请求：生成冰岛行程
  ↓
ComplianceFactsAgent.extractRailPassRules('IS')
  ↓
RAG 检索：Eurail Global Pass 冰岛使用规则
  ↓
LLM 提取：结构化 RailPassRule 对象
  ↓
写入：ComplianceEvidence 表
  ↓
Abu 策略：检查行程是否符合 Rail Pass 规则
  ↓
决策：ALLOW / REJECT（基于结构化数据，不是 RAG 原文）
```

### 示例 2：路线叙事生成流程

```
用户查看：冰岛高地路线详情
  ↓
RouteKnowledgeCurator.enrichRouteNarrative('iceland-highlands')
  ↓
RAG 检索：冰岛高地游记、攻略
  ↓
LLM 生成：RoutePhilosophyNarrative（故事化文案）
  ↓
UI 展示：路线哲学说明 + 实用建议
```

### 示例 3：用户问答流程

```
用户问："F26 这段路冬天能走吗？"
  ↓
1. 先查 PhysicalRealityModel.roadStates（结构化数据）
   → 回答："F26 在 1 月是封闭的（基于官方路网数据）"
  ↓
2. 如果用户追问："那这段路大概是什么感觉？"
   → RAG 检索：F26 游记片段
   → 生成："F26 是一条穿越高地的碎石路，沿途可以看到火山、冰川..."
```

---

## 六、关键原则总结

### ✅ 应该做的

1. **RAG 作为"知识摄取工具"**
   - 自动读取长文档（条款、公告）
   - 提取结构化规则
   - 写入三个一等公民模型

2. **RAG 作为"叙事增强工具"**
   - 生成故事化文案
   - 提供实用建议
   - 回答细节问题

3. **RAG 作为"软知识补充"**
   - 覆盖长尾国家/区域
   - 提供 Local Insights
   - 降低手工维护成本

### ❌ 不应该做的

1. **RAG 直接参与硬决策**
   - Abu / Dr.Dre / Neptune 不能直接读 RAG 原文做判断
   - 所有关键规则必须先写入结构化模型

2. **RAG 替代结构化数据**
   - 道路状态、季节性、体能阈值等必须来自结构化数据
   - RAG 只能作为"提示"，不能作为"证据"

3. **RAG 绕过验证**
   - 所有从 RAG 提取的规则必须经过验证
   - 必须标注置信度和来源

---

## 七、一句话总结

**不融合 RAG：** TripNARA 依然是一个极强的"物理世界 + 行程决策引擎"，已经比 99% 旅行产品高级。

**融合之后：** 你会从「世界级路线内核」升级为 **"世界级路线内核 + 世界知识外挂 + 会讲人话的导游"**

**但前提是：**
- ✅ RAG 只在「解释 / 配置生成 / 软知识」层使用
- ❌ 不直接改 Abu / Dr.Dre / Neptune 的硬决策
- ✅ 所有关键规则最终都写回你那三个一等公民模型

---

## 八、下一步行动

1. **建立 RAG 基础设施**
   - 选择向量数据库（Pinecone / Weaviate / Qdrant）
   - 建立文档索引库（Rail Pass 条款、游记、攻略）

2. **实现 ComplianceFactsAgent**
   - 定期爬取/更新合规文档
   - 提取结构化规则
   - 写入 ComplianceEvidence 表

3. **实现 RouteKnowledgeCurator**
   - 为现有 RouteDirection 生成叙事内容
   - 建立 LocalInsight 数据库

4. **集成到用户对话层**
   - 增强 Chat Service
   - 提供"为什么选这条路"的详细解释

5. **监控和优化**
   - 跟踪 RAG 提取规则的准确率
   - 持续优化 LLM prompt
   - 建立置信度评估机制

