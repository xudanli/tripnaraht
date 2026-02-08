# MCP 工具融合架构 - 问题诊断与修复

## 🔍 问题分析

### 测试结果分析

从测试结果看：
1. ✅ **路由正确**: 能够正确路由到 `airbnb`、`weather`、`search`
2. ❌ **工具选择未触发**: `toolName` 都是 `none`
3. ✅ **响应正常**: 所有请求都有响应，但回退到了默认处理

### 根本原因

根据代码分析，工具选择未触发的原因可能是：

1. **服务注入问题**
   - `toolRegistry` 或 `toolSelector` 可能没有正确注入到 `SmartRouterService`
   - 需要检查模块配置和依赖注入

2. **工具选择逻辑未执行**
   - 条件检查可能失败（`toolRegistry` 或 `toolSelector` 为 `undefined`）
   - 或者工具选择执行了但失败了，没有抛出错误

## 🔧 已添加的调试日志

### 在 SmartRouterService.routeWithTools() 中

```typescript
// 调试日志：检查工具选择条件
this.logger.debug(`工具选择检查: target=${routingResult.target}, hasRegistry=${!!this.toolRegistry}, hasSelector=${!!this.toolSelector}`);

// 映射路由目标到服务名称
this.logger.debug(`路由目标 ${routingResult.target} 映射到服务: ${serviceName}`);

// 获取可用工具
this.logger.debug(`服务 ${serviceName} 可用工具数: ${availableTools.length}`);

// 工具选择结果
this.logger.debug(`工具选择结果: ${toolSelection.tool.toolName}, confidence=${toolSelection.confidence}`);
```

### 在 PlanningAssistantV2Service.chat() 中

```typescript
// 调试日志：检查工具选择结果
this.logger.debug(`路由结果检查: target=${routingResult.target}, hasSelectedTool=${!!routingResult.selectedTool}, hasToolSelection=${!!routingResult.toolSelection}, hasDispatcher=${!!this.mcpToolDispatcher}`);
```

## 🛠️ 修复步骤

### 步骤 1: 检查服务注入

查看服务器启动日志，确认：
```
[LOG] 🚀 MCP Tool Registry Service 初始化
[LOG] ✅ 已注册 11 个工具
[LOG] 🚀 MCP Tool Dispatcher Service 初始化
[LOG] 🚀 LLM Tool Selector Service 初始化
[LOG] 🚀 智能路由服务已初始化
[LOG] 工具融合能力: Registry=true, Selector=true
[LOG] 工具融合服务注入状态: ToolDispatcher=true, SmartRouter=true
```

### 步骤 2: 运行测试并查看日志

```bash
# 运行测试
npx tsx scripts/test-mcp-tools-fusion.ts

# 查看服务器日志中的调试信息
# 应该看到工具选择相关的日志
```

### 步骤 3: 根据日志诊断

如果看到：
- `hasRegistry=false` 或 `hasSelector=false` → 服务注入问题
- `服务 XXX 可用工具数: 0` → 工具注册问题
- `工具选择结果: ...` → 工具选择执行了，检查置信度
- `工具选择失败: ...` → 查看错误信息

## 📋 预期日志输出

### 成功的工具选择应该看到：

```
[DEBUG] 工具选择检查: target=weather, hasRegistry=true, hasSelector=true
[DEBUG] 路由目标 weather 映射到服务: weather
[DEBUG] 服务 weather 可用工具数: 2
[DEBUG] 开始工具选择，可用工具: weather.getCurrentWeather, weather.getWeatherByDatetimeRange
[DEBUG] 工具选择结果: weather.getWeatherByDatetimeRange, confidence=0.85
[DEBUG] 工具选择成功: weather.getWeatherByDatetimeRange, confidence=0.85
[DEBUG] 路由结果检查: target=weather, hasSelectedTool=true, hasToolSelection=true, hasDispatcher=true
[DEBUG] 工具选择: weather.getWeatherByDatetimeRange, confidence=0.85
[DEBUG] 工具调用完成: weather.getWeatherByDatetimeRange, 耗时=1234ms
```

## 🎯 下一步行动

1. **等待服务器启动完成**
2. **运行测试并查看日志**
3. **根据日志诊断问题**
4. **修复发现的问题**

---

**状态**: 🔍 等待服务器启动后诊断
**最后更新**: 2026-02-08
