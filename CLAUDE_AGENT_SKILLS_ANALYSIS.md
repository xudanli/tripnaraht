# TripNARA Claude Agent & Skills 角色分析报告

## 项目背景

TripNARA 是一个**决策型旅行应用（Decision-first Travel）**，采用：
- **6层架构**：模型层/调度层/记忆层/工具层/运维治理层/社会层
- **三人格决策系统**：Abu（安全评估）/Dr.Dre（节奏调整）/Neptune（空间修复）
- **Skills/MCP/Agent三层架构**：能力颗粒/插座标准/编排逻辑
- **双系统架构**：System 1（快路径）/System 2（推理路径）

## 现有 Skills 分类

### 1. 决策核心 Skills
- `skill.decision.abuCheck` - 安全检查（物理现实、合规）
- `skill.decision.drdrePace` - 节奏调整（人体能力模型）
- `skill.decision.neptuneRepair` - 空间修复（路线哲学保持）
- `skill.decision.runThreeGuardians` - 三人格编排
- `skill.decision.explainForHuman` - 可解释性生成

### 2. 地理与地形 Skills
- `skill.dem.getProfile` - DEM 地形分析
- `skill.geo.findNearbyPOI` - 附近 POI 查找
- `skill.geo.checkHazardZones` - 危险区域检查
- `skill.geo.sampleElevationProfile` - 海拔剖面采样

### 3. 路线方向 Skills
- `skill.routeDirection.pickForIntent` - 根据意图选择路线
- `skill.routeDirection.listForCountry` - 列出国家路线

### 4. 准备度 Skills
- `skill.readiness.generateChecklist` - 行前清单生成
- `skill.readiness.summarizeRisks` - 风险总结
- `skill.readiness.checkVisaWindow` - 签证窗口检查

### 5. 上下文与工具 Skills
- `skill.context.build` - 上下文构建
- `skill.context.compress` - 上下文压缩
- `skill.tools.select` - 工具选择

### 6. 世界模型 Skills
- `skill.world.buildContext` - 世界模型构建

## 建议新增的 Claude Agent Skills 角色

基于 TripNARA 的**决策型旅行应用**定位，建议以下 Skills 角色：

---

## 一、商业分析类 Skills（战略层）

### 1.1 行业分析师（Industry Analyst - 麦肯锡方法论）

**角色定位**：
- 经验丰富的行业分析师，拥有麦肯锡等知名咨询公司工作经验
- 长期为大型企业提供战略与行业咨询
- 专长领域：**AI 决策型旅行应用（Decision-first Travel）**、**路线智能（Route Intelligence）**、**可执行行程闭环（Executable Itinerary）**
- 能够用非技术化语言讲清楚复杂概念，帮助行业新人快速建立认知框架

**核心技能**：
- 熟练运用**麦肯锡行业分析方法论**：市场结构拆解、价值链分析、竞争格局与差异化、监管与风险
- 深入理解 TripNARA 相关行业的关键变量：
  - **数据与供应链**：地图/路网/POI/交通时刻表/票务/酒店航班API、数据授权与成本
  - **可执行闭环**：可订链接、开放时间、实时交通、取消/退款策略
  - **DEM 与风险门控**：坡度/爬升/疲劳/安全风险，路线"是否应该存在"的判断
  - **AI 产品化**：LLM、多智能体编排、成本结构（推理成本）、幻觉与可解释性

**Skills**：
- `skill.analysis.industryOverview` - 市场与行业概览分析（方向一）
- `skill.analysis.competitiveLandscape` - 产品/服务与竞争格局分析（方向二）
- `skill.analysis.regulatoryFramework` - 法律/政策/监管与风险分析（方向三）
- `skill.analysis.industryReport` - 综合行业洞察报告生成

**工作流程**（严格遵守，逐步推进）：

#### 方向一：市场与行业概览分析（Decision-first Travel 行业）

**分析内容**：
1. **行业历史发展**：从"推荐型旅行工具"到"AI 行程规划"再到"决策型/可执行型"演进
2. **行业现状**：主要形态（AI itinerary、智能助理、地图/OTA 的AI化、户外路线平台等）
3. **未来趋势**：可执行闭环（booking+schedule）、实时性、个性化、安全与责任边界、端侧AI等

**评估维度**：
- **地理分布**：北美/欧洲/亚太的差异（数据开放程度、出行方式差异、监管差异）
- **市场细分**：徒步/自驾/公共交通/城市短途/长线跨境/户外高风险等
- **市场规模与增长**：AI 旅行规划/旅游科技/在线旅游相关市场的最新规模、增长率、需求动因
- **特别关注**：用户从"种草"向"省心决策/可靠执行"的迁移

**输出要求**：
- ✅ 必须使用 **Web Browsing** 搜索并引用新闻/报告（必须提供链接）
- ✅ 至少提供 **5 条**来自网络新闻或报告的链接
- ✅ 关键结论处用 **粗体** 标注
- ✅ 完成后询问用户：是否进入下一步（产品、服务和竞争格局分析）？

**Skills 接口**：
```typescript
interface IndustryOverviewInput {
  focusArea?: 'history' | 'current' | 'future' | 'all';
  region?: 'global' | 'north_america' | 'europe' | 'asia_pacific';
  marketSegment?: string[];
}

interface IndustryOverviewOutput {
  industryHistory: {
    evolution: string; // 演进路径
    keyMilestones: Array<{ year: string; event: string; source: string }>;
  };
  currentState: {
    mainForms: Array<{ type: string; description: string; examples: string[] }>;
    marketSize?: { value: string; unit: string; source: string };
    growthRate?: { value: string; period: string; source: string };
  };
  futureTrends: Array<{ trend: string; description: string; impact: string }>;
  geographicDistribution: {
    [region: string]: {
      dataOpenness: string;
      travelMode: string;
      regulatory: string;
    };
  };
  marketSegmentation: Array<{ segment: string; characteristics: string }>;
  keyInsights: Array<{ insight: string; evidence: string; source: string }>;
  sources: Array<{ title: string; url: string; relevance: string }>; // 至少5条
}
```

---

#### 方向二：产品、服务和竞争格局分析（TripNARA 的对标与壁垒）

**分析内容**：
1. **传统玩家**：OTA、地图、内容平台如何AI化（行程生成、问答、推荐、预订整合）
2. **新玩家**：AI 原生旅行助手、路线规划工具、户外路线平台
3. **关键维度评估**（用通俗语言解释）：
   - **可执行闭环能力**：能否给出可订/可达/可走的行程（班次、开门时间、预订链接）
   - **数据壁垒**：地图/POI/时刻表/票务/户外风险数据的质量与授权成本
   - **可靠性与解释**：失败归因、替代方案、可解释的"为什么不建议/不允许"
   - **成本结构**：AI 推理成本、数据调用成本是否可控
   - **差异化护城河**：TripNARA 的 Should-Exist Gate、DEM 与风险门控是否形成壁垒

**输出要求**：
- ✅ 必须使用 **Web Browsing** 搜索行业内主要产品/服务的最新动态（必须提供新闻链接）
- ✅ 至少提供 **8 条**新闻/报告链接
- ✅ 每个主要玩家下写清楚"它的优势/短板"
- ✅ 输出"玩家分层图"（平台型/工具型/内容型/户外型/AI原生）
- ✅ 输出"对标矩阵"（维度 × 玩家）
- ✅ 完成后询问用户：是否进入下一步（法律、政策和监管框架研究）？

**Skills 接口**：
```typescript
interface CompetitiveLandscapeInput {
  competitorTypes?: Array<'ota' | 'map' | 'content' | 'ai_native' | 'outdoor' | 'all'>;
  focusDimensions?: Array<'executable' | 'data' | 'reliability' | 'cost' | 'differentiation'>;
}

interface CompetitiveLandscapeOutput {
  playerCategories: {
    platform: Array<CompetitorProfile>;
    tool: Array<CompetitorProfile>;
    content: Array<CompetitorProfile>;
    outdoor: Array<CompetitorProfile>;
    aiNative: Array<CompetitorProfile>;
  };
  competitorMatrix: {
    dimensions: string[];
    players: Array<{
      name: string;
      category: string;
      scores: { [dimension: string]: { score: number; notes: string } };
      strengths: string[];
      weaknesses: string[];
      latestNews?: Array<{ title: string; url: string; date: string }>;
    }>;
  };
  tripnaraPositioning: {
    differentiation: string[];
    moats: Array<{ moat: string; defensibility: 'HIGH' | 'MEDIUM' | 'LOW'; evidence: string }>;
    competitiveAdvantages: string[];
    vulnerabilities: string[];
  };
  sources: Array<{ title: string; url: string; relevance: string }>; // 至少8条
}

interface CompetitorProfile {
  name: string;
  category: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
  latestUpdates?: Array<{ date: string; update: string; source: string }>;
}
```

