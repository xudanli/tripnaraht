# 规划工作台流程合理性评估报告

**评估日期**: 2026-02-04  
**评估角色**: 产品经理（Danny）、首席AI科学家、地理科学家  
**评估对象**: `PLANNING_WORKBENCH_FLOW.md`

---

## 一、产品经理评估（Danny）

### ✅ 合理性评估

#### 1.1 决策优先原则符合度：**良好**

**优点**：
- ✅ 流程体现了 **"先判断路线是否应该存在（Should-Exist Gate），再生成可执行行程"** 的核心理念
- ✅ System 1 快速检查 → System 2 深度评审的流程符合决策分层原则
- ✅ 门控检查（`plan.gate.precheck`、`plan.gate.runThreeGuardians`）在生成后执行，确保方案可执行性

**问题**：
- ⚠️ **缺少"排除过程"展示**：流程中没有明确记录"为什么排除了某些方案"，只展示了最终推荐方案
- ⚠️ **不确定性展示不足**：虽然生成了2-3个方案，但没有明确的风险分布（Plan A风险30%、Plan B风险12%等）
- ⚠️ **用户是裁判而非输入员**：流程中缺少用户判断环节（"你更讨厌哪种失败？"、"你愿意为确定性牺牲多少体验？"）

#### 1.2 可执行性优先：**良好**

**优点**：
- ✅ POI数据从当前行程优先获取，确保方案与已有行程一致
- ✅ System 1检查包含预算、交通、节奏、门控等可执行性验证
- ✅ 三人格输出（ABU、DR_DRE、NEPTUNE）提供不同视角的可执行性评估

**问题**：
- ⚠️ **缺少交通班次/票务验证**：流程中没有明确调用交通时刻表、票务可用性检查
- ⚠️ **缺少开放时间验证**：POI的开放时间、预订链接等可执行数据没有在流程中明确验证
- ⚠️ **缺少紧急点位标记**：流程中没有标记紧急点位、救援点等安全信息

#### 1.3 用户体验流程：**需要改进**

**问题**：
- ❌ **缺少用户旅程设计**：流程中没有明确用户从"产生意图"到"执行后反馈"的全链路
- ❌ **缺少决策回放机制**：没有决策replay（时间轴回溯）功能
- ❌ **缺少假设模拟**：没有"What if"功能（如果改变某个约束会怎样）
- ❌ **缺少历史决策风格建模**：没有学习用户历史决策偏好

#### 1.4 功能完整性：**基本完整，但有缺失**

**缺失功能**：
- ❌ **方案对比功能**：`compare` 操作只有占位符，没有实现
- ❌ **方案提交功能**：`commit` 操作只有占位符，没有实现
- ❌ **方案调整功能**：`adjust` 操作只有占位符，没有实现

**建议**：
- **P0（必须）**：实现 `compare` 功能，让用户对比多个方案
- **P1（重要）**：实现 `commit` 功能，将方案提交为可执行行程
- **P2（可选）**：实现 `adjust` 功能，支持用户调整方案

### 📊 产品经理评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 决策优先原则 | 7/10 | 基本符合，但缺少排除过程展示 |
| 可执行性优先 | 8/10 | 良好，但缺少交通/票务验证 |
| 用户体验流程 | 5/10 | 缺少用户旅程设计和决策回放 |
| 功能完整性 | 6/10 | 核心功能完整，但compare/commit/adjust未实现 |
| **综合评分** | **6.5/10** | **需要改进** |

---

## 二、首席AI科学家评估

### ✅ 合理性评估

#### 2.1 LLM模型选择与优化：**良好**

**优点**：
- ✅ 使用 Claude Anthropic（适合长文本组织、推理）
- ✅ 动态 `max_tokens` 计算（基于prompt长度和schema复杂度，最高8192）
- ✅ 超时保护（长行程90秒，短行程60秒）
- ✅ JSON解析增强（markdown清理、不完整JSON修复）

**问题**：
- ⚠️ **缺少模型路由策略**：没有根据任务复杂度选择不同模型（vLLM vs Claude API）
- ⚠️ **缺少Few-shot examples**：Prompt中没有提供示例，可能影响输出质量
- ⚠️ **缺少Chain-of-Thought**：对于复杂决策，没有引导LLM进行推理链思考
- ⚠️ **缺少输出验证**：没有对LLM输出的合理性进行验证（如天数是否匹配、锚点是否合理）

#### 2.2 提示工程：**需要优化**

**当前Prompt分析**：
```
你是一位经验丰富的旅行规划师（Trip Architect）。
任务：基于用户的目标和约束，生成 2-3 套不同的行程骨架方案。
```

