# Skill: `itinerary.adaptive_replan` (Adaptive Replan Engine)

> **定位**：Decision OS 改排「大脑」—— 约束规划（CSP）+ 奥德赛人格对齐的动态决策引擎。  
> **不是** 简单 CRUD；**是** `ITINERARY_ADJUST` 编排内核的终极演进（承接 `itinerary.smart_update` 之上）。

---

## 0. 三层边界（必读）

```
┌─────────────────────────────────────────────────────────────────┐
│ 上层 · Consultation（长文咨询）                                    │
│  - 用户闲聊、目的地科普、签证/装备问答                               │
│  - 输出：自然语言回答；**不写** itinerary                           │
│  - 入口：GENERAL_PLAN / DATA_LOOKUP / compound follow-up          │
│  - ❌ 勿在此层做改排                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │ 识别到「改已有行程」意图
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 中层 · 工作台业务意图 · ITINERARY_ADJUST 编排图                     │
│  - intake → poi_selection → plan_gen → plan-verify-loop → narrate │
│  - 走廊插值、邻日锚点、auto-apply 双闸、itinerary_adjust_result    │
│  - **大脑调用点**：复杂改排走 itinerary.adaptive_replan             │
│  - 简单单点 CRUD **不走** 此图（见下层）                            │
└────────────────────────────┬────────────────────────────────────┘
                             │ 调用 Skill 层
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 下层 · 原子/组合 Skill                                            │
│  CRUD 原子：trip.deleteItem / trip.applyEdit(db)                  │
│  复合 CRUD：intake-itinerary-compound（删→改→增）                   │
│  校验闭环：itinerary.verify → repair.apply                         │
│  智能修补：itinerary.smart_update（verify+neptune+repair 编排）     │
│  自适应改排：itinerary.adaptive_replan（五阶段 CSP）                  │
│  体验策划：itinerary.experience_curator（感性脑：黄金时刻+感官+转场）   │
└─────────────────────────────────────────────────────────────────┘
```

### 路由决策表

| 用户意图 | 走哪条链路 | 禁止 |
|---------|-----------|------|
| 「删掉第 3 天蓝湖」 | 下层 CRUD compound / `trip.applyEdit(db)` | ❌ adaptive_replan |
| 「明天太累了，轻松点」 | 中层 ITINERARY_ADJUST → **adaptive_replan** | ❌ 裸 PLAN_GEN |
| 「明天大雨，调整上午」 | 中层 ITINERARY_ADJUST → **adaptive_replan** | ❌ 裸 trip.applyEdit |
| 「冰岛 F 路封了怎么办」 | Consultation + readiness；若绑定 trip 则 adaptive_replan | ❌ 仅聊天不落地 |
| 「签证要准备什么」 | 上层 Consultation | ❌ 任何改行程 Skill |

### 与 `intake-itinerary-compound` 的互斥

`applyItineraryCrudWithCompoundPlan` 在 `routePrimary === 'ITINERARY_ADJUST'` 时 **主动返回 false**。  
改排与 CRUD 在 INTAKE 层互斥 —— 复杂改排必须经 `ITINERARY_ADJUST` → `adaptive_replan`。

---

## 1. Intent & Purpose

当用户或顾问提出**改已有行程**（工作台 `ITINERARY_ADJUST`、口语改排、环境突变）时调用。

与 `itinerary.smart_update` 的区别：

| 维度 | `smart_update` | `adaptive_replan` |
|------|----------------|-------------------|
| 输入 | itinerary + NL 意图 | + 天气/路况矩阵 + Odyssey Persona |
| 决策 | verify 问题 → repair | 五阶段 CSP + 人格节奏 |
| 场景 | Gate/Repair 热修补 | 全日/多日改排草案 |
| 输出 | 修补后 itinerary | + `adjust_result_hints` 供工作台卡片 |

---

## 2. Input Payload

类型定义：`adaptive-replan.types.ts` → `AdaptiveReplanPayload`

```typescript
interface AdaptiveReplanPayload {
  tripId: string;
  targetDays: number[];           // 如 [2] = 第 2 天
  userIntent?: string;
  structuredEdits?: StructuredEditItem[];
  environmentalContext?: {
    weatherForecast: WeatherSnapshot[];
    trafficStatus: TrafficMatrix;
  };
  personaSnapshot: {
    travelStyle: 'deep_privacy' | 'efficiency_first' | 'leisure_chill' | 'adventure';
    energyModel: {
      currentFatigueLevel: number;  // 0-100
      maxDailyPoiCount: number;
      bufferRatio: number;
    };
    socialBoundary: 'absolute_privacy' | 'standard' | 'open';
  };
}
```

### Persona 补水

编排层可从 `metadata.odyssey_planning_branch` 推导默认快照：

```typescript
import { readOdysseyPlanningBranch } from 'src/psychographic-vector/odyssey-planning-branch.util';
import { resolvePersonaSnapshotFromOdysseyBranch } from './adaptive-replan-persona.util';

const branch = readOdysseyPlanningBranch(state);
const personaSnapshot = resolvePersonaSnapshotFromOdysseyBranch(branch, {
  energyModel: { currentFatigueLevel: 75 }, // 用户吐槽「好累」时覆盖
});
```

