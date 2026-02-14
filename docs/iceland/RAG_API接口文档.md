# RAG API 接口文档

## 📋 概述

本文档描述了 RAG（Retrieval Augmented Generation）模块的所有 API 接口。

**Base URL**: `/rag`

**认证**: 所有接口均使用 `@Public()` 装饰器，无需认证（生产环境建议添加认证）

---

## 📚 目录

1. [文档检索](#文档检索)
2. [Chunk 检索（新系统）](#chunk-检索新系统)
3. [文档管理](#文档管理)
4. [合规规则提取](#合规规则提取)
5. [路线叙事生成](#路线叙事生成)
6. [当地洞察](#当地洞察)
7. [增强对话](#增强对话)
8. [评估与测试集](#评估与测试集)
9. [监控指标](#监控指标)
10. [缓存管理](#缓存管理)
11. [知识库管理](#知识库管理)
12. [Query-Document 对收集](#query-document-对收集)

---

## 文档检索

### 1. 检索文档（GET）

**接口**: `GET /rag/retrieve`

**描述**: 从 RAG 知识库中检索相关文档（旧系统：DocumentIndex 表）

**查询参数**:
- `query` (string, 必填): 查询文本
- `collection` (string, 必填): 集合名称
- `countryCode` (string, 可选): 国家代码
- `limit` (number, 可选): 返回数量限制，默认 10

**示例请求**:
```bash
GET /rag/retrieve?query=冰岛租车&collection=travel_guides&countryCode=IS&limit=10
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "doc-001",
      "content": "冰岛租车需要...",
      "title": "冰岛租车指南",
      "source": "iceland-guide.json",
      "score": 0.85,
      "metadata": {
        "countryCode": "IS",
        "tags": ["car-rental"]
      }
    }
  ]
}
```

---

### 2. RAG 搜索（POST）

**接口**: `POST /rag/search`

**描述**: 从 RAG 知识库中搜索相关文档，支持更复杂的查询参数

**请求体**:
```json
{
  "query": "冰岛租车保险",
  "collection": "travel_guides",
  "countryCode": "IS",
  "tags": ["car-rental", "insurance"],
  "limit": 10,
  "minScore": 0.5
}
```

**参数说明**:
- `query` (string, 必填): 查询文本
- `collection` (string, 必填): 集合名称
- `countryCode` (string, 可选): 国家代码
- `tags` (string[], 可选): 标签列表
- `limit` (number, 可选): 返回数量限制，默认 10
- `minScore` (number, 可选): 最小相似度分数，默认 0.5

**响应**: 同 `GET /rag/retrieve`

---

### 3. RAG 统计

**接口**: `GET /rag/stats`

**描述**: 获取 RAG 知识库的统计信息

**查询参数**:
- `collection` (string, 可选): 集合名称（不提供则返回所有集合的统计）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalDocuments": 1000,
    "collections": {
      "travel_guides": {
        "count": 500,
        "countries": ["IS", "JP", "CH"]
      }
    }
  }
}
```

---

## Chunk 检索（新系统）

### 4. 从 Chunk 表检索文档（支持 Hybrid Search）

**接口**: `POST /rag/chunks/retrieve`

**描述**: 使用新的知识库系统（KnowledgeFile + Chunk）检索文档，支持混合检索、重排序、查询扩展等高级功能

**请求体**:
```json
{
  "query": "冰岛租车保险怎么选？",
  "limit": 10,
  "credibilityMin": 0.5,
  "type": "operational_guide",
  "category": "practical",
  "fileId": "file-uuid",
  "useHybridSearch": true,
  "denseWeight": 0.7,
  "sparseWeight": 0.3,
  "useReranking": false,
  "rerankTopK": 20,
  "useQueryExpansion": false,
  "maxQueryVariants": 3
}
```

**参数说明**:
- `query` (string, 必填): 查询文本
- `limit` (number, 可选): 返回数量限制，默认 10
- `credibilityMin` (number, 可选): 最小可信度，默认 0.5
- `type` (string, 可选): 文档类型过滤
- `category` (string, 可选): 文件分类过滤
- `fileId` (string, 可选): 文件ID过滤
- `useHybridSearch` (boolean, 可选): 是否使用混合检索（Dense + Sparse），默认 true
- `denseWeight` (number, 可选): Dense检索权重，默认 0.7
- `sparseWeight` (number, 可选): Sparse检索权重，默认 0.3
- `useReranking` (boolean, 可选): 是否使用重排序（会增加延迟但提升准确率），默认 false
- `rerankTopK` (number, 可选): 重排序的Top-K数量，默认 20
- `useQueryExpansion` (boolean, 可选): 是否使用查询扩展（会增加延迟和成本但提升召回率），默认 false
- `maxQueryVariants` (number, 可选): 最大查询变体数量，默认 3

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "chunk-uuid",
      "chunkId": "car_rental_insurance_001",
      "content": "冰岛租车保险包括...",
      "type": "operational_guide",
      "credibilityScore": 0.9,
      "keywords": ["租车", "保险", "冰岛"],
      "file": {
        "id": "file-uuid",
        "filename": "iceland-car-rental-guide.json",
        "category": "practical"
      },
      "denseScore": 0.85,
      "sparseScore": 0.75,
      "hybridScore": 0.82,
      "rerankScore": 0.88,
      "rerankReason": "LLM reranking"
    }
  ]
}
```

---

## 文档管理

### 5. 索引文档

**接口**: `POST /rag/index`

**描述**: 将文档添加到 RAG 知识库索引

**请求体**:
```json
{
  "collection": "travel_guides",
  "title": "冰岛租车指南",
  "content": "冰岛租车需要...",
  "countryCode": "IS",
  "tags": ["car-rental"],
  "source": "iceland-guide.json",
  "metadata": {
    "author": "TripNara"
  }
}
```

**响应示例**:
```json
{
  "id": "doc-uuid",
  "success": true
}
```

---

### 6. 批量索引文档

**接口**: `POST /rag/index/batch`

**描述**: 批量将文档添加到 RAG 知识库索引。支持两种格式：
1. DocumentIndexItem 数组
2. 路线JSON对象（会自动转换为文档）

**请求体（文档数组）**:
```json
[
  {
    "collection": "travel_guides",
    "title": "文档1",
    "content": "内容1",
    "countryCode": "IS"
  },
  {
    "collection": "travel_guides",
    "title": "文档2",
    "content": "内容2",
    "countryCode": "IS"
  }
]
```

**请求体（路线JSON）**:
```json
{
  "route": {
    "route_id": "iceland_golden_circle_001",
    "route_name": "黄金圈路线",
    "key_stops": [...],
    "risk_assessment": {...}
  },
  "metadata": {...}
}
```

**响应示例**:
```json
{
  "ids": ["doc-uuid-1", "doc-uuid-2"],
  "success": true,
  "count": 2
}
```

---

### 7. 获取文档列表（后台管理）

**接口**: `GET /rag/documents`

**描述**: 获取 RAG 知识库中的文档列表，支持分页、筛选

**查询参数**:
- `collection` (string, 可选): 集合名称
- `countryCode` (string, 可选): 国家代码
- `tags` (string, 可选): 标签（逗号分隔）
- `page` (number, 可选): 页码，从1开始，默认 1
- `pageSize` (number, 可选): 每页数量，默认 20
- `search` (string, 可选): 搜索关键词（标题或内容）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "doc-uuid",
        "title": "文档标题",
        "contentPreview": "内容预览...",
        "collection": "travel_guides",
        "countryCode": "IS"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

### 8. 获取文档详情

**接口**: `GET /rag/documents/:id`

**描述**: 根据文档 ID 获取文档的详细信息

**路径参数**:
- `id` (string): 文档 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "doc-uuid",
    "title": "文档标题",
    "content": "完整内容",
    "collection": "travel_guides",
    "countryCode": "IS",
    "tags": ["tag1", "tag2"],
    "source": "source.json",
    "metadata": {...}
  }
}
```

---

### 9. 更新文档

**接口**: `PUT /rag/documents/:id`

**描述**: 更新 RAG 知识库中的文档，如果内容更新会自动重新生成 embedding

**路径参数**:
- `id` (string): 文档 ID

**请求体**:
```json
{
  "title": "更新后的标题",
  "content": "更新后的内容",
  "tags": ["tag1", "tag2"]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "doc-uuid",
    "message": "文档更新成功"
  }
}
```

---

### 10. 删除文档

**接口**: `DELETE /rag/documents/:id`

**描述**: 从 RAG 知识库中删除指定文档

**路径参数**:
- `id` (string): 文档 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "doc-uuid",
    "message": "文档删除成功"
  }
}
```

---

## 合规规则提取

### 11. 提取 Rail Pass 规则

**接口**: `POST /rag/compliance/rail-pass`

**描述**: 从文档中提取铁路通票相关的合规规则

**请求体**:
```json
{
  "passType": "Eurail Global Pass",
  "countryCode": "IS"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "passType": "Eurail Global Pass",
      "countryCode": "IS",
      "requiresReservation": true,
      "rules": "..."
    }
  ]
}
```

---

### 12. 提取 Trail Access 规则

**接口**: `POST /rag/compliance/trail-access`

**描述**: 从文档中提取步道访问相关的合规规则

**请求体**:
```json
{
  "trailId": "trail-001",
  "countryCode": "IS"
}
```

---

### 13. 刷新合规规则缓存

**接口**: `POST /rag/compliance/refresh`

**描述**: 手动触发合规规则缓存刷新

**响应示例**:
```json
{
  "success": true,
  "message": "Compliance rules refresh started"
}
```

---

## 路线叙事生成

### 14. 生成路线叙事

**接口**: `GET /rag/route-narrative/:routeDirectionId`

**描述**: 为指定路线生成丰富的叙事内容

**路径参数**:
- `routeDirectionId` (string): 路线方向 ID

**查询参数**:
- `countryCode` (string, 可选): 国家代码
- `includeLocalInsights` (boolean, 可选): 是否包含当地洞察信息

**响应示例**:
```json
{
  "success": true,
  "data": {
    "narrative": "路线叙事内容...",
    "localInsights": [...]
  }
}
```

---

### 15. 生成路线段叙事

**接口**: `POST /rag/segment-narrative`

**描述**: 为路线段生成叙事内容

**请求体**:
```json
{
  "segmentId": "segment-001",
  "dayIndex": 1,
  "name": "段名称",
  "description": "段描述",
  "countryCode": "IS"
}
```

---

## 当地洞察

### 16. 获取当地洞察

**接口**: `GET /rag/local-insight`

**描述**: 获取指定地区的当地洞察信息

**查询参数**:
- `countryCode` (string, 必填): 国家代码
- `tags` (string, 必填): 标签（逗号分隔或数组），如 "culture,tips,etiquette"
- `region` (string, 可选): 地区

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "content": "当地洞察内容...",
      "tags": ["culture", "tips"],
      "countryCode": "IS"
    }
  ]
}
```

---

### 17. 刷新当地洞察缓存

**接口**: `POST /rag/local-insight/refresh`

**描述**: 手动触发指定地区的当地洞察信息缓存刷新

**请求体**:
```json
{
  "countryCode": "IS",
  "tags": ["culture", "tips", "etiquette"],
  "region": "Reykjavik"
}
```

---

## 增强对话

### 18. 回答路线问题

**接口**: `POST /rag/chat/answer-route-question`

**描述**: 使用增强对话功能回答关于路线的问题

**请求体**:
```json
{
  "question": "这条路线适合新手吗？",
  "routeDirectionId": "route-001",
  "countryCode": "IS",
  "segmentId": "segment-001",
  "dayIndex": 1,
  "tripId": "trip-001"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "answer": "回答内容...",
    "source": "HYBRID",
    "ragSnippets": [...],
    "structuredData": {...}
  }
}
```

---

### 19. 解释为什么不是另一条路线

**接口**: `POST /rag/chat/explain-why-not-other-route`

**描述**: 解释为什么选择某条路线而不是另一条

**请求体**:
```json
{
  "selectedRouteId": "route-001",
  "alternativeRouteId": "route-002",
  "countryCode": "IS"
}
```

---

### 20. 获取目的地深度实用信息

**接口**: `GET /rag/destination-insights`

**描述**: 获取行程中目的地的特色贴士和隐藏攻略

**查询参数**:
- `placeId` (string, 必填): 地点 ID
- `tripId` (string, 可选): 行程 ID
- `countryCode` (string, 可选): 国家代码

**响应示例**:
```json
{
  "success": true,
  "data": {
    "placeId": "place-001",
    "insights": {
      "tips": [...],
      "localInsights": [...],
      "routeInsights": {...}
    },
    "credibility": {
      "ragSources": 10,
      "localInsightsCount": 5,
      "hasRouteContext": true
    }
  }
}
```

---

### 21. 提取行程相关合规规则

**接口**: `POST /rag/extract-compliance-rules`

**描述**: 自动获取行程涉及的签证和交通合规信息，生成合规清单

**请求体**:
```json
{
  "tripId": "trip-001",
  "countryCodes": ["IS", "NO"],
  "ruleTypes": ["VISA", "TRANSPORT", "ENTRY", "EXIT"]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tripId": "trip-001",
    "countryCodes": ["IS", "NO"],
    "rules": [...],
    "checklist": [
      {
        "category": "签证规则",
        "items": [
          {
            "description": "需要申根签证",
            "required": true,
            "deadline": "出发前至少30天",
            "source": "RAG检索"
          }
        ]
      }
    ],
    "summary": {
      "totalRules": 10,
      "totalChecklistItems": 15,
      "categories": ["签证规则", "交通规则"]
    }
  }
}
```

---

## 评估与测试集

### 22. 评估单次检索质量

**接口**: `POST /rag/evaluation/evaluate`

**描述**: 评估 RAG 检索的质量，返回 Recall@K、MRR、NDCG 等指标（旧系统：DocumentIndex）

**请求体**:
```json
{
  "query": "冰岛租车保险",
  "params": {
    "query": "冰岛租车保险",
    "collection": "travel_guides",
    "countryCode": "IS",
    "limit": 10
  },
  "groundTruthDocumentIds": ["doc-uuid-1", "doc-uuid-2"]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "recallAtK": {
      "1": 0.5,
      "5": 0.8,
      "10": 0.9
    },
    "mrr": 0.75,
    "ndcgAtK": {
      "1": 0.6,
      "5": 0.85,
      "10": 0.92
    }
  }
}
```

---

### 23. 批量评估检索质量

**接口**: `POST /rag/evaluation/evaluate-batch`

**描述**: 批量评估多个查询的检索质量（旧系统）

**请求体**:
```json
{
  "testCases": [
    {
      "query": "查询1",
      "params": {...},
      "groundTruthDocumentIds": ["doc-1"]
    }
  ]
}
```

---

### 24. 评估 Chunk 检索质量

**接口**: `POST /rag/evaluation/chunks/evaluate`

**描述**: 评估新知识库系统（Chunk 表）的检索质量

**请求体**:
```json
{
  "query": "冰岛租车保险",
  "params": {
    "query": "冰岛租车保险",
    "limit": 10,
    "useHybridSearch": true
  },
  "groundTruthChunkIds": ["chunk-uuid-1", "chunk-uuid-2"]
}
```

---

### 25. 批量评估 Chunk 检索质量

**接口**: `POST /rag/evaluation/chunks/evaluate-batch`

**描述**: 批量评估多个查询在 Chunk 检索链路下的质量指标

**请求体**:
```json
{
  "testCases": [
    {
      "query": "查询1",
      "params": {...},
      "groundTruthChunkIds": ["chunk-1"]
    }
  ]
}
```

---

### 26. 获取 RAG 评估测试集

**接口**: `GET /rag/evaluation/testset`

**描述**: 读取测试集文件（`e2e-cases/rag-eval-testset.json`）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "version": 1,
    "name": "iceland-kb-smoke",
    "description": "测试集描述",
    "createdAt": "2026-01-23T00:00:00.000Z",
    "updatedAt": "2026-01-23T00:00:00.000Z",
    "testCases": [
      {
        "id": "is-car-insurance-001",
        "query": "冰岛租车保险怎么选？",
        "groundTruthChunkIds": ["chunk-uuid-1"],
        "tags": ["iceland", "car-rental"],
        "notes": "测试用例说明"
      }
    ]
  }
}
```

---

### 27. 保存 RAG 评估测试集

**接口**: `PUT /rag/evaluation/testset`

**描述**: 保存测试集到文件

**请求体**: 同 `GET /rag/evaluation/testset` 的响应格式

**响应示例**:
```json
{
  "success": true,
  "data": {
    "message": "testset saved"
  }
}
```

---

### 28. 运行测试集评估

**接口**: `POST /rag/evaluation/testset/run`

**描述**: 读取测试集并对每个 case 运行 ChunkRetrieval 评估

**请求体**:
```json
{
  "params": {
    "useHybridSearch": true,
    "useReranking": false,
    "useQueryExpansion": false
  },
  "limit": 10
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "testset": {
      "name": "iceland-kb-smoke",
      "version": 1,
      "updatedAt": "2026-01-23T00:00:00.000Z"
    },
    "result": {
      "averageRecallAtK": {
        "1": 0.5,
        "5": 0.8,
        "10": 0.9
      },
      "averageMRR": 0.75,
      "averageNDCGAtK": {
        "1": 0.6,
        "5": 0.85,
        "10": 0.92
      },
      "perQueryResults": [...]
    }
  }
}
```

---

### 29. 查找相关 chunks

**接口**: `GET /rag/evaluation/testset/find-chunks`

**描述**: 根据查询文本查找相关的 chunks，用于帮助填充测试集的 groundTruthChunkIds

**查询参数**:
- `query` (string, 必填): 查询文本
- `limit` (number, 可选): 返回数量限制，默认 10

**响应示例**:
```json
{
  "success": true,
  "data": {
    "query": "冰岛租车保险",
    "chunks": [
      {
        "id": "chunk-uuid",
        "chunkId": "car_rental_insurance_001",
        "content": "内容预览...",
        "type": "operational_guide",
        "keywords": ["租车", "保险"],
        "filename": "iceland-car-rental-guide.json",
        "category": "practical",
        "similarity": 8
      }
    ],
    "count": 10
  }
}
```

---

### 30. 列出所有 chunks

**接口**: `GET /rag/evaluation/testset/list-chunks`

**描述**: 列出数据库中的所有 chunks，用于浏览和选择 groundTruthChunkIds

**查询参数**:
- `limit` (number, 可选): 返回数量限制，默认 100

**响应示例**:
```json
{
  "success": true,
  "data": {
    "chunks": [
      {
        "id": "chunk-uuid",
        "chunkId": "chunk-001",
        "content": "内容...",
        "type": "operational_guide",
        "keywords": ["tag1"],
        "filename": "file.json",
        "category": "practical"
      }
    ],
    "count": 100
  }
}
```

---

## 监控指标

### 31. 获取 RAG 监控指标

**接口**: `GET /rag/monitoring/metrics`

**描述**: 返回性能、质量、成本、缓存等所有监控指标

**响应示例**:
```json
{
  "success": true,
  "data": {
    "performance": {
      "totalRetrievals": 1000,
      "averageLatency": 150,
      "p95Latency": 300,
      "errorRate": 0.01
    },
    "quality": {
      "averageRecallAtK": {...},
      "averageMRR": 0.75
    },
    "cost": {
      "totalEmbeddingCalls": 5000,
      "totalLLMCalls": 100,
      "estimatedCost": 10.5
    },
    "cache": {
      "hitRate": 0.85,
      "totalHits": 4250,
      "totalMisses": 750
    }
  }
}
```

---

### 32. 获取性能指标

**接口**: `GET /rag/monitoring/performance`

**描述**: 返回检索延迟、吞吐量、错误率等性能指标

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalRetrievals": 1000,
    "averageLatency": 150,
    "p50Latency": 120,
    "p95Latency": 300,
    "p99Latency": 500,
    "errorRate": 0.01,
    "throughput": 10.5
  }
}
```

---

### 33. 获取质量指标

**接口**: `GET /rag/monitoring/quality`

**描述**: 返回 Recall@K、MRR、NDCG 等质量指标（需要有 Ground Truth 数据）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "averageRecallAtK": {
      "1": 0.5,
      "5": 0.8,
      "10": 0.9
    },
    "averageMRR": 0.75,
    "averageNDCGAtK": {
      "1": 0.6,
      "5": 0.85,
      "10": 0.92
    },
    "totalEvaluations": 100
  }
}
```

