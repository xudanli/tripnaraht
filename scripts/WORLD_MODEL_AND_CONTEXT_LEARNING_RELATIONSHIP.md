# 世界模型与上下文学习的关系

**日期**: 2026-02-10  
**目的**: 解释世界模型（World Model）和上下文学习（Context Learning）在 TripNARA 系统中的关系

---

## 📊 核心概念

### 1. 世界模型（World Model）

**定义**: TripNARA 决策系统的"眼睛"，让系统能够"看见真实世界"

**架构**: 三段式结构（第一性原理）

```typescript
interface WorldModelContext {
  /** 物理现实模型（必须） */
  physical: PhysicalRealityModel;      // 地球那一坨
  
  /** 人体能力模型（必须） */
  human: HumanCapabilityModel;         // 人那一坨
  
  /** 路线方向（带哲学模型，必须） */
  routeDirection: RouteDirectionWithPhilosophy;  // 世界观那一坨
}
```

**核心组件**:
- **PhysicalRealityModel**: DEM证据、道路状态、危险区域、渡轮状态、气候季节性
- **HumanCapabilityModel**: 体力评估、节奏偏好、风险承受度、适应度
- **RouteDirectionWithPhilosophy**: 路线哲学、世界观、判断标准

**作用**: 提供**结构化的、可执行的世界状态表示**

---

### 2. 上下文学习（Context Learning）

**定义**: 学习 Context Block 的重要性、相关性、压缩策略等，持续优化 Context 构建策略

**学习维度**:
- **Block重要性学习**: 哪些Block对用户决策更重要
- **Block相关性学习**: 哪些Block与用户查询更相关
- **Context压缩策略学习**: 哪些Block可以压缩或省略
- **个性化Context组合学习**: 不同用户的最优Context组合

**学习事件类型**:
- `context_built`: Context构建事件（权重 0.1）
- `context_used`: Context使用事件（权重 0.3）
- `decision_made`: 决策结果事件（权重 0.6）
- `user_feedback`: 用户反馈事件（权重 0.8）

**作用**: 从使用中学习，持续优化 Context 构建策略

---

## 🔗 关系分析

### 1. 世界模型是 Context Package 的一部分

**实现位置**: `src/agent/context-engine/services/context-engineer.service.ts`

**关系**:
- 世界模型（`WorldModelContext`）是 Context Package 中的一个重要 Block
- Block 类型: `WORLD_MODEL`
- 在构建 Context Package 时，会调用 `world.buildContext` skill 构建世界模型

**代码示例**:
```typescript
// Context Package 包含多个 Block
interface ContextPackage {
  blocks: ContextBlock[];
  // ...
}

// WORLD_MODEL 是其中一个 Block
{
  key: 'WORLD_MODEL',
  type: 'WORLD_MODEL',
  content: WorldModelContext, // 世界模型数据
  priority: number,
  // ...
}
```

---

### 2. Context Learning 学习世界模型的重要性

**实现位置**: `src/agent/context-engine/services/context-learning.service.ts`

**学习过程**:
1. **记录使用**: 当 Context Package 被使用时，记录哪些 Block（包括 WORLD_MODEL）被使用
2. **学习重要性**: 基于使用频率、决策结果、用户反馈，学习 WORLD_MODEL Block 的重要性
3. **优化构建**: 在后续构建 Context Package 时，优先包含重要的 Block（包括 WORLD_MODEL）

**学习指标**:
- `importanceScore`: Block重要性评分（0-1）
- `relevanceScore`: Block相关性评分（0-1）
- `usageCount`: Block使用次数
- `confidence`: 学习置信度

---

### 3. 世界模型提供结构化数据，Context Learning 学习如何使用

**数据流**:

```
世界模型构建
    ↓
WorldModelContext (结构化数据)
    ↓
Context Package (包含 WORLD_MODEL Block)
    ↓
Context Learning (学习 Block 重要性)
    ↓
优化后续 Context 构建
```

**关系**:
- **世界模型**: 提供结构化的、可执行的世界状态表示
- **Context Learning**: 学习如何更好地使用这些状态（哪些部分更重要、哪些可以压缩）

---

## 🎯 实际应用场景

### 场景1: 首次构建 Context Package