---

## 3. Core Execution Flow（五阶段）

```
[AdaptiveReplanPayload]
        │
        ▼
┌───────────────────────────────────────┐
│ 1. CONSTRAINT PARSING                 │
│    adaptive-replan-constraint-parser  │
│    天气×户外 POI、路况 F_traffic、人格权重 │
└───────────────┬───────────────────────┘
                ▼
┌───────────────────────────────────────┐
│ 2. POI CORRIDOR FILTERING             │
│    adaptive-replan-corridor           │
│    封路剔除、通行/停留比降级            │
└───────────────┬───────────────────────┘
                ▼
┌───────────────────────────────────────┐
│ 3. PERSONA-ALIGNED REARRANGEMENT      │
│    adaptive-replan-persona-rearrange  │
│    POI 上限、休息空档、最早出发时刻      │
└───────────────┬───────────────────────┘
                ▼
┌───────────────────────────────────────┐
│ 4. VERIFY & AUTO-REPAIR               │
│    itinerary.smart_update             │
│    verify → neptune(可选) → repair    │
└───────────────┬───────────────────────┘
                ▼
[AdaptiveReplanOutput + adjust_result_hints]
        │
        ▼ (编排层 enrich)
[payload.itinerary_adjust_result]
```

### 人格 → 参数映射

| Persona | bufferRatio | maxDailyPoi | 最早出发 | 休息空档 |
|---------|-------------|-------------|---------|---------|
| deep_privacy | 1.4 | 3 | 09:00 | 15:00–16:00 |
| leisure_chill | 1.35 | 3 | 09:30 | 15:00–16:00 |
| efficiency_first | 1.1 | 4 | 08:00 | — |
| adventure | 1.05 | 5 | 07:30 | — |

疲劳度 > 70：自动 structural thinning；> 80：maxDailyPoi ≤ 2，最早出发 ≥ 10:00。

---

## 4. When to Invoke

### DO

- 用户请求**节奏/体力**调整（「太累了」「别早起」）
- **天气/路况**驱动的改排（「明天大雨」「F 路封了」）
- 工作台 `ITINERARY_ADJUST` 子意图为 `strong_modification` / `weather_driven`
- 需要同时考虑 POI 距离、营业时间、人格边界的**全日重排**

### DO NOT

- 单点增删改（「加上蓝湖」「删掉这家酒店」）→ `trip.applyEdit` / compound CRUD
- 纯咨询（「蓝湖门票多少」）→ Consultation
- 从零规划新行程 → `GENERAL_PLAN` + `itinerary.generate`
- 已有结构化 `edits[]` 且无需重排 → `trip.applyEdit(db)`

---

## 5. Orchestration Integration（已接线）

| 阶段 | 文件 | 行为 |
|------|------|------|
| INTAKE | `intake-phase.executor.ts` | `ITINERARY_ADJUST` → `metadata.adaptive_replan_requested = true` + `adaptive_replan_trigger` |
| PLAN_GEN 后 | `plan-gen-phase.executor.ts` → `claude-orchestrator.service.ts` | `runAdaptiveReplanForAdjustState` 精炼 `state.itinerary` |
| NARRATE | `itinerary-adjust-optimization-summary.util.ts` | `adaptive_replan_rationale_zh` 并入 `rationale_bullets_zh` |
| 环境补水 | `itinerary-adjust-adaptive-replan.util.ts` | 从 `research_data` / `guardian_debate_trip_context` 构建 `environmentalContext` |

### 后续可增强

- POI_SELECTION 之后将走廊候选注入 `adaptive_replan` 的 structuredEdits
- 显式调用 `world.buildContext` / `iceland.fRoadStatus` 替代 research_data 推断

---

## 6. Code Map

| 文件 | 职责 |
|------|------|
| `itinerary-adaptive-replan.skill.ts` | Skill 入口，五阶段编排 |
| `adaptive-replan.types.ts` | 输入/输出合同 |
| `adaptive-replan-persona.util.ts` | 人格 → 约束权重 |
| `adaptive-replan-constraint-parser.util.ts` | 天气×POI、路况解析 |
| `adaptive-replan-corridor.util.ts` | 空间过滤与降级 |
| `adaptive-replan-persona-rearrange.util.ts` | 节奏重排 |
| `itinerary-smart-update.skill.ts` | Stage 4 校验闭环 |
| `itinerary-adjust-optimization-summary.util.ts` | 工作台输出形状 |

---

## 7. Decision OS Flywheel

```
用户改排意图 → adaptive_replan（人格+环境）→ itinerary_adjust_result 草案
     ↑                                              │
     └──────── 用户确认 apply / 执行反馈疲劳度 ────────┘
```

保持 **人格一致性**：任何复杂改排经 `personaSnapshot`，避免 CRUD 绕过心理安全边界。
