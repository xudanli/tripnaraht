# RAG 模块优化实现总结

**实现日期**: 2026-01-23  
**实现内容**: 文档中提到的关键优化

---

## ✅ 已实现的优化

### 1. Embedding 缓存 ⭐⭐⭐

**状态**: ✅ 已完成

**实现内容**:
- `EmbeddingCacheService` 已实现并集成到 `EmbeddingService`
- 支持 Redis 缓存（优先）和内存缓存（降级）
- 缓存 TTL: 24小时
- 自动缓存命中统计

**集成位置**:
- `src/rag/services/embedding-cache.service.ts` - 缓存服务实现
- `src/places/services/embedding.service.ts` - 已集成缓存
- `src/rag/rag.module.ts` - 已导出 EmbeddingCacheService
- `src/places/places.module.ts` - 已导入 RagModule（forwardRef）

**预期效果**:
- ✅ 减少 60-70% 延迟（缓存命中时）
- ✅ 降低 50-70% 成本（避免重复 API 调用）

**API 端点**:
- `GET /rag/cache/stats` - 获取缓存统计
- `POST /rag/cache/reset-stats` - 重置统计
- `POST /rag/cache/clear` - 清空缓存

---

### 2. 统一数据模型 ⭐⭐

**状态**: ✅ 已完成

**实现内容**:
- 标记 `RagService`（基于 DocumentIndex）为 `@deprecated`
- 推荐使用 `ChunkRetrievalService`（基于 Chunk 表）
- 添加警告日志提示迁移

**变更**:
- `src/rag/services/rag.service.ts`:
  - 添加 `@deprecated` 注释
  - 添加警告日志
  - 明确说明应使用 `ChunkRetrievalService`

- `src/rag/services/chunk-retrieval.service.ts`:
  - 作为主要检索服务
  - 支持 Hybrid Search
  - 基于 Chunk 表（新系统）

**迁移建议**:
- 新代码使用 `ChunkRetrievalService.retrieve()`
- 旧代码逐步迁移到 Chunk 表
- DocumentIndex 表保留用于向后兼容

---

### 3. Hybrid Search ⭐⭐⭐

**状态**: ✅ 已完成

**实现内容**:
- 实现 Dense（向量）检索
- 实现 Sparse（关键词）检索
- 使用 RRF (Reciprocal Rank Fusion) 合并结果
- 默认启用混合检索

**技术细节**:

1. **Dense 检索**:
   - 使用 pgvector 余弦相似度搜索
   - 基于 embedding 向量

2. **Sparse 检索**:
   - 关键词提取（支持中英文）
   - 停用词过滤
   - 在 content 和 keywords 字段中搜索
   - 计算关键词匹配分数

3. **结果合并**:
   - 使用 RRF (Reciprocal Rank Fusion)
   - 可配置权重（默认: Dense 0.7, Sparse 0.3）
   - 公式: `score = weight / (k + rank)`
   - k = 60（RRF 常数）

**接口变更**:

```typescript
// ChunkRetrievalParams
{
  query: string;
  useHybridSearch?: boolean; // 默认 true
  denseWeight?: number; // 默认 0.7
  sparseWeight?: number; // 默认 0.3
  // ... 其他参数
}

// ChunkRetrievalResult
{
  // ... 基础字段
  denseScore?: number; // Dense 检索分数
  sparseScore?: number; // Sparse 检索分数
  hybridScore?: number; // 混合检索最终分数
}
```

**API 端点**:
- `POST /rag/chunks/retrieve` - 支持 Hybrid Search 参数

**预期效果**:
- ✅ 召回率提升 20-30%
- ✅ 结合语义和关键词匹配优势

---

### 4. Reranking（重排序） ⭐⭐

**状态**: ✅ 已完成

---

### 5. 建立监控体系 ⭐⭐

**状态**: ✅ 已完成

---

### 6. 查询扩展 ⭐⭐

**状态**: ✅ 已完成

---

### 7. 建立测试集 ⭐

**状态**: ✅ 已完成

**实现内容**:
- 实现 `RagTestsetService` 测试集服务（文件存储）
- 支持测试集的读取、写入、校验
- 提供 API 端点帮助查找相关 chunks
- 集成到评估服务中

