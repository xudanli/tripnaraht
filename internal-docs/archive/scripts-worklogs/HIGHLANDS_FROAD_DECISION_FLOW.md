# 内陆高地F路 RouteDirection 系统决策流程详解

**文档日期**: 2026-02-10  
**RouteDirection UUID**: `8afd4b2e-7dd1-4837-8169-d3efed748138`  
**适用场景**: 冰岛内陆高地F路穿越行程规划

---

## 执行摘要

针对**内陆高地F路**，系统采用**三段式世界模型架构**进行决策：

1. **PhysicalRealityModel（物理现实）**: 基于corridorGeom生成DEM证据，评估地形、路况、风险
2. **HumanCapabilityModel（人体能力）**: 评估用户的身体能力、风险承受度、驾驶经验
3. **RouteDirection（路线哲学）**: 基于philosophy、failureProfile、antiPersona进行路线约束和优化

系统通过**三人格决策策略**（Abu → Dr.Dre → Neptune）确保生成的行程既符合路线哲学，又满足用户能力和安全要求。

---

## 一、世界模型构建阶段

### 1.1 世界模型构建流程

**入口**: `WorldBuildContextSkill.execute()`

**输入**:
- `tripId` 或 `{ countryCode: 'IS', season: 7, routeDirectionId: '8afd4b2e-7dd1-4837-8169-d3efed748138' }`
- `partyProfile`: 用户画像（风险承受度、体能、节奏偏好等）

**输出**: `WorldModelContext`（包含physical、human、routeDirection）

### 1.2 PhysicalRealityModel构建

#### 1.2.1 DEM证据生成（三级降级策略）

**优先级1**: 从实际行程路线生成DEM证据
- 如果存在trip且有ItineraryItem
- 提取所有Place的坐标
- 使用`DEMEffortMetadataService`生成完整的DEM证据

**优先级2**: 从RouteDirection的corridorGeom生成DEM证据 ⭐
- **针对内陆高地F路**: 使用corridorGeom（LINESTRING，10个点，997.4km）
- 从PostGIS geometry提取坐标点
- 使用`DEMEffortMetadataService`生成基础DEM证据
- **生成内容**:
  ```typescript
  {
    segmentId: 'route_8afd4b2e-7dd1-4837-8169-d3efed748138_corridor',
    cumulativeAscent: 累计爬升（米）,
    maxSlopePct: 最大坡度（%）,
    rollingAscent3Days: 3天滚动累计爬升,
    fatigueIndex: 疲劳指数,
    elevationProfile: 海拔剖面,
    explanation: '基于RouteDirection corridorGeom生成（source: route_direction_corridor）：10 个路线点，总距离 997.4km，累计爬升 XXXm'
  }
  ```

**优先级3**: 使用占位符（最后降级）
- 如果以上两种方法都失败
- 标记`physicalRealityIncomplete = true`

#### 1.2.2 道路状态数据加载

**数据源**: `data/physical-reality/road-status/iceland-road-status.json`

**针对内陆高地F路的关键F路**:
- F208: Landmannalaugar入口
- F225: Landmannalaugar → Þórsmörk
- F26: Sprengisandur高地纵贯
- F910: Askja火山
- F88: Askja → 北部

**决策影响**:
- 检查F路开放状态（仅夏季6月中旬-9月中旬）
- 评估路况风险（砂石路、河流穿越、极端地形）
- 验证车辆要求（必须四驱SUV）

#### 1.2.3 天气窗口数据加载

**数据源**: `data/physical-reality/weather-windows/iceland-weather-windows.json`

**针对内陆高地F路**:
- 最佳月份: 7月、8月
- 避免月份: 冬季（完全关闭）
- 天气窗口限制: 强风、降雪、能见度

**决策影响**:
- 评估天气风险
- 建议最佳出行时间
- 提供天气突变应对策略

### 1.3 HumanCapabilityModel构建

**构建函数**: `createHumanCapabilityModelFromProfile()`

**输入**: `partyProfile`
```typescript
{
  mobilityProfile?: string,
  riskTolerance: 'low' | 'medium' | 'high',
  fitness: 'low' | 'medium' | 'high',
  pace: 'relaxed' | 'moderate' | 'intense'
}
```

**输出**: `HumanCapabilityModel`
```typescript
{
  maxDailyAscentM: 单日最大爬升（根据fitness计算）,
  rollingAscent3DaysM: 连续3天滚动爬升阈值,
  maxSlopePct: 最大可接受坡度,
  preferredPace: 节奏偏好,
  riskTolerance: 风险承受度,
  highAltitudeExperience: 高海拔经验
}
```

