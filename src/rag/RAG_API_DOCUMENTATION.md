# RAG API 接口文档

本文档介绍 RAG（检索增强生成）相关的 API 接口。

## 目录

- [新知识库检索接口](#新知识库检索接口)
- [已废弃接口](#已废弃接口)
- [知识库管理接口](#知识库管理接口)
- [RAG 评估接口](#rag-评估接口)
- [监控和统计接口](#监控和统计接口)

---

## 新知识库检索接口

### 基础路径
`/api/rag`

### 1. Chunk 检索（推荐使用）

**接口**: `POST /api/rag/chunks/retrieve`

**描述**: 使用新的知识库系统（KnowledgeFile + Chunk）检索文档，默认启用混合检索（Dense + Sparse），对中文查询更有效。

**请求体**:
```json
{
  "query": "冰岛环岛路线推荐",           // 查询文本（必填）
  "limit": 10,                         // 返回数量限制（可选，默认 10）
  "credibilityMin": 0.5,               // 最小可信度（可选，默认 0.5）
  "type": "MARKDOWN",                  // 文档类型（可选）
  "category": "ROUTE_GUIDE",           // 文件分类（可选）
  "fileId": "file-123",                // 文件ID（可选）
  "chunkCategory": "POI_INFO",         // Chunk分类过滤（可选）：RULES, POI_INFO, GATE, WEATHER, GENERAL
  
  // Hybrid Search 配置（推荐启用）
  "useHybridSearch": true,              // 是否使用混合检索（默认 true，推荐）
  "denseWeight": 0.6,                   // Dense检索权重（默认 0.6）
  "sparseWeight": 0.4,                 // Sparse检索权重（默认 0.4）
  
  // 高级功能（可选）
  "useReranking": false,                // 是否使用重排序（默认 false，启用后准确率可达100%，但延迟+2-3秒）
  "rerankTopK": 20,                     // 重排序的Top-K数量（默认 20）
  "useQueryExpansion": false,           // 是否使用查询扩展（默认 false，会增加延迟和成本但提升召回率）
  "maxQueryVariants": 3,                 // 最大查询变体数量（默认 3）
  "useIntentClassification": false      // 是否使用意图分类自动过滤（默认 false）
}
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "chunk-123",
      "chunkId": "chunk-123",
      "content": "冰岛环岛路线推荐：从雷克雅未克出发，沿1号公路顺时针环岛...",
      "type": "PARAGRAPH",
      "credibilityScore": 0.9,
      "keywords": ["冰岛", "环岛", "路线"],
      "metadata": {
        "page": 1,
        "section": "路线推荐"
      },
      "fileId": "file-456",
      "similarity": 0.85,
      "sourceFile": "iceland-ring-road.md",
      "denseScore": 0.82,
      "sparseScore": 0.88,
      "hybridScore": 0.0125
    },
    {
      "id": "chunk-124",
      "chunkId": "chunk-124",
      "content": "环岛路线最佳时间：夏季（6-8月）...",
      "type": "PARAGRAPH",
      "credibilityScore": 0.85,
      "keywords": ["环岛", "最佳时间", "夏季"],
      "metadata": {
        "page": 2,
        "section": "最佳时间"
      },
      "fileId": "file-456",
      "similarity": 0.78,
      "sourceFile": "iceland-ring-road.md",
      "denseScore": 0.75,
      "sparseScore": 0.81,
      "hybridScore": 0.0102
    }
  ]
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | ✅ | - | 查询文本 |
| `limit` | number | ❌ | 10 | 返回数量限制 |
| `credibilityMin` | number | ❌ | 0.5 | 最小可信度阈值（0-1） |
| `type` | string | ❌ | - | 文档类型（MARKDOWN, PDF等） |
| `category` | string | ❌ | - | 文件分类 |
| `fileId` | string | ❌ | - | 文件ID（只检索指定文件） |
| `chunkCategory` | string | ❌ | - | Chunk分类：RULES, POI_INFO, GATE, WEATHER, GENERAL |
| `useHybridSearch` | boolean | ❌ | true | 是否使用混合检索（推荐启用） |
| `denseWeight` | number | ❌ | 0.6 | Dense检索权重（0-1） |
| `sparseWeight` | number | ❌ | 0.4 | Sparse检索权重（0-1） |
| `useReranking` | boolean | ❌ | false | 是否使用重排序（高精度但慢） |
| `rerankTopK` | number | ❌ | 20 | 重排序的Top-K数量 |
| `useQueryExpansion` | boolean | ❌ | false | 是否使用查询扩展（高召回但慢） |
| `maxQueryVariants` | number | ❌ | 3 | 最大查询变体数量 |
| `useIntentClassification` | boolean | ❌ | false | 是否使用意图分类自动过滤 |

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | Chunk ID（与 chunkId 相同） |
| `chunkId` | string | Chunk ID |
| `content` | string | Chunk 内容 |
| `type` | string | Chunk 类型（PARAGRAPH, HEADING等） |
| `credibilityScore` | number | 可信度分数（0-1） |
| `keywords` | string[] | 关键词列表 |
| `metadata` | object | 元数据（页面、章节等） |
| `fileId` | string | 所属文件ID |
| `similarity` | number | 相似度分数（0-1，主要分数） |
| `sourceFile` | string | 文件名 |
| `denseScore` | number | Dense检索分数（可选，Hybrid Search时提供） |
| `sparseScore` | number | Sparse检索分数（可选，Hybrid Search时提供） |
| `hybridScore` | number | 混合检索最终分数（可选，Hybrid Search时提供） |
| `rerankScore` | number | 重排序分数（可选，启用重排序时提供） |
| `rerankReason` | string | 重排序原因（可选，启用重排序时提供） |

**使用示例**:

```typescript
// 基础检索
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '冰岛环岛路线推荐',
    limit: 10,
  }),
});
const result = await response.json();

// 高精度检索（启用重排序）
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '冰岛F路开放时间',
    limit: 5,
    useHybridSearch: true,
    useReranking: true,      // 启用重排序
    rerankTopK: 20,
  }),
});