**问题**：
- ❌ **缺少上下文信息**：Prompt中没有包含世界模型信息（地形、天气、路况）
- ❌ **缺少约束明确化**：没有明确Hard Constraints vs Soft Preferences
- ❌ **缺少不确定性要求**：没有要求LLM输出风险分布、置信度
- ❌ **缺少Few-shot examples**：没有提供高质量示例引导输出格式

**建议优化**：
```typescript
// 增强的Prompt结构
const enhancedPrompt = `
你是一位经验丰富的旅行规划师（Trip Architect）。

## 任务
基于用户的目标和约束，生成 2-3 套不同的行程骨架方案。

## 上下文信息
${worldModelInfo}  // 地形、天气、路况等

## 约束分类
- Hard Constraints（不能违反）：${hardConstraints}
- Soft Preferences（可权衡）：${softPreferences}

## 输出要求
1. 必须返回完整的 JSON 对象，不要被截断
2. 每个方案必须包含不确定性评估（风险概率分布）
3. 必须说明为什么排除了其他可能的方案
4. 提供决策理由（为什么推荐这个方案）

## 示例（Few-shot）
${fewShotExamples}
`;
```

#### 2.3 多智能体系统：**架构合理，但缺少协作**

**优点**：
- ✅ 三人格系统（ABU、DR_DRE、NEPTUNE）在System 2阶段执行
- ✅ System 1检查并行执行，提高效率

**问题**：
- ⚠️ **缺少Sub-Agent调用**：流程中没有明确调用Planner、Gatekeeper、LocalInsight等Sub-Agents
- ⚠️ **缺少Agent间通信**：没有看到Agent间的消息传递、状态共享机制
- ⚠️ **缺少冲突解决机制**：如果System 1检查发现冲突，没有明确的仲裁流程

#### 2.4 RAG系统集成：**缺失**

**问题**：
- ❌ **POI查询没有使用RAG**：当前直接从Place表查询，没有使用向量搜索进行语义匹配
- ❌ **缺少知识库检索**：没有从RAG知识库检索相关地理知识、文化信息等
- ❌ **缺少上下文压缩**：如果世界模型信息过长，没有压缩机制

**建议**：
- 使用RAG进行POI语义搜索（根据主题、描述匹配相关POI）
- 从知识库检索目的地相关信息（文化、历史、注意事项）
- 实现上下文压缩，避免Prompt过长

#### 2.5 成本与性能优化：**良好，但有改进空间**

**优点**：
- ✅ System 1检查并行执行
- ✅ POI查询批量处理
- ✅ 超时保护

**问题**：
- ⚠️ **缺少结果缓存**：相同查询可能重复调用LLM
- ⚠️ **缺少Token优化**：Prompt可能包含冗余信息
- ⚠️ **缺少批量LLM调用**：如果生成多个方案，可以批量调用

#### 2.6 可解释性设计：**基本符合，但可增强**

**优点**：
- ✅ 决策日志记录（通过TripAttempt）
- ✅ 三人格输出提供不同视角
- ✅ 健康度评分

**问题**：
- ⚠️ **缺少决策追溯链**：无法追溯"为什么生成这个方案"的完整推理过程
- ⚠️ **缺少证据可视化**：没有明确展示支持决策的证据（地形数据、POI评分等）
- ⚠️ **缺少排除理由**：没有记录"为什么排除了其他方案"

### 📊 首席AI科学家评分

| 维度 | 评分 | 说明 |
|------|------|------|
| LLM模型选择 | 7/10 | 良好，但缺少模型路由 |
| 提示工程 | 5/10 | 需要优化，缺少Few-shot和上下文 |
| 多智能体系统 | 6/10 | 架构合理，但缺少Sub-Agent调用 |
| RAG系统集成 | 3/10 | 缺失，需要集成 |
| 成本与性能 | 7/10 | 良好，但有改进空间 |
| 可解释性 | 6/10 | 基本符合，但可增强 |
| **综合评分** | **5.7/10** | **需要改进** |

---

## 三、地理科学家评估

### ✅ 合理性评估

#### 3.1 DEM地形数据集成：**严重缺失**

**问题**：
- ❌ **流程中没有DEM数据查询**：虽然segments包含`ascentM`、`slopePct`字段，但流程中没有调用DEM服务填充这些数据
- ❌ **缺少地形剖面计算**：没有计算路线的海拔剖面、累计爬升
- ❌ **缺少地形复杂度评估**：没有基于DEM数据评估地形复杂度
- ❌ **缺少疲劳模型**：虽然System 1有`plan.pace.fatigueScore`，但没有看到基于DEM的疲劳计算

