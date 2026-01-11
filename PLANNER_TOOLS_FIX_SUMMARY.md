# Planner 工具列表修复总结

## 修复状态：✅ 成功

### 修复前的问题

从日志 `@npm (1-872)` 可以看到：
- Planner 生成的计划使用了不存在的工具：`weather.query`、`general.execute`
- ExecutorService 无法找到这些工具，导致执行失败

### 修复后的效果

从最新日志 `@npm (439-935)` 可以看到：
- ✅ Planner 正确使用了 `webbrowse.browse` 工具（第441-442行）
- ✅ ExecutorService 正确提取了工具名（不再是 `weather.query` 或 `general.execute`）
- ✅ 工具列表已成功注入到 Planner Prompt 中

## 已完成的修复

### 1. PlannerService - 工具列表注入

**文件**: `src/agent/plan-execute/planner.service.ts`

**修改内容**:
- 注入 `ActionRegistryService` 依赖
- 添加 `buildAvailableToolsSection()` 方法，动态生成可用工具列表
- 在生成 Prompt 时自动注入工具列表到 `{{AVAILABLE_TOOLS}}` 占位符位置

**效果**:
- Planner 的 Prompt 现在包含完整的可用工具列表
- LLM 知道哪些工具可用，避免生成不存在的工具

### 2. ExecutorService - 工具提取逻辑改进

**文件**: `src/agent/plan-execute/executor.service.ts`

**修改内容**:
- 改进 `extractToolName()` 方法，优先级：
  1. 从反引号中提取工具名（如 "使用 `webbrowse.browse` ..."）
  2. 从 ActionRegistry 中基于关键词匹配工具
  3. 使用模式匹配（改为使用存在的工具）
  4. 如果都失败，抛出错误而不是返回不存在的工具

**效果**:
- 正确提取 Planner 在描述中指定的工具名
- 避免误判（如将"查询天气"误判为 `weather.query`）

### 3. Planner Prompt - 使用规则更新

**文件**: `docs/SKILLS.md`

**修改内容**:
- 在使用规则中明确要求使用反引号指定工具名
- 提供正确和错误的示例

**效果**:
- LLM 知道必须在描述中使用反引号指定工具名
- 减少工具名提取错误

## 当前状态

### ✅ 已解决的问题

1. **工具列表注入**：Planner 现在知道所有可用工具
2. **工具提取**：ExecutorService 正确提取工具名
3. **工具使用**：Planner 使用正确的工具（`webbrowse.browse`）

### ⚠️ 当前问题（环境相关）

从最新日志可以看到，`webbrowse.browse` 工具执行失败，原因是：
- **错误**: `libatk-1.0.so.0: cannot open shared object file: No such file or directory`
- **原因**: Playwright 浏览器启动失败，缺少系统依赖库
- **影响**: 这是环境配置问题，不是 Planner 或工具列表的问题

**解决方案**（如果需要修复浏览器问题）:
```bash
# 安装 Playwright 系统依赖
npx playwright install-deps
# 或安装特定依赖
sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
```

## 验证

从日志可以验证修复成功：

**修复前** (`@npm (1-872)`):
```
[ExecutorService] 步骤 t1 执行失败: 工具未找到: weather.query
[ExecutorService] 步骤 t2 执行失败: 工具未找到: general.execute
```

**修复后** (`@npm (439-935)`):
```
[ExecutorService] 执行步骤: T1 - 使用 `webbrowse.browse` 查询冰岛7月的天气信息...
[ExecutorService] 执行步骤: T2 - 使用 `webbrowse.browse` 查询当前欧元兑人民币...
```

工具名提取正确，现在的问题是浏览器环境依赖缺失，这是另一个问题。

## 修改的文件

1. `src/agent/plan-execute/planner.service.ts`
   - 添加 `ActionRegistryService` 依赖注入
   - 添加 `buildAvailableToolsSection()` 方法
   - 在生成 Prompt 时注入工具列表

2. `src/agent/plan-execute/executor.service.ts`
   - 改进 `extractToolName()` 方法，支持从反引号中提取工具名
   - 添加基于 ActionRegistry 的工具匹配逻辑

3. `docs/SKILLS.md`
   - 在 Planner Prompt 中添加 `{{AVAILABLE_TOOLS}}` 占位符
   - 更新使用规则，明确要求使用反引号指定工具名

## 结论

✅ **Planner 工具列表修复已完成并验证成功**

现在 Planner 能够：
- 看到所有可用工具列表
- 正确使用已注册的工具（如 `webbrowse.browse`）
- 避免使用不存在的工具（如 `weather.query`、`general.execute`）

当前 `webbrowse.browse` 执行失败是环境配置问题（缺少系统依赖库），不是 Planner 的问题。
