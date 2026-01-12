# 模型 404 错误修复

## 🐛 问题

服务重启后，环境变量优先级问题已解决，但出现新的错误：

```
Anthropic API error: 404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-3-5-sonnet-20241022"},"request_id":"req_011CX3XfJvBcZN8MfhKyBii8"}
```

## 🔍 原因

`.env` 文件中配置的模型 `claude-3-5-sonnet-20241022` 在代理服务器 `https://hongmacode.com/api` 上不存在。

根据之前的测试，该代理服务器只支持：
- ✅ `claude-3-haiku-20240307`
- ❌ `claude-3-5-sonnet-20241022`（不支持）
- ❌ `claude-3-opus-20240229`（不支持）

## ✅ 修复

已修改 `.env` 文件，将模型改为支持的版本：

```bash
# 修改前
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# 修改后
ANTHROPIC_MODEL=claude-3-haiku-20240307
```

## 🚀 下一步

**需要重启服务**才能应用新的模型配置：

```bash
# 停止当前服务（Ctrl+C）
# 重新启动
npm run dev
```

## ✅ 验证

重启后，日志应该显示：

**正确**：
```
[Anthropic] 调用 API: https://hongmacode.com/api/v1/messages, model: claude-3-haiku-20240307
```

**不应该再看到**：
```
Anthropic API error: 404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-3-5-sonnet-20241022"}}
```

## 📋 当前配置

```bash
ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
ANTHROPIC_MODEL=claude-3-haiku-20240307
ANTHROPIC_BASE_URL=https://hongmacode.com/api
```

---

**最后更新**: 2024-01-12  
**状态**: ✅ 已修复模型配置，等待服务重启验证
