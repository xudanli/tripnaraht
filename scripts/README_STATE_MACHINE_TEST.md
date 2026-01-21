# 状态机流程测试说明

## 概述

`test-state-machine-flow.ts` 是一个专门用于测试 CLAUDE_SM 状态机流程的测试脚本。

## 状态机流程

状态机流程按照以下顺序执行：

```
INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → REPAIR → NARRATE → DONE
```

### 关键约束

1. **Gate 必须在 Plan 之前**（硬约束）
2. **Gate = BLOCK 时直接返回**，不执行后续步骤
3. **REPAIR 条件执行**：仅在 `gate_result = ADJUST_REQUIRED` 或 `errors.length > 0` 时执行
4. **NARRATE 不得修改硬字段**（只读约束）

## 使用方法

### 前置条件

1. **确保服务器正在运行**
   ```bash
   npm run dev
   # 或
   npm run backend:dev
   ```

2. **设置环境变量（可选）**
   ```bash
   export BASE_URL=http://localhost:3000
   ```

### 运行测试

```bash
npm run test:state-machine
```

或直接使用 ts-node：

```bash
ts-node scripts/test-state-machine-flow.ts
```

## 测试用例

### 1. 完整流程测试 - 简单行程规划

测试状态机完整流程，从 INTAKE 到 DONE。

**期望步骤**：`INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → NARRATE → DONE`

**期望 Gate 结果**：`ALLOW`

### 2. Gate BLOCK 测试

测试当 Gate 结果为 BLOCK 时，流程应该在 GATE_EVAL 后停止。

**期望步骤**：`INTAKE → RESEARCH → GATE_EVAL`

**期望 Gate 结果**：`BLOCK`

**验证**：不应该执行 PLAN_GEN 步骤

### 3. Gate ADJUST_REQUIRED 测试

测试当 Gate 结果为 ADJUST_REQUIRED 时，应该执行 REPAIR 步骤。

**期望步骤**：`INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → REPAIR → NARRATE → DONE`

**期望 Gate 结果**：`ADJUST_REQUIRED`

### 4. HARD 缺口测试

测试当有 HARD 缺口时，应该在 INTAKE 后返回澄清问题。

**期望步骤**：`INTAKE`

**期望状态**：`NEED_MORE_INFO`

## 测试验证项

测试脚本会验证以下内容：

1. **步骤顺序**：验证步骤是否按正确顺序执行
2. **Gate 结果**：验证 Gate 结果是否符合预期
3. **流程完成**：验证流程是否按预期完成或停止
4. **Gate 约束**：验证 Gate BLOCK 时不执行 PLAN_GEN
5. **Gate 顺序**：验证 GATE_EVAL 在 PLAN_GEN 之前执行

## 输出说明

### 成功输出示例

```
✅ HTTP 状态码: 200
⏱️  响应时间: 12345ms

📋 执行的步骤顺序:
   1. INTAKE
   2. RESEARCH
   3. GATE_EVAL
   4. PLAN_GEN
   5. VERIFY
   6. NARRATE
   7. DONE

🏁 最终步骤: DONE
🚪 Gate 结果: ALLOW

✅ 测试通过
```

### 失败输出示例

```
❌ 测试失败

错误:
   - 缺少期望步骤: RESEARCH
   - Gate 结果不匹配: 期望 ALLOW, 实际 BLOCK
   - 流程未完成: 最终步骤是 FAILED, 期望 DONE
```

## 常见问题

### 1. 请求超时

如果看到 `TIMEOUT` 状态：

- **服务器端超时限制**：服务器端硬编码的最大超时时间为 **20 秒**（`agent.service.ts` 第374行）
- **客户端超时时间**：测试脚本默认超时时间为 5 分钟，但实际受服务器端限制
- **测试用例配置**：所有测试用例已设置 `max_seconds: 20` 来使用服务器端最大允许的超时时间
- **检查服务器状态**：确保服务器正在运行且响应正常
- **检查 LLM API**：确保 Anthropic API 密钥配置正确且可用
- **检查依赖服务**：确保数据库、Redis 等服务都在运行
- **注意**：如果状态机流程需要超过 20 秒，可能需要修改服务器端的超时限制

**调试技巧**：
- 查看服务器日志，了解状态机执行到哪一步
- 检查是否有错误导致流程提前终止
- 查看决策日志，了解已执行的步骤

### 2. 缺少 trip_id 错误

如果看到 "智能体统一入口只为具体行程服务" 错误：

- 确保测试用例中设置了 `trip_id: null` 和 `entry_point: 'dashboard'`
- 这是创建新行程所必需的

### 3. 步骤顺序不正确

如果步骤顺序不符合预期：

- 检查状态机实现是否正确
- 检查是否有错误导致流程提前终止
- 查看决策日志了解执行情况
- 检查响应结构，确保决策日志从正确的位置提取

### 4. 熔断器打开（BREAKER_OPEN）

如果看到 `BREAKER_OPEN:CLAUDE_DYNAMIC` 错误：

- **原因**：之前的请求失败导致熔断器打开
- **解决方案**：
  1. 等待一段时间让熔断器自动恢复
  2. 检查之前的请求是否有错误
  3. 确保 LLM API 服务正常
  4. 检查服务器日志了解具体错误原因

### 5. 决策日志为空

如果测试显示"未找到决策日志"：

- **检查响应结构**：测试脚本会从多个位置尝试提取决策日志：
  1. `response.data.explain.decision_log`
  2. `response.data.result.payload.orchestrationResult.state.decision_log`
  3. `response.data.result.payload.evidence`
- **调试信息**：测试脚本会输出调试信息，显示哪些字段存在
- **可能原因**：
  - 状态机流程未正确执行
  - 决策日志未被正确记录
  - 响应结构发生变化

## 调试技巧

1. **查看完整响应**：测试脚本会输出响应的关键信息，包括决策日志和调试信息
2. **检查服务器日志**：查看服务器端的日志输出，了解状态机执行情况
3. **调整超时时间**：对于复杂请求，可能需要增加超时时间（默认已设置为5分钟）
4. **简化测试用例**：如果测试失败，尝试使用更简单的请求来定位问题
5. **查看调试信息**：测试脚本会输出调试信息，显示响应结构，帮助定位问题
6. **检查决策日志提取**：测试脚本会从多个位置尝试提取决策日志，查看调试信息了解提取情况
7. **检查熔断器状态**：如果看到熔断器打开，等待一段时间后重试

## 相关文件

- `src/agent/services/claude-orchestrator.service.ts` - 状态机实现
- `src/agent/services/agent.service.ts` - 路由逻辑
- `src/agent/interfaces/trip-plan.interface.ts` - 状态机接口定义
- `.claude/roles/AGENT_COLLABORATION.md` - Agent 协作机制文档

## 注意事项

1. **测试环境**：确保在测试环境中运行，避免影响生产数据
2. **API 密钥**：确保配置了正确的 LLM API 密钥（Anthropic、OpenAI 等）
3. **依赖服务**：确保所有依赖服务（数据库、Redis 等）都在运行
4. **成本**：运行测试会产生 LLM API 调用成本，请注意控制测试频率
5. **超时时间**：默认超时时间已设置为 5 分钟，对于复杂请求可能需要更长时间
6. **熔断器**：如果看到熔断器打开，等待一段时间后重试
7. **服务器状态**：确保服务器正在运行且响应正常，否则测试会失败或超时