---

### 34. 获取成本指标

**接口**: `GET /rag/monitoring/cost`

**描述**: 返回 Embedding 和 LLM API 调用成本

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalEmbeddingCalls": 5000,
    "totalLLMCalls": 100,
    "embeddingCost": 5.0,
    "llmCost": 5.5,
    "estimatedTotalCost": 10.5,
    "costPerRetrieval": 0.0105
  }
}
```

---

### 35. 重置监控指标

**接口**: `POST /rag/monitoring/reset`

**描述**: 清空所有监控指标数据

**响应示例**:
```json
{
  "success": true,
  "data": {
    "message": "监控指标已重置"
  }
}
```

---

## 缓存管理

### 36. 获取 Embedding 缓存统计

**接口**: `GET /rag/cache/stats`

**描述**: 返回缓存命中率、延迟等统计信息

**响应示例**:
```json
{
  "success": true,
  "data": {
    "hitRate": 0.85,
    "totalHits": 4250,
    "totalMisses": 750,
    "totalRequests": 5000,
    "averageHitLatency": 5,
    "averageMissLatency": 200
  }
}
```

---

### 37. 重置缓存统计

**接口**: `POST /rag/cache/reset-stats`

**描述**: 重置缓存命中率等统计信息

**响应示例**:
```json
{
  "success": true,
  "data": {
    "message": "缓存统计已重置"
  }
}
```

---

### 38. 清空 Embedding 缓存

**接口**: `POST /rag/cache/clear`

**描述**: 清空所有缓存的 embedding（注意：Redis缓存需要手动清空）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "message": "Embedding缓存已清空（内存缓存），Redis缓存需要手动清空"
  }
}
```

