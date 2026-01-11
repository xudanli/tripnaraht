# WebBrowse 工具的使用目的

## 概述

`webbrowse.browse` 是一个**兜底工具**，用于在系统无法通过内部工具获取信息时，访问外部网页获取实时信息。

## 主要使用场景

### 1. **实时信息查询**

当用户需要实时信息，但系统内部没有对应的 API 或工具时：

- **天气查询**：
  - 用户输入："查询冰岛7月的天气"
  - Planner 生成任务：使用 `webbrowse.browse` 访问天气网站
  - 用途：获取实时天气数据，用于路线规划决策

- **汇率查询**：
  - 用户输入："查询欧元兑人民币的汇率"
  - Planner 生成任务：使用 `webbrowse.browse` 访问汇率网站
  - 用途：预算计算和货币转换

### 2. **外部网页内容提取**

当用户提供 URL 或需要访问特定网页时：

- **URL 直接访问**：
  - 用户输入包含 URL（如："看看这个网页的内容：https://example.com"）
  - Orchestrator 检测到 URL，直接使用 `webbrowse.browse` 访问
  - 用途：提取网页文本内容、标题、链接等

- **官网查询**（通过 Router 硬规则）：
  - 用户输入："查官网有没有房"、"访问官网查看信息"
  - Router 路由到 `SYSTEM2_WEBBROWSE`（需要用户授权）
  - 用途：访问官方网站获取实时信息（如酒店可用性、价格等）

### 3. **JavaScript 渲染内容**

对于需要 JavaScript 执行才能显示内容的动态网页：

- 使用 Playwright 无头浏览器
- 等待页面加载完成（`waitUntil: 'networkidle'`）
- 提取渲染后的文本内容
- 可选择性截图

## 代码中的使用位置

### Router 层面（`router.service.ts`）

```typescript
// 硬规则：检测到浏览器/官网关键词
if (/浏览器|官网|网页|爬取|查.*房|查.*有房/i.test(input)) {
  return {
    route: RouteType.SYSTEM2_WEBBROWSE,
    consent_required: true, // 需要用户授权
    reasons: [RouterReason.REALTIME_WEB, RouterReason.HIGH_RISK_ACTION],
  };
}
```

### Plan-and-Execute Agent 层面

1. **Planner 生成任务**（`planner.service.ts`）：
   - Planner 根据用户需求，判断需要查询实时信息时
   - 生成任务描述，指定使用 `webbrowse.browse` 工具

2. **Executor 执行任务**（`executor.service.ts`）：
   - 从任务描述中提取工具名（优先从反引号中提取，如 `` `webbrowse.browse` ``）
   - 降级匹配规则：
     ```typescript
     const patterns: Record<string, string> = {
       '查询.*天气': 'webbrowse.browse',
       '查询.*汇率': 'webbrowse.browse',
       '获取.*信息': 'webbrowse.browse',
     };
     ```

3. **Orchestrator 直接使用**（`orchestrator.service.ts`）：
   ```typescript
   // 检测用户输入中的 URL
   const urlMatch = this.extractUrlFromInput(state.user_input);
   if (urlMatch) {
     return [{
       name: 'webbrowse.browse',
       input: { url: urlMatch, extract_text: true }
     }];
   }
   ```

## 设计理念：兜底工具

### 为什么是"兜底"？

1. **优先使用内部工具**：
   - 系统优先使用内部的 API 和工具（如 `places.resolve_entities`、`trip.load_draft` 等）
   - 只有在内部工具无法满足需求时，才考虑使用 `webbrowse.browse`

2. **高风险操作**：
   - 访问外部网页需要用户授权（`allow_webbrowse`）
   - 成本高（`ActionCost.HIGH`）
   - 不可缓存（`cacheable: false`）
   - 有副作用（`side_effect: CALLS_API`）

3. **完善的降级机制**：
   - Router 层面：未授权 → 降级到 `SYSTEM2_REASONING`
   - Executor 层面：执行失败 → 触发 Replanner 使用其他工具
   - 服务层面：`ENABLE_WEBBROWSE=false` → 返回错误但不崩溃

## 实际使用示例

### 示例 1：天气查询（Plan-and-Execute）

**用户输入**："我想去冰岛玩，帮我看看7月的天气"

**流程**：
1. Router 路由到 `SYSTEM2_REASONING`（Plan-and-Execute）
2. Planner 生成任务：
   ```json
   {
     "id": "t1",
     "description": "使用 `webbrowse.browse` 查询冰岛7月的天气信息",
     "toolCategory": "weather"
   }
   ```
3. Executor 执行 `webbrowse.browse`，访问天气网站
4. 提取天气数据，返回给用户

### 示例 2：官网查询（Router 硬规则）

**用户输入**："查一下官网有没有房"

**流程**：
1. Router 检测到"官网"关键词，路由到 `SYSTEM2_WEBBROWSE`
2. 检查用户授权 `allow_webbrowse`
   - 如果未授权 → 降级到 `SYSTEM2_REASONING`
   - 如果已授权 → 执行 `webbrowse.browse` 访问官网

### 示例 3：URL 直接访问（Orchestrator）

**用户输入**："看看这个网页：https://example.com/route-info"

**流程**：
1. Router 路由到 `SYSTEM2_REASONING`
2. Orchestrator 检测到 URL，直接使用 `webbrowse.browse` 访问
3. 提取页面内容，返回给用户

## 注意事项

### 1. **生产环境建议**

大多数场景下，**建议禁用 WebBrowse**：
- 设置 `ENABLE_WEBBROWSE=false`
- 系统会使用其他工具完成任务
- 减少系统依赖和资源消耗

### 2. **何时需要启用**

只有在以下情况才需要启用：
- 需要访问外部网页获取实时信息（天气、汇率等）
- 需要执行 JavaScript 渲染的网页
- 用户明确需要访问外部 URL

### 3. **替代方案**

系统内部已有其他工具可以替代部分功能：
- **天气**：可以使用 `readiness.check` 获取准备度信息（包含天气窗口）
- **汇率**：可以使用 `countryPack.getBlocks` 获取货币信息
- **POI 信息**：使用 `places.resolve_entities`、`places.search` 等

## 总结

**WebBrowse 的目的**：
1. ✅ 获取实时信息（天气、汇率等）
2. ✅ 访问外部网页内容
3. ✅ 处理 JavaScript 渲染的动态网页
4. ✅ 作为兜底工具，在内部工具无法满足需求时使用

**关键特点**：
- 🔒 需要用户授权（高风险操作）
- 💰 成本高（资源消耗大）
- 🔄 有完善的降级机制
- ⚠️ 大多数场景下可禁用
