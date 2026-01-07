# TripNARA Skills Architecture

## 架构概述

TripNARA 采用 **Skills / MCP / Agent** 三层架构：

- **Skills** = 能力颗粒（最小可复用的能力单元）
- **MCP** = 能力的"插座标准"（Model Context Protocol）
- **Agent** = 会用这些能力的人（LLM + 编排逻辑）

## 核心设计原则

1. **每个 Skill 只做一件"决策上有意义的事"**
2. **Skills 是对 Agent 友好的动作**，不是简单的接口 1:1 映射
3. **MCP 提供统一的工具接口**，对内给 Agent，对外给 ChatGPT/Dify 等客户端
4. **Agent 负责理解人话、编排 Skills、解释结果**

## 已实现的 Skills

### 1. 决策核心相关 Skills

#### `skill.dem.getProfile`
- **输入**: `{ polyline, samples }`
- **输出**: `{ elevationProfile, cumulativeAscent, maxSlope, fatigueIndex }`
- **用途**: 供 Abu / Dr.Dre 以及 Explanation 使用

#### `skill.decision.abuCheck`
- **输入**: `{ world: PhysicalRealityModel, candidatePlan }`
- **输出**: `{ allowed: boolean, violations: DemDecisionEvidence[], decisionLog }`
- **用途**: 基于物理现实和合规的安全检查，不考虑体验偏好

#### `skill.decision.drdrePace`
- **输入**: `{ world: WorldModelContext, draftPlan }`
- **输出**: `{ adjustedPlan, changes, reasonSummary }`
- **用途**: 基于人体能力模型调整行程节奏

#### `skill.decision.neptuneRepair`
- **输入**: `{ world: WorldModelContext, brokenPlan, issue }`
- **输出**: `{ repairedPlan, replacements, philosophyCheck }`
- **用途**: 在保持路线哲学的前提下替换不可用路段

### 2. RouteDirection Skills

#### `skill.routeDirection.pickForIntent`
- **输入**: `{ countryCode, season, userIntentTags }`
- **输出**: `{ routeDirectionId, reasoning, alternatives }`
- **用途**: 根据国家、季节和用户意图选择路线方向

### 3. Readiness Skills

#### `skill.readiness.generateChecklist`
- **输入**: `{ world: WorldModelContext, routeDirection, userProfile }`
- **输出**: 行前清单（证件、装备、健康/高反、车辆配置等）
- **用途**: 基于世界模型生成行前准备清单

## 使用方式

### 1. 直接使用 Skills（内部）

```typescript
import { DemGetProfileSkill } from './skills/dem/dem-get-profile.skill';

// 在 Service 中注入
constructor(private readonly demGetProfile: DemGetProfileSkill) {}

// 调用
const result = await this.demGetProfile.execute({
  polyline: [{ lat: 64.1, lng: -21.9 }, { lat: 64.2, lng: -21.8 }],
  samples: 100,
});
```

### 2. 通过 MCP Server（外部）

启动 MCP Server：
```bash
npm run mcp:skills
```

在支持 MCP 的客户端（如 ChatGPT、Dify）中配置：
```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npm",
      "args": ["run", "mcp:skills"]
    }
  }
}
```

然后就可以在客户端中调用：
- `tripnara.dem.getProfile`
- `tripnara.decision.abuCheck`
- `tripnara.decision.drdrePace`
- `tripnara.decision.neptuneRepair`
- `tripnara.routeDirection.pickForIntent`
- `tripnara.readiness.generateChecklist`

### 3. 通过 Agent 层（推荐）

使用 `PlannerAgentMcpService` 作为示例，展示如何：
1. 理解用户自然语言需求
2. 调用多个 MCP Skills
3. 编排决策流程
4. 生成最终计划和解释

## 完整调用链示例

用户输入：
> "7 月想去冰岛徒步 8 天，别太累，预算 2 万以内"

**Step 1: PlannerAgent（LLM）**
- 识别意图 → `plan_road_trip`
- 提取参数：
  - `country=IS`
  - `month=7`
  - `days=8`
  - `intentTags=['hiking', 'scenic']`
  - `strategyMode='Balanced'`

**Step 2: 调用 Skills**
```typescript
// 1. 选择路线方向
const rd = await tripnara.routeDirection.pickForIntent({
  countryCode: 'IS',
  season: 7,
  userIntentTags: ['hiking', 'scenic'],
});

// 2. 生成草案计划
const draftPlan = generateDraftPlan(rd);

// 3. DEM 检查
const demProfile = await tripnara.dem.getProfile({
  polyline: draftPlan.polyline,
});

// 4. Abu 安全检查
const abuResult = await tripnara.decision.abuCheck({
  world: buildWorldModel(rd),
  candidatePlan: draftPlan,
});

// 5. Dr.Dre 节奏调整
const dreResult = await tripnara.decision.drdrePace({
  world: buildWorldModel(rd),
  draftPlan: abuResult.allowed ? draftPlan : null,
});

// 6. Neptune 修复（如果需要）
const neptuneResult = await tripnara.decision.neptuneRepair({
  world: buildWorldModel(rd),
  brokenPlan: dreResult.adjustedPlan,
});

// 7. 生成准备清单
const checklist = await tripnara.readiness.generateChecklist({
  world: buildWorldModel(rd),
  routeDirection: rd,
  userProfile: extractUserProfile(),
});
```

**Step 3: 生成最终结果**
- 整合所有 Skills 的输出
- 生成前端需要的 JSON + 文案
- 提供可解释的决策日志

## 扩展 Skills

要添加新的 Skill：

1. 在 `src/skills/` 下创建新的 Skill 文件
2. 实现 `Skill` 接口
3. 在 `SkillsModule` 中注册
4. 在 `mcp-schema-builders.ts` 中添加 schema
5. MCP Server 会自动暴露该 Skill

## 未来计划

- [ ] CountryPack Skills (newSkeleton, validate, generateRegressionTests)
- [ ] What-If Skills (evaluateChange)
- [ ] Analytics Skills (tripSummary)
- [ ] RAG Skills (searchKnowledge)