---

## 知识库管理

### 39. 重建知识库索引

**接口**: `POST /rag/knowledge-base/rebuild-index`

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

### 40. 清空知识库索引

**接口**: `POST /rag/knowledge-base/clear-index`

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

## Query-Document 对收集

### 41. 收集 query-document 对

**接口**: `POST /rag/query-pairs/collect`

**描述**: 收集用户查询和正确答案文档的配对，用于 RAG 评估和微调

**请求体**:
```json
{
  "query": "冰岛租车保险",
  "correctDocumentIds": ["doc-uuid-1", "doc-uuid-2"],
  "metadata": {
    "source": "user-feedback",
    "userId": "user-001",
    "sessionId": "session-001",
    "collection": "travel_guides",
    "countryCode": "IS",
    "tags": ["car-rental"]
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "pairId": "pair-uuid",
    "message": "query-document 对已收集"
  }
}
```

---

### 42. 从用户查询自动收集

**接口**: `POST /rag/query-pairs/collect-from-query`

**描述**: 基于检索结果和用户反馈自动收集 query-document 对

**请求体**:
```json
{
  "query": "冰岛租车保险",
  "retrievedResults": [
    {
      "id": "doc-uuid-1",
      "score": 0.85
    }
  ],
  "userFeedback": {
    "clickedDocumentIds": ["doc-uuid-1"],
    "relevantDocumentIds": ["doc-uuid-1", "doc-uuid-2"],
    "irrelevantDocumentIds": ["doc-uuid-3"]
  }
}
```

