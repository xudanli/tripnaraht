# Stripe MCP 服务集成指南

## 📋 概述

本文档说明如何将 [Smithery 提供的 Stripe MCP 服务](https://smithery.ai/server/stripe) 集成到项目中。

### 服务信息

- **服务名称**: Stripe MCP
- **服务 URL**: `https://server.smithery.ai/stripe`
- **服务类型**: 远程 HTTP/SSE MCP 服务器
- **功能**: 提供 Stripe 支付处理相关工具（创建支付意图、确认支付、退款等）
- **认证方式**: OAuth 2.0（可选，取决于服务配置）

---

## 🔧 集成方式

### 方式 1: 在 MCP Skills Server 中使用（推荐）⭐

Stripe MCP 工具已经集成到 MCP Skills Server 中，重启 Cursor 后即可使用：

1. **查看可用工具**:
   ```
   列出所有 Stripe 工具
   ```

2. **创建支付意图**:
   ```
   使用 Stripe 创建一个支付意图，金额 100 美元
   ```

### 方式 2: 在 Claude Desktop 中使用

#### 配置 Claude Desktop

在 Claude Desktop 配置文件中添加：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": ["tsx", "src/mcp/mcp-skills-server.ts"],
      "cwd": "/home/devbox/project"
    },
    "stripe": {
      "command": "npx",
      "args": ["tsx", "src/mcp/stripe-bridge-server.ts"],
      "cwd": "/home/devbox/project"
    }
  }
}
```

---

## 🚀 使用方法

### 测试连接

```bash
# 测试 Stripe MCP 客户端
npm run mcp:test:stripe

# 认证助手（如果需要）
npm run mcp:auth:stripe

# 桥接服务器（用于 Claude Desktop）
npm run mcp:stripe
```

### 认证

如果 Stripe MCP 服务需要 OAuth 认证：

```bash
# 运行认证助手
npm run mcp:auth:stripe

# 清除认证信息（如果需要重新认证）
npm run mcp:auth:stripe -- --clear
```

认证信息保存在 `~/.tripnara-mcp/stripe-*.json` 文件中。

---

## 🛠️ 工具列表

工具列表在连接时动态发现，工具名称格式为 `stripe.{tool_name}`。

常见的 Stripe 工具可能包括：

- `stripe.createPaymentIntent` - 创建支付意图
- `stripe.confirmPayment` - 确认支付
- `stripe.getPaymentStatus` - 获取支付状态
- `stripe.refund` - 处理退款
- `stripe.getPaymentHistory` - 获取支付历史

**注意**: 实际可用工具取决于 Stripe MCP 服务的实现。

---

## ⚙️ 配置

### 环境变量

- `ENABLE_STRIPE_MCP` - 是否启用 Stripe MCP（默认: `true`）
  - 设置为 `false` 可以禁用 Stripe MCP 功能
- `STRIPE_OAUTH_CALLBACK_URL` - OAuth 回调 URL（默认: `http://localhost:3000/oauth/callback`）
- `CLIENT_URI` - 客户端 URI（默认: `http://localhost:3000`）

### 禁用 Stripe MCP

如果不需要 Stripe 功能，可以通过环境变量禁用：

```bash
export ENABLE_STRIPE_MCP=false
npm run mcp:skills
```

---

## 📁 文件结构

```
src/mcp/
├── stripe-client.ts              # Stripe MCP 客户端
├── stripe-bridge-server.ts       # Stripe MCP 桥接服务器
└── STRIPE_MCP_INTEGRATION.md     # 本文件

scripts/
├── test-stripe-mcp.ts            # 测试脚本
└── stripe-auth.ts                # 认证助手
```

---

## 🔐 认证信息存储

Stripe MCP 的认证信息存储在 `~/.tripnara-mcp/` 目录：

```
~/.tripnara-mcp/
├── stripe-tokens.json              # Stripe tokens
├── stripe-client-info.json         # Stripe 客户端信息
└── stripe-code-verifier.txt         # Stripe 代码验证器
```

**安全提示**: 
- 这些文件包含敏感信息，请妥善保管
- 不要将 `~/.tripnara-mcp/` 目录提交到版本控制
- 生产环境建议使用加密存储

---

## 💡 使用场景

### 支付处理

- ✅ 创建支付意图（用于预订住宿、航班等）
- ✅ 确认支付
- ✅ 查询支付状态
- ✅ 处理退款

### 支付历史

- ✅ 查询用户支付历史
- ✅ 生成支付报告

---

## 🧪 测试

### 测试连接和工具列表

```bash
npm run mcp:test:stripe
```

这将：
1. 连接到 Stripe MCP 服务器
2. 列出所有可用工具
3. 显示工具详情

### 测试认证流程

```bash
npm run mcp:auth:stripe
```

---

## ⚠️ 注意事项

1. **OAuth 认证**: Stripe MCP 可能需要 OAuth 认证，首次使用需要运行认证助手
2. **支付安全**: Stripe 支付涉及敏感信息，确保在生产环境中使用 HTTPS
3. **API 限制**: 注意 Stripe API 的调用限制和配额
4. **错误处理**: 支付操作失败时，确保有适当的错误处理和用户提示

---

## 🔗 相关资源

- [Smithery Stripe MCP](https://smithery.ai/server/stripe)
- [Stripe API 文档](https://stripe.com/docs/api)
- [MCP SDK 文档](https://modelcontextprotocol.io/)

---

## ✅ 状态

- ✅ Stripe MCP 客户端 - 已创建
- ✅ Stripe MCP 桥接服务器 - 已创建
- ✅ 集成到 MCP Skills Server - 已完成
- ✅ 测试脚本 - 已创建
- ✅ 认证助手 - 已创建

---

**最后更新**: 2026-02-07