1. **世界模型构建**: 调用 `world.buildContext` skill，构建完整的 `WorldModelContext`
2. **Context Package 构建**: 将世界模型作为 `WORLD_MODEL` Block 加入 Context Package
3. **Context Learning 记录**: 记录 `context_built` 事件，学习 WORLD_MODEL Block 的重要性

### 场景2: 使用 Context Package 进行决策

1. **Context Package 使用**: Agent（如 Planner、Abu、Dr.Dre）使用 Context Package
2. **世界模型数据使用**: Agent 从 `WORLD_MODEL` Block 中提取物理现实、人体能力、路线哲学数据
3. **Context Learning 记录**: 记录 `context_used` 事件，学习哪些 Block 被实际使用

### 场景3: 决策结果反馈

1. **决策执行**: 基于 Context Package（包含世界模型）做出决策
2. **结果评估**: 评估决策结果（成功/失败、用户满意度）
3. **Context Learning 学习**: 记录 `decision_made` 事件，学习 WORLD_MODEL Block 对决策结果的影响

### 场景4: 用户反馈

1. **用户反馈**: 用户提供反馈（哪些信息有用、哪些没用）
2. **Context Learning 学习**: 记录 `user_feedback` 事件，学习 WORLD_MODEL Block 的相关性
3. **优化构建**: 在后续构建中，优先包含用户认为重要的世界模型数据

---

## 📈 优化效果

### 1. 个性化 Context 构建

**效果**: 为不同用户、不同阶段、不同 Agent 学习不同的世界模型重要性

**示例**:
- 对于体力较弱的用户，`HumanCapabilityModel` Block 的重要性更高
- 对于高风险路线，`PhysicalRealityModel.hazardZones` Block 的重要性更高
- 对于规划阶段，`RouteDirectionWithPhilosophy` Block 的重要性更高

### 2. 智能压缩策略

**效果**: 学习哪些世界模型数据可以压缩或省略

**示例**:
- 如果用户不关心地形细节，可以压缩 `DEMEvidence` 数据
- 如果路线不涉及渡轮，可以省略 `FerryState` 数据
- 如果用户偏好已知，可以压缩 `HumanCapabilityModel` 的部分数据

### 3. 持续优化

**效果**: 从使用中学习，持续优化世界模型的使用方式

**机制**:
- **时间衰减**: 使用衰减因子（0.95）对旧数据进行衰减
- **置信度计算**: 基于样本数量计算置信度
- **个性化学习**: 为不同用户、不同阶段学习不同的重要性

---

## 🔍 代码实现位置

### 1. 世界模型构建

**文件**: `src/skills/world/world-build-context.skill.ts`

**功能**: 构建完整的 `WorldModelContext`

### 2. Context Package 构建

**文件**: `src/agent/context-engine/services/context-engineer.service.ts`

**功能**: 将世界模型作为 `WORLD_MODEL` Block 加入 Context Package

### 3. Context Learning

**文件**: `src/agent/context-engine/services/context-learning.service.ts`

**功能**: 学习 Context Block（包括 WORLD_MODEL）的重要性、相关性、压缩策略

### 4. 自动集成

**文件**: `src/skills/context/context-build.skill.ts`

**功能**: 每次 `context.build` 执行后，自动记录 `context_built` 事件，触发 Context Learning

---

## 📊 总结

### 关系总结

1. **世界模型是 Context Package 的一部分**
   - 世界模型作为 `WORLD_MODEL` Block 加入 Context Package
   - 提供结构化的、可执行的世界状态表示

2. **Context Learning 学习世界模型的重要性**
   - 从使用中学习哪些世界模型数据更重要
   - 学习如何更好地使用世界模型数据
   - 优化后续 Context 构建策略

3. **相互促进**
   - 世界模型提供高质量的结构化数据
   - Context Learning 学习如何更好地使用这些数据
   - 持续优化，形成正向循环

### 核心价值

- ✅ **不是**静态的、预训练的知识
- ✅ **是**动态的、从使用中学习的新知识
- ✅ **不是**一次性使用预训练知识
- ✅ **是**持续学习、持续优化 Context 构建策略

---

## 📝 相关文档

- `WORLD_MODEL_ARCHITECTURE.md` - 世界模型架构说明
- `.claude/analysis/tripnara-context-engineering-assessment.md` - Context Engineering/Context Learning 框架定位分析
- `src/agent/context-engine/README.md` - Context Engine Module 说明
- `src/agent/context-engine/services/context-learning.service.ts` - Context Learning 服务实现