---

#### 方向三：法律、政策和监管框架研究（TripNARA 关键风险）

**分析内容**：
1. **隐私与位置数据**：位置数据、用户画像、跨境数据传输的合规要求
2. **地图/数据授权**：地图与POI数据的许可条款、使用限制、潜在法律风险
3. **AI 监管趋势**：对生成式AI的透明度、内容责任、误导风险要求
4. **旅游安全与责任边界**：尤其是户外徒步/自驾风险提示，产品责任如何界定

**影响分析**：
- **数据成本上升/使用限制** → 商业模式与毛利压力
- **合规要求提升** → 需要更强审计与风控能力

**输出要求**：
- ✅ 必须使用 **Web Browsing** 搜索并引用新闻/官方信息（必须提供链接）
- ✅ 至少提供 **6 条**新闻/官方链接
- ✅ 把"对 TripNARA 的具体影响"用 **粗体** 写成行动建议
- ✅ 分析完成后询问用户：是否需要把三部分汇总成一份"TripNARA 行业洞察报告"？

**Skills 接口**：
```typescript
interface RegulatoryFrameworkInput {
  regions?: Array<'global' | 'eu' | 'us' | 'china' | 'all'>;
  focusAreas?: Array<'privacy' | 'data_licensing' | 'ai_regulation' | 'safety_liability' | 'all'>;
}

interface RegulatoryFrameworkOutput {
  privacyAndLocationData: {
    requirements: Array<{ region: string; requirement: string; impact: string }>;
    complianceChallenges: string[];
    recommendations: string[]; // 粗体标注对 TripNARA 的具体影响
  };
  mapDataLicensing: {
    licensingModels: Array<{ provider: string; model: string; cost: string; restrictions: string }>;
    legalRisks: string[];
    recommendations: string[]; // 粗体标注对 TripNARA 的具体影响
  };
  aiRegulation: {
    transparencyRequirements: string[];
    contentLiability: string[];
    misleadingRisk: string[];
    recommendations: string[]; // 粗体标注对 TripNARA 的具体影响
  };
  safetyAndLiability: {
    outdoorRiskGuidance: string[];
    productLiability: string[];
    disclaimers: string[];
    recommendations: string[]; // 粗体标注对 TripNARA 的具体影响
  };
  businessImpact: {
    dataCostPressure: { description: string; impact: string; mitigation: string };
    complianceOverhead: { description: string; impact: string; mitigation: string };
  };
  sources: Array<{ title: string; url: string; type: 'news' | 'official' | 'report'; relevance: string }>; // 至少6条
}
```

---

#### 方向四：综合行业洞察报告生成（可选）

**Skills 接口**：
```typescript
interface IndustryReportInput {
  includeOverview: boolean;
  includeCompetitive: boolean;
  includeRegulatory: boolean;
  format?: 'executive_summary' | 'detailed' | 'presentation';
}

interface IndustryReportOutput {
  executiveSummary: {
    keyFindings: string[];
    opportunities: string[];
    risks: string[];
    recommendations: string[];
  };
  marketOverview: IndustryOverviewOutput;
  competitiveLandscape: CompetitiveLandscapeOutput;
  regulatoryFramework: RegulatoryFrameworkOutput;
  tripnaraStrategicImplications: {
    opportunities: Array<{ opportunity: string; rationale: string; priority: 'HIGH' | 'MEDIUM' | 'LOW' }>;
    risks: Array<{ risk: string; impact: string; mitigation: string; priority: 'HIGH' | 'MEDIUM' | 'LOW' }>;
    actionItems: Array<{ action: string; owner: string; timeline: string; priority: 'HIGH' | 'MEDIUM' | 'LOW' }>;
  };
  appendix: {
    sources: Array<{ title: string; url: string; category: string }>;
    methodology: string;
    dataLimitations: string[];
  };
}
```

**使用场景**：
- **战略规划**：为产品路线图提供行业洞察
- **投资决策**：评估市场机会和风险
- **竞品分析**：识别差异化机会和竞争威胁
- **合规准备**：提前识别监管风险并制定应对策略
- **市场进入**：评估新市场/新功能的可行性

**Claude 优势**：
- 强大的信息整合能力（Web Browsing + 知识库）
- 能够理解复杂的市场动态和监管环境
- 生成结构化的分析报告（符合麦肯锡方法论）
- 客观中立，避免过多技术术语
- 能够将复杂概念转化为可执行的行动建议

---

### 1.2 波特五力模型分析（Porter's Five Forces Analysis）

**职责**：
- 分析目的地竞争环境
- 评估供应商议价能力
- 评估买家议价能力
- 识别替代品威胁
- 评估新进入者威胁

**Skills**：
- `skill.analysis.porterFiveForces` - 波特五力分析
  - 输入：`{ destination, marketSegment }`
  - 输出：`{ competitiveRivalry, supplierPower, buyerPower, threatOfSubstitution, threatOfNewEntry, strategicRecommendations }`

**使用场景**：
- **竞品分析**：分析某个目的地的竞争格局（如：冰岛 vs 挪威 vs 瑞士）
- **供应商分析**：评估酒店、交通、活动供应商的议价能力
- **市场进入策略**：评估新目的地进入的可行性
- **产品差异化**：识别竞争劣势，指导产品功能开发

**Claude 优势**：
- 结构化分析框架
- 能够整合多源信息
- 生成可执行的战略建议

**示例输出**：
```json
{
  "competitiveRivalry": "HIGH",
  "supplierPower": "MEDIUM",
  "buyerPower": "HIGH",
  "threatOfSubstitution": "MEDIUM",
  "threatOfNewEntry": "LOW",
  "strategicRecommendations": [
    "差异化：强调DEM决策和路线哲学，而非简单POI推荐",
    "壁垒：建立RouteDirection Pack的知识壁垒",
    "定位：高端决策型旅行，而非大众OTA"
  ]
}
```

---

### 1.3 PEST 模型分析（PEST Analysis - 麦肯锡/贝恩/BCG 方法论）

**角色定位**：
- 资深顶尖的行业咨询顾问，曾在**贝恩（Bain）/埃森哲（Accenture）/波士顿咨询（BCG）/麦肯锡（McKinsey）**等机构为多家国际大型企业提供战略咨询服务
- 擅长用 **PEST（政治/经济/社会/技术）框架**，把宏观环境对企业/产品的影响拆解为：
  - **可验证的事实依据**：基于 Web Browsing 检索的最新信息
  - **可落地的战略含义**：对产品/业务的直接影响
  - **可执行的风险与机会清单**：具体的行动建议

**核心能力**：
- 严格使用 **Web Browsing** 上网检索最新信息，确保结论具备**准确性、时效性与来源可追溯性**
- 针对 **TripNARA（决策型旅行应用）** 的特殊视角强化

**Skills**：
- `skill.analysis.pestAnalysis` - PEST 模型分析
  - 输入：`{ companyOrTopic, marketScope, year? }`
  - 输出：PEST 分析报告（分章节：0.1-0.4）

**交互方式**（命令驱动）：
- 用户输入：`/分析 <公司或主题> — <市场范围>`
- 系统输出：PEST 模型分析报告目录（0.1–0.4）
- 用户输入：`/开始` 或 `/开始 0.3`（跳到指定章节）
- 系统逐章输出详细分析

**推荐输入示例**：
```
/分析 TripNARA（决策型旅行应用）— 面向全球市场
/分析 TripNARA — 北美市场 PEST（2026）
/分析 "AI 旅行规划行业（决策型路线产品）"
/分析 某个竞品（例如 OTA/地图/AI 行程工具）
```

---

#### PEST 分析框架（针对 TripNARA 强化视角）

##### 0.1 政治/监管（Political/Regulatory）

**针对 TripNARA 的关键视角**：

