# RAG 接口对接指南

**最后更新**: 2026-01-23  
**版本**: v1.0  
**Base URL**: `http://localhost:3000/api/rag`

---

## 📋 目录

- [前端用户接口](#前端用户接口)
- [后台管理系统接口](#后台管理系统接口)
- [接口认证说明](#接口认证说明)
- [错误处理](#错误处理)
- [最佳实践](#最佳实践)

---

## 🎨 前端用户接口

### 核心检索接口

#### 1. 检索相关文档 ⭐ **推荐使用**

**用途**: 通用文档检索，用于搜索功能、智能问答等

```typescript
POST /api/rag/chunks/retrieve
Content-Type: application/json

{
  "query": "冰岛租车保险",
  "limit": 5,
  "credibilityMin": 0.5,
  "type": "full",
  "category": "practical_guides"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "chunkId": "car-rental-guide.json_full",
      "content": "文档内容...",
      "similarity": 0.82,
      "sourceFile": "car-rental-guide.json"
    }
  ]
}
```

**使用场景**:
- 搜索框：用户输入关键词搜索相关文档
- 智能推荐：根据用户查询推荐相关内容
- 上下文补充：为对话系统提供背景知识

---

#### 2. 获取路线叙事

**用途**: 路线详情页展示丰富的叙事内容

```typescript
GET /api/rag/route-narrative/:routeDirectionId?countryCode=IS&includeLocalInsights=true
```

**响应示例**:
```json
{
  "narrative": {
    "route": "黄金圈",
    "description": "丰富的叙事内容...",
    "highlights": ["亮点1", "亮点2"],
    "tips": ["贴士1", "贴士2"]
  },
  "localInsights": [...]
}
```

**使用场景**:
- 路线详情页：展示路线介绍和亮点
- 路线卡片：显示路线摘要
- 路线对比：展示不同路线的特色

---

#### 3. 获取当地洞察

**用途**: 目的地详情页展示当地文化、贴士等信息

```typescript
GET /api/rag/local-insight?countryCode=IS&tags=culture,tips,etiquette&region=Reykjavik
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "insights": [
      {
        "content": "当地文化洞察...",
        "tags": ["culture", "tips"],
        "confidence": "HIGH"
      }
    ]
  }
}
```

**使用场景**:
- 目的地详情页：展示当地文化、礼仪、贴士
- 行程建议：根据目的地提供实用建议
- 文化指南：帮助用户了解当地文化

---

#### 4. 回答路线问题

**用途**: 对话功能，回答用户关于路线的具体问题

```typescript
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

**响应示例**:
```json
{
  "answer": "黄金圈在冬天...",
  "sources": ["doc_id_1", "doc_id_2"],
  "confidence": 0.85
}
```

**使用场景**:
- 路线问答：回答用户关于路线的具体问题
- 智能助手：提供路线相关的智能建议
- 行程规划：帮助用户规划行程

---

#### 5. 获取目的地深度信息

**用途**: 行程详情页展示目的地的深度实用信息

```typescript
GET /api/rag/destination-insights?placeId=reykjavik&tripId=trip_123&countryCode=IS
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "placeId": "reykjavik",
    "insights": {
      "tips": ["贴士1", "贴士2"],
      "localInsights": [...],
      "routeInsights": {...}
    },
    "credibility": {
      "ragSources": 5,
      "localInsightsCount": 3
    }
  }
}
```

**使用场景**:
- 行程详情页：展示每个目的地的深度信息
- 目的地卡片：显示目的地特色和贴士
- 行程优化：提供目的地相关的优化建议

---

### 合规规则接口

#### 6. 提取 Rail Pass 规则

**用途**: 获取铁路通票相关规则，用于行程合规性检查

```typescript
POST /api/rag/compliance/rail-pass
Content-Type: application/json

{
  "passType": "Eurail Global Pass",
  "countryCode": "IS"
}
```

**使用场景**:
- 行程规划：检查铁路通票使用规则
- 合规检查：验证行程是否符合通票规则
- 规则说明：向用户展示通票使用规则

---

#### 7. 提取 Trail Access 规则

**用途**: 获取徒步路线准入规则，用于行程合规性检查

```typescript
POST /api/rag/compliance/trail-access
Content-Type: application/json

{
  "trailId": "laugavegur",
  "countryCode": "IS"
}
```

**使用场景**:
- 徒步路线规划：检查路线准入要求
- 许可证申请：指导用户申请必要的许可证
- 安全提醒：提醒用户注意准入限制

---

#### 8. 提取行程合规规则

**用途**: 批量提取行程相关的所有合规规则，用于准备度检查

```typescript
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
    "rules": [...],
    "checklist": [
      {
        "category": "签证规则",
        "items": [
          {
            "description": "...",
            "required": true,
            "deadline": "出发前至少30天"
          }
        ]
      }
    ]
  }
}
```

**使用场景**:
- 准备度检查：生成行程准备清单
- 合规提醒：提醒用户注意合规要求
- 规则汇总：展示所有相关规则

---

### 统计接口

#### 9. 获取知识库统计

**用途**: 展示知识库基本信息（可选，用于调试或展示）

```typescript
GET /api/rag/stats?collection=travel_guides
```

**使用场景**:
- 调试页面：显示知识库状态
- 数据展示：展示知识库规模

---

## 🔧 后台管理系统接口

### 知识库管理

#### 1. 重建知识库索引 ⚠️ **重要操作**

**用途**: 清空并重新索引所有文件（耗时操作，10-20分钟）

```typescript
POST /api/rag/knowledge-base/rebuild-index
```

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "知识库索引重建完成"
  }
}
```

**使用场景**:
- 数据更新后：重新索引所有文件
- 系统初始化：首次部署时建立索引
- 故障恢复：索引损坏后重建

**注意事项**:
- ⚠️ 此操作会清空现有索引
- ⚠️ 执行时间较长（10-20分钟）
- ⚠️ 建议在低峰期执行
- ✅ 建议添加进度提示和确认对话框

---

#### 2. 清空知识库索引 ⚠️ **危险操作**

**用途**: 删除所有知识库数据

```typescript
POST /api/rag/knowledge-base/clear-index
```

**使用场景**:
- 数据清理：清空所有数据
- 重置系统：完全重置知识库

**注意事项**:
- ⚠️ 此操作不可逆
- ⚠️ 建议添加二次确认
- ⚠️ 建议记录操作日志

---

### 文档管理

#### 3. 获取文档列表

**用途**: 文档管理页面展示文档列表

```typescript
GET /api/rag/documents?collection=travel_guides&page=1&pageSize=20&search=租车
```

**Query 参数**:
- `collection` (可选): 集合名称
- `countryCode` (可选): 国家代码
- `tags` (可选): 标签（逗号分隔）
- `page` (可选): 页码，默认 1
- `pageSize` (可选): 每页数量，默认 20
- `search` (可选): 搜索关键词

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

**使用场景**:
- 文档管理页面：展示所有文档
- 文档搜索：搜索特定文档
- 文档筛选：按分类、标签筛选

---

#### 4. 获取文档详情

**用途**: 文档编辑页面展示文档详情

```typescript
GET /api/rag/documents/:id
```

**使用场景**:
- 文档编辑：加载文档内容进行编辑
- 文档预览：预览文档内容

---

#### 5. 添加单个文档

**用途**: 添加新文档到知识库

```typescript
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

**使用场景**:
- 文档添加：手动添加新文档
- 内容导入：导入外部内容

---

#### 6. 批量添加文档

**用途**: 批量添加文档或导入路线数据

```typescript
POST /api/rag/index/batch
Content-Type: application/json

// 格式1: 文档数组
[
  {
    "collection": "travel_guides",
    "title": "文档1",
    "content": "内容1",
    ...
  }
]

// 格式2: 路线JSON（自动转换）
{
  "route": {
    "route_id": "iceland_golden_circle_001",
    "route_name": "黄金圈",
    ...
  },
  "metadata": {...}
}
```

**使用场景**:
- 批量导入：批量导入文档
- 路线导入：导入路线数据（自动转换为多个文档）

---

#### 7. 更新文档

**用途**: 更新现有文档内容

```typescript
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

**使用场景**:
- 文档编辑：编辑文档内容
- 内容更新：更新过时内容

---

#### 8. 删除文档

**用途**: 删除文档

```typescript
DELETE /api/rag/documents/:id
```

**使用场景**:
- 文档删除：删除不需要的文档
- 内容清理：清理过时内容

---

### 缓存管理

#### 9. 刷新合规规则缓存

**用途**: 手动触发合规规则缓存刷新

```typescript
POST /api/rag/compliance/refresh
```

**使用场景**:
- 规则更新后：刷新缓存以使用最新规则
- 缓存清理：清理过时的缓存

---

#### 10. 刷新当地洞察缓存

**用途**: 手动触发当地洞察缓存刷新

```typescript
POST /api/rag/local-insight/refresh
Content-Type: application/json

{
  "countryCode": "IS",
  "tags": ["culture", "tips"],
  "region": "Reykjavik"
}
```

**使用场景**:
- 洞察更新后：刷新缓存以使用最新洞察
- 区域更新：更新特定区域的洞察

---

### 评估和优化

#### 11. 评估检索质量

**用途**: 评估单次检索的质量指标

```typescript
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

**使用场景**:
- 质量评估：评估检索系统质量
- 性能优化：优化检索参数
- A/B测试：测试不同检索策略

---

#### 12. 批量评估检索质量

**用途**: 批量评估多个查询的检索质量

```typescript
POST /api/rag/evaluation/evaluate-batch
Content-Type: application/json

{
  "testCases": [
    {
      "query": "查询1",
      "params": {...},
      "groundTruthDocumentIds": [...]
    }
  ]
}
```

**使用场景**:
- 批量测试：批量测试检索质量
- 回归测试：验证系统改进效果

---

### Query-Document 对收集

#### 13. 收集 Query-Document 对

**用途**: 收集用户查询和正确答案，用于训练和评估

```typescript
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

**使用场景**:
- 训练数据收集：收集训练数据
- 用户反馈：收集用户反馈的正确答案
- 质量改进：用于改进检索质量

---

#### 14. 从用户查询自动收集

**用途**: 从用户查询和反馈自动收集 Query-Document 对

```typescript
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

**使用场景**:
- 自动收集：自动收集用户反馈
- 隐式反馈：从用户行为收集反馈

---

#### 15. 获取收集的对

**用途**: 查看已收集的 Query-Document 对

```typescript
GET /api/rag/query-pairs?source=user_feedback&collection=travel_guides&limit=100
```

**使用场景**:
- 数据管理：查看收集的数据
- 数据分析：分析收集的数据质量

---

#### 16. 导出评估数据集

**用途**: 导出 Query-Document 对为评估数据集

```typescript
POST /api/rag/query-pairs/export-for-evaluation
Content-Type: application/json

{
  "pairs": [
    {
      "query": "冰岛租车保险",
      "correctDocumentIds": ["doc_id_1", "doc_id_2"]
    }
  ]
}
```

**使用场景**:
- 数据导出：导出评估数据集
- 外部评估：用于外部评估工具

---

## 🔐 接口认证说明

### 当前状态

**所有接口目前都标记为 `@Public()`**，意味着：
- ✅ 开发环境可以直接访问，无需认证
- ⚠️ 生产环境建议添加认证保护

### 建议的认证策略

#### 前端用户接口
- **建议**: 保持公开或使用用户级别的认证（JWT）
- **原因**: 用户需要访问这些接口获取信息

#### 后台管理系统接口
- **建议**: 使用管理员级别的认证（JWT + 角色验证）
- **原因**: 这些接口涉及数据修改，需要权限控制

### 需要保护的接口

以下接口建议添加管理员认证：

1. `POST /api/rag/knowledge-base/rebuild-index` ⚠️
2. `POST /api/rag/knowledge-base/clear-index` ⚠️
3. `POST /api/rag/index` ⚠️
4. `POST /api/rag/index/batch` ⚠️
5. `PUT /api/rag/documents/:id` ⚠️
6. `DELETE /api/rag/documents/:id` ⚠️
7. `POST /api/rag/compliance/refresh` ⚠️
8. `POST /api/rag/local-insight/refresh` ⚠️

---

## ❌ 错误处理

### 统一错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "详细错误信息"
  }
}
```

### 错误码

- `INTERNAL_ERROR`: 内部服务器错误
- `NOT_FOUND`: 资源不存在
- `INVALID_REQUEST`: 请求参数错误
- `UNAUTHORIZED`: 未授权

### 前端处理建议

```typescript
try {
  const response = await fetch('/api/rag/chunks/retrieve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '...' })
  });
  
  const data = await response.json();
  
  if (!data.success) {
    // 处理错误
    console.error('Error:', data.error.message);
    // 显示用户友好的错误提示
  } else {
    // 处理成功响应
    const results = data.data;
  }
} catch (error) {
  // 处理网络错误
  console.error('Network error:', error);
}
```

---

## 💡 最佳实践

### 前端开发建议

1. **使用推荐接口**: 优先使用 `POST /api/rag/chunks/retrieve` 进行检索
2. **错误处理**: 始终处理错误响应，给用户友好的提示
3. **加载状态**: 显示加载状态，检索可能需要1-3秒
4. **缓存策略**: 考虑缓存常用查询结果
5. **分页**: 使用分页避免一次性加载过多数据

### 后台管理建议

1. **操作确认**: 危险操作（重建索引、清空索引）需要二次确认
2. **进度提示**: 长时间操作（重建索引）显示进度
3. **操作日志**: 记录所有管理操作
4. **批量操作**: 批量操作时显示进度和结果统计
5. **数据验证**: 添加文档前验证数据格式

### 性能优化

1. **请求合并**: 合并多个相关请求
2. **防抖节流**: 搜索框使用防抖，避免频繁请求
3. **缓存**: 缓存不经常变化的数据（如统计信息）
4. **分页**: 使用分页加载，避免一次性加载大量数据

---

## 📊 接口优先级

### 前端用户接口（按优先级）

**P0 - 核心功能**:
1. `POST /api/rag/chunks/retrieve` - 文档检索
2. `GET /api/rag/route-narrative/:routeDirectionId` - 路线叙事
3. `POST /api/rag/extract-compliance-rules` - 合规规则

**P1 - 重要功能**:
4. `GET /api/rag/local-insight` - 当地洞察
5. `POST /api/rag/chat/answer-route-question` - 路线问答
6. `GET /api/rag/destination-insights` - 目的地信息

**P2 - 增强功能**:
7. `POST /api/rag/compliance/rail-pass` - Rail Pass规则
8. `POST /api/rag/compliance/trail-access` - Trail Access规则

### 后台管理接口（按优先级）

**P0 - 核心管理**:
1. `GET /api/rag/documents` - 文档列表
2. `POST /api/rag/index` - 添加文档
3. `PUT /api/rag/documents/:id` - 更新文档
4. `DELETE /api/rag/documents/:id` - 删除文档

**P1 - 批量操作**:
5. `POST /api/rag/index/batch` - 批量添加
6. `POST /api/rag/knowledge-base/rebuild-index` - 重建索引

**P2 - 优化功能**:
7. `POST /api/rag/evaluation/evaluate` - 质量评估
8. `POST /api/rag/query-pairs/collect` - 数据收集

---

## 🔗 相关资源

- [RAG API 接口文档](./RAG-API接口文档.md) - 完整接口文档
- [RAG Controller 源码](../../src/rag/rag.controller.ts) - 源码参考
- [Swagger 文档](http://localhost:3000/api-docs) - 交互式API文档

---

**维护者**: 请保持此文档与代码同步更新  
**最后验证**: 2026-01-23