**建议**：
```typescript
// 在阶段2之后，阶段3之前添加：
// 2.5 填充DEM地形数据
if (planState.itinerary.segments.length > 0) {
  for (const segment of planState.itinerary.segments) {
    // 如果有POI坐标，计算地形数据
    if (segment.metadata?.attractions?.length > 0) {
      const poiCoords = segment.metadata.attractions[0].coordinates;
      if (poiCoords) {
        // 调用DEM服务
        const elevation = await demElevationService.getElevation(
          poiCoords.lat, 
          poiCoords.lng
        );
        segment.metadata.elevation = elevation;
      }
    }
    
    // 如果有多个POI，计算路线剖面
    if (segment.metadata?.attractions?.length >= 2) {
      const polyline = segment.metadata.attractions.map(a => ({
        lat: a.coordinates.lat,
        lng: a.coordinates.lng
      }));
      const profile = await demEffortMetadataService.getProfile(polyline);
      segment.distanceKm = profile.totalDistanceKm;
      segment.ascentM = profile.totalAscentM;
      segment.slopePct = profile.averageSlopePct;
    }
  }
}
```

#### 3.2 地理特征分析：**缺失**

**问题**：
- ❌ **缺少地理特征查询**：流程中没有查询河流、山脉、道路、海岸线等地理特征
- ❌ **缺少可达性评估**：没有基于道路网络、交通连接评估可达性
- ❌ **缺少地理风险评估**：没有识别危险区域（雪崩、泥石流、火山等）

**建议**：
- 在System 1检查中添加地理特征查询（`geo.facts.getGeoFeatures`）
- 添加危险区域检测（`geo.check.hazard.zones`）
- 基于地理特征计算可达性评分

#### 3.3 空间查询优化：**良好**

**优点**：
- ✅ POI坐标批量提取（PostGIS查询）
- ✅ 使用PostGIS空间索引

**问题**：
- ⚠️ **缺少空间查询缓存**：相同区域的地理数据可能重复查询
- ⚠️ **缺少空间查询优化**：没有看到查询性能优化策略

#### 3.4 地理数据质量：**需要监控**

**问题**：
- ⚠️ **缺少数据质量检查**：没有检查DEM数据覆盖率、POI数据完整性
- ⚠️ **缺少数据时效性验证**：没有验证地理数据的时效性

### 📊 地理科学家评分

| 维度 | 评分 | 说明 |
|------|------|------|
| DEM地形数据集成 | 2/10 | **严重缺失**，segments中的地形字段未填充 |
| 地理特征分析 | 1/10 | **完全缺失**，没有地理特征查询 |
| 空间查询优化 | 7/10 | 良好，但有改进空间 |
| 地理数据质量 | 4/10 | 缺少质量监控 |
| **综合评分** | **3.5/10** | **需要重大改进** |

---

## 四、综合评估与改进建议

### 4.1 关键问题汇总

#### 🔴 P0（严重问题，必须修复）

1. **DEM地形数据未填充**
   - **问题**：segments中的`distanceKm`、`ascentM`、`slopePct`都是0，没有调用DEM服务
   - **影响**：无法评估路线难度、疲劳程度
   - **修复**：在阶段2之后添加DEM数据填充步骤

2. **地理特征分析缺失**
   - **问题**：没有查询河流、山脉、危险区域等地理特征
   - **影响**：无法评估地理风险、可达性
   - **修复**：在System 1检查中添加地理特征查询

3. **compare/commit/adjust功能未实现**
   - **问题**：用户操作只有占位符
   - **影响**：用户体验不完整
   - **修复**：实现这三个核心功能

#### 🟡 P1（重要问题，建议修复）

4. **缺少RAG系统集成**
   - **问题**：POI查询没有使用向量搜索进行语义匹配
   - **影响**：POI推荐可能不够精准
   - **修复**：使用RAG进行POI语义搜索

5. **提示工程需要优化**
   - **问题**：缺少Few-shot examples、上下文信息、不确定性要求
   - **影响**：LLM输出质量可能不稳定
   - **修复**：增强Prompt，添加Few-shot和上下文

6. **缺少决策追溯链**
   - **问题**：无法追溯"为什么生成这个方案"
   - **影响**：可解释性不足
   - **修复**：记录完整的决策推理过程

7. **缺少排除过程展示**
   - **问题**：没有记录"为什么排除了其他方案"
   - **影响**：不符合TripNARA的"展示排除过程"原则
   - **修复**：记录排除理由，在UI中展示

#### 🟢 P2（优化建议）

8. **缺少模型路由策略**
   - **建议**：根据任务复杂度选择vLLM vs Claude API

9. **缺少结果缓存**
   - **建议**：缓存相同查询的LLM结果

10. **缺少用户旅程设计**
    - **建议**：设计完整的用户旅程，包括决策回放、What-if模拟

### 4.2 改进优先级

