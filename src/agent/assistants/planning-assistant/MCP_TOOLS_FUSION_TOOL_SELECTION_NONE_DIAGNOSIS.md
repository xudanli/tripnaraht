# MCP 工具融合 - 工具选择返回 `none` 问题诊断

## 问题描述

测试结果显示所有工具选择都返回 `none`，尽管路由目标正确（如 `weather`、`airbnb`、`search`）。

## 诊断步骤

### 1. 服务注入状态 ✅

从启动日志确认：
- ✅ `McpToolRegistryService` 已初始化，注册了 12 个工具
- ✅ `LlmToolSelectorService` 已初始化
- ✅ `SmartRouterService` 显示：`Registry=true, Selector=true`
- ✅ `PlanningAssistantV2Service` 显示：`ToolDispatcher=true, SmartRouter=true`

### 2. 代码修改

**问题**：`SmartRouterService` 构造函数中使用了 `@Optional()` 装饰器，可能导致服务未正确注入。

**修复**：
- 移除了 `toolRegistry` 和 `toolSelector` 的 `@Optional()` 装饰器（它们在同一个模块中，应该自动注入）
- 将工具选择相关的 `debug` 日志改为 `log` 级别，确保可见
- 添加了警告日志，如果服务未注入会显示

### 3. 可能的原因

1. **服务注入问题**：虽然日志显示已注入，但实际运行时可能未注入
2. **工具选择逻辑未执行**：条件检查失败，导致工具选择逻辑未执行
3. **LLM 服务未注入**：`LlmToolSelectorService` 需要 `LlmService`，如果未注入会抛出错误
4. **工具注册表为空**：虽然显示注册了 12 个工具，但特定服务的工具可能为空

### 4. 下一步调试

1. **检查服务器重新编译后的日志**：
   ```bash
   tail -f /path/to/server.log | grep -E "\[工具选择\]|工具融合能力|未注入"
   ```

2. **发送测试请求并查看日志**：
   ```bash
   curl -X POST http://localhost:3000/api/agent/planning-assistant/v2/chat \
     -H "Content-Type: application/json" \
     -d '{"sessionId":"test","message":"冰岛下周的天气怎么样？","language":"zh"}'
   ```

3. **检查工具注册表**：
   - 确认 `weather` 服务的工具已注册
   - 确认 `mapTargetToServiceName('weather')` 返回 `'weather'`
   - 确认 `getServiceTools('weather')` 返回非空数组

### 5. 预期日志输出

如果工具选择逻辑正常执行，应该看到：
```
[工具选择] 检查: target=weather, hasRegistry=true, hasSelector=true
[工具选择] 路由目标 weather 映射到服务: weather
[工具选择] 服务 weather 可用工具数: 2, 工具列表: weather.getCurrentWeather, weather.getWeatherByDatetimeRange
[工具选择] 开始工具选择，可用工具: weather.getCurrentWeather, weather.getWeatherByDatetimeRange
[工具选择] 结果: weather.getWeatherByDatetimeRange, confidence=0.85
[工具选择] ✅ 成功: weather.getWeatherByDatetimeRange, confidence=0.85
```

如果服务未注入，应该看到：
```
⚠️ McpToolRegistryService 未注入！
⚠️ LlmToolSelectorService 未注入！
```

## 修复状态

- ✅ 移除了不必要的 `@Optional()` 装饰器
- ✅ 提升了日志级别（debug → log）
- ✅ 添加了服务注入状态警告
- ⏳ 等待服务器重新编译并测试
