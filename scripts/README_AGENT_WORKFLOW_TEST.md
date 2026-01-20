# 智能体流程测试指南

## 概述

`test-agent-workflow.ts` 是一个综合测试脚本，用于测试完整的智能体工作流程，包括：

1. **路由决策测试** - 验证 System 1 vs System 2 的路由决策
2. **状态机流程测试** - 验证 CLAUDE_SM 状态机的完整流程
3. **规划工作台测试** - 验证规划工作台的执行流程

## 使用方法

### 基本使用

```bash
# 运行所有测试用例
npm run test:agent-workflow

# 或直接使用 ts-node
ts-node scripts/test-agent-workflow.ts
```

### 环境变量

```bash
# 指定服务器地址（默认: http://localhost:3000）
BASE_URL=http://localhost:3000 npm run test:agent-workflow
```

## 测试用例

### 1. 路由决策测试

#### 简单查询测试
- **目的**: 测试简单查询的路由决策
- **期望**: 验证路由决策逻辑是否正确

#### 复杂规划测试
- **目的**: 测试复杂规划请求的路由
- **期望**: 应该路由到 System 2，执行完整的状态机流程

#### 信息不足测试
- **目的**: 测试信息不足时的处理
- **期望**: 应该返回澄清问题（NEED_MORE_INFO）

#### Gate BLOCK 测试
- **目的**: 测试 Gate BLOCK 时的流程停止
- **期望**: Gate BLOCK 后不应该执行 PLAN_GEN

### 2. 规划工作台测试

#### 生成规划测试
- **目的**: 测试规划工作台的生成规划流程
- **期望**: 成功生成规划并返回 PlanState

## 测试结果解读

### 通过标准

- ✅ **测试通过**: 没有错误，可能有警告
- ⚠️ **测试通过（有警告）**: 没有错误，但有警告（如路由模式不匹配）
- ❌ **测试失败**: 有错误（如步骤顺序错误、Gate BLOCK 时执行了 PLAN_GEN）

### 输出信息

- **HTTP 状态码**: API 响应的 HTTP 状态码
- **响应时间**: 请求处理耗时
- **路由**: 实际路由决策（SYSTEM1_* 或 SYSTEM2_*）
- **执行的步骤**: 状态机执行的步骤序列
- **状态**: 最终状态（READY, NEED_MORE_INFO, FAILED 等）
- **回答预览**: 返回给用户的回答文本预览

## 常见问题

### 1. 测试超时

如果测试超时，可能原因：
- 服务器响应慢
- 网络问题
- LLM API 调用慢

**解决方案**:
- 增加 `timeout` 配置
- 检查服务器状态
- 检查 LLM API 配置

### 2. 路由不匹配

如果路由模式不匹配（期望 SYSTEM1，实际 SYSTEM2），这通常是**警告**而不是错误，因为：
- 路由策略可能根据实际情况调整
- 简单查询可能也需要 System 2 处理

### 3. 步骤缺失

如果缺少期望的步骤，可能是：
- 流程因条件不同而跳过某些步骤
- Gate BLOCK 时不会执行后续步骤
- 信息不足时在 INTAKE 后停止

## 自定义测试用例

可以在 `testCases` 数组中添加自定义测试用例：

```typescript
{
  name: '自定义测试',
  description: '测试描述',
  type: 'route_and_run', // 或 'planning_workbench'
  request: {
    request_id: `test-${Date.now()}`,
    user_id: 'test-user',
    message: '测试消息',
    options: {
      use_claude_orchestration: true,
      use_state_machine_orchestration: true,
    },
  },
  expectedSteps: ['INTAKE', 'RESEARCH', 'GATE_EVAL'],
  timeout: 300000,
}
```

## 相关文档

- `scripts/test-state-machine-flow.ts` - 状态机流程详细测试
- `scripts/test-claude-orchestration.ts` - Claude 编排测试
- `docs/PLANNING_WORKBENCH_API_TEST_RESULTS.md` - 规划工作台 API 测试结果

## 注意事项

1. **确保服务器运行**: 测试前确保服务器在 `http://localhost:3000` 运行
2. **LLM API 配置**: 确保 LLM API 密钥已配置
3. **测试数据**: 某些测试可能需要有效的 trip_id 或其他数据
4. **超时设置**: 复杂流程可能需要较长的超时时间（默认 5 分钟）
