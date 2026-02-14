# RAG API 接口文档

**最后更新**: 2026-01-23
**Base URL**: `http://localhost:3000/api/rag`
**版本**: v1.0

---

## 📚 目录

- [核心检索接口](#核心检索接口)
- [知识库管理](#知识库管理)
- [文档管理](#文档管理)
- [合规规则](#合规规则)
- [路线叙事](#路线叙事)
- [当地洞察](#当地洞察)
- [增强对话](#增强对话)
- [评估和优化](#评估和优化)
- [Query-Document 对收集](#query-document-对收集)

---

## 🔍 核心检索接口

### 1. 从 Chunk 表检索文档（新）⭐

**当前推荐使用** - 使用新的知识库系统

```http
POST /api/rag/chunks/retrieve
Content-Type: application/json

{
  "query": "冰岛租车保险",
  "limit": 5,
  "credibilityMin": 0.5,
  "type": "full",
  "category": "practical_guides",
  "fileId": "uuid-string"
}
```

**参数说明**:
- `query` (string, 必填): 查询文本
- `limit` (number, 可选): 返回数量，默认 10
- `credibilityMin` (number, 可选): 最小可信度，默认 0.5
- `type` (string, 可选): 文档类型
- `category` (string, 可选): 文件分类
- `fileId` (string, 可选): 指定文件ID

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "518a358b-8404-46c4-b516-542d4f0af37f",
      "chunkId": "car-rental-guide.json_full",
      "content": "{\n  \"metadata\": {\n    \"version\": \"1.0.0\",\n    ...",
      "type": "full",
      "credibilityScore": 0.9,
      "keywords": [],
      "metadata": {},
      "fileId": "ca463379-0eab-408c-bbba-9899c9597130",
      "similarity": 0.5932,
      "sourceFile": "car-rental-guide.json"
    }
  ]
}
```

---

### 2. 检索文档（旧）

```http
GET /api/rag/retrieve?query=冰岛租车&collection=travel_guides&limit=10
```

**Query 参数**:
- `query` (string, 必填): 查询文本
- `collection` (string, 必填): 集合名称
- `countryCode` (string, 可选): 国家代码
- `limit` (number, 可选): 返回数量

---

### 3. RAG 搜索

```http
POST /api/rag/search
Content-Type: application/json

{
  "query": "冰岛租车保险",
  "collection": "travel_guides",
  "countryCode": "IS",
  "tags": ["practical", "insurance"],
  "limit": 10,
  "minScore": 0.5
}
```

---

### 4. RAG 统计

```http
GET /api/rag/stats?collection=travel_guides
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalDocuments": 23,
    "totalChunks": 23,
    "collections": ["travel_guides", "compliance_rules"],
    "byCategory": {
      "practical_guides": 8,
      "routes": 7,
      "geography": 3
    }
  }
}
```

---

## 📦 知识库管理

### 5. 重建知识库索引 ⭐

**完整重建** - 清空并重新索引所有文件

```http
POST /api/rag/knowledge-base/rebuild-index
```

**说明**:
- 清空现有索引
- 扫描 `KB_PATH` 目录（默认: `./docs/iceland`）
- 为每个 JSON 文件生成 embedding
- 存储到 `knowledge_files` 和 `chunks` 表

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "知识库索引重建完成"
  }
}
```

**执行时间**: 约 10-20 分钟（23 个文件）

---

### 6. 清空知识库索引

```http
POST /api/rag/knowledge-base/clear-index
```

**警告**: 此操作将删除所有知识库数据

---

### 7. 索引单个文档

```http
POST /api/rag/index
Content-Type: application/json

{
  "collection": "travel_guides",
  "title": "冰岛租车指南",
  "content": "详细内容...",
  "countryCode": "IS",
  "tags": ["rental", "insurance"],
  "source": "manual",
  "metadata": {}
}
```

---

### 8. 批量索引文档

支持两种格式：

**格式 1: 文档数组**

```http
POST /api/rag/index/batch
Content-Type: application/json

[
  {
    "collection": "travel_guides",
    "title": "文档1",
    "content": "内容1",
    ...
  },
  {
    "collection": "travel_guides",
    "title": "文档2",
    "content": "内容2",
    ...
  }
]
```

**格式 2: 路线 JSON** ⭐

```http
POST /api/rag/index/batch
Content-Type: application/json

{
  "route": {
    "route_id": "iceland_golden_circle_001",
    "route_name": "黄金圈",
    "key_stops": [...],
    "risk_assessment": {...},
    "seasonal_variations": {...}
  },
  "metadata": {...}
}
```

**自动转换**:
- 路线概述 → 1 个文档
- 每个站点 → 1 个文档
- 风险评估 → 1 个文档
- 每个季节 → 1 个文档
- 决策支持 → 1 个文档

---

## 📄 文档管理

### 9. 获取文档列表

```http
GET /api/rag/documents?collection=travel_guides&page=1&pageSize=20&search=租车
```

**Query 参数**:
- `collection` (string, 可选): 集合名称
- `countryCode` (string, 可选): 国家代码
- `tags` (string, 可选): 标签（逗号分隔）
- `page` (number, 可选): 页码，默认 1
- `pageSize` (number, 可选): 每页数量，默认 20
- `search` (string, 可选): 搜索关键词

**响应示例**:
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "uuid",
        "title": "冰岛租车指南",
        "contentPreview": "内容预览...",
        "collection": "travel_guides",
        "countryCode": "IS",
        "tags": ["rental", "insurance"]
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 50
    }
  }
}
```

---

### 10. 获取文档详情

```http
GET /api/rag/documents/:id
```

---

### 11. 更新文档

```http
PUT /api/rag/documents/:id
Content-Type: application/json

{
  "title": "新标题",
  "content": "新内容",
  "tags": ["new-tag"],
  "metadata": {}
}
```

**说明**: 如果更新 `content`，会自动重新生成 embedding

---

### 12. 删除文档

```http
DELETE /api/rag/documents/:id
```

---

## 📋 合规规则

### 13. 提取 Rail Pass 规则

```http
POST /api/rag/compliance/rail-pass
Content-Type: application/json

{
  "passType": "Eurail Global Pass",
  "countryCode": "IS"
}
```

---

### 14. 提取 Trail Access 规则

```http
POST /api/rag/compliance/trail-access
Content-Type: application/json

{
  "trailId": "laugavegur",
  "countryCode": "IS"
}
```

---

### 15. 刷新合规规则缓存

```http
POST /api/rag/compliance/refresh
```

**说明**: 手动触发合规规则缓存刷新，用于后台管理系统

---

## 📖 路线叙事

### 16. 生成路线叙事

```http
GET /api/rag/route-narrative/:routeDirectionId?countryCode=IS&includeLocalInsights=true
```

**响应示例**:
```json
{
  "narrative": {
    "route": "黄金圈",
    "description": "丰富的叙事内容...",
    "highlights": [...],
    "tips": [...]
  },
  "localInsights": [...]
}
```

---

### 17. 生成路线段叙事

```http
POST /api/rag/segment-narrative
Content-Type: application/json

{
  "segmentId": "seg_001",
  "dayIndex": 1,
  "name": "雷克雅未克到黄金圈",
  "description": "第一天行程",
  "countryCode": "IS"
}
```

---

## 🌍 当地洞察

### 18. 获取当地洞察

```http
GET /api/rag/local-insight?countryCode=IS&tags=culture,tips,etiquette&region=Reykjavik
```

**Query 参数**:
- `countryCode` (string, 必填): 国家代码
- `tags` (string, 必填): 标签（逗号分隔或数组）
- `region` (string, 可选): 地区

---

### 19. 刷新当地洞察缓存

```http
POST /api/rag/local-insight/refresh
Content-Type: application/json

{
  "countryCode": "IS",
  "tags": ["culture", "tips"],
  "region": "Reykjavik"
}
```

---

## 💬 增强对话

### 20. 回答路线问题

```http
POST /api/rag/chat/answer-route-question
Content-Type: application/json

{
  "question": "黄金圈适合冬天去吗？",
  "routeDirectionId": "route_001",
  "countryCode": "IS",
  "segmentId": "seg_001",
  "dayIndex": 1,
  "tripId": "trip_123"
}
```

**说明**: 使用 RAG 增强的对话功能，结合路线知识回答问题

---

### 21. 解释为什么不选择另一条路线

```http
POST /api/rag/chat/explain-why-not-other-route
Content-Type: application/json

{
  "selectedRouteId": "route_001",
  "alternativeRouteId": "route_002",
  "countryCode": "IS"
}
```

---

### 22. 获取目的地深度信息

```http
GET /api/rag/destination-insights?placeId=reykjavik&tripId=trip_123&countryCode=IS
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "placeId": "reykjavik",
    "insights": {
      "tips": [...],
      "localInsights": [...],
      "routeInsights": {...}
    },
    "credibility": {
      "ragSources": 5,
      "localInsightsCount": 3,
      "hasRouteContext": true
    }
  }
}
```

---

## 📋 合规清单

### 23. 提取行程相关合规规则

```http
POST /api/rag/extract-compliance-rules
Content-Type: application/json

