# 规划工作台 API 接口文档

## 概述

规划工作台是"做决策与做取舍的地方"，面向用户只显示"三人格"（Abu/Dr.Dre/Neptune）作为可解释与信任的"人格外壳"，其他角色（预算/交通/节奏/总规划师）都隐藏成能力模块。

## 基础信息

- **Base URL**: `/api/planning-workbench`
- **认证**: 当前为公开接口（`@Public()`），生产环境可能需要认证
- **Content-Type**: `application/json`

---

## API 接口列表

### 1. 执行规划工作台流程

**接口**: `POST /api/planning-workbench/execute`

**描述**: 规划工作台的主入口，支持生成方案、对比方案、提交方案、调整方案等操作。

**请求参数**:

```typescript
{
  context: {
    destination: {
      country?: string;      // 国家代码（如 "JP", "IS"）
      city?: string;         // 城市名称
      region?: string;       // 区域名称
    };
    days: number;            // 行程天数（必填）
    travelMode?: 'self_drive' | 'public_transit' | 'walking' | 'mixed';  // 交通模式
    mustDo?: string[];       // 必去地点/活动
    mustAvoid?: string[];    // 必避地点/活动
    constraints?: {
      budget?: {
        total?: number;      // 总预算
        currency?: string;  // 货币单位（默认 "CNY"）
      };
      fitness?: {
        level?: 'low' | 'medium' | 'high';  // 体力水平
        maxDailyAscentM?: number;           // 最大日爬升（米）
        maxDailyDistanceKm?: number;        // 最大日距离（公里）
        restDayFrequency?: number;          // 休息日频率（每 N 天一个休息日）
      };
      accommodation?: {
        level?: 'budget' | 'mid' | 'luxury';  // 住宿档位
        type?: string[];                       // 住宿类型
      };
      companions?: {
        count?: number;      // 同伴数量
        ages?: number[];     // 同伴年龄
        specialNeeds?: string[];  // 特殊需求
      };
    };
  };
  tripId?: string;           // 行程 ID（可选，用于关联现有行程）
  existingPlanState?: any;   // 现有 PlanState（可选，用于增量更新）
  userAction?: 'generate' | 'compare' | 'commit' | 'adjust';  // 用户操作
}
```

**请求示例**:

```json
{
  "context": {
    "destination": {
      "country": "JP",
      "city": "Tokyo"
    },
    "days": 5,
    "travelMode": "public_transit",
    "mustDo": ["浅草寺", "东京塔"],
    "constraints": {
      "budget": {
        "total": 10000,
        "currency": "CNY"
      },
      "fitness": {
        "level": "medium"
      },
      "accommodation": {
        "level": "mid"
      }
    }
  },
  "tripId": "trip-123",
  "userAction": "generate"
}
```

**响应结构**:

```typescript
{
  success: boolean;
  data: {
    planState: {
      plan_id: string;
      plan_version: number;
      constraints: any;
      itinerary: any;
      mobility: any;
      budget: any;
      pace: any;
      gate: any;
      evidence_refs: any[];
      decision_log_refs: any[];
      status: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
    };
    uiOutput: {
      // 面向用户：三人格输出
      personas: {
        abu: {
          persona: 'ABU';
          icon: '🐻‍❄️';
          slogan: '我负责：这条路，真的能走吗？';
          verdict: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
          explanation: string;  // 面向用户的解释（第一人称）
          evidence: Array<{
            source: string;
            excerpt: string;
            relevance: string;
          }>;
          recommendations?: Array<{
            action: string;
            reason: string;
            impact: string;
          }>;
          confirmations?: string[];
        } | null;
        drdre: {
          persona: 'DR_DRE';
          icon: '🐕';
          slogan: '别太累，我会让每一天刚刚好。';
          verdict: 'ALLOW' | 'ADJUST' | 'NEED_CONFIRM';
          explanation: string;
          evidence: any[];
          recommendations?: any[];
        } | null;
        neptune: {
          persona: 'NEPTUNE';
          icon: '🦦';
          slogan: '如果行不通，我会给你一个刚刚好的替代。';
          verdict: 'ALLOW' | 'REPLACE' | 'NEED_CONFIRM';
          explanation: string;
          evidence: any[];
          recommendations?: any[];
        } | null;
      };
      consolidatedDecision: {
        status: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
        summary: string;
        nextSteps: string[];
      };
      timestamp: string;
    };
  };
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "planState": {
      "plan_id": "plan_1234567890",
      "plan_version": 1,
      "status": "PROPOSED",
      "constraints": { ... },
      "itinerary": { ... },
      "mobility": { ... },
      "budget": { ... },
      "pace": { ... },
      "gate": { ... }
    },
    "uiOutput": {
      "personas": {
        "abu": {
          "persona": "ABU",
          "icon": "🐻‍❄️",
          "slogan": "我负责：这条路，真的能走吗？",
          "verdict": "ALLOW",
          "explanation": "经过安全检查，当前方案在物理现实和合规性方面没有问题。我负责把你带去安全地带，这条路可以走。",
          "evidence": [
            {
              "source": "预算分析",
              "excerpt": "交通类目正常",
              "relevance": "预算检查通过"
            }
          ]
        },
        "drdre": {
          "persona": "DR_DRE",
          "icon": "🐕",
          "slogan": "别太累，我会让每一天刚刚好。",
          "verdict": "ALLOW",
          "explanation": "当前节奏合理，每一天都刚刚好，体验稳定。",
          "evidence": []
        },
        "neptune": {
          "persona": "NEPTUNE",
          "icon": "🦦",
          "slogan": "如果行不通，我会给你一个刚刚好的替代。",
          "verdict": "ALLOW",
          "explanation": "当前方案在空间和路线哲学方面没有问题，所有路段都可行。",
          "evidence": []
        }
      },
      "consolidatedDecision": {
        "status": "ALLOW",
        "summary": "三人格一致通过，方案可行。",
        "nextSteps": [
          "查看完整的行程详情",
          "确认并锁定方案"
        ]
      },
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

---

### 2. 获取规划状态

**接口**: `GET /api/planning-workbench/state/:planId`

**描述**: 根据 planId 获取当前的 PlanState（待实现）。

**路径参数**:
- `planId` (string): 规划 ID

**响应**: 待实现

---

## 错误响应

所有接口在出错时返回统一格式：

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "错误描述"
  }
}
```