// 分类过滤检索
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '冰岛租车规则',
    limit: 10,
    chunkCategory: 'RULES',  // 只检索规则类Chunk
  }),
});
```

---

## 已废弃接口

### ⚠️ 以下接口已废弃，请使用新接口

#### 1. GET `/api/rag/retrieve`（已废弃）

**状态**: ❌ 已废弃

**响应**: 返回错误，提示使用新接口

```json
{
  "success": false,
  "error": {
    "code": "BUSINESS_ERROR",
    "message": "此端点已废弃。document_index表已删除，请使用 POST /api/rag/chunks/retrieve 接口"
  },
  "data": {
    "deprecated": true,
    "newEndpoint": "POST /api/rag/chunks/retrieve",
    "migrationGuide": "/api/rag/RAG_API_MIGRATION_GUIDE.md"
  }
}
```

#### 2. POST `/api/rag/search`（已废弃）

**状态**: ❌ 已废弃

**响应**: 返回错误，提示使用新接口

```json
{
  "success": false,
  "error": {
    "code": "BUSINESS_ERROR",
    "message": "此端点已废弃。document_index表已删除，请使用 POST /api/rag/chunks/retrieve 接口"
  },
  "data": {
    "deprecated": true,
    "newEndpoint": "POST /api/rag/chunks/retrieve",
    "migrationGuide": "/api/rag/RAG_API_MIGRATION_GUIDE.md"
  }
}
```

---

## 知识库管理接口

### 1. 获取知识库文档列表

**接口**: `GET /api/rag/documents`

**描述**: 获取 RAG 知识库中的文档列表，支持分页、筛选等功能

**查询参数**:
- `limit` (number, 可选): 分页限制（默认 50）
- `offset` (number, 可选): 分页偏移（默认 0）
- `type` (string, 可选): 文档类型过滤
- `category` (string, 可选): 文件分类过滤

**响应示例**:
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "file-123",
        "fileName": "iceland-ring-road.md",
        "type": "MARKDOWN",
        "category": "ROUTE_GUIDE",
        "chunksCount": 15,
        "createdAt": "2026-02-04T10:00:00.000Z",
        "updatedAt": "2026-02-04T10:00:00.000Z"
      }
    ],
    "total": 100,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 2. 获取单个文档详情

**接口**: `GET /api/rag/documents/:id`

**描述**: 获取指定文档的详细信息，包括所有 Chunks

**路径参数**:
- `id` (string): 文档ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "file-123",
    "fileName": "iceland-ring-road.md",
    "type": "MARKDOWN",
    "category": "ROUTE_GUIDE",
    "chunksCount": 15,
    "chunks": [
      {
        "id": "chunk-123",
        "chunkId": "chunk-123",
        "content": "冰岛环岛路线推荐...",
        "type": "PARAGRAPH",
        "metadata": {}
      }
    ],
    "createdAt": "2026-02-04T10:00:00.000Z",
    "updatedAt": "2026-02-04T10:00:00.000Z"
  }
}
```

