# PlanningWorkbench Agent

## 角色定位

**PlanningWorkbench Agent** 是规划工作台的主 Agent，负责编排所有规划技能。

**项目实现位置**：
- 服务：`src/agent/services/planning-workbench-agent.service.ts` - `PlanningWorkbenchAgentService`
- 控制器：`src/agent/planning-workbench.controller.ts` - `PlanningWorkbenchController`

## 核心职责

1. **维护唯一 PlanState（唯一真相）**
   - 管理规划状态
   - 版本控制
   - 状态同步

2. **决定走 System1 还是 System2**
   - 根据复杂度选择路径
   - 优化性能
   - 控制成本

3. **在冲突时触发仲裁**
   - 检测冲突
   - 触发仲裁流程
   - 解决冲突

4. **在关键点要求用户确认**
   - 识别关键决策点
   - 请求用户确认
   - 等待用户反馈

## 输入/输出 Schema

### 输入：PlanningWorkbenchRequest

```typescript
{
  context: PlanContext;        // 规划上下文
  tripId?: string;            // Trip ID（可选）
  existingPlanState?: PlanState;  // 现有 PlanState（如果有）
  userAction?: 'generate' | 'compare' | 'commit' | 'adjust';  // 用户操作
}
```

### 输出：PlanningWorkbenchResponse

```typescript
{
  planState: PlanState;       // 更新后的 PlanState
  uiOutput: {
    // UI 输出内容
  };
  personas?: PersonaShellOutput;  // 三人格输出（如果有）
}
```

## 调用的 Skills

- `context.build` - 构建上下文
- `plan.architect.generateSkeleton` - 生成规划骨架
- `plan.architect.compareOptions` - 比较选项
- `plan.architect.commitOption` - 提交选项
- `plan.budget.estimateBaseline` - 估算预算基线
- `plan.budget.detectOverrun` - 检测预算超支
- `plan.transit.buildTransferGraph` - 构建换乘图
- `plan.pace.computeTimeWindows` - 计算时间窗
- `plan.pace.fatigueScore` - 疲劳评分
- `plan.gate.precheck` - Gate 预检查
- `plan.gate.runThreeGuardians` - 运行三人格
- `plan.constraints.detectConflicts` - 检测冲突
- `plan.log.appendDecision` - 追加决策日志

## 工作流程

```
用户请求
  ↓
PlanningWorkbenchAgent
  ├─ 1. 构建上下文（context.build）
  ├─ 2. 生成规划骨架（plan.architect.generateSkeleton）
  ├─ 3. 比较选项（plan.architect.compareOptions）
  ├─ 4. 预算估算（plan.budget.*）
  ├─ 5. 交通规划（plan.transit.*）
  ├─ 6. 节奏规划（plan.pace.*）
  ├─ 7. Gate 检查（plan.gate.*）
  ├─ 8. 冲突检测（plan.constraints.*）
  └─ 9. 记录决策（plan.log.*）
      ↓
返回 PlanState 和 UI 输出
```

## 参考文档

- `src/agent/services/planning-workbench-agent.service.ts` - 服务实现
- `src/agent/planning-workbench.controller.ts` - 控制器实现
- `src/skills/plan/shared/plan-state.types.ts` - PlanState 类型定义
