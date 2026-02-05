# Execution 路由问题排查指南

## 问题现象

所有 `/api/execution/*` 路由返回 404 错误：
```
Cannot POST /api/execution/execute
```

## 可能原因

### 1. 服务未重启 ⚠️ 最常见

**症状**: 新添加的路由无法访问，但旧路由正常

**解决方法**:
```bash
# 停止当前服务
# 然后重新启动
npm run start:dev
```

### 2. ExecutionAgentService 初始化失败

**检查方法**:
1. 查看启动日志，查找 `ExecutionAgentService` 相关的错误
2. 检查是否有依赖注入错误

**可能原因**:
- SkillsModule 使用 `forwardRef`，可能导致技能类无法注入
- 但所有依赖都是 `@Optional()`，即使未注入也应该能创建服务

### 3. ExecutionController 未正确注册

**检查方法**:
1. 确认 `ExecutionController` 在 `agent.module.ts` 的 `controllers` 数组中
2. 确认 `ExecutionAgentService` 在 `providers` 数组中

**当前状态**:
- ✅ `ExecutionController` 已在 `controllers` 数组中（第115行）
- ✅ `ExecutionAgentService` 已在 `providers` 数组中（第139行）

### 4. 模块加载顺序问题

**检查方法**:
查看启动日志，确认 AgentModule 是否成功加载

## 诊断步骤

### 步骤1: 检查服务是否重启

```bash
# 检查服务是否在运行
curl http://localhost:3000/api/health

# 如果返回404，说明服务可能未启动或路由未注册
```

### 步骤2: 检查路由注册

```bash
# 运行诊断脚本
./scripts/check-execution-routes.sh
```

### 步骤3: 检查启动日志

查找以下日志：
- `[ExecutionAgentService]` - 服务是否创建
- `[ExecutionController]` - 控制器是否注册
- `[AgentModule]` - 模块是否加载

### 步骤4: 测试健康检查路由

```bash
# 测试新添加的健康检查路由
curl -X GET "http://localhost:3000/api/execution/health"
```

如果这个路由也返回404，说明 ExecutionController 完全没有被注册。

## 临时解决方案

如果问题持续存在，可以尝试：

### 方案1: 重启服务

```bash
# 完全停止服务
# Ctrl+C 或 kill 进程

# 重新启动
npm run start:dev
```

### 方案2: 检查编译错误

```bash
# 检查是否有TypeScript编译错误
npm run build 2>&1 | grep -i "execution"
```

### 方案3: 检查模块导入

确认 `src/app.module.ts` 中 `AgentModule` 已导入：
```typescript
imports: [
  // ...
  AgentModule, // 应该在这里
  // ...
]
```

## 验证修复

修复后，运行以下命令验证：

```bash
# 1. 测试健康检查
curl -X GET "http://localhost:3000/api/execution/health"

# 2. 测试执行接口
curl -X POST "http://localhost:3000/api/execution/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "test",
    "action": "get_status"
  }'

# 3. 运行完整测试脚本
./scripts/test-execution-apis.sh
```

## 如果问题仍然存在

1. **检查启动日志**: 查看是否有 `ExecutionAgentService` 或 `ExecutionController` 相关的错误
2. **检查依赖注入**: 确认所有 `@Optional()` 依赖都能正确处理
3. **检查模块循环依赖**: 确认 `forwardRef` 使用正确
4. **临时移除可选依赖**: 尝试移除 `@Optional()` 依赖，看是否能创建服务

## 相关文件

- `src/agent/execution.controller.ts` - ExecutionController 定义
- `src/agent/services/execution-agent.service.ts` - ExecutionAgentService 定义
- `src/agent/agent.module.ts` - AgentModule 配置
- `src/app.module.ts` - AppModule 配置
