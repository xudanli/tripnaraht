# Planner - Decision Node 拆解 Agent

## 架构定位

**所属层级**：Decision Orchestration Layer（决策编排层）

Planner 负责将用户请求拆解为 **Decision Node 树**，识别约束系统、偏好系统和权衡点。这是 TripNARA 决策系统的入口，将模糊的用户意图转化为可执行的决策结构。

> **核心理念**：不是"规划行程"，而是"构建决策树"

**项目实现位置**：
- 服务：`src/trips/decision/orchestration/planner-agent.service.ts`
- 接口：`src/trips/decision/orchestration/langgraph-orchestrator.interface.ts`

---

## 核心职责

### 1. Decision Node 拆解

将用户请求拆解为结构化的 Decision Node：

```typescript
interface DecisionNode {
  nodeId: string;
  nodeType: 'ROOT' | 'ROUTE' | 'POI' | 'TRANSPORT' | 'TIMING' | 'BUDGET';
  context: WorldState;           // 世界状态
  constraints: HardConstraint[]; // 硬约束
  preferences: SoftPreference[]; // 软偏好
  options: Option[];             // 候选方案
  tradeOff: TradeOffModel;       // 权衡逻辑
  dependencies: string[];        // 依赖的其他 Node
  confidence: number;            // 置信度
}
```

### 2. 约束系统识别

区分 Hard Constraints 和 Soft Preferences：

| 类型 | 定义 | 示例 |
|------|------|------|
| **Hard Constraint** | 违反则方案无效 | 签证、航班、封路、体力极限 |
| **Soft Preference** | 可权衡妥协 | 风景优先、预算敏感、舒适度 |

### 3. 缺口（Gap）识别

识别决策所需但缺失的信息：

```typescript
interface DecisionGap {
  gapId: string;
  gapType: 'DATA_MISSING' | 'CONSTRAINT_CONFLICT' | 'PREFERENCE_UNCLEAR' | 'UNCERTAINTY_HIGH';
  severity: 'BLOCKING' | 'DEGRADING' | 'ACCEPTABLE';
  affectedNodes: string[];
  resolutionStrategy: string;
}
```

### 4. 候选方案结构设计

设计多个候选方案的框架（Plan A/B/C）：

```typescript
interface CandidateStructure {
  structureId: string;
  approach: 'OPTIMAL_EXPERIENCE' | 'SAFE_CONSERVATIVE' | 'BUDGET_OPTIMIZED';
  riskProfile: {
    overallRisk: number;  // 0..1
    riskFactors: string[];
  };
  tradeOffSummary: string;  // "高体验 vs 高风险"
  estimatedConfidence: number;
}
```

---

## 输入/输出 Schema

### 输入：PlannerInput

```typescript
{
  request_id: string;
  raw_request: {
    origin: string | { lat: number; lng: number };
    destination: string | { lat: number; lng: number };
    dateRange?: { start: string; end: string };
    party?: { adults: number; children: number; fitness_level: string };
    preferences?: Record<string, any>;
    constraints?: Record<string, any>;
  };
  world_context?: {
    weather_forecast?: WeatherData[];
    road_conditions?: RoadCondition[];
    current_prices?: PriceData[];
  };
}
```

### 输出：PlannerOutput

```typescript
{
  request_id: string;
  
  // 核心：Decision Node 树
  decision_tree: {
    root: DecisionNode;
    nodes: Map<string, DecisionNode>;
    edges: Array<{ from: string; to: string; relationship: string }>;
  };
  
  // 约束系统
  constraint_system: {
    hard_constraints: Array<{
      constraint_id: string;
      type: 'REACHABILITY' | 'SAFETY' | 'TIME' | 'LEGAL' | 'PHYSICAL';
      description: string;
      source: 'USER_EXPLICIT' | 'WORLD_MODEL' | 'INFERRED';
      violation_consequence: string;
    }>;
    soft_preferences: Array<{
      preference_id: string;
      type: 'SCENIC' | 'EFFICIENCY' | 'COMFORT' | 'COST' | 'ADVENTURE';
      weight: number;  // 0..1
      tradeoff_willing: string;  // 用户愿意用什么交换
    }>;
  };
  
  // 缺口清单
  gaps: DecisionGap[];
  
  // 候选方案结构
  candidate_structures: CandidateStructure[];
  
  // 需要用户判断的点
  user_judgment_required: Array<{
    question_id: string;
    question: string;  // "你更讨厌哪种失败？"
    options: string[];
    impact: string;    // 回答会影响什么
  }>;
  
  // 假设清单
  assumptions: Array<{
    assumption_id: string;
    assumption_text: string;
    needs_verification: boolean;
    default_if_unverified: string;
  }>;
}
```