---

### 3. 重建知识库索引

**接口**: `POST /api/rag/knowledge-base/rebuild-index`

**描述**: 清空并重新索引所有知识库文件

**响应示例**:
```json
{
  "success": true,
  "data": {
    "message": "知识库索引重建完成"
  }
}
```

---

### 4. 清空知识库索引

**接口**: `POST /api/rag/knowledge-base/clear-index`

**描述**: 清空所有知识库文件和分块

**响应示例**:
```json
{
  "success": true,
  "data": {
    "message": "知识库索引已清空"
  }
}
```

---

## RAG 评估接口

### 1. 评估 Chunk 检索质量

**接口**: `POST /api/rag/evaluation/chunks/evaluate`

**描述**: 评估新知识库系统（Chunk 表）的检索质量，返回 Recall@K、MRR、NDCG 等指标

**请求体**:
```json
{
  "query": "冰岛环岛路线推荐",
  "retrievedChunkIds": ["chunk-123", "chunk-124", "chunk-125"],
  "groundTruthChunkIds": ["chunk-123", "chunk-124"]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "recallAtK": {
      "k1": 0.5,
      "k3": 1.0,
      "k5": 1.0,
      "k10": 1.0
    },
    "mrr": 0.75,
    "ndcg": {
      "k1": 0.5,
      "k3": 0.85,
      "k5": 0.90,
      "k10": 0.92
    },
    "precision": 0.67,
    "f1": 0.80
  }
}
```

---

### 2. 批量评估 Chunk 检索质量

**接口**: `POST /api/rag/evaluation/chunks/evaluate-batch`

**描述**: 批量评估多个查询在 Chunk 检索链路下的质量指标

**请求体**:
```json
{
  "testCases": [
    {
      "query": "冰岛环岛路线推荐",
      "retrievedChunkIds": ["chunk-123", "chunk-124"],
      "groundTruthChunkIds": ["chunk-123"]
    },
    {
      "query": "冰岛F路开放时间",
      "retrievedChunkIds": ["chunk-125", "chunk-126"],
      "groundTruthChunkIds": ["chunk-125", "chunk-126"]
    }
  ]
}
```

---

### 3. 运行测试集评估

**接口**: `POST /api/rag/evaluation/testset/run`

**描述**: 读取测试集并对每个 case 运行 ChunkRetrieval 评估，支持配置 Hybrid/Rerank/Expansion 参数

**请求体**:
```json
{
  "useHybridSearch": true,
  "useReranking": false,
  "useQueryExpansion": false
}
```

---

### 4. 查找相关 chunks

**接口**: `GET /api/rag/evaluation/testset/find-chunks`

**描述**: 根据查询文本查找相关的 chunks，用于帮助填充测试集的 groundTruthChunkIds

**查询参数**:
- `query` (string, 必填): 查询文本
- `limit` (number, 可选): 返回数量限制（默认 10）

---

### 5. 列出所有 chunks

**接口**: `GET /api/rag/evaluation/testset/list-chunks`

**描述**: 列出数据库中的所有 chunks，用于浏览和选择 groundTruthChunkIds

**查询参数**:
- `limit` (number, 可选): 返回数量限制（默认 100）

---

## 监控和统计接口

### 1. 获取 RAG 统计信息

**接口**: `GET /api/rag/stats`

**描述**: 获取 RAG 知识库的统计信息，包括文档数量、集合统计等

**查询参数**:
- `collection` (string, 可选): 集合名称（不提供则返回所有集合的统计）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalDocuments": 100,
    "totalChunks": 1500,
    "collections": {
      "iceland": {
        "documents": 50,
        "chunks": 750
      },
      "svalbard": {
        "documents": 30,
        "chunks": 450
      }
    }
  }
}
```

---

### 2. 获取 RAG 监控指标

**接口**: `GET /api/rag/monitoring/metrics`

**描述**: 获取 RAG 监控指标（总览）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalQueries": 1000,
    "averageLatency": 250,
    "successRate": 0.98,
    "cacheHitRate": 0.75
  }
}
```

