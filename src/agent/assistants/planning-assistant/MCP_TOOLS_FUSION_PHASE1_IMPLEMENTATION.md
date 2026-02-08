# MCP 工具融合架构 - Phase 1: MVP 实现完成

## 📋 实现概览

已成功实现 MCP 工具融合架构的 Phase 1（MVP），使 Planning Assistant V2 能够智能选择并调用 MCP 服务中的具体工具，而不仅仅是服务级别的路由。

## ✅ 已完成的功能

### 1. 核心服务组件

#### 1.1 McpToolRegistryService
- **位置**: `src/agent/assistants/planning-assistant/services/mcp-tool-registry.service.ts`
- **职责**: 
  - 统一管理所有 MCP 工具的能力定义
  - 支持工具注册和动态发现
  - 提供工具查询和分类功能
- **已注册工具**:
  - `airbnb.search` - 搜索房源
  - `airbnb.listingDetails` - 获取房源详情 ⭐
  - `weather.getCurrentWeather` - 获取当前天气
  - `weather.getWeatherByDatetimeRange` - 获取天气预报 ⭐
  - `exa.webSearch` - Web 搜索

#### 1.2 McpToolDispatcherService
- **位置**: `src/agent/assistants/planning-assistant/services/mcp-tool-dispatcher.service.ts`
- **职责**:
  - 统一接口调用所有 MCP 工具
  - 根据服务名称和工具名称路由到对应的服务
  - 处理工具调用的错误和重试
- **支持的服务**:
  - Airbnb (airbnbService)
  - Weather (weatherDirectService)
  - Exa (exaService)

#### 1.3 LlmToolSelectorService
- **位置**: `src/agent/assistants/planning-assistant/services/llm-tool-selector.service.ts`
- **职责**:
  - 使用 LLM 智能选择最合适的工具
  - 从用户消息中提取工具参数
  - 提供工具选择的置信度评估
- **特点**:
  - 使用 DeepSeek LLM 进行工具选择
  - 支持会话上下文（selectedDestination, phase, preferences）
  - 自动参数提取和验证

### 2. 智能路由增强

#### 2.1 SmartRouterService.routeWithTools()
- **位置**: `src/agent/assistants/planning-assistant/services/smart-router.service.ts`
- **新增方法**: `routeWithTools()`
- **功能**:
  - 在基础路由后，如果路由到具体服务，进行工具选择
  - 映射路由目标到服务名称
  - 返回选中的工具和提取的参数

### 3. Planning Assistant V2 集成

#### 3.1 工具调用流程
1. **路由阶段**: `SmartRouterService.routeWithTools()` 分析用户消息
2. **工具选择**: 如果路由到具体服务，`LlmToolSelectorService` 选择最合适的工具
3. **工具执行**: `McpToolDispatcherService` 执行工具调用
4. **结果格式化**: `PlanningAssistantV2Service.formatToolResult()` 格式化返回结果

#### 3.2 支持的工具调用场景

##### Airbnb 房源详情
- **触发**: "这个房源怎么样？房源 ID 是 12345"
- **工具**: `airbnb.listingDetails`
- **参数提取**: listingId, checkin, checkout

##### 天气预报
- **触发**: "冰岛下周的天气怎么样？"
- **工具**: `weather.getWeatherByDatetimeRange`
- **参数提取**: location, startDate, endDate

##### Web 搜索
- **触发**: "搜索冰岛旅游攻略"
- **工具**: `exa.webSearch`
- **参数提取**: query, numResults

## 🔧 技术实现细节

### 依赖注入配置

```typescript
// planning-assistant.module.ts
providers: [
  McpToolRegistryService,    // MCP 工具注册表
  McpToolDispatcherService,   // MCP 工具分发器
  LlmToolSelectorService,     // LLM 工具选择器
  // ...
]
```

### 工具选择流程

