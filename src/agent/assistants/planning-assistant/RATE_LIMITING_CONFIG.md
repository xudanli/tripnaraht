# Planning Assistant V2 速率限制配置

**最后更新**: 2026-02-08

---

## 🔧 环境配置

### 开发环境

在开发环境中，速率限制会自动放宽：

- **默认限流**: 1000 次/分钟（全局）
- **Chat 接口**: 300 次/分钟

### 生产环境

在生产环境中，使用严格的限流规则：

- **默认限流**: 100 次/分钟（全局）
- **Chat 接口**: 30 次/分钟

---

## 🚫 禁用限流（仅开发环境）

如果需要在开发环境中完全禁用限流，设置环境变量：

```bash
# 在 .env 文件中添加
DISABLE_THROTTLER=true
```

或者在启动时设置：

```bash
DISABLE_THROTTLER=true npm run dev
```

**注意**: 
- 此设置仅用于开发环境
- 生产环境不应禁用限流
- 禁用限流后，所有接口的限流设置为 999999 次/分钟（实际等同于禁用）

---

## 📊 限流规则总结

### 公开接口

| 接口 | 开发环境 | 生产环境 |
|------|---------|---------|
| `POST /sessions` | 1000 次/分钟 | 10 次/分钟 |
| `GET /recommendations` | 1000 次/分钟 | 20 次/分钟 |
| `POST /chat` | 300 次/分钟 | 30 次/分钟 |

### 受保护接口

| 接口 | 开发环境 | 生产环境 |
|------|---------|---------|
| `GET /sessions/:sessionId` | 1000 次/分钟 | 100 次/分钟 |
| `DELETE /sessions/:sessionId` | 1000 次/分钟 | 10 次/分钟 |
| `GET /sessions/:sessionId/history` | 1000 次/分钟 | 60 次/分钟 |
| `POST /plans/generate` | 1000 次/分钟 | 10 次/分钟 |
| `POST /plans/generate-async` | 1000 次/分钟 | 20 次/分钟 |
| `GET /plans/generate/:taskId` | 1000 次/分钟 | 60 次/分钟 |
| `GET /plans/compare` | 1000 次/分钟 | 20 次/分钟 |
| `POST /plans/:planId/optimize` | 1000 次/分钟 | 10 次/分钟 |
| `POST /plans/:planId/confirm` | 1000 次/分钟 | 10 次/分钟 |
| `POST /trips/:tripId/optimize` | 1000 次/分钟 | 10 次/分钟 |
| `POST /trips/:tripId/refine` | 1000 次/分钟 | 10 次/分钟 |
| `GET /trips/:tripId/suggestions` | 1000 次/分钟 | 30 次/分钟 |

---

## 🔍 调试限流问题

### 检查当前配置

查看日志输出，确认当前限流配置：

```bash
# 开发环境会显示：
[Nest] INFO [PlanningAssistantModule] Throttler configured: 1000 requests/minute (development)

# 生产环境会显示：
[Nest] INFO [PlanningAssistantModule] Throttler configured: 100 requests/minute (production)
```

### 查看限流响应头

当请求被限流时，响应头会包含：

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640000000
```

### 临时禁用限流

如果遇到限流问题，可以临时禁用：

```bash
# 方法1: 设置环境变量
export DISABLE_THROTTLER=true
npm run dev

# 方法2: 在 .env 文件中添加
echo "DISABLE_THROTTLER=true" >> .env
```

---

## ⚠️ 注意事项

1. **开发环境**: 限流已自动放宽，通常不需要禁用
2. **生产环境**: 不应禁用限流，这是重要的安全措施
3. **测试环境**: 建议使用 `DISABLE_THROTTLER=true` 避免测试干扰
4. **限流键**: 默认基于 IP 地址，认证用户基于用户ID

---

**参考文档**:
- [速率限制策略](./RATE_LIMITING_STRATEGY.md)
- [身份验证实施](./AUTHENTICATION_IMPLEMENTATION.md)