| 优先级 | 问题 | 影响 | 工作量 |
|--------|------|------|--------|
| **P0** | DEM地形数据未填充 | 高 | 中 |
| **P0** | 地理特征分析缺失 | 高 | 高 |
| **P0** | compare/commit/adjust未实现 | 高 | 高 |
| **P1** | RAG系统集成 | 中 | 中 |
| **P1** | 提示工程优化 | 中 | 低 |
| **P1** | 决策追溯链 | 中 | 中 |
| **P2** | 模型路由策略 | 低 | 中 |
| **P2** | 结果缓存 | 低 | 低 |

### 4.3 改进后的流程建议

#### 阶段 2.5（新增）：填充地理数据

在"转换骨架方案为Segments"之后，添加：

```typescript
// 2.5 填充DEM地形数据和地理特征
if (planState.itinerary.segments.length > 0) {
  // 2.5.1 填充DEM地形数据
  for (const segment of planState.itinerary.segments) {
    // 提取POI坐标
    const poiCoords = this.extractPoiCoordinates(segment);
    
    if (poiCoords.length >= 2) {
      // 计算路线剖面
      const profile = await demEffortMetadataService.getProfile(poiCoords);
      segment.distanceKm = profile.totalDistanceKm;
      segment.ascentM = profile.totalAscentM;
      segment.slopePct = profile.averageSlopePct;
      segment.metadata.elevationProfile = profile.elevationProfile;
    }
  }
  
  // 2.5.2 查询地理特征
  for (const segment of planState.itinerary.segments) {
    const centerPoint = this.calculateSegmentCenter(segment);
    const geoFeatures = await geoFactsService.getGeoFeaturesForPoint(
      centerPoint.lat,
      centerPoint.lng
    );
    segment.metadata.geoFeatures = geoFeatures;
    
    // 检测危险区域
    const hazards = await geoCheckHazardZonesSkill.execute({
      coordinates: centerPoint,
      radiusKm: 10
    });
    segment.metadata.hazards = hazards;
  }
}
```

#### 阶段 2.6（新增）：使用RAG进行POI推荐

```typescript
// 2.6 使用RAG进行POI语义搜索（如果Place表查询失败）
if (!tripPoisByDay.size && this.vectorSearchService) {
  for (const dayTheme of option.dayThemes) {
    // 使用RAG进行语义搜索
    const searchQuery = `${dayTheme.theme} ${dayTheme.description}`;
    const ragResults = await this.vectorSearchService.search(
      searchQuery,
      { countryCode, category: 'ATTRACTION' },
      limit: 10
    );
    // 将RAG结果转换为POI
  }
}
```

#### 阶段 2.7（新增）：记录排除过程

```typescript
// 2.7 记录排除过程
const exclusionLog: Array<{
  excludedOption: string;
  reason: string;
  evidence: string[];
}> = [];

// 记录为什么排除了其他可能的方案
for (const option of skeletonSet.options) {
  if (option.id !== recommendedOption.id) {
    exclusionLog.push({
      excludedOption: option.id,
      reason: '不符合推荐标准',
      evidence: ['用户偏好匹配度较低', '预算超出约束']
    });
  }
}

planState.metadata.exclusionLog = exclusionLog;
```

### 4.4 最终评分

| 角色 | 评分 | 主要问题 |
|------|------|----------|
| **产品经理** | 6.5/10 | 缺少排除过程展示、compare/commit/adjust未实现 |
| **首席AI科学家** | 5.7/10 | RAG缺失、提示工程需优化、缺少Sub-Agent调用 |
| **地理科学家** | 3.5/10 | **DEM数据未填充、地理特征分析缺失** |
| **综合评分** | **5.2/10** | **需要重大改进** |

### 4.5 关键结论

1. **地理数据集成是最大短板**：DEM地形数据和地理特征分析完全缺失，严重影响方案的可执行性和安全性评估。

2. **AI系统集成不完整**：RAG系统未集成，提示工程需要优化，缺少Few-shot examples和上下文信息。

3. **产品体验不完整**：缺少排除过程展示、决策回放、What-if模拟等TripNARA核心特性。

4. **功能实现不完整**：compare/commit/adjust功能只有占位符，需要实现。

### 4.6 下一步行动建议

**立即行动（本周）**：
1. ✅ 添加DEM地形数据填充步骤（阶段2.5）
2. ✅ 添加地理特征查询（阶段2.5）
3. ✅ 实现compare功能（至少基础版本）

**短期改进（2周内）**：
4. ✅ 集成RAG系统进行POI语义搜索
5. ✅ 优化Prompt，添加Few-shot examples
6. ✅ 实现commit功能

**中期优化（1个月内）**：
7. ✅ 实现adjust功能
8. ✅ 添加决策追溯链
9. ✅ 添加排除过程记录和展示

---

**评估完成时间**: 2026-02-04  
**评估人**: 产品经理（Danny）、首席AI科学家、地理科学家  
**下次评估**: 改进后重新评估
