# Exa 作为 TripNara 搜索工具的产品策略

## 📋 文档说明

本文档从**产品经理**和**首席AI科学家**的角度，分析 Exa 在 TripNara 中的定位和使用范围。

**作者**: 产品经理 + 首席AI科学家  
**日期**: 2026-02-06  
**状态**: 策略文档

---

## 🎯 TripNara 核心定位回顾

### TripNara 是什么
> **"我们不是在规划旅行，而是在替用户判断：在这个世界的这个角落，他该不该这样走。"**

- ✅ **世界级路线认知 Agent**
- ✅ **地理 × 体力 × 风险的联合决策系统**
- ✅ **会替用户承担"判断责任"的决策引擎**

### TripNara 的核心能力
1. **三人格决策系统**（Abu/Dr.Dre/Neptune）
2. **RouteDirection 系统**（路线人格母本）
3. **DEM 决策证据**（地形、海拔、疲劳分析）
4. **天气决策证据**（风速、能见度、降水）
5. **世界模型构建**（物理现实、人类能力、路线方向）
6. **决策日志系统**（责任账本）

---

## 🔍 Exa 能力分析

### Exa 提供的工具
1. ✅ **web_search_exa** - Web 搜索
2. ✅ **get_code_context_exa** - 代码上下文搜索
3. ✅ **company_research_exa** - 公司研究
4. ✅ **web_search_advanced_exa** - 高级 Web 搜索
5. ✅ **deep_search_exa** - 深度搜索
6. ✅ **crawling_exa** - 网页爬取
7. ✅ **people_search_exa** - 人员搜索
8. ✅ **deep_researcher_start/check** - 深度研究代理

---

## 💡 产品策略：Exa 在 TripNara 中的定位

### 核心原则

#### 1. **不偏离核心定位**
- ❌ **不是**内容生成型旅行助手
- ❌ **不是**攻略推荐系统
- ✅ **是**决策支持工具，为"判断"提供实时信息

#### 2. **补充而非替代**
- TripNara 的核心是**确定性决策逻辑**（DEM、天气、合规）
- Exa 提供**实时、动态的外部信息**，增强决策质量
- Exa 不能替代 TripNara 的 Hard Core（三人格、RouteDirection）

#### 3. **信息质量优先**
- 优先使用**结构化数据源**（已有：天气、DEM、交通）
- Exa 用于**无法结构化的实时信息**（新闻、事件、动态变化）

---

## 🎯 应该框定的内容（推荐使用）

### ✅ **P0 - 核心场景（必须启用）**

#### 1. **实时风险信息搜索** ⭐⭐⭐
**场景**: 在决策前，搜索目的地的实时风险信息

**使用工具**: `web_search_exa` + `deep_search_exa`

**具体用例**:
- ✅ **路线封闭信息**: "冰岛 F-Road 2026年2月封闭情况"
- ✅ **极端天气事件**: "挪威北部 2026年2月暴雪预警"
- ✅ **地质灾害**: "秘鲁安第斯山脉近期地震/山体滑坡"
- ✅ **政治/安全事件**: "目的地近期安全事件、抗议活动"
- ✅ **交通中断**: "瑞士阿尔卑斯山隧道维修、道路封闭"

**集成点**:
- **Abu（安全检查）**: 在 `abuCheck` 之前，调用 Exa 搜索实时风险
- **World Model 构建**: 在 `world.buildContext` 时，补充实时风险信息

**示例**:
```typescript
// 在 Abu 策略中
const riskInfo = await exaService.webSearch(
  `{country} {route} {month} 2026 封闭 风险 安全`
);
if (riskInfo.contains('封闭') || riskInfo.contains('禁止通行')) {
  return { allowed: false, reason: '实时信息显示路线封闭' };
}
```

---

#### 2. **目的地实时动态信息** ⭐⭐⭐
**场景**: 获取目的地的实时动态信息，影响决策

**使用工具**: `web_search_exa` + `web_search_advanced_exa`

**具体用例**:
- ✅ **季节性变化**: "冰岛高地 2026年2月开放时间"
- ✅ **设施状态**: "目的地酒店/餐厅/设施是否开放"
- ✅ **活动/节庆**: "目的地近期活动、节庆、大型事件"
- ✅ **价格波动**: "目的地近期价格变化、旺季/淡季"
- ✅ **游客流量**: "目的地近期游客流量、拥挤度"

