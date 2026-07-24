# API 调用 — 边界情况参考

导出时复制到 `references/EDGE_CASES.md`，供 Agent Skills 渐进式加载。

## 429 Rate Limit
- 读取 `Retry-After` 响应头
- 不得 busy-loop 重试

## 401 / 403
- 记录错误体，停止重试
- 检查 api_key 是否在配置层而非日志中

## 超时
- 按 5xx 重试策略处理
- 单次超时默认 30s
