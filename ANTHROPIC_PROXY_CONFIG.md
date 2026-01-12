# Anthropic 代理配置指南

## 📋 配置说明

项目已支持通过代理访问 Anthropic API，使用自定义 base URL。

## 🔧 配置方式

### 在 .env 文件中配置

```bash
# Anthropic API 配置
ANTHROPIC_API_KEY=你的API密钥
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_BASE_URL=https://hongmacode.com/api
```

### 配置说明

- **ANTHROPIC_API_KEY**: API 密钥（代理服务可能接受任何格式的密钥）
- **ANTHROPIC_MODEL**: 模型名称（如 `claude-3-5-sonnet-20241022`）
- **ANTHROPIC_BASE_URL**: 代理服务的 base URL（如 `https://hongmacode.com/api`）

### URL 构建规则

代码会自动构建完整的 API URL：
- 如果 `ANTHROPIC_BASE_URL` 是 `https://hongmacode.com/api`，最终 URL 为 `https://hongmacode.com/api/v1/messages`
- 如果 `ANTHROPIC_BASE_URL` 已经包含 `/v1/messages`，则直接使用

## ✅ 当前配置

```bash
ANTHROPIC_BASE_URL=https://hongmacode.com/api
```

## 🧪 验证配置

重启服务后，查看日志应该看到：

```
[Anthropic] 调用 API: https://hongmacode.com/api/v1/messages, model: claude-3-5-sonnet-20241022
```

## 📝 注意事项

1. **API Key 格式**：使用代理时，API Key 格式可能不受限制（代理服务会处理）
2. **请求头**：代码会发送标准的 Anthropic API 请求头：
   - `x-api-key`: API 密钥
   - `anthropic-version`: `2023-06-01`
   - `Content-Type`: `application/json`
3. **代理兼容性**：确保代理服务兼容 Anthropic API 的请求格式

## 🔄 切换回官方 API

如果需要切换回官方 Anthropic API，只需：

```bash
# 方式 1: 注释掉或删除 ANTHROPIC_BASE_URL
# ANTHROPIC_BASE_URL=https://hongmacode.com/api

# 方式 2: 设置为官方 URL
ANTHROPIC_BASE_URL=https://api.anthropic.com
```

代码会默认使用 `https://api.anthropic.com` 如果未配置 `ANTHROPIC_BASE_URL`。

---

**最后更新**: 2024-01-12  
**状态**: ✅ 已配置