**集成点**:
- **Neptune（空间修复）**: 当 POI 不可用时，搜索替代方案
- **Planning Policy**: What-If 分析时，考虑实时动态

**示例**:
```typescript
// 在 Neptune 策略中
const alternatives = await exaService.webSearch(
  `{destination} {category} 2026年2月 开放 推荐`
);
// 基于搜索结果，提供替代 POI
```

---

#### 3. **签证/入境政策实时更新** ⭐⭐
**场景**: 检查签证和入境政策的实时变化

**使用工具**: `web_search_exa`

**具体用例**:
- ✅ **签证政策变化**: "中国护照 冰岛 2026年 签证政策"
- ✅ **入境要求更新**: "目的地入境要求、健康证明、疫苗要求"
- ✅ **边境状态**: "目的地边境开放状态、限制措施"

**集成点**:
- **Readiness Skills**: `checkVisaWindow` 时，补充实时政策信息
- **World Model**: 构建合规性上下文时，加入实时政策

---

### ✅ **P1 - 重要场景（建议启用）**

#### 4. **深度目的地研究** ⭐⭐
**场景**: 对未知目的地进行深度研究，构建世界模型

**使用工具**: `deep_researcher_start` + `deep_researcher_check`

**具体用例**:
- ✅ **新国家 Pack 创建**: 研究新国家的路线、风险、文化
- ✅ **RouteDirection 验证**: 验证路线方向的可行性、风险
- ✅ **用户咨询**: 回答用户关于目的地的深度问题

**集成点**:
- **Country Pack 创建**: `countryPack.newSkeleton` 时，使用深度研究
- **用户问答**: Agent 回答用户问题时，使用深度研究

**注意**: 
- ⚠️ 这是**异步任务**，需要轮询
- ⚠️ 仅用于**深度研究场景**，不用于实时决策

---

#### 5. **特定网页内容获取** ⭐
**场景**: 获取特定网页的详细内容（官方公告、政策文件等）

**使用工具**: `crawling_exa`

**具体用例**:
- ✅ **官方公告**: 获取目的地官方旅游网站的最新公告
- ✅ **政策文件**: 获取签证、入境政策的详细文件内容
- ✅ **路线信息**: 获取官方路线网站的具体路线说明

**集成点**:
- **World Model 构建**: 从官方来源获取权威信息
- **决策证据**: 作为决策的权威证据来源

**注意**:
- ⚠️ 仅用于**权威来源**（官方网站、政府公告）
- ⚠️ 不用于一般网页爬取（避免版权问题）

---

### ❌ **P2 - 不推荐场景（应限制使用）**

#### 6. **代码搜索** ❌
**场景**: `get_code_context_exa`

**不推荐原因**:
- ❌ TripNara 不是代码生成工具
- ❌ 对旅行规划决策无直接价值
- ❌ 可能增加不必要的 API 调用成本

**建议**: 
- ⚠️ **禁用**或**不暴露给 Agent**
- ✅ 仅保留在技术文档中，供开发者使用

---

#### 7. **人员搜索** ❌
**场景**: `people_search_exa`

**不推荐原因**:
- ❌ TripNara 不涉及人员信息查询
- ❌ 隐私风险
- ❌ 对旅行规划决策无直接价值

**建议**:
- ⚠️ **禁用**或**不暴露给 Agent**

---

#### 8. **公司研究** ⚠️（有限使用）
**场景**: `company_research_exa`

**有限使用场景**:
- ✅ **旅游公司/服务商研究**: 研究目的地旅游公司、服务商的可信度
- ✅ **交通公司研究**: 研究交通公司（租车、航空公司）的服务质量

**不推荐场景**:
- ❌ 一般公司研究（与旅行无关）
- ❌ 商业分析（非 TripNara 核心功能）

**建议**:
- ⚠️ **限制使用范围**，仅用于旅行相关公司
- ✅ 在 Agent 提示词中明确使用场景

---

## 🏗️ 架构集成建议

### 1. **集成到决策流程**

```
用户查询
  ↓
Agent Router (理解意图)
  ↓
World Model 构建
  ├─ 结构化数据（DEM、天气、交通）← 已有数据源
  └─ 实时信息（Exa 搜索）← Exa 补充
  ↓
三人格决策（Abu/Dr.Dre/Neptune）
  ├─ Abu: 安全检查（使用 Exa 实时风险信息）
  ├─ Dr.Dre: 节奏调整（使用 Exa 实时动态信息）
  └─ Neptune: 空间修复（使用 Exa 替代方案搜索）
  ↓
决策结果 + 决策日志
```