---

### 43. 批量收集 query-document 对

**接口**: `POST /rag/query-pairs/collect-batch`

**描述**: 批量收集多个 query-document 对

**请求体**:
```json
{
  "pairs": [
    {
      "query": "查询1",
      "correctDocumentIds": ["doc-1"],
      "metadata": {...}
    },
    {
      "query": "查询2",
      "correctDocumentIds": ["doc-2"],
      "metadata": {...}
    }
  ]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "pairIds": ["pair-1", "pair-2"],
    "successCount": 2,
    "totalCount": 2
  }
}
```

---

### 44. 获取收集的 query-document 对

**接口**: `GET /rag/query-pairs`

**描述**: 获取已收集的 query-document 对列表

**查询参数**:
- `source` (string, 可选): 来源过滤
- `collection` (string, 可选): 集合过滤
- `countryCode` (string, 可选): 国家代码过滤
- `limit` (number, 可选): 返回数量限制

**响应示例**:
```json
{
  "success": true,
  "data": {
    "pairs": [
      {
        "id": "pair-uuid",
        "query": "查询文本",
        "correctDocumentIds": ["doc-1"],
        "metadata": {...}
      }
    ],
    "total": 100
  }
}
```

---

### 45. 导出为评估数据集格式

**接口**: `POST /rag/query-pairs/export-for-evaluation`

**描述**: 将 query-document 对导出为评估数据集格式

**请求体**:
```json
{
  "pairs": [
    {
      "query": "查询1",
      "correctDocumentIds": ["doc-1"]
    }
  ]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "evaluationDataset": {
      "version": 1,
      "testCases": [...]
    }
  }
}
```

---

## 📝 通用响应格式

所有接口都遵循统一的响应格式：

**成功响应**:
```json
{
  "success": true,
  "data": {...}
}
```

**错误响应**:
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "错误描述"
  }
}
```

---

## 🔧 错误码

- `INTERNAL_ERROR`: 内部服务器错误
- `NOT_FOUND`: 资源不存在
- `VALIDATION_ERROR`: 参数验证失败

---

## 📚 相关文档

- [RAG优化实现总结](./RAG优化实现总结.md)
- [RAG模块技术评估报告](./RAG模块技术评估报告.md)
- [RAG测试集使用指南](./RAG测试集使用指南.md)

---

**最后更新**: 2026-01-23
