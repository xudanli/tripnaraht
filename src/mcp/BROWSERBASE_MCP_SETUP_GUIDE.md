# Browserbase MCP API Key 申请指南

## 📋 概述

本文档介绍如何申请 Browserbase API Key 和 Project ID，以便使用 Browserbase MCP 服务。

---

## 🚀 申请步骤

### 步骤 1: 注册 Browserbase 账户

1. **访问注册页面**
   - 打开浏览器访问：https://browserbase.com/sign-up
   - 或访问：https://www.browserbase.com/sign-up

2. **填写注册信息**
   需要提供以下信息：
   - **First Name**（名）
   - **Last Name**（姓）
   - **Email Address**（邮箱地址）
   - **Phone Number**（电话号码）
   - **Organization Name**（组织名称，可选）
   - **Password**（密码）

3. **完成注册**
   - 点击 "Sign Up" 或 "Try for free" 按钮
   - 注意：**免费试用不需要信用卡** ✅

---

### 步骤 2: 登录 Dashboard

1. **访问登录页面**
   - https://www.browserbase.com/sign-in
   - 或从注册确认邮件中的链接登录

2. **登录账户**
   - 使用注册时的邮箱和密码登录

---

### 步骤 3: 获取 API Key 和 Project ID

登录后，在 Browserbase Dashboard 中：

1. **进入设置页面**
   - 通常在 Dashboard 右上角的设置图标或 "Settings" 菜单
   - 或直接访问：https://www.browserbase.com/overview（Dashboard）

2. **查找 API 凭证**
   - 在 Dashboard 或 Settings 页面中查找：
     - **API Key**（API 密钥）
     - **Project ID**（项目 ID）

3. **复制凭证**
   - 复制 API Key 和 Project ID
   - 注意：API Key 通常只显示一次，请妥善保存

---

### 步骤 4: 配置环境变量

将获取的 API Key 和 Project ID 添加到项目的 `.env` 文件中：

```bash
# Browserbase MCP 配置
BROWSERBASE_MCP_SERVER_URL=https://server.smithery.ai/@browserbasehq/mcp-browserbase
BROWSERBASE_API_KEY=your-api-key-here
BROWSERBASE_PROJECT_ID=your-project-id-here
```

**重要提示**：
- 将 `your-api-key-here` 替换为实际的 API Key
- 将 `your-project-id-here` 替换为实际的 Project ID
- 不要将 `.env` 文件提交到版本控制系统

---

## 🔍 如果找不到 API Key

如果在 Dashboard 中找不到 API Key，可以尝试以下方法：

### 方法 1: 查看文档

访问 Browserbase 官方文档：
- **Getting Started 指南**: https://docs.browserbase.com/introduction/getting-started
- **API 文档**: https://docs.browserbase.com/reference/api/overview

### 方法 2: 查看账户设置

1. 登录 Dashboard
2. 点击右上角的账户图标
3. 选择 "Settings" 或 "Account Settings"
4. 查找 "API Keys" 或 "Credentials" 部分

### 方法 3: 联系支持

如果仍然找不到 API Key：
- **支持门户**: https://portal.usepylon.com/browserbase/forms/talk-to-an-engineer
- **帮助文档**: https://docs.browserbase.com

---

## 📝 验证配置

配置完成后，可以通过以下方式验证：

### 1. 测试 API 端点

```bash
# 检查服务状态
curl http://localhost:3000/api/browserbase-mcp/health
```

### 2. 运行测试脚本

```bash
npm run test:browserbase-mcp:api
```

### 3. 查看日志

启动应用后，查看日志中是否有：
```
✅ Browserbase MCP Service initialized
```

---

## 💡 常见问题

### Q1: 免费试用有限制吗？

**A**: Browserbase 提供免费试用，通常包括：
- 有限的浏览器会话数量
- 有限的运行时间
- 查看 [Plans 页面](https://www.browserbase.com) 了解详细限制

### Q2: API Key 在哪里使用？

**A**: API Key 和 Project ID 需要在 **Browserbase MCP 服务器端**配置，而不是在客户端代码中。Smithery 的 Browserbase MCP 服务器会自动读取这些环境变量。

### Q3: 如何查看使用情况？

**A**: 
- 登录 Dashboard: https://www.browserbase.com/overview
- 查看 "Usage" 或 "Billing" 部分
- 参考文档: https://docs.browserbase.com/guides/measuring-usage

### Q4: 支持哪些支付方式？

**A**: 查看 [Billing 文档](https://docs.browserbase.com/account/billing) 了解支持的支付方式。

---

## 🔗 相关链接

- **注册页面**: https://browserbase.com/sign-up
- **登录页面**: https://www.browserbase.com/sign-in
- **Dashboard**: https://www.browserbase.com/overview
- **官方文档**: https://docs.browserbase.com
- **Getting Started**: https://docs.browserbase.com/introduction/getting-started
- **API 文档**: https://docs.browserbase.com/reference/api/overview
- **支持**: https://portal.usepylon.com/browserbase/forms/talk-to-an-engineer
- **Smithery 服务器**: https://smithery.ai/server/@browserbasehq/mcp-browserbase

---

## 📚 下一步

配置完成后，您可以：

1. **阅读前端 API 文档**: `src/mcp/BROWSERBASE_MCP_FRONTEND_API.md`
2. **运行测试**: `npm run test:browserbase-mcp:api`
3. **查看使用示例**: 参考文档中的 React Hook 示例
4. **集成到智能体**: Browserbase 工具已自动注册到 MCP Skills Server

---

**最后更新**: 2026-02-06
