# 状态机流程调试指南

## 问题总结

### 当前问题
1. **所有测试都在 20 秒后超时**
2. **决策日志为空**（`explain.decision_log` 长度为 0）
3. **orchestrationResult 不存在**
4. **第 4 个测试显示熔断器打开**（`BREAKER_OPEN:CLAUDE_DYNAMIC`）

### 可能原因分析

#### 1. 路由策略问题
- **检查点**：是否真的选择了 `CLAUDE_SM` 模式？
- **位置**：`src/agent/utils/orchestration-policy.util.ts`
- **可能问题**：
  - `use_state_machine_orchestration: true` 可能被其他规则覆盖
  - 简单请求可能被降级到 `LEGACY` 或 `CLAUDE_DYNAMIC`
  - 熔断器可能阻止了状态机执行

#### 2. 状态机执行问题
- **检查点**：状态机是否真的被调用？
- **位置**：`src/agent/services/claude-orchestrator.service.ts:orchestrateWithStateMachine`
- **可能问题**：
  - 状态机在某个步骤卡住
  - LLM API 调用超时
  - 依赖服务响应慢

#### 3. 响应结构问题
- **检查点**：决策日志是否正确写入响应？
- **位置**：`src/agent/services/agent.service.ts:routeAndRunWithClaudeStateMachine`
- **可能问题**：
  - `orchestrationResult.decisionLog` 为空
  - `orchestrationResult.result.state` 未正确设置
  - 响应映射逻辑有问题

## 调试步骤

### 步骤 1: 检查路由决策

在 `agent.service.ts` 中添加日志：

```typescript
// 在 routeAndRun 方法中，决策后添加
this.logger.log(`[AgentService] 路由决策: mode=${decision.mode}, reason=${decision.reason}`);
this.logger.log(`[AgentService] 匹配规则: ${decision.matchedRules.join(', ')}`);
this.logger.log(`[AgentService] 信号: complexity=${signals.complexity}, requiresStructuredOutput=${signals.requiresStructuredOutput}`);
```

### 步骤 2: 检查状态机调用

在 `claude-orchestrator.service.ts` 中添加日志：

```typescript
// 在 orchestrateWithStateMachine 方法开始处
this.logger.log(`[Claude Orchestrator] 状态机开始: request_id=${request.request_id}`);
this.logger.log(`[Claude Orchestrator] Deadline: ${deadline?.remainingMs() || 'N/A'}ms`);

// 在每个步骤执行前后添加日志
this.logger.log(`[Claude Orchestrator] 开始执行步骤: ${stepName}`);
// ... 执行步骤 ...
this.logger.log(`[Claude Orchestrator] 完成步骤: ${stepName}, 耗时: ${duration}ms`);
```

### 步骤 3: 检查响应构建

在 `agent.service.ts:routeAndRunWithClaudeStateMachine` 中添加日志：

```typescript
this.logger.log(`[AgentService] 状态机结果: success=${orchestrationResult.success}`);
this.logger.log(`[AgentService] 决策日志长度: ${orchestrationResult.decisionLog?.length || 0}`);
this.logger.log(`[AgentService] 状态: current_step=${orchestrationResult.result?.state?.current_step}`);
this.logger.log(`[AgentService] Gate 结果: ${orchestrationResult.result?.gate_result?.gate_result}`);
```

### 步骤 4: 检查熔断器状态

```typescript
// 在 agent.service.ts 中
this.logger.log(`[AgentService] 熔断器状态: SM=${this.breakerSM.canPass()}, Dynamic=${this.breakerDyn.canPass()}, Legacy=${this.breakerLegacy.canPass()}`);
```

## 快速检查脚本

创建一个简单的测试脚本来检查路由决策：

```typescript
// scripts/test-routing-decision.ts
import { signalsFromRequest } from './src/agent/utils/orchestration-signals.util';
import { routePolicy } from './src/agent/utils/orchestration-policy.util';

const request = {
  request_id: 'test-001',
  user_id: 'user-001',
  message: '我想在7月去冰岛旅行5天，从雷克雅未克出发',
  trip_id: null,
  options: {
    use_claude_orchestration: true,
    use_state_machine_orchestration: true,
    llm_provider: 'anthropic',
    entry_point: 'dashboard',
    max_seconds: 20,
  },
};

const signals = signalsFromRequest(request);
const decision = routePolicy(process.env, request.options, signals);

console.log('路由决策结果:');
console.log(`  模式: ${decision.mode}`);
console.log(`  原因: ${decision.reason}`);
console.log(`  匹配规则: ${decision.matchedRules.join(', ')}`);
console.log(`  信号:`, signals);
```

## 常见问题排查

### 问题 1: 路由策略选择了错误的模式

**症状**：测试请求应该使用 `CLAUDE_SM`，但实际使用了其他模式

**检查**：
1. 查看 `routePolicy` 的决策逻辑
2. 检查 `signalsFromRequest` 提取的信号
3. 检查是否有规则覆盖了显式设置

**解决**：
- 确保 `use_state_machine_orchestration: true` 被正确传递
- 检查 `resolveOrchestrationMode` 的返回值
- 查看是否有降级规则被触发

### 问题 2: 状态机执行超时

**症状**：状态机开始执行但在 20 秒内未完成

**检查**：
1. 查看服务器日志，确认执行到哪个步骤
2. 检查 LLM API 响应时间
3. 检查依赖服务（数据库、Redis 等）响应时间

**解决**：
- 增加服务器端超时时间（修改 `agent.service.ts` 第374行）
- 优化状态机流程，减少不必要的步骤
- 使用异步处理或进度反馈

### 问题 3: 决策日志为空

**症状**：`explain.decision_log` 存在但长度为 0

**检查**：
1. 确认状态机是否真的执行了
2. 检查 `state.decision_log` 是否被正确填充
3. 检查响应映射逻辑

**解决**：
- 确保每个步骤都正确记录决策日志
- 检查 `buildSuccessResult` 和 `buildErrorResult` 方法
- 验证响应映射逻辑

### 问题 4: 熔断器打开

**症状**：`BREAKER_OPEN:CLAUDE_DYNAMIC` 或 `BREAKER_OPEN:CLAUDE_SM`

**检查**：
1. 查看熔断器状态
2. 检查之前的失败请求
3. 查看熔断器配置

**解决**：
- 等待熔断器自动恢复
- 手动重置熔断器（如果支持）
- 修复导致失败的根本问题

## 建议的修复方案

### 方案 1: 增加超时时间（临时方案）

修改 `src/agent/services/agent.service.ts`：

```typescript
// 第374行
const deadline = createDeadline(Math.max(1000, Math.min(maxSeconds * 1000, 60_000))); // 增加到60秒
```

### 方案 2: 添加详细日志（调试方案）

在关键位置添加日志，了解执行流程。

### 方案 3: 优化状态机流程（长期方案）

- 减少不必要的 LLM 调用
- 优化步骤执行顺序
- 使用缓存减少重复计算

## 下一步行动

1. ✅ 添加详细日志到关键位置
2. ⏳ 运行测试并查看日志输出
3. ⏳ 根据日志定位问题
4. ⏳ 实施修复方案
5. ⏳ 重新运行测试验证修复