1. **跨境数据与隐私合规**
   - GDPR、CCPA 等数据保护法规对位置数据、用户画像的要求
   - 跨境数据传输限制（EU-US Data Privacy Framework）
   - 用户同意机制与数据最小化原则

2. **地图/导航数据许可**
   - Google Maps、Mapbox、OpenStreetMap 等数据许可条款
   - 使用限制、成本结构、商业授权要求
   - 潜在的法律风险（侵权、数据使用不当）

3. **AI 监管趋势**
   - EU AI Act、美国 AI 监管框架对生成式 AI 的要求
   - 透明度要求（可解释性、决策日志）
   - 内容责任与误导风险（虚假路线、不安全建议）

4. **旅游安全与户外风险提示责任边界**
   - 产品责任如何界定（路线建议 vs 用户自主决策）
   - 户外徒步/自驾风险提示的法律要求
   - 免责声明的有效性

**输出要求**：
- ✅ 使用 Web Browsing 搜索最新监管动态（至少 5 条来源）
- ✅ 每个关键点提供**可验证的事实依据**（来源链接）
- ✅ 提供**可落地的战略含义**（对 TripNARA 的具体影响）
- ✅ 提供**可执行的风险与机会清单**（行动建议）

---

##### 0.2 经济（Economic）

**针对 TripNARA 的关键视角**：

1. **旅游复苏周期**
   - 后疫情时代旅游需求恢复情况
   - 不同地区/市场的复苏节奏差异
   - 对 TripNARA 目标用户群体的影响

2. **消费分层与出行预算弹性**
   - 高端 vs 中端 vs 经济型旅行者的需求变化
   - 预算敏感度与价格弹性
   - 付费意愿与订阅模式可行性

3. **汇率与航司/酒店价格波动**
   - 汇率波动对跨境旅行成本的影响
   - 航司/酒店动态定价策略
   - 对 TripNARA "可执行行程"成本预测的影响

4. **AI 推理成本与商业化承压**
   - LLM API 成本（Claude、GPT-4 等）
   - 多智能体编排的推理成本
   - 数据调用成本（地图、POI、交通 API）
   - 商业化模式与成本结构的可持续性

**输出要求**：
- ✅ 使用 Web Browsing 搜索最新经济数据与行业报告（至少 5 条来源）
- ✅ 提供量化数据（市场规模、增长率、成本结构）
- ✅ 分析对 TripNARA 商业模式的直接影响
- ✅ 提供成本优化与定价策略建议

---

##### 0.3 社会（Social）

**针对 TripNARA 的关键视角**：

1. **用户对"可靠/安全/可解释"的偏好变化**
   - 从"种草"向"省心决策"的迁移趋势
   - 用户对 AI 决策透明度的需求
   - 对"可执行性"（而非仅推荐）的重视

2. **户外徒步与自驾风潮**
   - 户外运动与自驾旅行的增长趋势
   - 用户对"路线智能"与"风险门控"的需求
   - 对 TripNARA 核心价值主张的验证

3. **旅行方式从"种草"向"省心决策"迁移**
   - 内容平台（小红书、Instagram）vs 决策工具
   - 用户痛点：信息过载、选择困难、执行不确定性
   - TripNARA 的市场机会

**输出要求**：
- ✅ 使用 Web Browsing 搜索用户行为研究报告（至少 5 条来源）
- ✅ 提供用户调研数据与趋势分析
- ✅ 分析对 TripNARA 产品定位的验证
- ✅ 提供产品功能优先级建议

---

##### 0.4 技术（Technological）

**针对 TripNARA 的关键视角**：

1. **LLM 工具调用与多智能体编排**
   - Claude、GPT-4 等模型的工具调用能力
   - LangGraph 等多智能体编排框架
   - 成本、延迟、可靠性权衡

2. **地图/路线/DEM 地形技术**
   - 数字高程模型（DEM）数据可用性与精度
   - 路线规划算法（A*、Dijkstra、VRPTW）
   - 实时路况与交通数据集成

3. **实时交通与票务接口生态**
   - 交通 API（Google Routes、Mapbox Directions）
   - 票务 API（航司、酒店、活动预订）
   - 数据质量、成本、可用性

4. **端侧与隐私计算趋势**
   - 端侧 AI（设备上运行 LLM）
   - 隐私计算（联邦学习、差分隐私）
   - 对 TripNARA 架构的影响

**输出要求**：
- ✅ 使用 Web Browsing 搜索最新技术趋势（至少 5 条来源）
- ✅ 分析技术成熟度与可用性
- ✅ 评估对 TripNARA 技术架构的影响
- ✅ 提供技术选型与路线图建议

---

#### PEST 分析报告结构

**报告目录**：
- **0.1 政治/监管（Political/Regulatory）**
- **0.2 经济（Economic）**
- **0.3 社会（Social）**
- **0.4 技术（Technological）**

**每章节输出格式**：
1. **可验证的事实依据**（基于 Web Browsing）
   - 最新政策/法规/趋势
   - 数据与统计（含来源链接）
   - 时效性说明

2. **可落地的战略含义**
   - 对 TripNARA 的直接影响
   - 对产品/业务的具体含义
   - 优先级评估

3. **可执行的风险与机会清单**
   - **风险**：具体风险点 + 影响程度 + 缓解措施
   - **机会**：具体机会点 + 价值评估 + 行动建议

**Skills 接口**：
```typescript
interface PestAnalysisInput {
  companyOrTopic: string; // 例如："TripNARA" 或 "AI 旅行规划行业"
  marketScope: string; // 例如："全球市场" 或 "北美市场"
  year?: number; // 例如：2026
  focusAreas?: Array<'political' | 'economic' | 'social' | 'technological' | 'all'>;
}

interface PestAnalysisOutput {
  reportStructure: {
    sections: Array<{
      number: string; // "0.1", "0.2", "0.3", "0.4"
      title: string;
      status: 'pending' | 'completed';
    }>;
  };
  sections: {
    political?: PestSectionOutput;
    economic?: PestSectionOutput;
    social?: PestSectionOutput;
    technological?: PestSectionOutput;
  };
  executiveSummary?: {
    keyFindings: string[];
    risks: Array<{ risk: string; impact: 'HIGH' | 'MEDIUM' | 'LOW'; mitigation: string }>;
    opportunities: Array<{ opportunity: string; value: 'HIGH' | 'MEDIUM' | 'LOW'; action: string }>;
  };
}

interface PestSectionOutput {
  verifiedFacts: Array<{
    fact: string;
    source: string; // URL
    date: string; // 信息发布日期
    relevance: string; // 相关性说明
  }>;
  strategicImplications: Array<{
    implication: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  risksAndOpportunities: {
    risks: Array<{
      risk: string;
      impact: 'HIGH' | 'MEDIUM' | 'LOW';
      probability: 'HIGH' | 'MEDIUM' | 'LOW';
      mitigation: string; // 可执行的缓解措施
    }>;
    opportunities: Array<{
      opportunity: string;
      value: 'HIGH' | 'MEDIUM' | 'LOW';
      feasibility: 'HIGH' | 'MEDIUM' | 'LOW';
      action: string; // 可执行的行动建议
    }>;
  };
  sources: Array<{ title: string; url: string; type: 'news' | 'official' | 'report'; date: string }>; // 至少5条
}
```

**使用场景**：
- **战略规划**：为产品路线图提供宏观环境分析
- **风险评估**：识别监管、经济、技术风险
- **市场机会识别**：发现新的市场机会与技术趋势
- **竞品分析**：分析竞品面临的宏观环境挑战
- **投资决策**：为投资决策提供环境分析支持

**与现有系统集成**：
- 与 `skill.readiness.generateChecklist` 集成：基于监管分析增强准备清单
- 与 `skill.decision.abuCheck` 集成：提供合规风险评估
- 与 `skill.world.buildContext` 集成：丰富世界模型的宏观环境信息

---

## 二、市场研究类 Skills（洞察层）

### 2.1 竞品分析师（Competitive Intelligence Analyst）

**职责**：
- 分析竞争对手的产品功能
- 识别竞品优势与劣势
- 分析竞品定价策略
- 跟踪竞品新功能发布

**Skills**：
- `skill.analysis.competitiveIntelligence` - 竞品分析
  - 输入：`{ competitor, featureArea }`
  - 输出：`{ strengths, weaknesses, pricing, features, differentiationOpportunities }`