---

### 3. 获取性能指标

**接口**: `GET /api/rag/monitoring/performance`

**描述**: 获取 RAG 性能指标（延迟、吞吐量等）

---

### 4. 获取质量指标

**接口**: `GET /api/rag/monitoring/quality`

**描述**: 获取 RAG 质量指标（准确率、召回率等）

---

### 5. 获取成本指标

**接口**: `GET /api/rag/monitoring/cost`

**描述**: 获取 RAG 成本指标（API调用次数、Token消耗等）

---

### 6. 重置监控指标

**接口**: `POST /api/rag/monitoring/reset`

**描述**: 重置所有监控指标

---

### 7. 获取 Prometheus 指标

**接口**: `GET /api/rag/metrics`

**描述**: 获取 Prometheus 格式的监控指标（用于 Prometheus 抓取）

**响应格式**: Prometheus text format

---

## Chunk 分类说明

### ChunkCategory 枚举值

- `RULES`: 规则类（签证、租车规则等）
- `POI_INFO`: POI 信息（景点、餐厅等）
- `GATE`: Gate 决策相关
- `WEATHER`: 天气信息
- `GENERAL`: 通用信息

---

## 检索策略说明

### 1. Hybrid Search（混合检索）

**默认启用**，结合了：
- **Dense Retrieval**: 基于 Embedding 的语义检索（权重 0.6）
- **Sparse Retrieval**: 基于关键词的检索（权重 0.4）

**优势**: 对中文查询更有效，兼顾语义和关键词匹配

### 2. Reranking（重排序）

**默认关闭**，启用后：
- 对 Top-K 结果使用 LLM 重新排序
- 准确率可达 100%
- 但延迟增加 2-3 秒

**适用场景**: 需要高精度的场景

### 3. Query Expansion（查询扩展）

**默认关闭**，启用后：
- 生成查询变体（同义词、相关词）
- 提升召回率
- 但会增加延迟和成本

**适用场景**: 需要高召回率的场景

### 4. Intent Classification（意图分类）

**默认关闭**，启用后：
- 自动识别查询意图
- 自动过滤到对应的 chunkCategory
- 无需手动指定 chunkCategory

**适用场景**: 希望自动分类的场景

---

## 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `BUSINESS_ERROR` | 400 | 业务错误（如端点已废弃） |
| `VALIDATION_ERROR` | 400 | 请求参数验证失败 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

---

## 使用建议

### 1. 基础检索（推荐配置）

```typescript
// 对大多数场景，使用默认配置即可
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '冰岛环岛路线推荐',
    limit: 10,
    // useHybridSearch: true (默认)
  }),
});
```

### 2. 高精度检索

```typescript
// 启用重排序，准确率可达100%，但延迟+2-3秒
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '冰岛F路开放时间',
    limit: 5,
    useHybridSearch: true,
    useReranking: true,      // 启用重排序
    rerankTopK: 20,
  }),
});
```

### 3. 分类过滤检索

```typescript
// 只检索特定分类的Chunk
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '冰岛租车规则',
    limit: 10,
    chunkCategory: 'RULES',  // 只检索规则类Chunk
  }),
});
```

### 4. 意图分类自动过滤

```typescript
// 启用意图分类，自动识别查询意图并过滤
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '冰岛天气怎么样',
    limit: 10,
    useIntentClassification: true,  // 启用意图分类
  }),
});
```

---

## 性能优化建议

1. **合理设置 limit**: 列表展示用 10，详情页用 5，搜索建议用 3
2. **根据场景选择功能**: 快速搜索用默认配置，精确匹配启用重排序
3. **使用缓存**: 相同查询可以缓存结果，减少 API 调用
4. **批量查询**: 避免频繁调用，考虑批量处理

---

## 相关文档

- [RAG API 迁移指南](./RAG_API_MIGRATION_GUIDE.md) - 从旧接口迁移到新接口
- [RAG README](./README.md) - RAG 模块总体说明
- [ChunkRetrievalService 源码](../rag/services/chunk-retrieval.service.ts)

---

## 问题反馈

如果遇到问题，请检查：
1. 请求参数是否正确
2. 知识库中是否有相关数据
3. 网络请求是否成功（状态码 200）
4. 响应格式是否符合预期

如有问题，请联系后端团队或查看相关文档。