**针对内陆高地F路的特殊考虑**:
- **风险承受度**: 必须是'high'（否则会被antiPersona过滤）
- **体能要求**: 建议'medium'或'high'（F路极端路况）
- **驾驶经验**: 必须有四驱车驾驶经验（antiPersona要求）

### 1.4 RouteDirection构建

**获取方式**: `RouteDirectionsService.findRouteDirectionByUuid()`

**针对内陆高地F路的关键数据**:

#### 1.4.1 Philosophy（路线哲学）

**位置**: `metadata.philosophy`

**核心内容**:
```typescript
{
  coreStatement: '从文明进入高地，再回到人间',
  mustVisitTags: ['高地荒原', '温泉', '火山'],
  nonNegotiableRules: [
    '必须有一晚住高地 hut 或营地',
    '必须经过至少一个 F-road 路段',
    '必须从 Ring Road 进入高地，再回到 Ring Road',
    '必须使用四驱SUV（法律要求）'
  ],
  flexibleParts: [
    '具体 F-road 选择（F26 / F35 / F208 / F225 / F910）',
    '中间停留点（POI 可替换）',
    '天数（5-7 天范围内）'
  ],
  durationFlexibility: {
    minDays: 5,
    maxDays: 7,
    preferredDays: 5
  }
}
```

**决策影响**:
- ✅ **必须体验**: 确保行程包含"高地荒原"、"温泉"、"火山"体验
- ✅ **不可协商规则**: 不允许违反4条红线
- ✅ **灵活调整**: 可以在flexibleParts范围内调整

#### 1.4.2 FailureProfile（失败画像）

**位置**: `metadata.extensions.failureProfile`

**核心内容**:
```typescript
{
  commonFailureDays: [3, 4],
  typicalFailureReason: ['fatigue', 'weather', 'logistics'],
  rescueDifficulty: 'HIGH',
  failureScenarios: [
    {
      day: 3,
      reason: 'Sprengisandur (F26) 河流穿越失败',
      typicalUserProfile: '缺乏F路驾驶经验的用户',
      mitigation: '建议跟随有经验的向导或参加F路穿越团'
    },
    {
      day: 4,
      reason: 'Askja火山区域天气突变',
      typicalUserProfile: '未充分准备应对极端天气的用户',
      mitigation: '必须携带GPS设备，随时关注天气预报'
    }
  ]
}
```

**决策影响**:
- ⚠️ **提前预防**: 在第3、4天加强风险检查
- ⚠️ **失败场景识别**: 识别典型失败原因（疲劳、天气、物流）
- ⚠️ **缓解措施**: 提供针对性的缓解建议

#### 1.4.3 AntiPersona（不适合的用户画像）

**位置**: `metadata.antiPersona`

**核心内容**:
```typescript
[
  '低风险偏好',
  '无四驱车驾驶经验',
  '时间极度紧张（少于5天）',
  '不愿接受不确定性',
  '无户外应急经验',
  '无卫星通信设备',
  '车辆不适合F路（非四驱SUV）',
  '不愿在极端天气下等待',
  '希望舒适便利的旅行体验',
  '无河流穿越经验'
]
```

**决策影响**:
- 🚫 **用户过滤**: 在路线推荐阶段过滤不适合的用户
- 🚫 **风险控制**: 防止误推荐给高风险用户
- 🚫 **期望管理**: 设置正确的用户期望

#### 1.4.4 Narrative（路线叙事）

**位置**: `metadata.extensions.narrative`

**核心内容**:
```typescript
{
  internal: '这条路线假设用户愿意为极致荒野体验牺牲城市便利，接受高风险和高不确定性...',
  userFacing: '这是一条以极致荒野体验为主线的F路穿越路线，而不是舒适的城市打卡路线...',
  philosophy: '从文明进入高地，再回到人间'
}
```

**决策影响**:
- 📖 **用户教育**: 向用户解释路线本质
- 📖 **决策解释**: 帮助AI解释为什么做出某些决策
- 📖 **期望设置**: 设置正确的用户期望

---

## 二、决策策略阶段

### 2.1 三人格决策策略流程

**入口**: `StrategyOrchestrator.run()`

**流程**: Abu → Dr.Dre → Neptune

#### 2.1.1 Abu（合规检查者）