**使用场景**：
- **产品规划**：识别功能差距和差异化机会
- **定价策略**：参考竞品定价
- **市场定位**：明确 TripNARA 的差异化价值

**Claude 优势**：
- 能够分析竞品网站、文档、用户评价
- 生成结构化的对比分析

---

### 2.2 用户行为分析师（User Behavior Analyst）

**职责**：
- 分析用户旅行偏好趋势
- 识别用户痛点
- 分析用户决策路径
- 预测用户需求

**Skills**：
- `skill.analysis.userBehavior` - 用户行为分析
  - 输入：`{ userSegment, timeRange }`
  - 输出：`{ preferences, painPoints, decisionPath, futureNeeds }`

**使用场景**：
- **产品优化**：基于用户行为优化决策流程
- **功能优先级**：识别高价值功能
- **个性化推荐**：增强 RouteDirection 选择逻辑

---

## 三、风险评估类 Skills（安全层）

### 3.1 综合风险评估师（Comprehensive Risk Assessor）

**职责**：
- 整合 PEST 分析结果
- 结合 Abu 的物理风险评估
- 生成综合风险报告
- 提供风险缓解建议

**Skills**：
- `skill.analysis.comprehensiveRiskAssessment` - 综合风险评估
  - 输入：`{ destination, tripPlan, userProfile }`
  - 输出：`{ riskCategories, riskScore, mitigationStrategies, insuranceRecommendations }`

**使用场景**：
- **行前风险评估**：在 `skill.readiness.generateChecklist` 之前提供风险评估
- **实时风险监控**：结合天气、政治事件等实时信息
- **保险建议**：基于风险评估推荐保险类型

**与现有系统集成**：
- 与 `skill.decision.abuCheck` 集成：物理风险 + 商业风险
- 与 `skill.readiness.summarizeRisks` 集成：增强风险总结

---

## 四、战略规划类 Skills（规划层）

### 4.1 产品战略规划师（Product Strategy Planner）

**职责**：
- 分析产品功能优先级
- 评估功能 ROI
- 规划产品路线图
- 识别技术债务

**Skills**：
- `skill.analysis.productStrategy` - 产品战略分析
  - 输入：`{ currentFeatures, marketNeeds, technicalConstraints }`
  - 输出：`{ priorityMatrix, roadmap, technicalDebt, resourceAllocation }`

**使用场景**：
- **功能规划**：为产品经理提供数据支持
- **技术决策**：评估技术选型的商业价值
- **资源分配**：优化开发资源分配

---

## 五、内容生成类 Skills（内容层）

### 5.1 目的地内容分析师（Destination Content Analyst）

**职责**：
- 分析目的地内容质量
- 识别内容缺口
- 生成内容策略
- 评估内容 ROI

**Skills**：
- `skill.analysis.contentStrategy` - 内容策略分析
  - 输入：`{ destination, contentType }`
  - 输出：`{ contentGaps, qualityScore, contentPlan, seoOpportunities }`

**使用场景**：
- **RouteDirection Pack 优化**：识别需要补充的内容
- **SEO 优化**：识别关键词机会
- **内容生产优先级**：指导内容团队工作

---

## Skills 优先级建议

### 高优先级（立即实现）

1. **PEST 分析** (`skill.analysis.pestAnalysis`) ⭐ **最高优先级**
   - **理由**：
     - 使用麦肯锡方法论，提供系统化的宏观环境分析
     - 针对 TripNARA 的特殊视角强化（监管、成本、用户偏好、技术趋势）
     - 输出格式：可验证的事实依据 + 可落地的战略含义 + 可执行的风险与机会清单
     - 命令驱动交互（/分析、/开始），用户体验友好
   - **价值**：
     - 为产品战略提供全面的宏观环境分析
     - 识别监管风险、经济压力、社会趋势、技术机会
     - 与现有 `readiness` 和 `decision` Skills 高度集成
   - **依赖**：需要 Web Browsing 能力（Claude 原生支持）

2. **行业分析师 - 市场与行业概览** (`skill.analysis.industryOverview`)
   - **理由**：为产品战略提供基础市场洞察，理解行业发展趋势和用户需求迁移
   - **价值**：指导产品方向，识别市场机会，支持投资决策
   - **依赖**：需要 Web Browsing 能力（Claude 原生支持）

3. **行业分析师 - 竞争格局分析** (`skill.analysis.competitiveLandscape`)
   - **理由**：识别差异化机会，明确 TripNARA 的竞争定位和护城河
   - **价值**：指导产品功能优先级，识别竞争威胁，制定差异化策略
   - **依赖**：需要 Web Browsing 能力

### 中优先级（3-6个月）

4. **行业分析师 - 监管框架研究** (`skill.analysis.regulatoryFramework`)
   - **理由**：提前识别合规风险，避免法律问题
   - **价值**：降低合规成本，提前制定应对策略
   - **依赖**：需要 Web Browsing 能力

5. **综合风险评估** (`skill.analysis.comprehensiveRiskAssessment`)
   - **理由**：整合现有风险评估能力，提供一站式风险分析
   - **价值**：提升产品专业度，差异化竞争

6. **行业洞察报告生成** (`skill.analysis.industryReport`)
   - **理由**：整合三个方向的分析，生成可执行的战略报告
   - **价值**：为管理层提供决策支持

### 低优先级（6-12个月）

7. **波特五力分析** (`skill.analysis.porterFiveForces`)
   - **理由**：支持产品战略规划，但非核心功能
   - **价值**：内部使用，指导产品方向

8. **用户行为分析** (`skill.analysis.userBehavior`)
9. **产品战略分析** (`skill.analysis.productStrategy`)
10. **内容策略分析** (`skill.analysis.contentStrategy`)

---

## 实现建议

### 1. Skills 架构设计

#### 1.1 行业分析师 Skill（核心）

```typescript
// src/skills/analysis/industry-overview.skill.ts
@Skill({
  name: 'analysis.industryOverview',
  description: '市场与行业概览分析：使用麦肯锡方法论分析 Decision-first Travel 行业',
  category: 'ANALYSIS',
  requiresWebBrowsing: true, // 需要 Web Browsing 能力
})
export class IndustryOverviewSkill implements Skill {
  constructor(
    private llmService: LlmService, // Claude API with Web Browsing
    private webBrowserService: WebBrowserService, // Web Browsing 工具
  ) {}

  async execute(input: IndustryOverviewInput): Promise<IndustryOverviewOutput> {
    // 1. 使用 Web Browsing 搜索行业报告和新闻
    const searchQueries = [
      'AI travel planning market size 2024',
      'decision-first travel applications',
      'executable itinerary AI',
      'travel tech industry trends',
      'AI itinerary planning growth',
    ];
    
    const sources = await Promise.all(
      searchQueries.map(query => this.webBrowserService.search(query))
    );

    // 2. 调用 Claude API 进行深度分析（使用 Web Browsing 上下文）
    const analysis = await this.llmService.callClaude({
      systemPrompt: MCKINSEY_INDUSTRY_ANALYSIS_PROMPT,
      userMessage: `分析 Decision-first Travel 行业：${JSON.stringify(input)}`,
      webContext: sources, // 传入搜索结果作为上下文
      tools: [this], // 允许递归调用其他分析 Skills
    });

    // 3. 验证输出：确保至少 5 条来源链接
    if (analysis.sources.length < 5) {
      // 继续搜索补充来源
      const additionalSources = await this.webBrowserService.searchMore(
        analysis.missingTopics
      );
      analysis.sources.push(...additionalSources);
    }

    // 4. 格式化输出（关键结论加粗）
    return this.formatOutput(analysis);
  }
}
```

#### 1.2 竞争格局分析 Skill

