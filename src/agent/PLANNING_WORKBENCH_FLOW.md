# 规划工作台方案生成逻辑流程

## 概述

规划工作台（Planning Workbench）是 TripNARA 的核心规划引擎，负责从用户需求生成完整的行程方案。本文档详细描述了方案生成的完整流程。

## 入口点

**API端点**: `POST /api/planning-workbench/execute`

**请求参数**:
```typescript
{
  tripId?: string;              // 行程ID（可选）
  context: PlanContext;         // 规划上下文
  userAction?: 'generate' | 'compare' | 'commit' | 'adjust';
  existingPlanState?: PlanState; // 现有方案状态（可选）
}
```

## 完整流程

### 阶段 0: 初始化

1. **创建/获取 TripRun 记录**
   - 如果存在 `tripRunId`，复用现有记录
   - 否则创建新的 TripRun 记录（用于追踪规划过程）

2. **创建初始 PlanState**
   ```typescript
   {
     plan_id: `plan_${Date.now()}`,
     plan_version: 1,
     itinerary: {
       tripId: request.tripId || `trip_${Date.now()}`,
       routeDirectionId: `route_${Date.now()}`,
       segments: []  // 初始为空
     },
     constraints: { ... },
     mobility: { transferSegments: [] },
     budget: {},
     pace: {},
     gate: { status: 'NEED_CONFIRM' },
     status: 'DRAFT'
   }
   ```

### 阶段 1: 构建世界模型上下文（可选）

**条件**: 如果提供了 `tripId` 且 `contextBuild` 技能可用

**执行**:
- 调用 `world.buildContext` 技能
- 构建包含以下信息的世界模型：
  - 路线方向（RouteDirection）
  - 物理环境（地形、天气、路况）
  - 合规证据（签证、安全等）
- **超时保护**: 10秒超时，失败不影响主流程

### 阶段 2: 生成骨架方案（核心）

根据 `userAction` 执行不同流程：

#### 2.1 用户操作: `generate` 或 `default`

**执行步骤**:

1. **创建 TripAttempt 记录**（用于追踪本次生成尝试）

