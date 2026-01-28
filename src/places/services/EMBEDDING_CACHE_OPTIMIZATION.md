# Embedding 缓存优化说明

## 问题描述

从日志中观察到，当多个请求几乎同时查询相同的文本 embedding 时，会出现缓存未命中的情况：

```
[Nest] 53498  - 01/28/2026, 7:09:00 AM   DEBUG [EmbeddingCacheService] ❌ Embedding缓存未命中: Eurail Global Pass rules for IS... (1ms)
[Nest] 53498  - 01/28/2026, 7:09:00 AM   DEBUG [EmbeddingCacheService] ❌ Embedding缓存未命中: Eurail Global Pass rules for IS... (0ms)
```

### 原因分析

1. **并发请求竞态条件**：两个请求几乎同时到达，都检查缓存，都未命中
2. **缓存写入时机**：第一个请求生成 embedding 后异步写入缓存，第二个请求在写入完成前检查缓存
3. **重复 API 调用**：导致对相同文本重复调用 OpenAI Embedding API，浪费资源

## 优化方案

### 1. 并发请求去重（In-Flight Request Deduplication）

在 `EmbeddingService` 中添加 `inFlightRequests` Map，跟踪正在进行的 embedding 生成任务：

```typescript
// 并发请求去重：避免同时生成相同文本的 embedding
private readonly inFlightRequests = new Map<string, Promise<number[]>>();
```

**工作流程**：
1. 第一个请求检查缓存 → 未命中 → 创建生成任务 → 添加到 `inFlightRequests`
2. 第二个请求检查缓存 → 未命中 → 发现 `inFlightRequests` 中有相同任务 → 复用该任务
3. 第一个请求完成 → 写入缓存 → 从 `inFlightRequests` 移除
4. 第二个请求获得相同结果 → 直接返回

**优势**：
- ✅ 避免重复的 API 调用
- ✅ 减少延迟（第二个请求等待第一个请求完成，而不是重新生成）
- ✅ 提高缓存命中率

### 2. 内存缓存优先写入

优化 `EmbeddingCacheService.set()` 方法，先写入内存缓存（同步），再异步写入 Redis：

```typescript
// 1. 先写入内存缓存（同步，立即可用）
const expires = Date.now() + ttl * 1000;
this.memoryCache.set(cacheKey, { embedding, expires });

// 2. 异步写入Redis（不阻塞）
if (this.redisService) {
  this.redisService.set(cacheKey, embedding, ttl).then(...).catch(...);
}
```

**优势**：
- ✅ 内存缓存立即可用，后续请求可以立即命中
- ✅ 不阻塞主流程（Redis 写入异步进行）
- ✅ 即使 Redis 失败，内存缓存仍然可用

## 优化效果

### 优化前

```
请求1: 检查缓存 → 未命中 → 生成 embedding → 写入缓存（异步）
请求2: 检查缓存 → 未命中 → 生成 embedding → 写入缓存（异步）
结果: 2次 API 调用，2次缓存未命中
```

### 优化后

```
请求1: 检查缓存 → 未命中 → 创建任务 → 生成 embedding → 写入缓存
请求2: 检查缓存 → 未命中 → 发现进行中的任务 → 等待请求1完成 → 复用结果
结果: 1次 API 调用，1次缓存未命中（请求2等待请求1）
```

## 代码变更

### 1. `src/places/services/embedding.service.ts`

- 添加 `inFlightRequests` Map
- 重构 `generateEmbedding()` 方法，添加并发去重逻辑
- 新增 `generateEmbeddingInternal()` 内部方法

### 2. `src/rag/services/embedding-cache.service.ts`

- 优化 `set()` 方法，先写入内存缓存，再异步写入 Redis
- 改进日志输出，区分内存缓存和 Redis 缓存

## 测试建议

1. **并发测试**：同时发送多个相同查询，验证只有一个 API 调用
2. **缓存命中率**：观察日志中的缓存命中率是否提高
3. **性能测试**：测量并发请求的响应时间是否改善

## 相关日志

优化后，日志应该显示：

```
✅ 使用缓存的embedding: Eurail Global Pass rules for IS...
🔄 复用正在进行的embedding生成: Eurail Global Pass rules for IS...
💾 Embedding已写入内存缓存: Eurail Global Pass rules for IS... (TTL: 86400s)
💾 Embedding已缓存到Redis: Eurail Global Pass rules for IS... (TTL: 86400s)
```

## 注意事项

1. **内存使用**：`inFlightRequests` Map 会在请求完成后自动清理，不会造成内存泄漏
2. **错误处理**：如果 embedding 生成失败，Promise 会被 reject，等待的请求也会收到错误
3. **文本标准化**：使用 `text.trim().toLowerCase()` 作为去重键，确保相同文本被识别为相同请求

## 未来优化方向

1. **分布式去重**：如果有多实例部署，可以使用 Redis 分布式锁来实现跨实例去重
2. **缓存预热**：对于常用查询，可以预先生成并缓存 embedding
3. **批量生成**：对于批量请求，可以使用 OpenAI 的批量 API 提高效率