```
用户消息
  ↓
SmartRouterService.routeWithTools()
  ↓
基础路由 (route) → 路由到 'airbnb'
  ↓
获取可用工具 (airbnb.search, airbnb.listingDetails)
  ↓
LlmToolSelectorService.selectTool()
  ↓
LLM 分析 → 选择 airbnb.listingDetails
  ↓
提取参数 (listingId: "12345")
  ↓
McpToolDispatcherService.executeTool()
  ↓
调用 AirbnbService.getListingDetails()
  ↓
格式化结果 → 返回给用户
```

## 📊 工具定义示例

```typescript
{
  serviceName: 'airbnb',
  toolName: 'airbnb.listingDetails',
  displayName: '获取房源详情',
  description: '获取 Airbnb 房源的详细信息，包括设施、规则、评价、价格等',
  category: 'accommodation',
  parameters: [
    { name: 'listingId', type: 'string', required: true, description: '房源 ID' },
    { name: 'checkin', type: 'string', required: false, description: '入住日期（YYYY-MM-DD）' },
    { name: 'checkout', type: 'string', required: false, description: '退房日期（YYYY-MM-DD）' },
  ],
  returnType: 'AirbnbListingDetails',
  examples: [
    '这个房源怎么样？房源 ID 是 12345',
    '查看房源详情',
    '这个 Airbnb 有什么设施？'
  ],
}
```

## 🎯 使用示例

### 示例 1: 查询房源详情

**用户输入**: "这个房源怎么样？房源 ID 是 1573970428683000922"

**处理流程**:
1. 路由到 `airbnb` 服务
2. LLM 选择 `airbnb.listingDetails` 工具（置信度: 0.9）
3. 提取参数: `{ listingId: "1573970428683000922" }`
4. 调用 `AirbnbService.getListingDetails()`
5. 返回房源详情

### 示例 2: 查询天气预报

**用户输入**: "冰岛下周的天气怎么样？"

**处理流程**:
1. 路由到 `weather` 服务
2. LLM 选择 `weather.getWeatherByDatetimeRange` 工具（置信度: 0.85）
3. 提取参数: `{ location: "冰岛", startDate: "2026-02-15", endDate: "2026-02-22" }`
4. 调用 `WeatherDirectService.getWeatherByDatetimeRange()`
5. 返回天气预报

## 🚀 下一步计划 (Phase 2)

根据 `MCP_TOOLS_FUSION_EVALUATION.md` 的建议，Phase 2 将包括：

1. **更多工具集成**:
   - Google Calendar 基础操作
   - Exa 高级搜索功能
   - 其他高价值工具

2. **性能优化**:
   - 工具选择缓存
   - 批量工具调用
   - 异步工具执行

3. **错误处理增强**:
   - 工具调用重试机制
   - 降级策略
   - 用户友好的错误消息

4. **监控和日志**:
   - 工具调用指标
   - 选择准确率统计
   - 性能监控

## 📝 注意事项

1. **服务可用性**: 工具分发器会检查服务是否可用，如果服务不可用，会返回明确的错误消息
2. **参数提取**: LLM 会从用户消息中提取参数，如果消息中没有，会使用会话上下文（如 selectedDestination）
3. **向后兼容**: 如果工具选择失败或置信度较低，会回退到原有的服务级别路由
4. **MCP 格式处理**: 工具结果可能是 MCP 格式（`{ content: [{ type: 'text', text: '...' }] }`），会自动解析

## 🔍 测试建议

1. **单元测试**: 测试各个服务的核心功能
2. **集成测试**: 测试完整的工具调用流程
3. **端到端测试**: 使用真实用户消息测试工具选择和执行

## 📚 相关文档

- `MCP_TOOLS_FUSION_STRATEGY.md` - 架构设计文档
- `MCP_TOOLS_FUSION_EVALUATION.md` - 产品/AI 评估报告
- `API_DOCUMENTATION_V2.md` - API 文档

---

**实现日期**: 2026-02-08
**状态**: ✅ Phase 1 MVP 完成
