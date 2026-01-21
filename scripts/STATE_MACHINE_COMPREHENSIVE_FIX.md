# 状态机流程问题综合修复方案

## 问题诊断（多角色联合会诊）

### 🔴 核心问题

1. **路由决策降级**：虽然设置了 `use_state_machine_orchestration: true`，但路由策略仍然选择 `CLAUDE_DYNAMIC`
2. **超时处理缺陷**：超时时决策日志丢失（`buildFailureResponse` 硬编码空数组）
3. **状态机可能未执行**：如果路由决策不是 `CLAUDE_SM`，状态机根本不会被调用

### 📊 问题根源分析

#### 问题 1: 路由规则优先级

**当前逻辑**：
```typescript
// orchestration-policy.util.ts
1. flag_resolution: CLAUDE_SM (基础模式)
2. rule_explicit_claude_simple_dynamic: 降级到 CLAUDE_DYNAMIC
```

**问题**：即使修复了 `applyExplicitClaudeSimpleDynamicRule`，如果服务器未重启，修复不会生效。

**验证**：查看服务器日志中的路由决策。

#### 问题 2: 超时错误处理

**当前逻辑**：
```typescript
// agent.service.ts:583
const res = await withTimeout(
  this.routeAndRunWithClaudeStateMachine(...),
  remaining,
  'CLAUDE_SM'
);
```

**问题**：
- 如果超时，`withTimeout` 抛出 `TIMEOUT:CLAUDE_SM` 错误
- 错误被 catch 捕获，调用 `buildFailureResponse`
- `buildFailureResponse` 硬编码 `decision_log: []`，丢失所有已执行的步骤日志

**影响**：即使状态机执行了部分步骤，测试也无法看到。

#### 问题 3: 状态机执行超时

**可能原因**：
- LLM API 调用慢（Anthropic API 失败，降级到 DeepSeek）
- Skills 执行慢
- 某个步骤卡住

## 🔧 综合修复方案

### 修复 1: 确保路由决策正确（P0）✅

**已完成**：修复了 `applyExplicitClaudeSimpleDynamicRule` 规则

**需要验证**：
1. 服务器是否重启？
2. 路由决策日志是否显示 `CLAUDE_SM`？

**验证命令**：
```bash
# 查看服务器日志
grep "路由决策" <server_log_file>
```

### 修复 2: 超时时保留部分决策日志（P0）

**问题**：`buildFailureResponse` 硬编码空决策日志

**修复方案**：
1. 修改 `buildFailureResponse` 接受可选的决策日志参数
2. 在超时错误中尝试提取部分执行结果
3. 如果状态机已开始执行，记录已执行的步骤

**代码修改**：

```typescript
// agent.service.ts
private buildFailureResponse(
  request: RouteAndRunRequestDto,
  startTime: number,
  nf: { status: string; errorType: string; message: string; isTimeout: boolean },
  obs: any,
  partialDecisionLog?: DecisionLogEntry[], // 🆕 新增参数
): RouteAndRunResponseDto {
  return {
    // ...
    explain: {
      decision_log: partialDecisionLog || [], // 🆕 使用部分日志
      // ...
    },
  };
}
```

**调用处修改**：
```typescript
// 在 catch 块中，尝试提取部分结果
catch (e: any) {
  // 如果是超时错误，尝试从错误中提取部分结果
  let partialLog: DecisionLogEntry[] = [];
  if (e?.message?.startsWith('TIMEOUT:') && e?.partialResult) {
    partialLog = e.partialResult.decisionLog || [];
  }
  
  const nf = normalizeError(e);
  return this.buildFailureResponse(request, startTime, nf, obs, partialLog);
}
```

### 修复 3: 状态机超时前保存进度（P1）

**方案**：在状态机执行过程中，定期保存决策日志到临时存储

**实现**：
```typescript
// claude-orchestrator.service.ts
async orchestrateWithStateMachine(...) {
  // 使用 AbortController 支持取消
  const abortController = new AbortController();
  
  // 设置超时监听
  const timeoutId = setTimeout(() => {
    abortController.abort();
    // 保存当前进度到错误对象
    const partialResult = {
      state: currentState,
      decisionLog: state.decision_log,
    };
    throw Object.assign(new Error('TIMEOUT:CLAUDE_SM'), { partialResult });
  }, deadline.remainingMs());
  
  try {
    // 执行状态机...
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### 修复 4: 增加超时时间（临时方案）

**方案**：将服务器端最大超时时间从 20 秒增加到 60 秒

**代码修改**：
```typescript
// agent.service.ts:374
const deadline = createDeadline(Math.max(1000, Math.min(maxSeconds * 1000, 60_000))); // 增加到60秒
```

### 修复 5: 优化状态机执行（长期方案）

**方案**：
1. 减少不必要的 LLM 调用
2. 优化 Skills 调用顺序
3. 使用缓存减少重复计算
4. 并行执行独立的步骤

## 🎯 立即行动项

### 优先级 P0（必须立即修复）

1. **验证路由决策修复**
   - 重启服务器
   - 运行测试
   - 查看日志确认路由决策

2. **修复超时决策日志丢失**
   - 修改 `buildFailureResponse` 接受部分日志
   - 修改错误处理逻辑提取部分结果

### 优先级 P1（尽快修复）

3. **增加超时时间**
   - 修改服务器端超时限制
   - 重新测试

4. **添加进度保存机制**
   - 实现超时前保存进度
   - 测试验证

### 优先级 P2（长期优化）

5. **优化状态机流程**
   - 减少 LLM 调用
   - 优化 Skills 顺序
   - 使用缓存

## 📝 测试验证计划

### 阶段 1: 验证路由决策

1. 重启服务器
2. 运行单个测试
3. 查看日志确认路由决策是 `CLAUDE_SM`

### 阶段 2: 验证超时处理

1. 确认路由决策正确后
2. 运行完整测试
3. 即使超时，也应该能看到已执行的步骤

### 阶段 3: 验证完整流程

1. 增加超时时间后
2. 运行完整测试
3. 验证状态机完整执行

## 🔍 调试检查清单

- [ ] 服务器已重启
- [ ] 路由决策日志显示 `CLAUDE_SM`
- [ ] 状态机开始执行日志存在
- [ ] 每个步骤的执行日志存在
- [ ] 超时时决策日志不为空
- [ ] 响应中包含 `orchestrationResult`

## 相关文件

- `src/agent/utils/orchestration-policy.util.ts` - 路由策略（已修复）
- `src/agent/services/agent.service.ts` - 路由和错误处理（需要修复）
- `src/agent/services/claude-orchestrator.service.ts` - 状态机实现（需要优化）
- `scripts/test-state-machine-flow.ts` - 测试脚本