---

## Decision Node 拆解规则

### 层级结构

```
ROOT（整体旅行决策）
├── ROUTE（路线决策）
│   ├── SEGMENT_1（路段决策）
│   └── SEGMENT_2（路段决策）
├── POI（景点决策）
│   ├── MUST_VISIT（必去）
│   └── NICE_TO_HAVE（可选）
├── TRANSPORT（交通决策）
│   ├── MODE（交通方式）
│   └── SCHEDULE（班次选择）
├── TIMING（时间决策）
│   ├── DAILY_PACE（每日节奏）
│   └── BUFFER（缓冲时间）
└── BUDGET（预算决策）
    ├── ACCOMMODATION（住宿）
    └── ACTIVITIES（活动）
```

### 约束传播规则

1. **向下传播**：父节点的约束传递给子节点
2. **向上聚合**：子节点的不确定性聚合到父节点
3. **横向冲突**：同层节点的约束可能冲突，需标记

---

## 工作流程

### 步骤 1: 请求解析与意图识别

1. 解析原始请求，提取显式信息
2. 识别隐含意图（"轻松"→低疲劳约束）
3. 标记不确定/模糊的部分

### 步骤 2: 约束系统构建

1. 识别 Hard Constraints：
   - 用户显式声明的硬约束
   - 世界模型推导的硬约束（封路、天气）
   - 物理规律硬约束（体力、时间）
2. 识别 Soft Preferences：
   - 用户偏好（风景、效率、舒适）
   - 权衡意愿（愿意牺牲什么）

### 步骤 3: Decision Node 树构建

1. 创建 ROOT 节点
2. 递归拆解子决策
3. 建立节点间依赖关系
4. 标记每个节点的置信度

### 步骤 4: 缺口识别

1. 遍历每个 Decision Node
2. 检查所需数据是否完整
3. 识别约束冲突
4. 评估不确定性级别

### 步骤 5: 候选方案结构设计

设计至少 3 个候选方案框架：

| 方案 | 定位 | 风险档位 | 目标用户 |
|------|------|----------|----------|
| Plan A | 最优体验 | 高（30%） | 愿意冒险换体验 |
| Plan B | 平衡方案 | 中（15%） | 默认推荐 |
| Plan C | 保底方案 | 低（5%） | 极度风险厌恶 |

### 步骤 6: 用户判断点识别

识别需要用户做出判断（而非输入）的点：

```
✅ "你更讨厌哪种失败：错过景点 vs 行程太赶？"
✅ "你愿意为确定性牺牲多少体验？"
❌ "请输入你的预算"（传统表单思维）
```

---

## 输出要求

1. **必须输出**：Decision Node 树、约束系统、缺口清单、候选方案结构
2. **必须区分**：Hard Constraints vs Soft Preferences
3. **必须标注**：所有假设和不确定性
4. **必须设计**：至少 3 个不同风险档位的候选方案

---

## 限制条件

1. **不允许跳过约束识别**：必须明确区分硬约束和软偏好
2. **不允许单一方案**：必须提供多个风险档位的选择
3. **不允许忽略不确定性**：每个节点必须有置信度标注
4. **不允许传统表单思维**：用户判断点必须是"选择题"而非"填空题"

---

## 允许调用的 Skills

- `intent.parse` - 意图解析
- `constraints.normalize` - 约束规范化
- `constraints.detectConflicts` - 约束冲突检测
- `scope.guard` - 范围检查
- `world.queryState` - 查询世界状态

---

## 与其他 Agent 的协作

| 后继 Agent | 传递内容 |
|------------|----------|
| **Gatekeeper** | 约束系统 → 门控检查 |
| **CoreDecision** | 候选方案结构 → 权衡评估 |
| **Domain Agents** | 缺口清单 → 数据获取 |

---

## Claude 快捷唤起

```
作为 TripNARA 的 Planner，请拆解这个旅行请求：
[用户请求]

要求：
1. 构建 Decision Node 树
2. 区分 Hard Constraints 和 Soft Preferences
3. 识别数据缺口和不确定性
4. 设计 Plan A/B/C 三个风险档位的候选方案
5. 识别需要用户判断（而非填写）的点
```
