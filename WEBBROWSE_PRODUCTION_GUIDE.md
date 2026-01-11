# WebBrowse 生产环境配置指南

## 问题

`webbrowse.browse` 工具需要 Playwright 浏览器，而浏览器启动需要系统依赖库（如 `libatk-1.0.so.0`）。

## 解决方案

### 方案 1：禁用 WebBrowse 功能（推荐，如果不需要）

如果生产环境不需要网页浏览功能，可以通过环境变量禁用：

```bash
# 在 .env 文件中设置
ENABLE_WEBBROWSE=false
```

**效果**：
- `webbrowse.browse` 工具仍然注册，但执行时会返回错误（不会崩溃）
- Planner 仍然可以看到 `webbrowse.browse` 工具，但执行时会失败
- 系统会自动触发 Replanner，使用其他工具替代
- 不会尝试启动浏览器，避免依赖库问题

**适用场景**：
- 生产环境不需要访问外部网页
- 希望减少系统依赖和资源消耗
- 避免浏览器相关的安全风险

### 方案 2：安装系统依赖库（如果需要 WebBrowse）

如果生产环境需要网页浏览功能，需要安装 Playwright 的系统依赖：

```bash
# 方法 1：使用 Playwright 自动安装（推荐）
npx playwright install-deps chromium

# 方法 2：手动安装（Ubuntu/Debian）
sudo apt-get update
sudo apt-get install -y \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpango-1.0-0 \
  libcairo2 \
  libatspi2.0-0 \
  libxshmfence1

# 方法 3：在 Dockerfile 中安装
RUN apt-get update && apt-get install -y \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  && rm -rf /var/lib/apt/lists/*
```

**适用场景**：
- 生产环境需要访问外部网页获取信息
- 需要执行 JavaScript 渲染的网页
- 需要截图或提取动态内容

## 当前系统行为

### WebBrowse 的使用场景

从代码中可以看到，`webbrowse.browse` 主要用于：
1. **Plan-and-Execute Agent**：当 Planner 生成需要访问网页的任务时
2. **System2_WEBBROWSE 路由**：当 Router 判断需要网页浏览时（需要用户授权 `allow_webbrowse`）

### 降级机制

系统已经实现了降级机制：
1. **Router 层面**：如果用户未授权 `allow_webbrowse`，自动降级到 `SYSTEM2_REASONING`
2. **Executor 层面**：如果 `webbrowse.browse` 执行失败，会触发 Replanner 使用其他工具
3. **服务层面**：如果 `ENABLE_WEBBROWSE=false`，`webbrowse.browse` 会返回错误但不崩溃

## 建议

### 对于大多数生产环境（推荐）

**禁用 WebBrowse**：
```bash
ENABLE_WEBBROWSE=false
```

**理由**：
1. 减少系统依赖和资源消耗
2. 避免浏览器相关的安全风险
3. 大多数旅行规划场景不需要访问外部网页
4. 系统有完善的降级机制，不会影响核心功能

### 对于需要网页浏览的场景

**安装依赖库**：
```bash
# 在 Dockerfile 或部署脚本中
npx playwright install-deps chromium
```

**理由**：
1. 需要访问外部网页获取实时信息（如天气、汇率等）
2. 需要执行 JavaScript 渲染的网页
3. 需要截图或提取动态内容

## 验证

### 检查 WebBrowse 是否启用

```bash
# 查看环境变量
echo $ENABLE_WEBBROWSE

# 查看启动日志
# 如果禁用，会看到：WebBrowse is disabled
```

### 测试 WebBrowse 功能

```bash
# 如果启用，测试浏览器是否可用
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "查询冰岛天气",
    "options": {
      "allow_webbrowse": true
    }
  }'
```

## 总结

**生产环境是否需要安装 `libatk-1.0.so.0` 等依赖库？**

**答案**：取决于是否需要 WebBrowse 功能

- **不需要**：设置 `ENABLE_WEBBROWSE=false`，无需安装依赖库
- **需要**：安装 Playwright 系统依赖库（`npx playwright install-deps chromium`）

**推荐**：大多数情况下，禁用 WebBrowse 即可，系统会自动使用其他工具（如 `places.resolve_entities`、`trip.load_draft` 等）完成任务。
