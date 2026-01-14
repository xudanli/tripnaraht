# Execution Agent

## 角色定位

**Execution Agent** 是执行阶段的 Agent，负责"贴心管家式的提醒、变更与兜底"。

**项目实现位置**：
- 服务：`src/agent/services/execution-agent.service.ts` - `ExecutionAgentService`
- 控制器：`src/agent/execution.controller.ts` - `ExecutionController`

## 核心职责

1. **生成提醒（出发、入住、活动、交通、天气、安全、预算）**
   - 出发提醒
   - 入住提醒
   - 活动提醒
   - 交通提醒
   - 天气提醒
   - 安全提醒
   - 预算提醒

2. **处理变更（时间、地点、活动取消、交通延误等）**
   - 时间变更
   - 地点变更
   - 活动取消
   - 交通延误
   - 其他变更

3. **生成兜底方案（当原计划无法执行时）**
   - 检测无法执行的情况
   - 生成替代方案
   - 提供兜底建议

## 输入/输出 Schema

### 输入：ExecutionAgentRequest

```typescript
{
  tripId: string;             // Trip ID
  action: 'remind' | 'handle_change' | 'fallback' | 'get_status';  // 操作类型
  remindParams?: {            // 提醒相关参数
    reminderTypes?: string[];
    advanceHours?: number;
  };
  changeParams?: {            // 变更相关参数
    changeType: string;
    changeDetails: any;
  };
  fallbackParams?: {          // 兜底相关参数
    triggerReason: string;
    originalPlan: any;
  };
}
```

### 输出：ExecutionAgentResponse

```typescript
{
  executionState: ExecutionState;  // 执行状态
  personas?: PersonaShellOutput;  // 三人格输出（如果有）
  uiOutput: {
    reminders?: Reminder[];       // 提醒列表
    changeHandling?: ChangeHandlingResult;  // 变更处理结果
    fallbackPlan?: FallbackPlan;  // 兜底方案
  };
}
```

## 调用的 Skills

- `exec.remind` - 生成提醒
- `exec.handleChange` - 处理变更
- `exec.fallback` - 生成兜底方案

## 工作流程

```
用户请求
  ↓
ExecutionAgent
  ├─ action === 'remind'
  │   └─ exec.remind → 生成提醒列表
  ├─ action === 'handle_change'
  │   └─ exec.handleChange → 处理变更
  ├─ action === 'fallback'
  │   └─ exec.fallback → 生成兜底方案
  └─ action === 'get_status'
      └─ 返回执行状态
      ↓
返回 ExecutionState 和 UI 输出
```

## 参考文档

- `src/agent/services/execution-agent.service.ts` - 服务实现
- `src/agent/execution.controller.ts` - 控制器实现
- `src/skills/exec/shared/execution-state.types.ts` - ExecutionState 类型定义