```typescript
// src/skills/analysis/competitive-landscape.skill.ts
@Skill({
  name: 'analysis.competitiveLandscape',
  description: '产品/服务与竞争格局分析：评估 TripNARA 的对标与壁垒',
  category: 'ANALYSIS',
  requiresWebBrowsing: true,
})
export class CompetitiveLandscapeSkill implements Skill {
  async execute(input: CompetitiveLandscapeInput): Promise<CompetitiveLandscapeOutput> {
    // 1. 搜索主要竞争对手的最新动态
    const competitors = [
      'Expedia AI travel',
      'Google Maps AI itinerary',
      'Kayak AI assistant',
      'Wanderlog AI',
      'Roam Around AI',
      'AllTrails route planning',
      'Komoot AI features',
    ];

    const competitorData = await Promise.all(
      competitors.map(competitor => 
        this.webBrowserService.searchLatest(competitor, { maxResults: 3 })
      )
    );

    // 2. 使用 Claude 进行竞争分析
    const analysis = await this.llmService.callClaude({
      systemPrompt: COMPETITIVE_ANALYSIS_PROMPT,
      userMessage: `分析竞争格局：${JSON.stringify({ input, competitorData })}`,
      webContext: competitorData,
    });

    // 3. 生成玩家分层图和对标矩阵
    return {
      ...analysis,
      playerCategories: this.categorizePlayers(analysis.players),
      competitorMatrix: this.buildMatrix(analysis.players, analysis.dimensions),
      tripnaraPositioning: this.analyzeTripnaraPosition(analysis),
      sources: analysis.sources.filter(s => s.url), // 确保至少 8 条链接
    };
  }
}
```

#### 1.3 PEST 分析 Skill

```typescript
// src/skills/analysis/pest-analysis.skill.ts
@Skill({
  name: 'analysis.pestAnalysis',
  description: 'PEST模型分析：使用麦肯锡方法论分析宏观环境对企业/产品的影响',
  category: 'ANALYSIS',
  requiresWebBrowsing: true,
})
export class PestAnalysisSkill implements Skill {
  constructor(
    private llmService: LlmService, // Claude API with Web Browsing
    private webBrowserService: WebBrowserService,
  ) {}

  async execute(input: PestAnalysisInput): Promise<PestAnalysisOutput> {
    // 1. 生成报告目录
    const reportStructure = {
      sections: [
        { number: '0.1', title: '政治/监管（Political/Regulatory）', status: 'pending' },
        { number: '0.2', title: '经济（Economic）', status: 'pending' },
        { number: '0.3', title: '社会（Social）', status: 'pending' },
        { number: '0.4', title: '技术（Technological）', status: 'pending' },
      ],
    };

    // 2. 根据用户请求的章节进行分析
    const sections: Partial<PestAnalysisOutput['sections']> = {};

    // 政治/监管分析
    if (input.focusAreas?.includes('political') || input.focusAreas?.includes('all')) {
      const politicalTopics = [
        'GDPR travel applications 2024',
        'EU AI Act travel liability',
        'map data licensing legal requirements',
        'cross-border data transfer travel',
        'travel safety liability regulations',
      ];

      const politicalData = await Promise.all(
        politicalTopics.map(topic => 
          this.webBrowserService.searchOfficial(topic)
        )
      );

      sections.political = await this.analyzeSection('political', {
        input,
        searchData: politicalData,
      });
    }

    // 经济分析
    if (input.focusAreas?.includes('economic') || input.focusAreas?.includes('all')) {
      const economicTopics = [
        'travel industry recovery 2024',
        'AI inference cost trends',
        'travel budget elasticity',
        'exchange rate impact travel',
        'LLM API pricing 2024',
      ];

      const economicData = await Promise.all(
        economicTopics.map(topic => 
          this.webBrowserService.search(topic, { sources: ['reports', 'news'] })
        )
      );

      sections.economic = await this.analyzeSection('economic', {
        input,
        searchData: economicData,
      });
    }

    // 社会分析
    if (input.focusAreas?.includes('social') || input.focusAreas?.includes('all')) {
      const socialTopics = [
        'travel decision making trends',
        'outdoor travel growth',
        'AI transparency user preference',
        'travel planning user behavior',
        'reliable travel tools demand',
      ];

      const socialData = await Promise.all(
        socialTopics.map(topic => 
          this.webBrowserService.search(topic, { sources: ['reports', 'news'] })
        )
      );

      sections.social = await this.analyzeSection('social', {
        input,
        searchData: socialData,
      });
    }

    // 技术分析
    if (input.focusAreas?.includes('technological') || input.focusAreas?.includes('all')) {
      const techTopics = [
        'LLM tool calling capabilities',
        'multi-agent orchestration frameworks',
        'DEM terrain data availability',
        'real-time travel API ecosystem',
        'edge AI privacy computing',
      ];

      const techData = await Promise.all(
        techTopics.map(topic => 
          this.webBrowserService.search(topic, { sources: ['reports', 'news'] })
        )
      );

      sections.technological = await this.analyzeSection('technological', {
        input,
        searchData: techData,
      });
    }

    return {
      reportStructure,
      sections,
    };
  }

  private async analyzeSection(
    section: 'political' | 'economic' | 'social' | 'technological',
    context: { input: PestAnalysisInput; searchData: any[] }
  ): Promise<PestSectionOutput> {
    // 使用 Claude 进行深度分析
    const analysis = await this.llmService.callClaude({
      systemPrompt: PEST_ANALYSIS_PROMPT,
      userMessage: `分析 ${section} 维度：${JSON.stringify(context)}`,
      webContext: context.searchData,
    });

    // 验证输出：确保至少 5 条来源
    if (analysis.sources.length < 5) {
      const additionalSources = await this.webBrowserService.searchMore(
        analysis.missingTopics
      );
      analysis.sources.push(...additionalSources);
    }

    return {
      verifiedFacts: analysis.verifiedFacts,
      strategicImplications: analysis.strategicImplications,
      risksAndOpportunities: analysis.risksAndOpportunities,
      sources: analysis.sources.filter(s => s.url),
    };
  }
}
```

#### 1.4 监管框架研究 Skill

```typescript
// src/skills/analysis/regulatory-framework.skill.ts
@Skill({
  name: 'analysis.regulatoryFramework',
  description: '法律/政策/监管与风险分析：TripNARA 关键风险研究',
  category: 'ANALYSIS',
  requiresWebBrowsing: true,
})
export class RegulatoryFrameworkSkill implements Skill {
  async execute(input: RegulatoryFrameworkInput): Promise<RegulatoryFrameworkOutput> {
    // 1. 搜索监管相关新闻和官方信息
    const regulatoryTopics = [
      'EU AI Act travel applications',
      'GDPR location data travel',
      'map data licensing legal',
      'AI travel liability',
      'outdoor travel safety regulations',
      'cross-border data transfer travel',
    ];

    const regulatoryData = await Promise.all(
      regulatoryTopics.map(topic => 
        this.webBrowserService.searchOfficial(topic)
      )
    );

    // 2. 使用 Claude 进行监管分析
    const analysis = await this.llmService.callClaude({
      systemPrompt: REGULATORY_ANALYSIS_PROMPT,
      userMessage: `分析监管框架：${JSON.stringify({ input, regulatoryData })}`,
      webContext: regulatoryData,
    });

    // 3. 生成行动建议（粗体标注对 TripNARA 的影响）
    return {
      ...analysis,
      recommendations: analysis.recommendations.map(rec => ({
        ...rec,
        impact: `**${rec.impact}**`, // 粗体标注
        action: `**${rec.action}**`, // 粗体标注
      })),
      sources: analysis.sources.filter(s => s.type === 'official' || s.type === 'news'),
    };
  }
}
```

### 2. Claude Agent 集成（支持 Web Browsing）

```typescript
// src/agent/services/industry-analysis-agent.service.ts
@Injectable()
export class IndustryAnalysisAgentService {
  constructor(
    private llmService: LlmService, // Claude API with Web Browsing
    private webBrowserService: WebBrowserService,
    private industryOverviewSkill: IndustryOverviewSkill,
    private competitiveLandscapeSkill: CompetitiveLandscapeSkill,
    private regulatoryFrameworkSkill: RegulatoryFrameworkSkill,
  ) {}

  /**
   * 执行完整的行业分析流程（三步走）
   */
  async analyzeIndustry(
    step: 'overview' | 'competitive' | 'regulatory' | 'all' = 'overview'
  ): Promise<IndustryAnalysisResult> {
    const results: Partial<IndustryAnalysisResult> = {};

    // 步骤一：市场与行业概览
    if (step === 'overview' || step === 'all') {
      results.overview = await this.industryOverviewSkill.execute({
        focusArea: 'all',
        region: 'global',
      });
      
      // 询问用户是否继续
      if (step === 'overview') {
        return { overview: results.overview, nextStep: 'competitive' };
      }
    }

    // 步骤二：竞争格局分析
    if (step === 'competitive' || step === 'all') {
      results.competitive = await this.competitiveLandscapeSkill.execute({
        competitorTypes: ['all'],
        focusDimensions: ['all'],
      });
      
      if (step === 'competitive') {
        return { 
          overview: results.overview,
          competitive: results.competitive,
          nextStep: 'regulatory' 
        };
      }
    }

    // 步骤三：监管框架研究
    if (step === 'regulatory' || step === 'all') {
      results.regulatory = await this.regulatoryFrameworkSkill.execute({
        regions: ['all'],
        focusAreas: ['all'],
      });
    }

    // 生成综合报告
    if (step === 'all') {
      results.report = await this.generateIndustryReport(results);
    }

    return results as IndustryAnalysisResult;
  }
}
```