### 2. **Exa 调用时机**

#### **时机 1: World Model 构建时**
```typescript
// world.buildContext
const worldModel = {
  physicalReality: await buildPhysicalReality(), // 结构化数据
  realTimeInfo: await exaService.webSearch(
    `${country} ${route} ${month} 2026 实时信息 风险`
  ), // Exa 补充实时信息
  // ...
};
```

#### **时机 2: Abu 安全检查时**
```typescript
// abu-strategy.service.ts
async checkSafety(plan: RoutePlanDraft) {
  // 1. DEM 证据检查（确定性逻辑）
  const demEvidence = await this.checkDEM(plan);
  
  // 2. Exa 实时风险检查（动态信息）
  const riskInfo = await exaService.webSearch(
    `${plan.country} ${plan.route} ${plan.month} 封闭 风险`
  );
  
  // 3. 综合判断
  if (demEvidence.violations.length > 0 || riskInfo.contains('封闭')) {
    return { allowed: false };
  }
}
```

#### **时机 3: Neptune 空间修复时**
```typescript
// neptune-strategy.service.ts
async findReplacement(originalPOI: Place, reason: string) {
  // 1. 结构化替代方案（已有 POI 数据库）
  const alternatives = await this.findNearbyPOIs(originalPOI);
  
  // 2. Exa 搜索实时替代方案（动态信息）
  const realTimeAlternatives = await exaService.webSearch(
    `${originalPOI.city} ${originalPOI.category} 2026年2月 推荐 开放`
  );
  
  // 3. 合并结果
  return mergeAlternatives(alternatives, realTimeAlternatives);
}
```

### 3. **Agent 工具暴露策略**

#### **推荐暴露给 Agent 的工具**
```typescript
// 在 Agent 工具列表中
const exaTools = [
  'web_search_exa',           // ✅ P0 - 实时信息搜索
  'web_search_advanced_exa',   // ✅ P0 - 高级搜索
  'deep_search_exa',           // ✅ P0 - 深度搜索
  'deep_researcher_start',     // ✅ P1 - 深度研究
  'deep_researcher_check',     // ✅ P1 - 深度研究状态
  'crawling_exa',              // ✅ P1 - 网页爬取（限制使用）
  'company_research_exa',       // ⚠️ P2 - 有限使用（仅旅行相关）
];
```

#### **不暴露给 Agent 的工具**
```typescript
const hiddenTools = [
  'get_code_context_exa',      // ❌ 代码搜索（不相关）
  'people_search_exa',          // ❌ 人员搜索（隐私风险）
];
```

---

## 📊 使用场景优先级矩阵

| 场景 | Exa 工具 | 优先级 | 集成点 | 使用频率 |
|------|---------|--------|--------|---------|
| 实时风险信息 | `web_search_exa` + `deep_search_exa` | **P0** | Abu 安全检查 | 高频 |
| 目的地实时动态 | `web_search_exa` + `web_search_advanced_exa` | **P0** | Neptune 空间修复 | 高频 |
| 签证/入境政策 | `web_search_exa` | **P0** | Readiness Skills | 中频 |
| 深度目的地研究 | `deep_researcher_start/check` | **P1** | Country Pack 创建 | 低频 |
| 特定网页内容 | `crawling_exa` | **P1** | World Model 构建 | 低频 |
| 旅游公司研究 | `company_research_exa` | **P2** | 用户咨询 | 低频 |
| 代码搜索 | `get_code_context_exa` | **❌** | - | 不使用 |
| 人员搜索 | `people_search_exa` | **❌** | - | 不使用 |

---

## 🎯 产品功能边界

### ✅ **应该做的**

1. **实时信息补充**
   - 在决策前，搜索实时风险、动态信息
   - 补充结构化数据源无法覆盖的信息

2. **增强决策质量**
   - 为三人格决策提供实时上下文
   - 提高决策的准确性和时效性

3. **用户问答支持**
   - 回答用户关于目的地的实时问题
   - 提供深度研究和分析

### ❌ **不应该做的**

1. **替代核心决策逻辑**
   - ❌ 不能用 Exa 搜索结果替代 DEM 证据
   - ❌ 不能用 Exa 搜索结果替代天气决策证据
   - ❌ 不能用 Exa 搜索结果替代 RouteDirection 哲学