2. **调用骨架生成技能**: `plan.architect.generateSkeleton`

   **技能内部流程**:
   
   a. **构建世界模型上下文**（如果需要）
      - 如果未提供 `world`，调用 `world.buildContext`
   
   b. **构建 LLM Prompt**
      ```
      你是一位经验丰富的旅行规划师（Trip Architect）。
      任务：基于用户的目标和约束，生成 2-3 套不同的行程骨架方案。
      
      每套方案必须包含：
      1. 每天的主题和描述（description 请控制在 50 字以内）
      2. 关键锚点（必须去的城市/活动）
      3. 移动日安排
      4. 清晰的取舍理由（tradeoffs/strengths/weaknesses 每个条目控制在 30 字以内）
      
      方案类型：
      - 紧凑型：最大化体验密度，适合时间有限但想多看多体验的用户
      - 均衡型：平衡体验和休息，适合大多数用户
      - 松弛型：节奏较慢，适合注重深度体验和休息的用户
      ```
   
   c. **调用 LLM（Claude Anthropic）**
      - Provider: `ANTHROPIC`
      - Schema: 定义骨架方案的JSON结构
      - 超时: 长行程（>7天）90秒，短行程60秒
      - max_tokens: 动态计算（基于prompt长度和schema复杂度，最高8192）
   
   d. **解析 LLM 响应**
      - 移除 markdown 代码块标记（```json）
      - 尝试修复不完整的JSON（自动关闭未闭合的括号）
      - 如果解析失败，返回默认方案
   
   e. **补充 POI 信息**（关键步骤）
      
      **优先级策略**:
      1. **优先使用当前行程的POI**（如果提供了 `tripId`）
         - 查询 Trip → TripDay → ItineraryItem → Place
         - 按天组织POI：
           - 住宿（HOTEL 或 REST 类型）
           - 餐厅（RESTAURANT 或 MEAL_* 类型，按时间推断早/午/晚）
           - 景点（ATTRACTION 或 ACTIVITY 类型）
         - 提取坐标信息（PostGIS查询）
      
      2. **从 Place 表查询补充**（如果行程中没有POI）
         - 根据国家代码查询
         - 根据主题、描述、锚点提取搜索关键词
         - 查询各类别POI：
           - 住宿：每天1个（评分最高）
           - 餐厅：每天2-3个（早餐、午餐、晚餐）
           - 景点：每天2-5个（评分最高）
      
      **POI数据结构**:
      ```typescript
      {
        placeId: number;
        placeUuid: string;
        nameCN: string;
        nameEN?: string;
        category: 'ATTRACTION' | 'RESTAURANT' | 'HOTEL' | ...;
        address?: string;
        rating?: number;
        description?: string;
        coordinates?: { lat: number; lng: number };
        metadata?: Record<string, any>;
      }
      ```
   
   f. **返回骨架方案集**
      ```typescript
      {
        skeletonSet: {
          options: PlanSkeleton[];  // 2-3个方案
          recommendation: {
            optionId: string;
            reason: string;
          }
        },
        evidence: []
      }
      ```

3. **转换骨架方案为 Segments**

   - 选择推荐的方案（或第一个方案）
   - 将 `dayThemes` 转换为 `RouteSegment[]`
   - **关键**: 将POI信息添加到每个segment的metadata中
   
   ```typescript
   planState.itinerary.segments = dayThemes.map(theme => ({
     segmentId: `day_${theme.day}_segment_1`,
     dayIndex: theme.day - 1,
     distanceKm: 0,      // 初始值，后续填充
     ascentM: 0,         // 初始值，后续由DEM服务填充
     slopePct: 0,         // 初始值
     metadata: {
       theme: theme.theme,
       description: theme.description,
       day: theme.day,
       skeletonId: recommendedOption.id,
       skeletonName: recommendedOption.name,
       // POI信息（如果有）
       accommodation?: SkeletonPoi,
       restaurants?: Array<{ meal: 'breakfast' | 'lunch' | 'dinner'; poi: SkeletonPoi }>,
       attractions?: SkeletonPoi[]
     }
   }))
   ```

4. **更新 TripAttempt 状态**
   - 成功: `COMPLETED`
   - 失败: `FAILED`

### 阶段 3: System 1 快速检查

**条件**: 如果 `planState.plan_id` 存在

**并行执行以下检查**（无依赖关系）:

1. **预算估算** (`plan.budget.estimateBaseline`)
   - 估算总预算和分类预算
   - 失败时使用默认预算拆分

2. **超支检测** (`plan.budget.detectOverrun`)
   - 检测是否超出预算约束

3. **构建可达图** (`plan.transit.buildTransferGraph`)
   - 构建城市间的交通可达性图

4. **计算时间窗** (`plan.pace.computeTimeWindows`)
   - 计算每天的时间窗口（考虑交通、活动时间）

5. **疲劳评分** (`plan.pace.fatigueScore`)
   - 评估行程的疲劳程度

6. **门控预检查** (`plan.gate.precheck`)
   - System 1 快速门控检查
   - 更新 `planState.gate.status`

7. **冲突检测** (`plan.constraints.detectConflicts`)
   - 检测约束冲突

### 阶段 4: System 2 深度评审（可选）

**条件**: 如果 `planState.gate.status === 'NEED_CONFIRM'`

**执行**: `plan.gate.runThreeGuardians`
- 运行三人格门控检查（ABU、DR_DRE、NEPTUNE）
- 生成需要用户确认的点
- 更新 `planState.gate` 状态

### 阶段 5: 计算健康度

**执行**: `computeHealth(planState)`
- 计算预算健康度
- 计算节奏健康度
- 计算门控健康度
- 返回综合健康度评分

### 阶段 6: 包装为三人格输出

**执行**: `personaShell.wrapAsPersonas(planState)`
- 将技术性的 PlanState 转换为用户友好的三人格输出
- 包含：
  - ABU（合规专家）的视角
  - DR_DRE（节奏专家）的视角
  - NEPTUNE（体验专家）的视角

### 阶段 7: 返回响应

**响应结构**:
```typescript
{
  planState: PlanState;           // 完整的方案状态
  uiOutput: {
    skeletonOptions?: PlanSkeletonSet;  // 骨架方案选项（供用户选择）
    comparison?: any;                   // 对比结果（如果执行了compare）
    personas?: PersonaShellOutput;      // 三人格输出
    health?: {                          // 健康度
      budget: 'healthy' | 'warning' | 'critical';
      pace: 'healthy' | 'warning' | 'critical';
      gate: 'healthy' | 'warning' | 'critical';
    };
    confirmations?: any[];              // 需要用户确认的点
  }
}
```

## 错误处理

### LLM调用失败
- **超时**: 返回默认骨架方案
- **解析失败**: 返回默认骨架方案
- **网络错误**: 返回默认骨架方案

### POI查询失败
- **不影响主流程**: 只记录警告日志
- **继续返回骨架方案**: 即使没有POI数据

### System 1检查失败
- **预算估算失败**: 使用默认预算拆分
- **其他检查失败**: 记录警告，继续执行

## 数据流

```
用户请求
  ↓
创建初始PlanState
  ↓
构建世界模型（可选）
  ↓
生成骨架方案（LLM）
  ↓
补充POI信息（当前行程 > Place表）
  ↓
转换为Segments（包含POI）
  ↓
System 1快速检查（预算、交通、节奏、门控）
  ↓
System 2深度评审（如果需要）
  ↓
计算健康度
  ↓
包装为三人格输出
  ↓
返回响应
```

## 关键设计决策

1. **POI优先级**: 当前行程POI > Place表查询
   - 确保方案与用户已有行程一致
   - 避免重复推荐

2. **容错性**: 所有步骤都有降级策略
   - LLM失败 → 默认方案
   - POI查询失败 → 继续执行（无POI数据）
   - System 1检查失败 → 使用默认值

3. **性能优化**:
   - System 1检查并行执行
   - POI查询批量处理
   - 超时保护防止阻塞

4. **数据完整性**:
   - 每个segment包含完整的POI信息（ID、名称、坐标等）
   - metadata包含骨架方案信息（便于追踪）

## 相关文件

- `src/agent/services/planning-workbench-agent.service.ts` - 主服务
- `src/skills/plan/architect/plan-architect-generate-skeleton.skill.ts` - 骨架生成技能
- `src/skills/plan/shared/plan-state.types.ts` - 类型定义
- `src/agent/planning-workbench.controller.ts` - API控制器