### 3. Web Browsing 集成配置

```typescript
// src/agent/services/web-browser.service.ts
@Injectable()
export class WebBrowserService {
  /**
   * 搜索行业报告和新闻
   */
  async search(query: string, options?: {
    maxResults?: number;
    dateRange?: { from: Date; to: Date };
    sources?: Array<'news' | 'reports' | 'official'>;
  }): Promise<SearchResult[]> {
    // 使用 Claude 的 Web Browsing 能力
    // 或集成第三方搜索 API（如 Google Search API, Bing Search API）
    return this.llmService.browseWeb({
      query,
      maxResults: options?.maxResults || 10,
      dateRange: options?.dateRange,
      sourceTypes: options?.sources || ['news', 'reports'],
    });
  }

  /**
   * 搜索官方信息（政府网站、监管机构）
   */
  async searchOfficial(query: string): Promise<SearchResult[]> {
    return this.search(query, {
      sources: ['official'],
      maxResults: 5,
    });
  }

  /**
   * 搜索最新新闻
   */
  async searchLatest(query: string, options?: { maxResults?: number }): Promise<SearchResult[]> {
    return this.search(query, {
      sources: ['news'],
      maxResults: options?.maxResults || 3,
      dateRange: {
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 最近90天
        to: new Date(),
      },
    });
  }
}
```

### 3. 麦肯锡系统提示词示例

```typescript
// src/agent/prompts/mckinsey-industry-analysis.prompt.ts

export const MCKINSEY_INDUSTRY_ANALYSIS_PROMPT = `
[角色定位]

你是一位经验丰富的行业分析师，拥有麦肯锡等知名咨询公司工作经验，长期为大型企业提供战略与行业咨询。你擅长用麦肯锡行业研究方法论（市场结构拆解、价值链分析、竞争格局与差异化、监管与风险）帮助用户深入理解行业。

你的专长领域是 TripNARA 所在赛道：AI 决策型旅行应用（Decision-first Travel）、路线智能（Route Intelligence）、可执行行程闭环（Executable Itinerary）。你能够把复杂概念用非技术化语言讲清楚，帮助行业新人快速建立认知框架。

[技能要求]

能熟练运用麦肯锡行业分析方法论：市场/价值链/竞争优势/商业模式/监管风险/增长路径。

深入理解 TripNARA 相关行业的关键变量：
- 数据与供应链：地图/路网/POI/交通时刻表/票务/酒店航班API、数据授权与成本
- 可执行闭环：可订链接、开放时间、实时交通、取消/退款策略
- DEM 与风险门控：坡度/爬升/疲劳/安全风险，路线"是否应该存在"的判断
- AI 产品化：LLM、多智能体编排、成本结构（推理成本）、幻觉与可解释性

能客观中立、清晰表达复杂概念，避免过多术语。

[输出要求]

1. 所有关键结论必须用 **粗体** 标注
2. 所有分析必须基于 Web Browsing 搜索的结果，并提供来源链接
3. 使用非技术化语言，行业外用户也要易懂
4. 保持客观中立，不偏袒任何企业
5. 所有行动建议必须具体可执行

[工作流程]

严格按照三步走流程：
1. 市场与行业概览分析（至少 5 条来源链接）
2. 产品/服务与竞争格局分析（至少 8 条来源链接）
3. 法律/政策/监管与风险分析（至少 6 条来源链接，优先官方来源）

每步完成后询问用户是否继续下一步。
`;

export const COMPETITIVE_ANALYSIS_PROMPT = `
[竞争分析框架]

使用以下维度评估竞争者（用通俗语言解释）：

1. **可执行闭环能力**：能否给出可订/可达/可走的行程（班次、开门时间、预订链接）
2. **数据壁垒**：地图/POI/时刻表/票务/户外风险数据的质量与授权成本
3. **可靠性与解释**：失败归因、替代方案、可解释的"为什么不建议/不允许"
4. **成本结构**：AI 推理成本、数据调用成本是否可控
5. **差异化护城河**：TripNARA 的 Should-Exist Gate、DEM 与风险门控是否形成壁垒

输出要求：
- 生成"玩家分层图"（平台型/工具型/内容型/户外型/AI原生）
- 生成"对标矩阵"（维度 × 玩家）
- 每个主要玩家下写清楚"它的优势/短板"
- 至少 8 条新闻/报告链接
`;

export const REGULATORY_ANALYSIS_PROMPT = `
[监管分析框架]

覆盖以下领域：

1. **隐私与位置数据**：位置数据、用户画像、跨境数据传输的合规要求
2. **地图/数据授权**：地图与POI数据的许可条款、使用限制、潜在法律风险
3. **AI 监管趋势**：对生成式AI的透明度、内容责任、误导风险要求
4. **旅游安全与责任边界**：尤其是户外徒步/自驾风险提示，产品责任如何界定

输出要求：
- 把"对 TripNARA 的具体影响"用 **粗体** 写成行动建议
- 至少 6 条新闻/官方链接（优先官方来源）
- 分析政策变化对行业的潜在影响
`;

export const PEST_ANALYSIS_PROMPT = `
[角色定位]

你是一位资深顶尖的行业咨询顾问，曾在贝恩（Bain）/埃森哲（Accenture）/波士顿咨询（BCG）/麦肯锡（McKinsey）等机构为多家国际大型企业提供战略咨询服务。

你擅长用 PEST（政治/经济/社会/技术）框架，把宏观环境对企业/产品的影响拆解为：
- **可验证的事实依据**：基于 Web Browsing 检索的最新信息
- **可落地的战略含义**：对产品/业务的直接影响
- **可执行的风险与机会清单**：具体的行动建议

[核心能力]

- 严格使用 **Web Browsing** 上网检索最新信息，确保结论具备**准确性、时效性与来源可追溯性**
- 针对 **TripNARA（决策型旅行应用）** 的特殊视角强化

[工作流程]

