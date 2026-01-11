# Planner 工具列表注入修复

## 问题

从日志中发现，Planner 生成的计划使用了不存在的工具：
- `weather.query` - 不存在
- `general.execute` - 不存在

这导致 ExecutorService 执行失败，触发 Replanner。

## 原因

Planner 的 Prompt 中没有明确列出系统可用的工具列表，导致 LLM 生成了不存在的工具名称。

## 解决方案

修改 `PlannerService`，在生成 Prompt 时动态注入可用工具列表：

### 1. 注入 ActionRegistryService

```typescript
constructor(
  @Optional() private readonly llmService?: LlmService,
  @Optional() private readonly actionRegistry?: ActionRegistryService,
) {}
```

### 2. 构建可用工具列表

添加 `buildAvailableToolsSection()` 方法，从 `ActionRegistryService` 获取所有已注册的工具，并按类别组织：

```typescript
private buildAvailableToolsSection(): string {
  if (!this.actionRegistry) {
    return '**注意**: ActionRegistry 未可用，无法获取工具列表。';
  }

  const actions = this.actionRegistry.list();
  
  // 按类别分组工具
  const toolsByCategory: Record<string, Array<{ name: string; description: string }>> = {};
  
  actions.forEach(action => {
    const category = action.name.split('.')[0];
    if (!toolsByCategory[category]) {
      toolsByCategory[category] = [];
    }
    toolsByCategory[category].push({
      name: action.name,
      description: action.description,
    });
  });

  // 构建工具列表文本...
}
```

### 3. 注入到 Prompt

在生成 Prompt 时，将工具列表注入到适当的位置：

```typescript
// 如果 Prompt 中包含 {{AVAILABLE_TOOLS}} 占位符，替换为实际工具列表
if (systemPrompt.includes('{{AVAILABLE_TOOLS}}')) {
  systemPrompt = systemPrompt.replace(/\{\{AVAILABLE_TOOLS\}\}/g, availableToolsSection);
} else {
  // 如果没有占位符，在 Tool Categories 部分后追加工具列表
  const toolCategoriesPattern = /(#+ Tool Categories[\s\S]*?)(#+ Few-Shot Examples|## Example|# Few-Shot Examples)/;
  if (toolCategoriesPattern.test(systemPrompt)) {
    systemPrompt = systemPrompt.replace(
      toolCategoriesPattern,
      `$1\n\n${availableToolsSection}\n\n$2`
    );
  }
}
```

## 可用工具列表

系统当前注册的工具包括：

### Trip Tools
- `trip.load_draft`: 加载行程草稿
- `trip.apply_user_edit`: 应用用户编辑
- `trip.persist_plan`: 持久化规划结果

### Places Tools
- `places.resolve_entities`: 解析用户输入中的实体（POI、地点等）
- `places.get_poi_facts`: 获取 POI 事实信息（营业时间、规则等）

### Transport Tools
- `transport.build_time_matrix`: 构建时间矩阵（所有点对之间的旅行时间）

### Itinerary Tools
- `itinerary.optimize_day_vrptw`: 使用 VRPTW 算法优化单日行程
- `itinerary.repair_cross_day`: 修复跨天问题（交换节点顺序、移动节点等）

### Policy Tools
- `policy.validate_feasibility`: 验证行程的可行性（时间窗、日界、午餐等）
- `policy.score_robustness`: 评估行程的稳健度

### Readiness Tools
- `readiness.check`: 检查旅行准备度（基于目的地、行程信息和地理特征）

### WebBrowse Tools
- `webbrowse.browse`: 使用无头浏览器访问网页并提取内容

### RailPass Tools
- （如果 RailPassService 可用）

## 效果

现在 Planner 的 Prompt 中会包含完整的可用工具列表，LLM 在生成计划时会：
1. 知道哪些工具可用
2. 只使用已注册的工具
3. 避免生成不存在的工具（如 `weather.query`、`general.execute`）

## 修改的文件

- `src/agent/plan-execute/planner.service.ts`
  - 添加 `ActionRegistryService` 依赖注入
  - 添加 `buildAvailableToolsSection()` 方法
  - 在生成 Prompt 时注入工具列表

## 可选：更新 docs/SKILLS.md

如果希望在 `docs/SKILLS.md` 的 Planner Prompt 中添加 `{{AVAILABLE_TOOLS}}` 占位符，可以在适当位置添加：

```markdown
# Tool Categories
...

{{AVAILABLE_TOOLS}}

# Few-Shot Examples
...
```

这样工具列表会出现在 Prompt 的指定位置。

## 注意事项

1. **ActionRegistry 可用性**：如果 `ActionRegistryService` 不可用（如 MCP 模式），会显示警告信息
2. **工具列表更新**：工具列表是动态生成的，每次调用时都会从 `ActionRegistryService` 获取最新列表
3. **向后兼容**：如果 Prompt 中没有 `{{AVAILABLE_TOOLS}}` 占位符，工具列表会自动追加到 Tool Categories 部分后
