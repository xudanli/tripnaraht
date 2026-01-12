# Anthropic 模型配置修复

## 🔍 问题发现

测试代理服务 `https://hongmacode.com/api` 时发现：

### 测试结果

| 模型名称 | 状态 | 说明 |
|---------|------|------|
| `claude-3-5-sonnet-20241022` | ❌ 不支持 | `not_found_error` |
| `claude-3-opus-20240229` | ❌ 不支持 | `not_found_error` |
| `claude-3-sonnet-20240229` | ❌ 不支持 | `not_found_error` |
| `claude-3-haiku-20240307` | ✅ **支持** | 成功返回响应 |

## ✅ 修复方案

### 更新 .env 配置

将 `ANTHROPIC_MODEL` 改为代理服务支持的模型：

```bash
# 修复前
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# 修复后
ANTHROPIC_MODEL=claude-3-haiku-20240307
```

### 模型说明

- **claude-3-haiku-20240307**: 
  - 快速、低成本
  - 适合简单任务和快速响应
  - 代理服务支持 ✅

- **claude-3-5-sonnet-20241022**: 
  - 平衡性能与成本
  - 代理服务不支持 ❌

## 🚀 下一步

### 1. 重启服务

修改 `.env` 后，**必须重启服务**：

```bash
docker restart tripnara-app
```

### 2. 验证修复

重启后，测试请求应该成功：

```bash
curl -X POST http://127.0.0.1:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_id": "user-123",
    "message": "测试",
    "options": {
      "use_claude_orchestration": true,
      "llm_provider": "anthropic"
    }
  }'
```

**成功标志**：
- 不再出现 `not_found_error`
- 日志中显示 API 调用成功
- 响应中包含决策日志

### 3. 查看日志

```bash
docker logs tripnara-app --tail 50 | grep -i "anthropic\|claude"
```

应该看到：
```
[Anthropic] 调用 API: https://hongmacode.com/api/v1/messages, model: claude-3-haiku-20240307
```

## 📋 配置总结

当前配置：

```bash
ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
ANTHROPIC_MODEL=claude-3-haiku-20240307
ANTHROPIC_BASE_URL=https://hongmacode.com/api
```

## ⚠️ 注意事项

1. **模型限制**：代理服务可能只支持部分模型，需要根据实际情况调整
2. **性能影响**：Haiku 模型比 Sonnet 更快但能力稍弱，适合快速响应场景
3. **成本考虑**：Haiku 成本更低，适合大量调用

## 🔄 如果需要使用其他模型

如果代理服务后续支持其他模型，只需修改 `.env`：

```bash
ANTHROPIC_MODEL=claude-3-sonnet-20240229  # 或其他支持的模型
```

然后重启服务。

---

**最后更新**: 2024-01-12  
**状态**: ✅ 已修复，待重启服务验证