1. 用户输入：\`/分析 <公司或主题> — <市场范围>\`
2. 你输出：PEST 模型分析报告目录（0.1–0.4）
3. 用户输入：\`/开始\` 或 \`/开始 0.3\`（跳到指定章节）
4. 你逐章输出详细分析

[PEST 分析框架 - 针对 TripNARA 强化视角]

### 0.1 政治/监管（Political/Regulatory）

关键视角：
1. **跨境数据与隐私合规**：GDPR、CCPA、跨境数据传输限制
2. **地图/导航数据许可**：Google Maps、Mapbox 等数据许可条款与成本
3. **AI 监管趋势**：EU AI Act、透明度要求、内容责任
4. **旅游安全与户外风险提示责任边界**：产品责任界定、免责声明有效性

### 0.2 经济（Economic）

关键视角：
1. **旅游复苏周期**：后疫情时代旅游需求恢复情况
2. **消费分层与出行预算弹性**：高端/中端/经济型旅行者需求变化
3. **汇率与航司/酒店价格波动**：对"可执行行程"成本预测的影响
4. **AI 推理成本与商业化承压**：LLM API 成本、多智能体编排成本、数据调用成本

### 0.3 社会（Social）

关键视角：
1. **用户对"可靠/安全/可解释"的偏好变化**：从"种草"向"省心决策"迁移
2. **户外徒步与自驾风潮**：对"路线智能"与"风险门控"的需求
3. **旅行方式从"种草"向"省心决策"迁移**：内容平台 vs 决策工具

### 0.4 技术（Technological）

关键视角：
1. **LLM 工具调用与多智能体编排**：Claude、GPT-4、LangGraph 等
2. **地图/路线/DEM 地形技术**：数字高程模型、路线规划算法
3. **实时交通与票务接口生态**：交通 API、票务 API、数据质量与成本
4. **端侧与隐私计算趋势**：端侧 AI、隐私计算对架构的影响

[输出要求]

每章节必须包含：

1. **可验证的事实依据**（基于 Web Browsing）
   - 最新政策/法规/趋势
   - 数据与统计（含来源链接）
   - 时效性说明
   - **至少 5 条来源链接**

2. **可落地的战略含义**
   - 对 TripNARA 的直接影响
   - 对产品/业务的具体含义
   - 优先级评估（HIGH/MEDIUM/LOW）

3. **可执行的风险与机会清单**
   - **风险**：具体风险点 + 影响程度 + 缓解措施
   - **机会**：具体机会点 + 价值评估 + 行动建议

[重要原则]

- ✅ 所有关键结论必须用 **粗体** 标注
- ✅ 所有分析必须基于 Web Browsing 搜索的结果，并提供来源链接
- ✅ 使用非技术化语言，行业外用户也要易懂
- ✅ 保持客观中立，不偏袒任何企业
- ✅ 所有行动建议必须具体可执行
- ✅ 确保信息的准确性、时效性与来源可追溯性
`;
```

### 4. 与现有系统集成

```typescript
// 在 ReadinessService 中集成监管分析结果
async generateChecklist(world: WorldModelContext): Promise<Checklist> {
  // 1. 现有准备清单生成
  const baseChecklist = await this.baseChecklistService.generate(world);
  
  // 2. 监管分析增强（可选，用于高风险目的地）
  if (world.destination.riskLevel === 'HIGH') {
    const regulatoryAnalysis = await this.regulatoryFrameworkSkill.execute({
      regions: [world.destination.region],
      focusAreas: ['safety_liability', 'privacy'],
    });
    
    // 基于监管分析增强清单
    baseChecklist.regulatoryWarnings = regulatoryAnalysis.safetyAndLiability.recommendations;
  }
  
  return baseChecklist;
}

// 在 DecisionService 中集成竞争分析结果
async evaluatePlan(plan: TripPlan): Promise<DecisionResult> {
  // 1. 现有决策逻辑
  const decision = await this.decisionEngine.evaluate(plan);
  
  // 2. 竞争分析增强（用于产品优化）
  const competitiveAnalysis = await this.competitiveLandscapeSkill.execute({
    competitorTypes: ['ai_native', 'outdoor'],
    focusDimensions: ['executable', 'reliability'],
  });
  
  // 基于竞争分析识别差异化机会
  decision.differentiationOpportunities = 
    competitiveAnalysis.tripnaraPositioning.differentiation;
  
  return decision;
}
```

---

## Claude 模型选择建议

### 1. 行业分析类任务（需要 Web Browsing）
- **推荐模型**：**Claude 3.5 Sonnet**（首选）或 Claude 3 Opus
- **理由**：
  - 需要深度推理、信息整合、结构化输出
  - 需要 Web Browsing 能力（Claude 3.5 Sonnet 原生支持）
  - 需要处理大量搜索结果并提取关键信息
  - 需要生成符合麦肯锡方法论的结构化报告

### 2. 竞争分析类任务
- **推荐模型**：Claude 3.5 Sonnet
- **理由**：
  - 需要分析多个竞争对手并生成对比矩阵
  - 需要理解产品功能和商业模式
  - 需要 Web Browsing 获取最新动态

### 3. 监管分析类任务
- **推荐模型**：Claude 3.5 Sonnet
- **理由**：
  - 需要搜索官方文档和监管信息
  - 需要理解复杂的法律条款
  - 需要生成可执行的合规建议

### 4. 内容生成类任务
- **推荐模型**：Claude 3.5 Sonnet
- **理由**：平衡成本与质量

### 5. 实时分析任务（不需要 Web Browsing）
- **推荐模型**：Claude 3 Haiku
- **理由**：快速响应，成本低

### Web Browsing 成本优化建议

1. **缓存策略**：
   - 缓存搜索结果（TTL: 7天）
   - 缓存分析报告（TTL: 30天）
   - 使用 Redis 存储缓存

2. **批量搜索**：
   - 合并多个搜索查询
   - 使用并行搜索（Promise.all）

3. **智能搜索**：
   - 根据分析阶段选择搜索深度
   - 第一阶段：广泛搜索（10-15条结果）
   - 后续阶段：针对性搜索（5-8条结果）

4. **成本监控**：
   - 设置每次分析的 Web Browsing 预算上限
   - 监控搜索次数和成本
   - 生成成本报告

---

## 总结

### 核心建议

1. **优先实现行业分析师 Skills**（高优先级）：
   - **市场与行业概览**：为产品战略提供基础洞察
   - **竞争格局分析**：识别差异化机会和竞争威胁
   - **监管框架研究**：提前识别合规风险
   - **价值**：指导产品方向、投资决策、合规准备

2. **充分利用 Claude 的 Web Browsing 能力**：
   - 行业分析师 Skills 需要实时搜索行业报告、新闻、官方信息
   - Claude 3.5 Sonnet 原生支持 Web Browsing，无需额外集成
   - 需要实现缓存策略以优化成本

3. **遵循麦肯锡方法论**：
   - 使用结构化的分析框架（市场结构拆解、价值链分析、竞争格局）
   - 输出必须包含来源链接（至少 5-8 条）
   - 关键结论和行动建议用粗体标注

4. **三步走工作流程**：
   - 严格按照"市场概览 → 竞争格局 → 监管风险"的顺序
   - 每步完成后询问用户是否继续
   - 最后可选生成综合行业洞察报告

5. **与现有系统深度集成**：
   - 行业分析结果可以增强 `readiness` 和 `decision` Skills
   - 监管分析结果可以增强 `skill.decision.abuCheck` 的合规检查
   - 保持 TripNARA 定位：决策型旅行应用，行业分析为内部工具

### 关键原则

- ✅ **增强现有能力**：新 Skills 应该增强而非替代现有功能
- ✅ **保持架构一致性**：遵循 Skills/MCP/Agent 三层架构
- ✅ **战略价值优先**：行业分析主要用于内部战略规划，不直接暴露给用户
- ✅ **客观中立**：使用麦肯锡方法论，保持客观中立，避免偏袒
- ✅ **可执行性**：所有分析结果必须包含可执行的行动建议
- ✅ **来源可追溯**：所有关键结论必须提供来源链接

### 行业分析师 Skills 的特殊要求

1. **必须使用 Web Browsing**：
   - 所有分析必须基于实时搜索的结果
   - 不能仅依赖训练数据或知识库

2. **来源要求**：
   - 市场概览：至少 5 条来源链接
   - 竞争格局：至少 8 条来源链接
   - 监管框架：至少 6 条来源链接（优先官方来源）

3. **输出格式**：
   - 关键结论用 **粗体** 标注
   - 对 TripNARA 的具体影响用 **粗体** 写成行动建议
   - 使用非技术化语言，行业外用户也要易懂

4. **工作流程**：
   - 严格遵守三步走流程
   - 每步完成后询问用户是否继续
   - 最后询问是否需要生成综合报告

### 下一步行动

1. **Phase 1（立即）**：
   - 实现 `skill.analysis.industryOverview`（市场与行业概览）
   - 实现 `skill.analysis.competitiveLandscape`（竞争格局分析）
   - 配置 Web Browsing 能力（Claude 原生支持或第三方 API）

2. **Phase 2（1-2个月）**：
   - 实现 `skill.analysis.regulatoryFramework`（监管框架研究）
   - 完善 `skill.analysis.pestAnalysis`（PEST 分析）与现有系统集成
   - 与现有 `readiness` 和 `decision` Skills 深度集成

3. **Phase 3（3-6个月）**：
   - 实现 `skill.analysis.industryReport`（综合报告生成）
   - 实现 `skill.analysis.comprehensiveRiskAssessment`（综合风险评估）
   - 评估用户反馈，决定是否扩展其他分析类 Skills

4. **Phase 4（6-12个月）**：
   - 实现其他低优先级 Skills（波特五力、用户行为分析等）
   - 优化 Web Browsing 成本（缓存、批量搜索）
   - 建立行业分析知识库（减少重复搜索）

---

**文档版本**：v2.1  
**创建日期**：2024-01-XX  
**最后更新**：2024-01-XX  
**作者**：AI Assistant  

**更新日志**：
- **v2.1**：根据麦肯锡/贝恩/BCG 方法论重新设计 PEST 分析角色
  - 角色定位：资深行业咨询顾问（贝恩/埃森哲/BCG/麦肯锡）
  - 针对 TripNARA 的特殊视角强化（监管、成本、用户偏好、技术趋势）
  - 输出格式：可验证的事实依据 + 可落地的战略含义 + 可执行的风险与机会清单
  - 命令驱动交互（/分析、/开始）
  - 完整的 PEST 分析框架（0.1-0.4 章节）
  - 添加 PEST 分析系统提示词和实现示例
  - 将 PEST 分析提升为最高优先级
- **v2.0**：根据麦肯锡方法论重新设计行业分析师角色
  - 包含三步走工作流程（市场概览 → 竞争格局 → 监管风险）
  - 添加 Web Browsing 能力要求
  - 添加详细的输出格式要求（来源链接、粗体标注）
  - 添加麦肯锡系统提示词示例
  - 添加完整的 Skills 接口定义和实现示例
- **v1.0**：初始版本，包含基础分析类 Skills 建议

**审核状态**：待产品团队审核

---

## 附录

### A. 实施检查清单

#### Phase 1 实施检查清单（最高优先级）

- [ ] 配置 Claude API（Claude 3.5 Sonnet，支持 Web Browsing）
- [ ] 实现 `WebBrowserService`（或使用 Claude 原生 Web Browsing）
- [ ] **实现 `PestAnalysisSkill`（⭐ 最高优先级）**
  - [ ] 命令驱动交互（/分析、/开始）
  - [ ] 报告目录生成（0.1-0.4）
  - [ ] 政治/监管分析（至少 5 条来源）
  - [ ] 经济分析（至少 5 条来源）
  - [ ] 社会分析（至少 5 条来源）
  - [ ] 技术分析（至少 5 条来源）
  - [ ] 可验证的事实依据输出
  - [ ] 可落地的战略含义输出
  - [ ] 可执行的风险与机会清单输出
  - [ ] 关键结论粗体标注
- [ ] 实现 `IndustryOverviewSkill`
  - [ ] 搜索功能（至少 5 条来源）
  - [ ] 关键结论粗体标注
  - [ ] 询问用户是否继续下一步
- [ ] 实现 `CompetitiveLandscapeSkill`
  - [ ] 搜索功能（至少 8 条来源）
  - [ ] 玩家分层图生成
  - [ ] 对标矩阵生成
  - [ ] 每个玩家优势/短板分析
- [ ] 实现 `IndustryAnalysisAgentService`
  - [ ] 三步走流程控制
  - [ ] 用户交互（询问是否继续）
- [ ] 单元测试
- [ ] 集成测试

#### Phase 2 实施检查清单

- [ ] 实现 `RegulatoryFrameworkSkill`
  - [ ] 搜索官方信息（至少 6 条来源）
  - [ ] 行动建议粗体标注
- [ ] 实现缓存策略（Redis）
  - [ ] 搜索结果缓存（TTL: 7天）
  - [ ] 分析报告缓存（TTL: 30天）
- [ ] 与现有系统集成
  - [ ] `ReadinessService` 集成监管分析
  - [ ] `DecisionService` 集成竞争分析
- [ ] 成本监控
  - [ ] Web Browsing 成本追踪
  - [ ] 成本报告生成

#### Phase 3 实施检查清单

- [ ] 实现 `IndustryReportSkill`（综合报告生成）
- [ ] 完善 `PestAnalysisSkill` 与现有系统深度集成
  - [ ] 与 `ReadinessService` 集成（基于监管分析增强准备清单）
  - [ ] 与 `DecisionService` 集成（提供合规风险评估）
  - [ ] 与 `WorldModelContext` 集成（丰富宏观环境信息）
- [ ] 实现 `ComprehensiveRiskAssessmentSkill`
- [ ] 用户反馈收集机制
- [ ] 性能优化（批量搜索、并行处理）

### B. 快速参考指南

#### 行业分析师 Skills 调用示例

```typescript
// 1. PEST 分析（命令驱动交互）
// 用户输入：/分析 TripNARA（决策型旅行应用）— 面向全球市场
const pestAnalysis = await pestAnalysisSkill.execute({
  companyOrTopic: 'TripNARA（决策型旅行应用）',
  marketScope: '面向全球市场',
  year: 2026,
  focusAreas: ['all'], // 或 ['political', 'economic', 'social', 'technological']
});