{
  "tripId": "trip_123",
  "countryCodes": ["IS", "NO"],
  "ruleTypes": ["VISA", "TRANSPORT", "ENTRY"]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tripId": "trip_123",
    "countryCodes": ["IS", "NO"],
    "rules": [...],
    "checklist": [
      {
        "category": "签证规则",
        "items": [
          {
            "description": "...",
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
      "categories": ["签证规则", "交通规则", "路线准入规则"]
    }
  }
}
```

---

## 📊 评估和优化

### 24. 评估单次检索质量

```http
POST /api/rag/evaluation/evaluate
Content-Type: application/json

{
  "query": "冰岛租车保险",
  "params": {
    "query": "冰岛租车保险",
    "collection": "travel_guides",
    "limit": 10
  },
  "groundTruthDocumentIds": ["doc_id_1", "doc_id_2"]
}
```

**响应**: Recall@K, MRR, NDCG 等指标

---

### 25. 批量评估检索质量

```http
POST /api/rag/evaluation/evaluate-batch
Content-Type: application/json

{
  "testCases": [
    {
      "query": "查询1",
      "params": {...},
      "groundTruthDocumentIds": [...]
    },
    {
      "query": "查询2",
      "params": {...},
      "groundTruthDocumentIds": [...]
    }
  ]
}
```

---

## 🗂️ Query-Document 对收集

### 26. 收集 Query-Document 对

```http
POST /api/rag/query-pairs/collect
Content-Type: application/json

{
  "query": "冰岛租车保险",
  "correctDocumentIds": ["doc_id_1", "doc_id_2"],
  "metadata": {
    "source": "user_feedback",
    "userId": "user_123",
    "sessionId": "session_456"
  }
}
```

**用途**: 收集用户查询和正确答案，用于评估和微调

---

### 27. 从用户查询自动收集

```http
POST /api/rag/query-pairs/collect-from-query
Content-Type: application/json

{
  "query": "冰岛租车保险",
  "retrievedResults": [
    { "id": "doc_1", "score": 0.85 },
    { "id": "doc_2", "score": 0.72 }
  ],
  "userFeedback": {
    "clickedDocumentIds": ["doc_1"],
    "relevantDocumentIds": ["doc_1", "doc_2"],
    "irrelevantDocumentIds": ["doc_3"]
  }
}
```

---

### 28. 批量收集

```http
POST /api/rag/query-pairs/collect-batch
Content-Type: application/json

{
  "pairs": [
    {
      "query": "查询1",
      "correctDocumentIds": ["doc_1"],
      "metadata": {}
    }
  ]
}
```

---

### 29. 获取收集的对

```http
GET /api/rag/query-pairs?source=user_feedback&collection=travel_guides&limit=100
```

---

### 30. 导出为评估数据集

```http
POST /api/rag/query-pairs/export-for-evaluation
Content-Type: application/json

{
  "pairs": [
    {
      "query": "冰岛租车保险",
      "correctDocumentIds": ["doc_1", "doc_2"]
    }
  ]
}
```

---

## 🔧 错误响应格式

所有接口遵循统一的错误响应格式：

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "详细错误信息"
  }
}
```

**错误码**:
- `INTERNAL_ERROR`: 内部服务器错误
- `NOT_FOUND`: 资源不存在
- `INVALID_REQUEST`: 请求参数错误
- `UNAUTHORIZED`: 未授权

---

## 🚀 快速开始示例

### 场景 1: 检索相关文档

```bash
curl -X POST http://localhost:3000/api/rag/chunks/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "冰岛租车保险",
    "limit": 5
  }'
```

### 场景 2: 重建索引

```bash
curl -X POST http://localhost:3000/api/rag/knowledge-base/rebuild-index
```

### 场景 3: 获取文档列表

```bash
curl http://localhost:3000/api/rag/documents?collection=travel_guides&page=1&pageSize=20
```

### 场景 4: 批量索引路线

```bash
curl -X POST http://localhost:3000/api/rag/index/batch \
  -H "Content-Type: application/json" \
  -d @route.json
```

---

## 📝 注意事项

1. **认证**: 大部分接口标记为 `@Public()`，开发环境可直接访问
2. **Embedding**: 需要配置 `OPENAI_API_KEY` 和代理（如在中国大陆）
3. **性能**: 向量检索通常在 1-3 秒内完成
4. **索引**: 重建索引需要 10-20 分钟（23 个文件）
5. **相似度**: 默认相似度阈值为 0.5，可调整

---

## 🔗 相关资源

- [RAG Controller 源码](../../src/rag/rag.controller.ts)
- [Chunk Retrieval Service](../../src/rag/services/chunk-retrieval.service.ts)
- [Embedding Service](../../src/places/services/embedding.service.ts)
- [索引脚本](../../scripts/rebuild-index-final.ts)
- [Swagger 文档](http://localhost:3000/api-docs)

---

**维护者**: 请保持此文档与代码同步更新
**最后验证**: 2026-01-23