**职责**: 检查硬约束和合规性

**针对内陆高地F路的检查**:
- ✅ **车辆要求**: 必须是四驱SUV（法律要求）
- ✅ **季节性限制**: 仅夏季开放（6月中旬-9月中旬）
- ✅ **许可要求**: 检查是否需要特殊许可
- ✅ **风险等级**: 验证用户风险承受度是否匹配（必须是'high'）

**决策结果**:
- ✅ **ALLOW**: 如果所有硬约束满足
- ❌ **REJECT**: 如果违反硬约束（如非四驱车、冬季进入等）

#### 2.1.2 Dr.Dre（节奏优化者）

**职责**: 优化行程节奏和体验

**针对内陆高地F路的优化**:
- ⚡ **节奏调整**: 根据用户pace偏好调整每日行程强度
- ⚡ **缓冲时间**: 为极端路况和天气变化预留缓冲时间
- ⚡ **体验平衡**: 平衡"高地荒原"、"温泉"、"火山"体验
- ⚡ **疲劳管理**: 考虑failureProfile中的常见失败日期（第3、4天）

**决策结果**:
- ✅ **ALLOW + 优化建议**: 如果节奏可以优化
- ✅ **ALLOW**: 如果节奏已经合理

#### 2.1.3 Neptune（空间修复者）⭐

**职责**: 修复空间问题，守护路线哲学

**针对内陆高地F路的关键决策**:

##### 2.1.3.1 空间问题检测

**检测内容**:
- 🗺️ **POI不可达**: 检查POI是否在corridorGeom范围内
- 🗺️ **路线冲突**: 检查路线段是否有冲突
- 🗺️ **DEM违规**: 检查是否违反DEM证据（爬升、坡度限制）

**使用corridorGeom**:
- 从RouteDirection的corridorGeom提取路线走廊
- 验证所有POI和路线段是否在走廊范围内
- 如果超出范围，标记为空间问题

##### 2.1.3.2 哲学约束验证

**验证内容**:
- ✅ **mustVisitTags检查**: 确保行程包含"高地荒原"、"温泉"、"火山"
- ✅ **nonNegotiableRules检查**: 不允许违反4条红线
- ✅ **核心体验覆盖**: 检查是否仍然覆盖核心体验

**使用philosophy**:
```typescript
// 验证替换操作是否违反路线哲学
const validation = validateReplacementAgainstPhilosophy(replacement, philosophy);
if (!validation.allowed) {
  // 拒绝替换，保持原计划
  return { allowed: false, reason: validation.violations };
}

// 检查核心体验是否仍然覆盖
const coverage = checkCoreExperienceCoverage(currentTags, philosophy);
if (!coverage.covered) {
  // 需要补充缺失的体验
  return { allowed: false, reason: `缺失体验: ${coverage.missingTags.join(', ')}` };
}
```

##### 2.1.3.3 空间修复（REPLACE操作）

**修复策略**:
- 🔧 **替换POI**: 如果POI不可达，在corridorGeom范围内寻找替代POI
- 🔧 **替换路线段**: 如果路线段有冲突，替换为替代路线段
- 🔧 **保持哲学**: 确保替换后仍然满足philosophy要求

**约束条件**:
- ✅ 替换点必须在corridorGeom缓冲范围内
- ✅ 替换后必须仍然覆盖mustVisitTags
- ✅ 替换后不能违反nonNegotiableRules
- ✅ 替换后必须仍然在regions指定的区域内

##### 2.1.3.4 失败预防

**使用failureProfile**:
- ⚠️ **第3天加强检查**: 检查Sprengisandur (F26) 河流穿越风险
- ⚠️ **第4天加强检查**: 检查Askja火山区域天气风险
- ⚠️ **提前建议**: 在第2、3天提供缓解措施建议

**决策逻辑**:
```typescript
// 检查是否在常见失败日期
if (failureProfile.commonFailureDays.includes(currentDay)) {
  // 加强风险检查
  const riskLevel = assessRiskLevel(currentDay, failureProfile);
  if (riskLevel === 'HIGH') {
    // 提供缓解措施
    return {
      allowed: true,
      warnings: [failureProfile.failureScenarios.find(s => s.day === currentDay)?.mitigation]
    };
  }
}
```

**决策结果**:
- ✅ **ALLOW + 修复**: 如果空间问题已修复
- ✅ **ALLOW**: 如果没有空间问题
- ❌ **REJECT**: 如果违反哲学约束且无法修复