// 输出报告目录后，用户输入：/开始 或 /开始 0.3
// 系统逐章输出详细分析

// 2. 市场与行业概览分析
const overview = await industryOverviewSkill.execute({
  focusArea: 'all',
  region: 'global',
  marketSegment: ['hiking', 'road_trip'],
});

// 3. 竞争格局分析
const competitive = await competitiveLandscapeSkill.execute({
  competitorTypes: ['ai_native', 'outdoor'],
  focusDimensions: ['executable', 'reliability', 'cost'],
});

// 4. 监管框架研究
const regulatory = await regulatoryFrameworkSkill.execute({
  regions: ['eu', 'us'],
  focusAreas: ['privacy', 'ai_regulation', 'safety_liability'],
});

// 5. 生成综合报告
const report = await industryReportSkill.execute({
  includeOverview: true,
  includeCompetitive: true,
  includeRegulatory: true,
  format: 'executive_summary',
});
```

#### 关键输出字段说明

**PestAnalysisOutput**（⭐ 最高优先级）：
- `reportStructure.sections`: 报告目录（0.1-0.4）
- `sections.political.verifiedFacts`: 可验证的事实依据（含来源链接）
- `sections.political.strategicImplications`: 可落地的战略含义
- `sections.political.risksAndOpportunities`: 可执行的风险与机会清单
- `sections.*.sources`: 每章节至少 5 条来源链接

**IndustryOverviewOutput**：
- `industryHistory.evolution`: 行业演进路径
- `currentState.marketSize`: 市场规模（含来源）
- `futureTrends`: 未来趋势列表
- `sources`: 至少 5 条来源链接

**CompetitiveLandscapeOutput**：
- `playerCategories`: 玩家分层（平台型/工具型/内容型/户外型/AI原生）
- `competitorMatrix`: 对标矩阵（维度 × 玩家）
- `tripnaraPositioning.differentiation`: TripNARA 差异化机会
- `sources`: 至少 8 条来源链接

**RegulatoryFrameworkOutput**：
- `privacyAndLocationData.recommendations`: 隐私合规建议（粗体）
- `aiRegulation.recommendations`: AI 监管建议（粗体）
- `safetyAndLiability.recommendations`: 安全责任建议（粗体）
- `sources`: 至少 6 条来源链接（优先官方）

### C. 常见问题（FAQ）

**Q1: Web Browsing 成本如何控制？**
- A: 实现缓存策略（搜索结果缓存 7 天，分析报告缓存 30 天）
- 使用批量搜索减少 API 调用次数
- 设置每次分析的预算上限
- 监控并生成成本报告

**Q2: 如何确保来源链接的质量？**
- A: 优先使用官方来源（政府网站、监管机构）
- 使用知名新闻媒体和行业报告
- 验证链接有效性（定期检查）
- 记录来源的相关性和可信度

**Q3: 三步走流程可以跳过某一步吗？**
- A: 可以，但建议按顺序执行，因为：
  - 市场概览提供行业背景
  - 竞争格局需要了解市场现状
  - 监管风险需要结合竞争环境分析

**Q4: 行业分析结果如何与现有 Skills 集成？**
- A: 
  - 监管分析 → `ReadinessService`（增强准备清单）
  - 竞争分析 → `DecisionService`（识别差异化机会）
  - 市场分析 → 产品路线图规划

**Q5: 如何验证分析结果的准确性？**
- A: 
  - 要求所有关键结论提供来源链接
  - 使用多个来源交叉验证
  - 定期更新分析（市场变化快）
  - 人工审核关键结论

### D. 相关文档链接

- [TripNARA Agent 架构总结](./AGENT_ARCHITECTURE_SUMMARY.md)
- [Skills 架构文档](./src/skills/README.md)
- [产品经理系统提示词](./PRODUCT_MANAGER_SYSTEM_PROMPT.md)
- [决策层文档](./src/trips/decision/README.md)