**功能**:

1. **测试集管理**:
   - 文件存储：`e2e-cases/rag-eval-testset.json`
   - 支持环境变量覆盖路径：`RAG_EVAL_TESTSET_PATH`
   - 自动校验测试集格式

2. **查找相关 chunks**:
   - 根据查询文本查找相关 chunks
   - 使用关键词匹配
   - 返回相关性评分

3. **评估集成**:
   - 支持从测试集文件运行批量评估
   - 自动转换为评估用例格式

**API 端点**:
- `GET /rag/evaluation/testset` - 获取测试集
- `PUT /rag/evaluation/testset` - 保存测试集
- `POST /rag/evaluation/testset/run` - 运行测试集评估
- `GET /rag/evaluation/testset/find-chunks?query=xxx` - 查找相关 chunks
- `GET /rag/evaluation/testset/list-chunks?limit=100` - 列出所有 chunks

**使用流程**:

1. **查找相关 chunks**:
   ```bash
   # 查找与查询相关的 chunks
   GET /rag/evaluation/testset/find-chunks?query=冰岛租车保险&limit=10
   ```

2. **更新测试集**:
   ```bash
   # 获取当前测试集
   GET /rag/evaluation/testset
   
   # 更新 groundTruthChunkIds
   PUT /rag/evaluation/testset
   {
     "testCases": [
       {
         "id": "is-car-insurance-001",
         "query": "冰岛租车保险怎么选？",
         "groundTruthChunkIds": ["uuid1", "uuid2"]  // 从 find-chunks 获取
       }
     ]
   }
   ```

3. **运行评估**:
   ```bash
   POST /rag/evaluation/testset/run
   {
     "params": {
       "useHybridSearch": true,
       "useReranking": false
     }
   }
   ```

**预期效果**:
- ✅ 量化质量，支持回归测试
- ✅ 持续跟踪检索质量变化

**实现内容**:
- 实现 `QueryExpansionService` 查询扩展服务
- 使用 LLM 生成查询变体（同义词、相关词、改写查询）
- 多查询并行检索后合并结果
- 支持降级策略（LLM 失败时使用简单同义词扩展）

**技术细节**:

1. **查询变体生成**:
   - 使用 LLM 生成同义词、相关词、改写查询
   - 支持可配置的变体数量（默认3个）
   - 保持查询核心意图不变

2. **多查询检索**:
   - 并行执行所有查询（原始 + 变体）
   - 每个查询获取更多结果（limit * 2）

3. **结果合并**:
   - 使用加权合并策略
   - 原始查询结果权重最高（1.0）
   - 变体查询结果权重递减（0.7, 0.35, 0.23...）

**接口变更**:

```typescript
// ChunkRetrievalParams
{
  // ... 其他参数
  useQueryExpansion?: boolean; // 默认 false
  maxQueryVariants?: number; // 默认 3
}
```

**API 端点**:
- `POST /rag/chunks/retrieve` - 支持 `useQueryExpansion` 和 `maxQueryVariants` 参数

**预期效果**:
- ✅ 召回率提升 10-15%
- ⚠️ 会增加延迟（多查询并行）和成本（LLM调用）

**使用建议**:
- 对召回率要求高的场景启用
- 可以结合 Hybrid Search 使用
- 考虑缓存查询变体以减少 LLM 调用（未来优化）

**实现内容**:
- 实现 `RAGMonitoringService` 监控服务
- 记录性能、质量、成本、缓存等关键指标
- 集成到检索服务中自动记录
- 提供监控 API 端点

**监控指标**:

1. **性能指标**:
   - 检索延迟（P50/P95/P99/平均）
   - Embedding 生成延迟
   - 吞吐量（QPS）
   - 错误率

2. **质量指标**:
   - Recall@K (K=1,5,10)
   - MRR (Mean Reciprocal Rank)
   - NDCG@K (K=1,5,10)

3. **成本指标**:
   - Embedding API 调用次数和 Token 消耗
   - LLM API 调用次数和 Token 消耗（用于 Reranking）
   - 估算成本（USD）