---

## 三、具体决策场景

### 场景1: 用户画像匹配

**输入**: 用户风险承受度='low'，无四驱车驾驶经验

**决策流程**:
1. **AntiPersona检查**: 匹配到"低风险偏好"和"无四驱车驾驶经验"
2. **Abu检查**: 验证车辆要求（必须是四驱SUV）
3. **决策结果**: ❌ **REJECT** - 不适合此路线

**系统响应**:
- 拒绝推荐内陆高地F路
- 推荐替代路线（如"黄金圈经典环线"）
- 解释原因：不符合antiPersona要求

### 场景2: DEM证据生成

**输入**: 计划生成阶段（无trip），routeDirectionId='8afd4b2e-7dd1-4837-8169-d3efed748138'

**决策流程**:
1. **优先级1检查**: 无trip，跳过
2. **优先级2执行**: 从corridorGeom生成DEM证据
   - 提取corridorGeom（10个点，997.4km）
   - 使用DEMEffortMetadataService计算：
     - 累计爬升
     - 最大坡度
     - 疲劳指数
     - 3天滚动累计爬升
3. **决策结果**: ✅ **成功生成DEM证据**

**系统响应**:
- 生成基础DEM证据
- 标记`physicalRealityIncomplete = false`
- 提供DEM数据用于后续决策

### 场景3: 哲学约束验证

**输入**: 用户尝试删除"Landmannalaugar"（高地荒原体验）

**决策流程**:
1. **Neptune检查**: 验证替换操作
2. **mustVisitTags检查**: "Landmannalaugar"属于"高地荒原"体验
3. **哲学验证**: 删除"高地荒原"违反mustVisitTags
4. **决策结果**: ❌ **REJECT** - 违反路线哲学

**系统响应**:
- 拒绝删除"Landmannalaugar"
- 解释原因：违反路线哲学（必须体验"高地荒原"）
- 建议：可以替换为其他"高地荒原"体验的POI

### 场景4: 空间问题修复

**输入**: POI"Askja"不在corridorGeom范围内

**决策流程**:
1. **Neptune检测**: 发现空间问题（POI超出corridorGeom范围）
2. **空间修复**: 在corridorGeom范围内寻找替代POI
3. **哲学验证**: 确保替代POI仍然满足philosophy要求
4. **决策结果**: ✅ **ALLOW + 修复** - 替换为corridorGeom范围内的替代POI

**系统响应**:
- 替换POI为corridorGeom范围内的替代点
- 确保仍然覆盖"火山"体验（mustVisitTags）
- 记录修复日志

### 场景5: 失败预防

**输入**: 第3天行程，Sprengisandur (F26) 河流穿越

**决策流程**:
1. **FailureProfile检查**: 第3天是常见失败日期
2. **风险评估**: 检查河流穿越风险（logistics类型）
3. **缓解措施**: 提供failureProfile中的缓解建议
4. **决策结果**: ✅ **ALLOW + 警告** - 允许但提供风险提示

**系统响应**:
- 允许第3天行程
- 添加警告：Sprengisandur (F26) 河流穿越风险
- 提供缓解措施：建议跟随有经验的向导或参加F路穿越团
- 建议携带拖车绳和卫星通信设备

---

## 四、决策数据流

### 4.1 数据输入

```
用户请求
  ↓
WorldBuildContextSkill
  ├─ countryCode: 'IS'
  ├─ season: 7 (7月)
  ├─ routeDirectionId: '8afd4b2e-7dd1-4837-8169-d3efed748138'
  └─ partyProfile: { riskTolerance: 'high', ... }
```

### 4.2 世界模型构建

```
WorldModelContext
  ├─ PhysicalRealityModel
  │   ├─ demEvidence: [基于corridorGeom生成]
  │   ├─ roadStates: [从iceland-road-status.json加载]
  │   └─ hazardZones: []
  ├─ HumanCapabilityModel
  │   ├─ maxDailyAscentM: 根据fitness计算
  │   ├─ riskTolerance: 'high'
  │   └─ preferredPace: 根据pace计算
  └─ RouteDirection
      ├─ philosophy: { coreStatement, mustVisitTags, ... }
      ├─ failureProfile: { commonFailureDays, failureScenarios, ... }
      ├─ antiPersona: [...]
      ├─ narrative: { internal, userFacing, ... }
      └─ corridorGeom: LINESTRING(10 points)
```

### 4.3 决策流程

