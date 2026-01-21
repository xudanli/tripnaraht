# 状态机流程测试总结

## 测试脚本状态

✅ **测试脚本已创建并配置完成**

- 文件：`scripts/test-state-machine-flow.ts`
- 文档：`scripts/README_STATE_MACHINE_TEST.md`
- npm 命令：`npm run test:state-machine`

## 已知限制

### 1. 服务器端超时限制

**问题**：服务器端硬编码的最大超时时间为 **20 秒**

**位置**：`src/agent/services/agent.service.ts` 第374行
```typescript
const deadline = createDeadline(Math.max(1000, Math.min(maxSeconds * 1000, 20_000))); // 默认12s，最大20s
```

**影响**：
- 即使客户端设置了更长的超时时间，服务器端也会在 20 秒后强制超时
- 复杂的状态机流程可能需要超过 20 秒才能完成

**解决方案**：
- ✅ 测试脚本已设置 `max_seconds: 20` 来使用最大允许的超时时间
- ⚠️ 如果流程确实需要更长时间，需要修改服务器端的超时限制

### 2. 测试结果分析

从测试运行结果看：

1. **所有请求都在约 12 秒后超时**
   - 这可能是因为状态机流程执行时间较长
   - 或者流程在某个步骤卡住了

2. **决策日志为空**
   - `explain.decision_log` 存在但长度为 0
   - `result.payload.orchestrationResult` 不存在
   - 说明状态机可能没有正确执行或响应结构不匹配

3. **需要进一步调试**
   - 查看服务器日志了解状态机执行情况
   - 检查 LLM API 是否正常工作
   - 验证状态机流程是否正确启动

## 测试用例

### 1. 完整流程测试
- **目的**：测试状态机完整流程，从 INTAKE 到 DONE
- **期望步骤**：`INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → NARRATE → DONE`
- **期望 Gate 结果**：`ALLOW`
- **超时设置**：20 秒（服务器端最大）

### 2. Gate BLOCK 测试
- **目的**：测试当 Gate 结果为 BLOCK 时，流程应该在 GATE_EVAL 后停止
- **期望步骤**：`INTAKE → RESEARCH → GATE_EVAL`
- **期望 Gate 结果**：`BLOCK`
- **验证**：不应该执行 PLAN_GEN 步骤

### 3. Gate ADJUST_REQUIRED 测试
- **目的**：测试当 Gate 结果为 ADJUST_REQUIRED 时，应该执行 REPAIR 步骤
- **期望步骤**：`INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → REPAIR → NARRATE → DONE`
- **期望 Gate 结果**：`ADJUST_REQUIRED`

### 4. HARD 缺口测试
- **目的**：测试当有 HARD 缺口时，应该在 INTAKE 后返回澄清问题
- **期望步骤**：`INTAKE`
- **期望状态**：`NEED_MORE_INFO`

## 改进建议

### 1. 服务器端改进
- **增加超时时间**：考虑将服务器端最大超时时间增加到 60 秒或更长
- **异步处理**：对于长时间运行的流程，考虑使用异步处理模式
- **进度反馈**：提供进度反馈机制，让客户端了解流程执行情况

### 2. 测试脚本改进
- ✅ **已完成**：添加调试信息输出
- ✅ **已完成**：改进决策日志提取逻辑
- ✅ **已完成**：改进错误处理
- ⏳ **待实现**：添加重试机制
- ⏳ **待实现**：添加性能指标收集

### 3. 测试环境改进
- **Mock 服务**：创建 Mock 服务来模拟 LLM API，避免实际 API 调用
- **单元测试**：创建单元测试来测试状态机的各个步骤
- **集成测试**：创建集成测试来测试完整流程

## 下一步行动

1. **检查服务器日志**
   - 查看状态机执行日志
   - 了解流程在哪个步骤卡住或失败

2. **验证 LLM API**
   - 确保 Anthropic API 密钥正确配置
   - 测试 API 连接是否正常

3. **调试状态机流程**
   - 在状态机代码中添加更多日志
   - 检查每个步骤的执行情况

4. **考虑增加超时时间**
   - 如果流程确实需要更长时间，修改服务器端超时限制
   - 或者优化状态机流程以减少执行时间

## 使用方法

```bash
# 1. 确保服务器正在运行
npm run dev

# 2. 运行状态机流程测试
npm run test:state-machine

# 3. 查看测试结果和调试信息
```

## 相关文件

- `scripts/test-state-machine-flow.ts` - 测试脚本
- `scripts/README_STATE_MACHINE_TEST.md` - 测试文档
- `src/agent/services/claude-orchestrator.service.ts` - 状态机实现
- `src/agent/services/agent.service.ts` - 路由和超时控制