2. **内容生成**
   - ❌ 不能用 Exa 生成行程（TripNara 不是内容生成器）
   - ❌ 不能用 Exa 生成攻略（TripNara 不是攻略推荐系统）

3. **偏离核心定位**
   - ❌ 不能用 Exa 做代码搜索（不相关）
   - ❌ 不能用 Exa 做人员搜索（隐私风险）

---

## 🔧 技术实现建议

### 1. **缓存策略**

```typescript
// Exa 搜索结果缓存
const cacheKey = `exa:${country}:${route}:${month}:${query}`;
const cached = await redis.get(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

// 调用 Exa API
const result = await exaService.webSearch(query);

// 缓存结果（实时信息缓存时间较短）
await redis.setex(cacheKey, 3600, JSON.stringify(result)); // 1小时
```

**缓存时间建议**:
- **实时风险信息**: 1-6小时
- **目的地动态**: 6-24小时
- **政策信息**: 24-72小时
- **深度研究**: 7-30天

### 2. **错误处理和降级**

```typescript
// 在决策流程中
try {
  const realTimeInfo = await exaService.webSearch(query);
  // 使用实时信息
} catch (error) {
  // Exa 失败时，降级到结构化数据
  this.logger.warn('Exa search failed, using structured data only');
  // 继续使用已有数据源，不阻塞决策流程
}
```

### 3. **成本控制**

```typescript
// 限制 Exa API 调用频率
const rateLimiter = {
  perMinute: 10,  // 每分钟最多 10 次
  perHour: 100,   // 每小时最多 100 次
  perDay: 1000,   // 每天最多 1000 次
};

// 优先使用缓存
// 批量查询合并
// 异步处理非关键查询
```

---

## 🔧 技术实现状态

### ✅ 已完成（Phase 1 + Phase 2）

1. **ExaIntegrationService** (`src/mcp/exa-integration.service.ts`)
   - ✅ 封装 Exa 搜索逻辑
   - ✅ 提供缓存机制（Redis）
   - ✅ 错误处理和降级逻辑
   - ✅ 实时风险信息搜索 (`searchRealTimeRisks`)
   - ✅ 目的地状态搜索 (`searchDestinationStatus`)
   - ✅ 深度风险搜索 (`searchDeepRisks`) - Phase 2
   - ✅ 替代方案搜索 (`searchAlternativeDestinations`) - Phase 2
   - ✅ 官方网页爬取 (`crawlOfficialPage`) - Phase 2
   - ✅ 深度研究启动和检查 (`startDeepResearch`, `checkDeepResearch`) - Phase 2

2. **Abu Strategy 集成** (`src/trips/decision/strategies/abu-strategy.service.ts`)
   - ✅ 在道路状态检查前，调用 Exa 搜索实时风险
   - ✅ 检测到高风险时，直接 REJECT 计划
   - ✅ 降级处理：Exa 失败时继续使用结构化数据

3. **World Model 构建集成** (`src/skills/world/world-build-context.skill.ts`)
   - ✅ 在构建 PhysicalRealityModel 时，补充实时风险信息
   - ✅ 将实时风险信息补充到 `roadStates` 和 `hazardZones`
   - ✅ 降级处理：Exa 失败时不阻塞构建流程

4. **Neptune Strategy 集成** (`src/trips/decision/strategies/neptune-strategy.service.ts`) - Phase 2
   - ✅ 当 SpatialReplacementService 找不到替代方案时，使用 Exa 搜索实时替代方案
   - ✅ 搜索目的地替代 POI 和入口点
   - ✅ 降级处理：Exa 失败时继续使用结构化数据

5. **Country Pack 创建集成** (`src/skills/country-pack/country-pack-new-skeleton.skill.ts`) - Phase 2
   - ✅ 创建 ReadinessPack 时，异步启动深度研究任务
   - ✅ 不阻塞骨架创建流程
   - ✅ 研究结果可在后续通过 `checkDeepResearch` 获取

6. **Readiness Skills 集成** (`src/skills/readiness/readiness-check-visa-window.skill.ts`) - Phase 2
   - ✅ 检查签证时间窗时，搜索实时签证政策信息
   - ✅ 优先使用实时信息，降级到结构化数据
   - ✅ 解析签证类型、处理时间、停留时间等信息

7. **模块集成**
   - ✅ `ExaModule` 导入到 `DecisionModule`
   - ✅ `ExaModule` 导入到 `SkillsModule`
   - ✅ `ExaIntegrationService` 导出供其他模块使用