```
StrategyOrchestrator
  ↓
Abu (合规检查)
  ├─ 检查车辆要求 ✅
  ├─ 检查季节性限制 ✅
  └─ 检查风险承受度 ✅
  ↓
Dr.Dre (节奏优化)
  ├─ 优化行程节奏 ⚡
  ├─ 添加缓冲时间 ⚡
  └─ 平衡体验 ⚡
  ↓
Neptune (空间修复)
  ├─ 检测空间问题 🗺️
  ├─ 验证哲学约束 ✅
  ├─ 执行空间修复 🔧
  └─ 失败预防 ⚠️
  ↓
最终决策结果
```

---

## 五、关键决策点总结

### 5.1 世界模型构建决策点

| 决策点 | 输入 | 决策逻辑 | 输出 |
|--------|------|----------|------|
| **DEM证据生成** | corridorGeom | 三级降级策略 | DEM证据或占位符 |
| **道路状态加载** | countryCode='IS' | 加载iceland-road-status.json | F路状态数据 |
| **用户画像匹配** | partyProfile | antiPersona过滤 | 是否适合路线 |
| **路线哲学提取** | RouteDirection | 从metadata.philosophy提取 | RoutePhilosophy对象 |

### 5.2 决策策略决策点

| 决策点 | 输入 | 决策逻辑 | 输出 |
|--------|------|----------|------|
| **合规检查** | WorldModelContext | Abu检查硬约束 | ALLOW/REJECT |
| **节奏优化** | RoutePlanDraft | Dr.Dre优化节奏 | ALLOW + 优化建议 |
| **空间修复** | 空间问题 + philosophy | Neptune修复 + 哲学验证 | ALLOW + 修复/REJECT |
| **失败预防** | failureProfile + 当前日期 | 检查常见失败日期 | ALLOW + 警告 |

---

## 六、系统决策优势

### 6.1 数据驱动

- ✅ **基于corridorGeom**: 使用实际路线几何生成DEM证据
- ✅ **基于failureProfile**: 提前识别和预防典型失败场景
- ✅ **基于philosophy**: 确保行程符合路线本质

### 6.2 安全优先

- ✅ **硬约束检查**: Abu确保不违反法律和安全要求
- ✅ **用户过滤**: antiPersona防止误推荐给不适合的用户
- ✅ **失败预防**: failureProfile提供针对性的风险提示

### 6.3 哲学守护

- ✅ **mustVisitTags保护**: 确保核心体验不被删除
- ✅ **nonNegotiableRules保护**: 不允许违反路线红线
- ✅ **灵活调整**: 在flexibleParts范围内允许优化

---

## 七、相关代码文件

### 7.1 世界模型构建

- `src/skills/world/world-build-context.skill.ts`: 世界模型构建核心逻辑
- `src/trips/decision/models/physical-reality.model.ts`: PhysicalRealityModel定义
- `src/trips/decision/models/human-capability.model.ts`: HumanCapabilityModel定义

### 7.2 决策策略

- `src/trips/decision/strategies/neptune-strategy.service.ts`: Neptune策略实现
- `src/trips/decision/services/spatial-replacement.service.ts`: 空间修复服务
- `src/trips/decision/services/strategy-orchestrator.service.ts`: 策略编排器

### 7.3 路线哲学

- `src/trips/decision/models/route-philosophy.model.ts`: RoutePhilosophy模型
- `src/route-directions/interfaces/route-direction.interface.ts`: RouteDirection接口

---

## 八、总结

针对**内陆高地F路**，系统通过**三段式世界模型**和**三人格决策策略**，实现了：

1. ✅ **数据驱动的决策**: 基于corridorGeom、failureProfile、philosophy等数据
2. ✅ **安全优先的保障**: 通过Abu和antiPersona确保用户安全
3. ✅ **哲学守护的约束**: 通过Neptune确保行程符合路线本质
4. ✅ **失败预防的机制**: 通过failureProfile提前识别和预防风险

**系统决策流程**:
```
用户请求 → 世界模型构建 → 三人格决策 → 最终行程
           (Physical + Human + RouteDirection)
           (Abu → Dr.Dre → Neptune)
```

**关键决策依据**:
- corridorGeom: DEM证据生成、空间验证
- philosophy: 哲学约束、体验保护
- failureProfile: 失败预防、风险提示
- antiPersona: 用户过滤、风险控制

---

**文档生成时间**: 2026-02-10  
**下次更新**: 功能更新后