**错误码**:
- `INTERNAL_ERROR`: 服务器内部错误
- `BAD_REQUEST`: 请求参数无效
- `NOT_FOUND`: 资源不存在
- `UNAUTHORIZED`: 未授权（如果启用认证）

---

## 前端集成指南

### 1. 调用规划工作台

```typescript
// 示例：生成行程骨架方案
const response = await fetch('/api/planning-workbench/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    context: {
      destination: {
        country: 'JP',
        city: 'Tokyo',
      },
      days: 5,
      travelMode: 'public_transit',
      constraints: {
        budget: {
          total: 10000,
          currency: 'CNY',
        },
      },
    },
    userAction: 'generate',
  }),
});

const result = await response.json();
if (result.success) {
  const { personas, consolidatedDecision } = result.data.uiOutput;
  
  // 显示三人格的决策结果
  console.log('Abu:', personas.abu);
  console.log('Dr.Dre:', personas.drdre);
  console.log('Neptune:', personas.neptune);
  console.log('综合决策:', consolidatedDecision);
}
```

### 2. UI 展示建议

#### 三人格卡片展示

```tsx
// React 示例
function PersonaCard({ persona }) {
  if (!persona) return null;
  
  return (
    <div className="persona-card">
      <div className="persona-header">
        <span className="persona-icon">{persona.icon}</span>
        <h3>{persona.persona}</h3>
        <p className="slogan">{persona.slogan}</p>
      </div>
      <div className={`verdict verdict-${persona.verdict.toLowerCase()}`}>
        {persona.verdict}
      </div>
      <div className="explanation">
        {persona.explanation}
      </div>
      {persona.evidence && persona.evidence.length > 0 && (
        <div className="evidence">
          <h4>证据：</h4>
          {persona.evidence.map((e, i) => (
            <div key={i}>
              <strong>{e.source}:</strong> {e.excerpt}
            </div>
          ))}
        </div>
      )}
      {persona.recommendations && persona.recommendations.length > 0 && (
        <div className="recommendations">
          <h4>建议：</h4>
          {persona.recommendations.map((r, i) => (
            <div key={i}>
              <strong>{r.action}:</strong> {r.reason} ({r.impact})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanningWorkbench() {
  const [result, setResult] = useState(null);
  
  // ... 调用 API ...
  
  return (
    <div className="planning-workbench">
      <div className="personas">
        <PersonaCard persona={result?.uiOutput.personas.abu} />
        <PersonaCard persona={result?.uiOutput.personas.drdre} />
        <PersonaCard persona={result?.uiOutput.personas.neptune} />
      </div>
      <div className="consolidated-decision">
        <h3>综合决策</h3>
        <p>{result?.uiOutput.consolidatedDecision.summary}</p>
        <ul>
          {result?.uiOutput.consolidatedDecision.nextSteps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

---

## 改动说明

### 新增文件

1. **`src/agent/planning-workbench.controller.ts`**
   - 规划工作台的 API Controller
   - 提供 `POST /api/planning-workbench/execute` 接口

2. **`src/agent/services/persona-shell.service.ts`**
   - 人格外壳服务
   - 将底层能力模块的结果包装成三人格输出

3. **`src/agent/services/planning-workbench-agent.service.ts`**
   - 规划工作台 Agent 服务
   - 编排所有规划技能

4. **`src/skills/plan/**`**
   - 17 个规划技能（architect/budget/transit/pace/gate/evidence/constraints/log）

### 修改文件

1. **`src/agent/agent.module.ts`**
   - 注册 `PlanningWorkbenchController`
   - 注册 `PersonaShellService` 和 `PlanningWorkbenchAgentService`

2. **`src/skills/skills.module.ts`**
   - 注册所有规划技能
   - 添加 `LlmModule` 导入

### 接口变更

**新增接口**:
- `POST /api/planning-workbench/execute` - 执行规划工作台流程
- `GET /api/planning-workbench/state/:planId` - 获取规划状态（待实现）

**无破坏性变更**: 所有新接口都是新增的，不影响现有接口。

---

## 注意事项

1. **认证**: 当前接口为公开接口（`@Public()`），生产环境可能需要添加认证
2. **存储**: PlanState 的持久化存储尚未实现，需要后续添加
3. **执行阶段 Agent**: 执行阶段的 Agent 尚未创建，需要后续实现
4. **行程详情页 Agent**: 行程详情页的 Agent 尚未创建，需要后续实现

---

## 后续工作

1. **执行阶段 Agent** (`skill.exec.*`)
   - 实现执行阶段的技能（提醒、变更处理、兜底）
   - 创建 `ExecutionAgentService`

2. **行程详情页 Agent** (`skill.detail.*`)
   - 实现行程详情页的技能（理解与掌控旅行现状）
   - 创建 `TripDetailAgentService`

3. **PlanState 持久化**
   - 实现 PlanState 的数据库存储
   - 实现版本管理和 diff 追踪

4. **API 完善**
   - 实现 `GET /api/planning-workbench/state/:planId`
   - 添加更多规划工作台相关接口
