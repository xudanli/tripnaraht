# 状态机流程测试问题 - 行动指南

## 🎯 目标

修复状态机流程测试失败问题，确保：
1. 路由决策正确选择 `CLAUDE_SM` 模式
2. 状态机正确执行
3. 决策日志正确记录和返回
4. 超时时也能看到已执行的步骤

## ✅ 已完成的修复

### 1. 路由规则修复 ✅

**文件**：`src/agent/utils/orchestration-policy.util.ts`

**问题**：`applyExplicitClaudeSimpleDynamicRule` 没有检查 `use_state_machine_orchestration`

**修复**：添加检查，如果显式启用状态机，不降级

### 2. 超时决策日志保留 ✅

**文件**：`src/agent/services/agent.service.ts`

**问题**：`buildFailureResponse` 硬编码空决策日志

**修复**：
- 添加 `partialDecisionLog` 参数
- 改进超时检测逻辑

### 3. 状态机超时处理 ✅

**文件**：`src/agent/services/claude-orchestrator.service.ts`

**问题**：超时时没有记录已执行的步骤

**修复**：
- 超时时设置 `current_step = 'TIMEOUT'`
- 记录超时时的决策日志，包含已执行步骤

### 4. 调试日志增强 ✅

**已添加**：
- 路由决策日志
- 状态机调用日志
- 步骤执行日志
- 超时处理日志

## 🚀 立即行动步骤

### 步骤 1: 重启服务器（必须）

```bash
# 停止当前服务器（Ctrl+C）
# 重新启动
npm run dev
```

**原因**：修复需要重新加载代码才能生效

### 步骤 2: 运行测试

```bash
npm run test:state-machine
```

### 步骤 3: 查看服务器日志

**关键日志位置**：

1. **路由决策**：
   ```
   [AgentService] 路由决策: mode=CLAUDE_SM
   ```

2. **状态机调用**：
   ```
   [AgentService] 调用状态机编排: request_id=..., deadline=...ms
   [Claude Orchestrator] 开始状态机编排: request_id=...
   ```

3. **步骤执行**：
   ```
   [Claude Orchestrator] 开始执行步骤: INTAKE
   [Claude Orchestrator] 完成步骤: INTAKE, 耗时: ...ms
   ```

4. **超时处理**：
   ```
   [Claude Orchestrator] 状态机执行超时，当前步骤: ..., 已执行步骤数: ...
   ```

## 🔍 问题排查

### 如果路由决策仍然是 `CLAUDE_DYNAMIC`

**检查**：
1. 服务器是否重启？
2. 查看完整的路由决策日志
3. 检查是否有其他规则导致降级

**临时解决方案**：
- 可以强制使用状态机模式（修改路由策略）
- 或者优化信号提取，让请求被识别为复杂任务

### 如果状态机未执行

**检查**：
1. 路由决策日志
2. 熔断器状态
3. 是否有错误阻止了状态机调用

### 如果状态机执行但超时

**检查**：
1. 查看执行到哪个步骤
2. 检查该步骤的耗时
3. 检查 LLM API 响应时间

**解决方案**：
- 增加超时时间（修改 `agent.service.ts:374`）
- 优化慢步骤的实现

### 如果决策日志仍然为空

**检查**：
1. 状态机是否真的执行了？
2. 每个步骤是否正确记录决策日志？
3. 响应映射是否正确？

## 📊 预期结果

### 修复后预期

1. **路由决策**：`mode=CLAUDE_SM` ✅
2. **状态机执行**：看到开始执行的日志 ✅
3. **步骤执行**：看到至少 `INTAKE` 步骤的执行日志 ✅
4. **决策日志**：即使超时，也能看到已执行的步骤 ✅

### 测试验证

运行测试后，应该能看到：
- ✅ 路由决策是 `CLAUDE_SM`
- ✅ 状态机开始执行
- ✅ 至少执行了 `INTAKE` 步骤
- ✅ 决策日志不为空（即使超时）

## 📝 相关文档

- `scripts/STATE_MACHINE_DIAGNOSIS.md` - 详细诊断报告
- `scripts/STATE_MACHINE_COMPREHENSIVE_FIX.md` - 综合修复方案
- `scripts/STATE_MACHINE_ROUTING_FIX.md` - 路由问题修复
- `scripts/FIX_SUMMARY.md` - 修复总结

## ⚠️ 重要提醒

1. **必须重启服务器**：所有修复都需要重启才能生效
2. **查看服务器日志**：这是诊断问题的关键
3. **逐步验证**：先验证路由决策，再验证状态机执行

## 🎯 成功标准

测试通过的标准：
- ✅ 路由决策正确（`CLAUDE_SM`）
- ✅ 状态机开始执行
- ✅ 至少执行了 `INTAKE` 步骤
- ✅ 决策日志不为空
- ✅ 即使超时，也能看到已执行的步骤