### 📝 使用说明

**Exa 工具不直接暴露给 Agent**，而是通过以下方式集成：

1. **自动集成**（无需 Agent 调用）:
   - Abu 安全检查时自动搜索实时风险
   - World Model 构建时自动补充实时信息

2. **HTTP API**（前端/后端调用）:
   - `POST /api/exa/search/web` - Web 搜索（推荐使用）
   - `POST /api/exa/research/company` - 公司研究（不推荐，仅用于特殊场景）
   - `POST /api/exa/search/code` - 代码搜索（不推荐，仅用于开发调试）

3. **限制**:
   - ❌ 不推荐 Agent 直接调用 Exa 工具（除非特殊场景）
   - ✅ 推荐通过 `ExaIntegrationService` 封装的方法使用
   - ✅ 所有调用都有缓存和降级保护

---

## 📈 成功指标（KPI）

### 1. **决策质量提升**
- ✅ 实时风险检测准确率提升 X%
- ✅ 决策被用户接受率提升 Y%
- ✅ 行程执行成功率提升 Z%

### 2. **用户体验提升**
- ✅ 用户问题回答准确率提升
- ✅ 用户满意度提升
- ✅ 行程规划时间缩短

### 3. **成本控制**
- ✅ Exa API 调用成本控制在预算内
- ✅ 缓存命中率 > 60%
- ✅ 平均响应时间 < 2秒

---

## 🚀 实施路线图

### Phase 1: 核心集成（1-2周）
1. ✅ 集成 `web_search_exa` 到 Abu 安全检查
2. ✅ 集成 `web_search_exa` 到 World Model 构建
3. ✅ 添加缓存机制
4. ✅ 添加错误处理和降级

### Phase 2: 增强功能（2-3周）✅ 已完成
1. ✅ 集成 `deep_search_exa` 到深度风险检查（ExaIntegrationService.searchDeepRisks）
2. ✅ 集成 `crawling_exa` 到官方信息获取（ExaIntegrationService.crawlOfficialPage）
3. ✅ 集成 `deep_researcher_start/check` 到 Country Pack 创建（CountryPackNewSkeletonSkill）
4. ✅ 集成替代方案搜索到 Neptune Strategy（NeptuneStrategy.searchExaAlternatives）
5. ✅ 集成签证政策实时更新到 Readiness Skills（ReadinessCheckVisaWindowSkill）

### Phase 3: 优化和监控（1-2周）✅ 已完成
1. ✅ 优化缓存策略（不同场景使用不同 TTL：风险信息 1-6 小时，替代方案 12-24 小时，官方网页 24-48 小时）
2. ✅ 添加成本监控（ExaMonitoringService，记录每次 API 调用，估算成本）
3. ✅ 添加使用分析（每日统计、性能指标、按工具分组统计）
4. ✅ 添加性能监控（响应时间、成功率、成本限制检查）
5. ✅ 提供监控 API 端点（`GET /api/exa/monitoring/stats`, `GET /api/exa/monitoring/cost-check`）
6. ✅ 创建集成测试脚本（`scripts/test-exa-integration.ts`）

---

## 📝 总结

### 核心结论

1. **Exa 是 TripNara 的"实时信息补充工具"**
   - 不替代核心决策逻辑
   - 补充结构化数据源无法覆盖的信息
   - 增强决策的时效性和准确性

2. **应该框定的内容**
   - ✅ **P0**: 实时风险信息、目的地动态、签证政策
   - ✅ **P1**: 深度研究、网页爬取（限制使用）
   - ⚠️ **P2**: 公司研究（仅旅行相关）
   - ❌ **禁用**: 代码搜索、人员搜索

3. **集成原则**
   - 在决策流程的关键节点调用 Exa
   - 优先使用缓存，控制成本
   - 失败时降级到结构化数据，不阻塞决策

4. **产品边界**
   - ✅ 增强决策质量
   - ❌ 不替代核心逻辑
   - ❌ 不偏离核心定位

---

**文档状态**: ✅ Phase 1、Phase 2 和 Phase 3 已完成  
**下一步**: 
- 运行测试脚本验证集成效果：`npm run test:exa:integration`
- 查看监控统计：`GET /api/exa/monitoring/stats?days=7`
- 检查成本限制：`GET /api/exa/monitoring/cost-check?dailyLimit=10`
