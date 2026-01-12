# 智能体统一入口使用指南

## 统一入口的作用

`POST /api/agent/route_and_run` 是 TripNARA 的**对话式智能体统一入口**，它的核心价值是：

### 1. 自然语言理解与自动路由

**用户不需要知道调用哪个接口**，只需要用自然语言描述需求：

```
用户："帮我规划一个5天的东京行程，预算1万"
→ 统一入口自动理解意图
→ 路由到 System2_REASONING
→ 选择并执行相关 Actions/Skills
→ 返回结果
```

### 2. 自动编排多个能力

统一入口可以**自动编排多个 Skills/Actions**，完成复杂任务：

```
用户："如果赶不上日落就改去横滨"
→ 统一入口理解条件逻辑
→ 自动编排：
   1. 检查当前时间
   2. 判断是否能赶上日落
   3. 如果赶不上 → 调用 planning.workbench.generate（生成横滨方案）
   4. 如果赶得上 → 继续原计划
```

### 3. 复用专用 Agent 的能力

统一入口**已经可以调用专用 Agent**，通过 Actions：

| 统一入口 Action | 调用的专用 Agent | 功能 |
|----------------|-----------------|------|
| `planning.workbench.generate` | PlanningWorkbenchAgentService | 生成行程骨架方案 |
| `planning.workbench.compare` | PlanningWorkbenchAgentService | 对比多个方案 |
| `execution.remind` | ExecutionAgentService | 生成执行阶段的提醒 |
| `execution.handle_change` | ExecutionAgentService | 处理执行期间的变更 |
| `trip.detail.get_status` | TripDetailAgentService | 理解当前行程状态 |
| `trip.detail.get_health` | TripDetailAgentService | 分析行程健康度 |
| `trip.detail.explain_decisions` | TripDetailAgentService | 解释决策 |

### 4. 对话式交互

支持多轮对话，理解上下文：

```
用户："帮我规划一个5天的东京行程"
→ 统一入口：需要更多信息，请提供预算、人数等
用户："预算1万，2个人"
→ 统一入口：理解上下文，调用 planning.workbench.generate
→ 返回结果
```

---

## 使用场景对比

### 场景 1：自然语言对话

**使用统一入口** ✅

```typescript
// 用户用自然语言提问
POST /api/agent/route_and_run
{
  "message": "帮我规划一个5天的东京行程，预算1万",
  "user_id": "user-123"
}

// 统一入口自动：
// 1. 理解意图（规划行程）
// 2. 路由到 System2_REASONING
// 3. 选择 Action: planning.workbench.generate
// 4. 调用 PlanningWorkbenchAgentService
// 5. 返回三人格决策结果
```

### 场景 2：明确的功能调用

**使用专用接口** ✅

```typescript
// 前端明确知道要生成方案
POST /api/planning-workbench/execute
{
  "context": {
    "destination": { "country": "JP", "city": "Tokyo" },
    "days": 5,
    "constraints": { "budget": { "total": 10000 } }
  },
  "userAction": "generate"
}

// 直接调用，跳过路由和意图理解
// 返回标准化的三人格输出
```

---

## 统一入口的工作流程

```
用户输入（自然语言）
    ↓
RouterService（语义路由）
    ↓
System 1 / System 2
    ↓
选择 Actions/Skills
    ↓
执行 Actions（可能调用专用 Agent）
    ↓
返回结果
```

### 示例流程

**用户输入**："帮我规划一个5天的东京行程"

1. **RouterService** 分析输入
   - 识别关键词：规划、5天、东京
   - 路由决策：`SYSTEM2_REASONING`（需要推理）

2. **System 2 执行**
   - LLM 分析意图：需要生成行程方案
   - 选择 Action：`planning.workbench.generate`

3. **Action 执行**
   - `planning.workbench.generate` Action 被调用
   - Action 内部调用 `PlanningWorkbenchAgentService.execute()`
   - 传入结构化的 `PlanContext`

4. **PlanningWorkbenchAgentService 执行**
   - 调用 `plan.architect.generateSkeleton`
   - 调用 `plan.budget.estimateBaseline`
   - 调用 `plan.gate.runThreeGuardians`
   - 通过 `PersonaShellService` 包装成三人格输出

5. **返回结果**
   - 统一入口返回标准化的响应
   - 包含三人格的决策结果

---

## 统一入口 vs 专用接口

| 特性 | 统一入口 | 专用接口 |
|------|---------|---------|
| **输入格式** | 自然语言 | 结构化数据 |
| **路由** | 自动路由 | 直接调用 |
| **意图理解** | 需要 | 不需要 |
| **编排** | 自动编排 | 手动调用 |
| **性能** | 较慢（需要路由和理解） | 较快（直接执行） |
| **灵活性** | 高（可以处理各种请求） | 低（只能处理特定功能） |
| **适用场景** | 对话式交互 | 功能式交互 |

---

## 最佳实践

### ✅ 使用统一入口

- 用户用自然语言提问
- 需求不明确，需要系统理解意图
- 需要多步骤协作
- 简单查询（"推荐拉面"）

### ✅ 使用专用接口

- 前端明确知道要执行的功能
- 需要结构化的输入输出
- 需要特定的数据格式（三人格输出）
- 性能要求高
- 前端需要精确控制流程

---

## 总结

**统一入口的核心价值**：
1. **对话式交互** - 用户用自然语言提问，系统自动理解
2. **自动路由** - 根据用户输入自动选择 System 1 或 System 2
3. **自动编排** - 自动选择和执行多个 Actions/Skills
4. **复用专用 Agent** - 通过 Actions 调用专用 Agent 的能力

**统一入口和专用接口的关系**：
- **互补关系**，不是替代关系
- 统一入口可以调用专用 Agent（通过 Actions）
- 前端根据场景选择使用哪个入口
- 两者共享底层的 Skills 能力

**当前状态**：
- ✅ 统一入口已实现
- ✅ 专用接口已实现
- ✅ 统一入口可以通过 Actions 调用专用 Agent（已实现）
