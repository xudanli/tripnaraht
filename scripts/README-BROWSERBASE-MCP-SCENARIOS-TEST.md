# Browserbase MCP 产品场景测试指南

## 📋 概述

本文档说明如何运行基于产品经理设计的测试场景的端到端测试。

---

## 🎯 测试场景

测试脚本 `test-browserbase-mcp-scenarios.ts` 包含以下场景：

### 场景 1: 旅游网站内容抓取 ⭐⭐⭐
- **业务价值**: 自动抓取旅游网站的价格、评价、图片等信息
- **测试步骤**: 创建会话 → 导航 → 提取信息 → 截图
- **验证点**: 数据提取准确性、截图质量

### 场景 2: 表单自动填写和提交 ⭐⭐⭐
- **业务价值**: 自动化表单填写，提高数据录入效率
- **测试步骤**: 创建会话 → 导航 → 填写表单 → 提交
- **验证点**: 表单字段正确填写、提交成功

### 场景 3: 页面内容验证和截图 ⭐⭐
- **业务价值**: 验证第三方网站内容，保存页面快照作为证据
- **测试步骤**: 创建会话 → 导航 → 验证内容 → 全页截图
- **验证点**: 内容验证准确、截图完整清晰

---

## 🚀 运行测试

### 前置条件

1. **启动开发服务器**
   ```bash
   npm run dev
   ```
   服务器将在 `http://localhost:3000` 启动

2. **完成 OAuth 授权**（如果尚未完成）
   ```bash
   # 获取授权 URL
   curl http://localhost:3000/api/browserbase-mcp/auth/url
   
   # 访问返回的 URL 完成授权
   # 然后更新 .env 文件中的 BROWSERBASE_MCP_CONNECTION_ID
   ```

3. **验证服务健康状态**
   ```bash
   curl http://localhost:3000/api/browserbase-mcp/health
   ```

### 运行测试脚本

```bash
# 运行所有场景测试
npm run test:browserbase-mcp:scenarios

# 或直接使用 tsx
npx tsx scripts/test-browserbase-mcp-scenarios.ts

# 指定不同的 Base URL
API_BASE_URL=http://localhost:3000 npx tsx scripts/test-browserbase-mcp-scenarios.ts
```

---

## 📊 测试输出

测试脚本会输出：

1. **前置检查**: 服务健康状态
2. **场景执行**: 每个场景的详细步骤和结果
3. **测试汇总**: 成功/失败统计、耗时、步骤详情

### 示例输出

```
🚀 Browserbase MCP 产品场景测试
📍 Base URL: http://localhost:3000
⏰ 开始时间: 2/6/2026, 3:54:27 PM

🔍 前置检查: 服务健康状态
   ✅ 服务可用: true

============================================================
📊 场景 1: 旅游网站内容抓取
============================================================

📝 步骤 1: 创建浏览器会话
   ✅ 会话创建成功: session-12345

📝 步骤 2: 导航到目标页面
   ✅ 导航成功

📝 步骤 3: 执行 JavaScript 提取信息
   ✅ 信息提取成功
   数据: { title: "Example Domain", description: "..." }

📝 步骤 4: 截图保存
   ✅ 截图成功
   图片数据长度: 12345 字符

============================================================
📊 测试结果汇总
============================================================

✅ 场景 1: 旅游网站内容抓取
   耗时: 2345ms
   步骤: 4/4 成功

总计: 3 个场景
成功: 3
失败: 0
总耗时: 5678ms
```

---

## 🔧 自定义测试场景

如需添加新的测试场景，编辑 `scripts/test-browserbase-mcp-scenarios.ts`：

1. 创建新的场景函数（如 `scenario4_CustomScenario`）
2. 在主函数 `main()` 中调用新场景
3. 遵循现有的步骤结构和错误处理模式

### 场景函数模板

```typescript
async function scenario4_CustomScenario(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const scenario = '场景 4: 自定义场景';
  const steps: ScenarioResult['steps'] = [];
  
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`📊 ${scenario}`, 'magenta');
  log(`${'='.repeat(60)}`, 'cyan');
  
  let sessionId: string | null = null;
  
  try {
    // 步骤 1: 创建会话
    // ...
    
    // 步骤 2: 执行操作
    // ...
    
    const duration = Date.now() - startTime;
    const success = steps.every(s => s.success);
    return { scenario, success, steps, duration };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return { scenario, success: false, steps, duration };
  }
}
```

---

## 📈 测试指标

### 功能指标
- **成功率**: ≥ 95%
- **响应时间**: ≤ 5秒（单次操作）
- **截图质量**: 清晰度 ≥ 90%

### 业务指标
- **数据准确性**: ≥ 98%
- **覆盖率**: 支持主流旅游网站
- **可用性**: 7x24 小时可用

---

## 🚨 常见问题

### 1. 服务不可用
**错误**: `❌ 服务不可用`

**解决方案**:
- 确保服务器正在运行: `npm run dev`
- 检查端口 3000 是否被占用
- 验证环境变量配置

### 2. OAuth 授权失败
**错误**: `OAuth authorization required`

**解决方案**:
1. 获取授权 URL: `curl http://localhost:3000/api/browserbase-mcp/auth/url`
2. 访问返回的 URL 完成授权
3. 更新 `.env` 文件中的 `BROWSERBASE_MCP_CONNECTION_ID`
4. 重启服务器

### 3. 会话创建失败
**错误**: `创建会话失败`

**可能原因**:
- Browserbase API Key 无效
- Project ID 不正确
- 网络连接问题
- Browserbase 服务不可用

**解决方案**:
- 检查 `.env` 文件中的 `BROWSERBASE_API_KEY` 和 `BROWSERBASE_PROJECT_ID`
- 验证 Browserbase 账户状态
- 检查网络连接

---

## 📝 测试报告

测试完成后，结果会显示在控制台。如需保存测试报告：

```bash
npm run test:browserbase-mcp:scenarios > test-results.log 2>&1
```

---

## 🔗 相关文档

- **产品测试场景**: `src/mcp/BROWSERBASE_MCP_PRODUCT_TEST_SCENARIOS.md`
- **API 文档**: `src/mcp/BROWSERBASE_MCP_FRONTEND_API.md`
- **基础测试**: `scripts/README-BROWSERBASE-MCP-TEST.md`
- **设置指南**: `src/mcp/BROWSERBASE_MCP_SETUP_GUIDE.md`

---

**最后更新**: 2026-02-06
