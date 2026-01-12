# TripNARA Claude Agent & Skills 使用指南

> 基于 Claude 3.5 Sonnet 的智能分析 Skills，为 TripNARA 提供行业洞察和战略分析能力

## 📋 目录

- [快速开始](#快速开始)
- [核心 Skills](#核心-skills)
- [使用示例](#使用示例)
- [实施指南](#实施指南)
- [快速参考](#快速参考)

---

## 快速开始

### 1. 配置要求

- **Claude API**：Claude 3.5 Sonnet（支持 Web Browsing）
- **Web Browsing**：Claude 原生支持或第三方 API
- **缓存**：Redis（可选，用于优化成本）

### 2. 安装依赖

```bash
# 已包含在项目依赖中
npm install
```

### 3. 环境变量

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ENABLE_WEB_BROWSING=true
```

---

## 核心 Skills

### ⭐ PEST 分析（最高优先级）

**Skill**: `skill.analysis.pestAnalysis`

**角色定位**：资深行业咨询顾问（麦肯锡/贝恩/BCG/埃森哲）

**功能**：使用 PEST 框架分析宏观环境对企业/产品的影响

**交互方式**：
```
/分析 TripNARA（决策型旅行应用）— 面向全球市场
/开始 或 /开始 0.3
```

**输出格式**：
- **可验证的事实依据**（基于 Web Browsing，至少 5 条来源）
- **可落地的战略含义**（对 TripNARA 的直接影响）
- **可执行的风险与机会清单**（具体行动建议）

**报告结构**：
- 0.1 政治/监管（Political/Regulatory）
- 0.2 经济（Economic）
- 0.3 社会（Social）
- 0.4 技术（Technological）

---

### 行业分析师 Skills

#### 1. 市场与行业概览

**Skill**: `skill.analysis.industryOverview`

**功能**：分析 Decision-first Travel 行业的发展、现状和趋势

**输出要求**：
- 至少 5 条来源链接
- 关键结论用粗体标注

#### 2. 竞争格局分析

**Skill**: `skill.analysis.competitiveLandscape`

**功能**：分析 TripNARA 的对标与壁垒

**输出内容**：
- 玩家分层图（平台型/工具型/内容型/户外型/AI原生）
- 对标矩阵（维度 × 玩家）
- 每个玩家的优势/短板

**输出要求**：
- 至少 8 条来源链接

#### 3. 监管框架研究

**Skill**: `skill.analysis.regulatoryFramework`

**功能**：分析法律/政策/监管与风险

**输出要求**：
- 至少 6 条来源链接（优先官方来源）
- 对 TripNARA 的具体影响用粗体标注

---

## 使用示例

### PEST 分析示例

```typescript
// 1. 用户输入命令
const input = {
  companyOrTopic: 'TripNARA（决策型旅行应用）',
  marketScope: '面向全球市场',
  year: 2026,
  focusAreas: ['all'], // 或 ['political', 'economic', 'social', 'technological']
};

// 2. 执行分析
const pestAnalysis = await pestAnalysisSkill.execute(input);

// 3. 输出报告目录
console.log(pestAnalysis.reportStructure);
// {
//   sections: [
//     { number: '0.1', title: '政治/监管（Political/Regulatory）', status: 'pending' },
//     { number: '0.2', title: '经济（Economic）', status: 'pending' },
//     { number: '0.3', title: '社会（Social）', status: 'pending' },
//     { number: '0.4', title: '技术（Technological）', status: 'pending' },
//   ]
// }

// 4. 用户选择章节，系统输出详细分析
const section = await pestAnalysisSkill.getSection('0.1');
console.log(section);
// {
//   verifiedFacts: [...], // 可验证的事实依据
//   strategicImplications: [...], // 可落地的战略含义
//   risksAndOpportunities: {
//     risks: [...], // 风险清单
//     opportunities: [...], // 机会清单
//   },
//   sources: [...], // 至少 5 条来源链接
// }
```

### 行业概览分析示例

```typescript
const overview = await industryOverviewSkill.execute({
  focusArea: 'all',
  region: 'global',
  marketSegment: ['hiking', 'road_trip'],
});

// 输出包含：
// - 行业历史发展
// - 行业现状
// - 未来趋势
// - 地理分布
// - 市场细分
// - 市场规模与增长
// - 至少 5 条来源链接
```

### 竞争格局分析示例

```typescript
const competitive = await competitiveLandscapeSkill.execute({
  competitorTypes: ['ai_native', 'outdoor'],
  focusDimensions: ['executable', 'reliability', 'cost'],
});

// 输出包含：
// - 玩家分层图
// - 对标矩阵
// - TripNARA 定位分析
// - 至少 8 条来源链接
```

---

## 实施指南

### Phase 1: 核心功能（立即实施）

#### 1. 配置 Claude API

```typescript
// src/config/claude.config.ts
export const claudeConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022',
  enableWebBrowsing: true,
  maxTokens: 4096,
};
```

#### 2. 实现 Web Browsing Service

```typescript
// src/agent/services/web-browser.service.ts
@Injectable()
export class WebBrowserService {
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // 使用 Claude 的 Web Browsing 能力
    // 或集成第三方搜索 API
  }
}
```

#### 3. 实现 PEST 分析 Skill

```typescript
// src/skills/analysis/pest-analysis.skill.ts
@Skill({
  name: 'analysis.pestAnalysis',
  description: 'PEST模型分析：使用麦肯锡方法论分析宏观环境',
  category: 'ANALYSIS',
  requiresWebBrowsing: true,
})
export class PestAnalysisSkill implements Skill {
  // 实现细节见 CLAUDE_AGENT_SKILLS_ANALYSIS.md
}
```

#### 4. 实现行业分析 Skills

- `IndustryOverviewSkill`
- `CompetitiveLandscapeSkill`
- `RegulatoryFrameworkSkill`

### Phase 2: 集成与优化（1-2个月）

#### 1. 缓存策略

```typescript
// 搜索结果缓存（TTL: 7天）
await redis.set(`search:${queryHash}`, results, 'EX', 7 * 24 * 60 * 60);

// 分析报告缓存（TTL: 30天）
await redis.set(`analysis:${analysisId}`, report, 'EX', 30 * 24 * 60 * 60);
```

#### 2. 与现有系统集成

```typescript
// 与 ReadinessService 集成
async generateChecklist(world: WorldModelContext): Promise<Checklist> {
  const baseChecklist = await this.baseChecklistService.generate(world);
  
  // 基于监管分析增强清单
  if (world.destination.riskLevel === 'HIGH') {
    const regulatoryAnalysis = await this.regulatoryFrameworkSkill.execute({
      regions: [world.destination.region],
      focusAreas: ['safety_liability', 'privacy'],
    });
    
    baseChecklist.regulatoryWarnings = 
      regulatoryAnalysis.safetyAndLiability.recommendations;
  }
  
  return baseChecklist;
}
```

#### 3. 成本监控

```typescript
// 设置每次分析的预算上限
const budget = {
  maxWebBrowsingCalls: 20,
  maxTokens: 100000,
  maxCostUSD: 5.0,
};
```

### Phase 3: 高级功能（3-6个月）

- 综合报告生成
- 与决策系统深度集成
- 用户反馈收集
- 性能优化

---

## 快速参考

### Skills 列表

| Skill | 优先级 | 输出要求 | Web Browsing |
|-------|--------|---------|--------------|
| `skill.analysis.pestAnalysis` | ⭐ 最高 | 每章节至少 5 条来源 | ✅ 必需 |
| `skill.analysis.industryOverview` | 高 | 至少 5 条来源 | ✅ 必需 |
| `skill.analysis.competitiveLandscape` | 高 | 至少 8 条来源 | ✅ 必需 |
| `skill.analysis.regulatoryFramework` | 中 | 至少 6 条来源（优先官方） | ✅ 必需 |
| `skill.analysis.industryReport` | 中 | 综合报告 | ✅ 必需 |

### 输出格式要求

#### PEST 分析输出

```typescript
interface PestSectionOutput {
  verifiedFacts: Array<{
    fact: string;
    source: string; // URL
    date: string;
    relevance: string;
  }>; // 至少 5 条
  
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
      mitigation: string;
    }>;
    opportunities: Array<{
      opportunity: string;
      value: 'HIGH' | 'MEDIUM' | 'LOW';
      feasibility: 'HIGH' | 'MEDIUM' | 'LOW';
      action: string;
    }>;
  };
  
  sources: Array<{
    title: string;
    url: string;
    type: 'news' | 'official' | 'report';
    date: string;
  }>; // 至少 5 条
}
```

### 系统提示词

所有分析 Skills 使用统一的系统提示词模板：

```typescript
export const PEST_ANALYSIS_PROMPT = `
[角色定位]
你是一位资深顶尖的行业咨询顾问，曾在贝恩/埃森哲/BCG/麦肯锡等机构工作。

[核心能力]
- 严格使用 Web Browsing 检索最新信息
- 确保结论具备准确性、时效性与来源可追溯性
- 针对 TripNARA 的特殊视角强化

[输出要求]
1. 可验证的事实依据（至少 5 条来源链接）
2. 可落地的战略含义
3. 可执行的风险与机会清单
`;
```

### 成本优化建议

1. **缓存策略**
   - 搜索结果缓存 7 天
   - 分析报告缓存 30 天

2. **批量搜索**
   - 合并多个搜索查询
   - 使用并行搜索（Promise.all）

3. **智能搜索**
   - 根据分析阶段选择搜索深度
   - 第一阶段：广泛搜索（10-15条）
   - 后续阶段：针对性搜索（5-8条）

4. **成本监控**
   - 设置每次分析的预算上限
   - 监控搜索次数和成本
   - 生成成本报告

---

## 相关文档

- [详细分析报告](./CLAUDE_AGENT_SKILLS_ANALYSIS.md) - 完整的角色定义、接口设计、实现示例
- [Agent 架构总结](./AGENT_ARCHITECTURE_SUMMARY.md) - TripNARA Agent 架构说明
- [Skills 架构文档](./src/skills/README.md) - Skills 系统架构

---

## 常见问题

### Q1: Web Browsing 成本如何控制？

**A**: 
- 实现缓存策略（搜索结果缓存 7 天，分析报告缓存 30 天）
- 使用批量搜索减少 API 调用次数
- 设置每次分析的预算上限
- 监控并生成成本报告

### Q2: 如何确保来源链接的质量？

**A**:
- 优先使用官方来源（政府网站、监管机构）
- 使用知名新闻媒体和行业报告
- 验证链接有效性（定期检查）
- 记录来源的相关性和可信度

### Q3: PEST 分析可以跳过某一步吗？

**A**: 
- 可以，但建议按顺序执行
- 市场概览提供行业背景
- 竞争格局需要了解市场现状
- 监管风险需要结合竞争环境分析

### Q4: 如何验证分析结果的准确性？

**A**:
- 要求所有关键结论提供来源链接
- 使用多个来源交叉验证
- 定期更新分析（市场变化快）
- 人工审核关键结论

---

## 更新日志

- **v1.0** (2024-01-XX): 初始版本
  - PEST 分析 Skill
  - 行业分析 Skills
  - Web Browsing 集成
  - 缓存策略

---

**文档版本**：v1.0  
**最后更新**：2024-01-XX  
**维护者**：TripNARA 团队