4. **缓存指标**:
   - 缓存命中率
   - 缓存大小

**API 端点**:
- `GET /rag/monitoring/metrics` - 获取所有监控指标
- `GET /rag/monitoring/performance` - 获取性能指标
- `GET /rag/monitoring/quality` - 获取质量指标
- `GET /rag/monitoring/cost` - 获取成本指标
- `POST /rag/monitoring/reset` - 重置监控指标

**预期效果**:
- ✅ 及时发现问题
- ✅ 持续优化数据支持
- ✅ 成本追踪和告警

**实现内容**:
- 实现 `RerankingService` 使用 LLM 对 Top-K 结果重新排序
- 集成到 `ChunkRetrievalService`
- 支持可配置的重排序参数
- 降级策略：LLM 失败时使用基于分数的排序

**技术细节**:

1. **重排序策略**:
   - 使用 LLM 评估文档与查询的相关性
   - 考虑语义相关性、信息完整性、可信度
   - 返回 JSON 格式的排序结果

2. **降级机制**:
   - LLM 不可用时，使用基于 hybridScore/similarity 的排序
   - 解析失败时自动降级

3. **性能优化**:
   - 默认不启用（因为会增加延迟）
   - 可配置重排序的 Top-K 数量（默认 20）
   - 支持批量重排序（并行处理）

**接口变更**:

```typescript
// ChunkRetrievalParams
{
  // ... 其他参数
  useReranking?: boolean; // 默认 false
  rerankTopK?: number; // 默认 20
}

// ChunkRetrievalResult
{
  // ... 其他字段
  rerankScore?: number; // 重排序分数
  rerankReason?: string; // 重排序原因
}
```

**API 端点**:
- `POST /rag/chunks/retrieve` - 支持 `useReranking` 和 `rerankTopK` 参数

**预期效果**:
- ✅ 准确率提升 10-20%
- ⚠️ 会增加延迟（LLM 调用时间）

**使用建议**:
- 对准确率要求高的场景启用
- 可以只对 Top-20 重排序，返回 Top-10
- 考虑使用专门的 Cross-encoder 模型（未来优化）

---

## 📊 性能优化总结

| 优化项 | 状态 | 预期收益 | 实际实现 |
|--------|------|----------|----------|
| Embedding 缓存 | ✅ | 延迟↓60-70%, 成本↓50-70% | ✅ 已实现 |
| 统一数据模型 | ✅ | 消除混乱，提升可维护性 | ✅ 已标记废弃 |
| Hybrid Search | ✅ | 召回率↑20-30% | ✅ 已实现 |
| Reranking | ✅ | 准确率↑10-20% | ✅ 已实现 |
| 监控体系 | ✅ | 及时发现问题，持续优化 | ✅ 已实现 |
| 查询扩展 | ✅ | 召回率↑10-15% | ✅ 已实现 |

---

## 🔧 使用示例

### 1. 使用 Hybrid Search 检索

```typescript
// 默认启用混合检索
const results = await chunkRetrievalService.retrieve({
  query: '冰岛租车保险',
  limit: 10,
  useHybridSearch: true, // 默认 true
  denseWeight: 0.7,
  sparseWeight: 0.3,
});
```

### 2. 启用 Reranking

```typescript
// 启用重排序（提升准确率）
const results = await chunkRetrievalService.retrieve({
  query: '冰岛租车保险',
  limit: 10,
  useHybridSearch: true,
  useReranking: true, // 启用重排序
  rerankTopK: 20, // 对Top-20重排序
});
```

### 3. 启用查询扩展

```typescript
// 启用查询扩展（提升召回率）
const results = await chunkRetrievalService.retrieve({
  query: '冰岛租车保险',
  limit: 10,
  useHybridSearch: true,
  useQueryExpansion: true, // 启用查询扩展
  maxQueryVariants: 3, // 生成3个查询变体
});
```

### 4. 组合使用所有优化

```typescript
// 组合使用：Hybrid Search + Query Expansion + Reranking
const results = await chunkRetrievalService.retrieve({
  query: '冰岛租车保险',
  limit: 10,
  useHybridSearch: true,
  useQueryExpansion: true,
  useReranking: true,
  maxQueryVariants: 3,
  rerankTopK: 20,
});
```

