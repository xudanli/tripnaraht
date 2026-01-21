# 状态机流程问题联合会诊报告

## 问题总结

### 核心问题
1. **所有测试都在 20 秒后超时**
2. **决策日志为空**（`explain.decision_log.length = 0`）
3. **orchestrationResult 不存在**
4. **第 4 个测试显示熔断器打开**（`BREAKER_OPEN:CLAUDE_DYNAMIC`）

### 关键发现

从之前的服务器日志分析：
- **路由决策仍然是 `CLAUDE_DYNAMIC`**，而不是 `CLAUDE_SM`
- 虽然设置了 `use_state_machine_orchestration: true`，但路由策略仍然降级

## 多角色分析

### 1. LangGraph 工程师视角：状态机流程设计问题

**问题**：
- 状态机流程设计正确，但**可能根本没有被调用**
- 即使被调用，**超时处理机制可能有问题**

**分析**：
1. **路由决策问题**：
   - 虽然修复了 `applyExplicitClaudeSimpleDynamicRule`，但服务器可能没有重启
   - 或者还有其他规则导致降级

2. **状态机执行问题**：
   - 如果状态机真的执行了，应该在日志中看到 `[Claude Orchestrator] 开始状态机编排`
   - 但从测试结果看，没有看到这些日志

3. **超时处理问题**：
   - 状态机在 20 秒内未完成，但**决策日志没有被正确记录**
   - `buildErrorResult` 或 `buildSuccessResult` 可能没有被调用

**建议**：
1. **确认路由决策**：检查服务器日志，确认是否真的选择了 `CLAUDE_SM`
2. **检查状态机调用**：确认 `orchestrateWithStateMachine` 是否被调用
3. **检查超时处理**：确认超时时是否正确记录了决策日志

### 2. Route Optimization 工程师视角：路线生成和验证问题

**问题**：
- 如果状态机执行了，可能在 **RESEARCH** 或 **PLAN_GEN** 步骤卡住
- Skills 调用可能超时或失败

**分析**：
1. **RESEARCH 步骤问题**：
   - 并行调用多个 Skills（transport.search, poi.search, opening_hours.get 等）
   - 如果某个 Skill 超时，整个流程可能卡住
   - 需要检查 Skills 的超时处理

2. **PLAN_GEN 步骤问题**：
   - 生成行程可能需要较长时间
   - LLM API 调用可能超时
   - 需要检查 LLM 调用的超时设置

3. **Gate 评估问题**：
   - GATE_EVAL 步骤需要调用 `plan.gate.runThreeGuardians` Skill
   - 如果这个 Skill 超时，流程会卡住

**建议**：
1. **检查 Skills 超时**：确认每个 Skill 的超时设置是否合理
2. **检查 LLM 调用**：确认 LLM API 调用的超时设置
3. **添加超时保护**：为每个步骤添加独立的超时保护

### 3. Skills 工程师视角：工具调用和集成问题

**问题**：
- Skills 调用可能失败或超时
- 决策日志可能没有被正确记录

**分析**：
1. **Skills 注册问题**：
   - 确认所有必需的 Skills 都已注册
   - 确认 Skills 的输入输出格式正确

2. **Skills 执行问题**：
   - 如果某个 Skill 执行失败，需要正确记录错误
   - 错误应该记录到 `state.decision_log` 和 `state.errors`

3. **决策日志记录问题**：
   - 每个步骤执行后，应该记录到 `state.decision_log`
   - 但测试结果显示决策日志为空，说明可能没有记录

**建议**：
1. **检查 Skills 注册**：确认所有必需的 Skills 都已注册
2. **检查错误处理**：确认 Skills 失败时是否正确记录
3. **检查决策日志**：确认每个步骤是否正确记录决策日志

## 根本原因分析

### 可能原因 1: 路由决策仍然降级

**症状**：路由决策是 `CLAUDE_DYNAMIC`，而不是 `CLAUDE_SM`

**原因**：
- 修复可能没有生效（服务器未重启）
- 或者还有其他规则导致降级

**验证方法**：
- 查看服务器日志中的路由决策
- 确认 `[AgentService] 路由决策: mode=...` 日志

### 可能原因 2: 状态机执行超时

**症状**：状态机开始执行，但在 20 秒内未完成

**原因**：
- LLM API 调用慢
- Skills 执行慢
- 某个步骤卡住

**验证方法**：
- 查看服务器日志中的步骤执行日志
- 确认执行到哪个步骤

### 可能原因 3: 决策日志未正确记录

**症状**：决策日志为空

**原因**：
- 超时时没有调用 `buildErrorResult`
- 或者 `buildErrorResult` 没有正确设置 `decisionLog`

**验证方法**：
- 检查 `buildErrorResult` 的实现
- 确认超时时是否正确记录决策日志

## 修复方案

### 方案 1: 确保路由决策正确（P0）

**步骤**：
1. 确认服务器已重启，修复已生效
2. 检查路由决策日志，确认选择了 `CLAUDE_SM`
3. 如果仍然降级，检查其他路由规则

**代码检查点**：
- `src/agent/utils/orchestration-policy.util.ts:applyExplicitClaudeSimpleDynamicRule`
- `src/agent/services/agent.service.ts:routeAndRun`（路由决策日志）

### 方案 2: 增加超时时间（临时方案）

**步骤**：
1. 增加服务器端超时时间（从 20 秒增加到 60 秒）
2. 为每个步骤添加独立的超时保护

**代码修改**：
- `src/agent/services/agent.service.ts:374` - 增加 deadline
- `src/agent/services/claude-orchestrator.service.ts` - 为每个步骤添加超时保护

### 方案 3: 修复决策日志记录（P0）

**步骤**：
1. 确保超时时也记录决策日志
2. 确保每个步骤都正确记录到 `state.decision_log`

**代码检查点**：
- `src/agent/services/claude-orchestrator.service.ts:buildErrorResult`
- `src/agent/services/claude-orchestrator.service.ts:executeIntakeStep` 等步骤方法

### 方案 4: 优化状态机流程（长期方案）

**步骤**：
1. 减少不必要的 LLM 调用
2. 优化 Skills 调用顺序
3. 使用缓存减少重复计算

## 立即行动项

### 1. 检查服务器日志（必须）

查看服务器日志，确认：
- 路由决策是什么模式？
- 状态机是否被调用？
- 执行到哪个步骤？
- 是否有错误日志？

### 2. 验证修复是否生效（必须）

确认：
- 服务器是否重启？
- 修复的代码是否已部署？
- 路由规则修复是否生效？

### 3. 添加更多调试日志（建议）

在关键位置添加日志：
- 路由决策前后
- 状态机调用前后
- 每个步骤执行前后
- 超时处理时

## 测试验证计划

### 阶段 1: 验证路由决策

1. 运行单个简单测试
2. 查看服务器日志，确认路由决策
3. 如果仍然是 `CLAUDE_DYNAMIC`，检查路由规则

### 阶段 2: 验证状态机执行

1. 确认路由决策是 `CLAUDE_SM` 后
2. 查看状态机执行日志
3. 确认执行到哪个步骤

### 阶段 3: 验证决策日志

1. 确认状态机执行后
2. 检查决策日志是否正确记录
3. 检查响应映射是否正确

## 相关文件

- `src/agent/utils/orchestration-policy.util.ts` - 路由策略（已修复）
- `src/agent/services/claude-orchestrator.service.ts` - 状态机实现
- `src/agent/services/agent.service.ts` - 路由和响应映射
- `scripts/test-state-machine-flow.ts` - 测试脚本
