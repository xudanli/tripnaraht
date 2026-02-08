# MCP 工具融合架构 - 调试指南

## 🔍 问题诊断

根据测试结果，发现以下问题：

### 当前状态
- ✅ 路由正确：能够正确路由到 `airbnb`、`weather`、`search`
- ❌ 工具选择未触发：`toolName` 都是 `none`
- ✅ 响应正常：所有请求都有响应

### 可能原因

1. **服务注入问题**
   - `toolRegistry` 或 `toolSelector` 可能没有正确注入到 `SmartRouterService`
   - `mcpToolDispatcher` 可能没有正确注入到 `PlanningAssistantV2Service`

2. **工具注册问题**
   - 工具可能没有正确注册
   - 服务名称映射可能不正确

3. **工具选择逻辑问题**
   - LLM 选择可能失败但没有抛出错误
   - 置信度可能低于阈值

## 🔧 调试步骤

### 1. 检查服务注入状态

查看服务器启动日志，应该看到：
```
[LOG] 🚀 MCP Tool Registry Service 初始化
[LOG] ✅ 已注册 11 个工具
[LOG] 🚀 MCP Tool Dispatcher Service 初始化
[LOG] 🚀 LLM Tool Selector Service 初始化
[LOG] 🚀 智能路由服务已初始化
[LOG] 工具融合能力: Registry=true, Selector=true
[LOG] 工具融合服务注入状态: ToolDispatcher=true, SmartRouter=true
```

### 2. 检查路由日志

发送测试请求后，查看日志应该看到：
```
[DEBUG] 工具选择检查: target=weather, hasRegistry=true, hasSelector=true
[DEBUG] 路由目标 weather 映射到服务: weather
[DEBUG] 服务 weather 可用工具数: 2
[DEBUG] 开始工具选择，可用工具: weather.getCurrentWeather, weather.getWeatherByDatetimeRange
[DEBUG] 工具选择结果: weather.getWeatherByDatetimeRange, confidence=0.85
[DEBUG] 工具选择成功: weather.getWeatherByDatetimeRange, confidence=0.85
```

### 3. 如果工具选择未触发

检查以下条件：
1. `toolRegistry` 是否为 `true`
2. `toolSelector` 是否为 `true`
3. `serviceName` 是否不为 `null`
4. `availableTools.length` 是否 > 0

### 4. 如果工具选择失败

查看错误日志：
```
[ERROR] 工具选择失败: ...
```

## 🛠️ 修复建议

### 如果服务未注入

1. **检查模块配置**
   - 确认 `McpToolRegistryService`、`McpToolDispatcherService`、`LlmToolSelectorService` 都在 `providers` 中
   - 确认 `SmartRouterService` 的构造函数正确注入了这些服务

2. **检查循环依赖**
   - 确保没有循环依赖问题

### 如果工具未注册

1. **检查工具注册**
   - 查看 `McpToolRegistryService.onModuleInit()` 日志
   - 确认工具数量正确

2. **检查服务名称映射**
   - 确认 `mapTargetToServiceName()` 返回正确的服务名称

### 如果工具选择失败

1. **检查 LLM 服务**
   - 确认 `LlmService` 可用
   - 检查 LLM API 配置

2. **检查置信度阈值**
   - 当前阈值是 0.6
   - 如果置信度低于阈值，会使用默认路由

## 📊 测试用例

### 测试 1: 检查服务注入
```bash
# 查看服务器启动日志
tail -100 /path/to/server.log | grep "工具融合"
```

### 测试 2: 检查路由和工具选择
```bash
# 运行测试脚本
npx tsx scripts/test-mcp-tools-fusion.ts

# 查看日志中的工具选择信息
```

### 测试 3: 手动测试
```bash
# 创建会话
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/agent/planning-assistant/v2/sessions \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.sessionId')

# 发送测试消息
curl -X POST http://localhost:3000/api/agent/planning-assistant/v2/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"message\": \"冰岛下周的天气怎么样？\",
    \"language\": \"zh\"
  }" | jq '.routing'
```

## 📝 日志检查清单

- [ ] 服务初始化日志（Registry、Dispatcher、Selector）
- [ ] 工具注册日志（11 个工具）
- [ ] 路由日志（target、confidence）
- [ ] 工具选择检查日志（hasRegistry、hasSelector）
- [ ] 服务映射日志（serviceName）
- [ ] 可用工具日志（availableTools.length）
- [ ] 工具选择结果日志（toolName、confidence）
- [ ] 工具调用日志（executeTool）

---

**最后更新**: 2026-02-08
**状态**: 🔍 调试中