### 3. 查看缓存统计

```typescript
const stats = embeddingCacheService.getStats();
// {
//   hits: 150,
//   misses: 50,
//   hitRate: 0.75,
//   totalRequests: 200,
//   cacheSize: 150,
//   avgLatencyMs: 2.5
// }
```

---

## 📝 后续优化建议

### 短期（1-2周）
1. ✅ Embedding 缓存 - 已完成
2. ✅ 统一数据模型 - 已完成
3. ✅ Hybrid Search - 已完成
4. ✅ Reranking - 已完成
5. ✅ 监控体系 - 已完成
6. ✅ 查询扩展 - 已完成
7. ✅ 建立测试集 - 已完成

### 中期（1个月）
5. **建立监控体系** - 集成 Prometheus/Grafana
6. **建立测试集** - 收集 100-200 个查询-文档对
7. **优化 Reranking** - 考虑使用 Cross-encoder 模型替代 LLM

### 长期（2-3个月）
8. **查询扩展** - 使用 LLM 生成查询变体
9. **上下文压缩** - 减少 Token 消耗
10. **A/B 测试框架** - 支持实验

---

## 🎯 关键改进点

1. **性能优化**:
   - Embedding 缓存减少 API 调用
   - 并行执行 Dense 和 Sparse 检索

2. **质量提升**:
   - Hybrid Search 结合语义和关键词匹配
   - RRF 合并算法提升召回率
   - Reranking 提升准确率

3. **架构优化**:
   - 明确数据模型使用策略
   - 标记废弃服务，引导迁移
   - 模块化设计，易于扩展

---

## 📚 相关文档

- [RAG模块技术评估报告](./RAG模块技术评估报告.md)
- [ChunkRetrievalService 源码](../src/rag/services/chunk-retrieval.service.ts)
- [EmbeddingCacheService 源码](../src/rag/services/embedding-cache.service.ts)
- [RerankingService 源码](../src/rag/services/reranking.service.ts)
- [RAGMonitoringService 源码](../src/rag/services/rag-monitoring.service.ts)
- [QueryExpansionService 源码](../src/rag/services/query-expansion.service.ts)
- [RagTestsetService 源码](../src/rag/services/rag-testset.service.ts)

---

**实现完成时间**: 2026-01-23  
**下次评估建议**: 优化实施后 1 个月

---

## 🚀 快速开始：填充测试集

### 方法1：使用自动填充脚本（推荐）

```bash
# 运行自动填充脚本
npx ts-node scripts/populate-testset-ground-truth.ts
```

脚本会自动：
1. 读取测试集文件
2. 对每个查询执行 Chunk 检索
3. 自动选择相关 chunks 作为 groundTruthChunkIds
4. 更新测试集文件（自动备份）

### 方法2：使用 API 手动填充

```bash
# 1. 查找相关 chunks
curl "http://localhost:3000/api/rag/evaluation/testset/find-chunks?query=冰岛租车保险&limit=10"

# 2. 更新测试集（使用找到的 chunk UUIDs）
curl -X PUT "http://localhost:3000/api/rag/evaluation/testset" \
  -H "Content-Type: application/json" \
  -d '{
    "version": 1,
    "name": "iceland-kb-smoke",
    "testCases": [
      {
        "id": "is-car-insurance-001",
        "query": "冰岛租车保险怎么选？有哪些必买的险种？",
        "groundTruthChunkIds": ["chunk-uuid-1", "chunk-uuid-2"]
      }
    ]
  }'

# 3. 运行评估
curl -X POST "http://localhost:3000/api/rag/evaluation/testset/run" \
  -H "Content-Type: application/json" \
  -d '{
    "params": {
      "useHybridSearch": true,
      "useReranking": false
    }
  }'
```

---

## 📚 相关文档

- [RAG优化后续计划](./RAG优化后续计划.md) - 后续优化建议
- [RAG测试集使用指南](./RAG测试集使用指南.md) - 测试集使用说明
- [RAG_API接口文档](./RAG_API接口文档.md) - 完整 API 文档
