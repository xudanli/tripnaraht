# RAG 模块

RAG（Retrieval-Augmented Generation）检索增强生成模块，提供知识库检索、合规规则提取、路线知识整理等功能。

## 模块结构

```
src/rag/
├── interfaces/
│   └── rag.interface.ts          # RAG 相关接口定义
├── services/
│   ├── rag.service.ts            # 核心检索服务
│   ├── rag.service.spec.ts       # RagService 单元测试 ✅
│   ├── enhanced-chat.service.ts  # 增强对话服务
│   ├── enhanced-chat.service.spec.ts # EnhancedChatService 单元测试 ✅
│   ├── compliance-facts-agent.service.ts # 合规规则提取
│   ├── route-knowledge-curator.service.ts # 路线知识整理
│   ├── local-insight.service.ts  # 当地洞察服务
│   └── llm-extraction.service.ts # LLM 结构化提取
├── rag.controller.ts             # REST API 控制器
├── rag.module.ts                 # NestJS 模块定义
└── README.md                     # 本文件
```

## 核心服务

### RagService

通用检索服务，提供文档索引和向量检索功能。

**主要方法：**
- `retrieve(params)` - 检索相关文档（向量搜索 + 降级到关键词搜索）
- `indexDocument(item)` - 索引单个文档
- `indexDocuments(items)` - 批量索引文档
- `deleteDocument(id)` - 删除文档索引
- `updateDocument(id, item)` - 更新文档索引

**特性：**
- 支持 pgvector 向量相似度搜索
- 支持按 collection、countryCode、tags 过滤
- 自动降级策略（向量搜索失败 → 关键词搜索）
- 相似度阈值过滤

### EnhancedChatService

增强对话服务，结合结构化数据和 RAG 内容回答路线问题。

**主要方法：**
- `answerRouteQuestion(question, context)` - 回答路线问题
- `explainWhyNotOtherRoute(...)` - 解释路线选择
- `getRouteNarrative(routeDirectionId, countryCode)` - 获取路线叙事

**特性：**
- 优先使用结构化数据（核心决策逻辑）
- RAG 补充细节和体验（软知识）
- 返回答案来源（STRUCTURED / RAG / HYBRID）

### ComplianceFactsAgent

合规规则提取 Agent，从 RAG 检索中提取结构化规则。

**主要方法：**
- `extractRailPassRules(passType, countryCode)` - 提取 Rail Pass 规则
- `extractTrailAccessRules(trailId, countryCode)` - 提取 Trail Access 规则
- `refreshComplianceRules()` - 刷新合规规则

**特性：**
- RAG 检索相关文档
- LLM 提取结构化规则
- 存储到 ComplianceEvidence 表

### RouteKnowledgeCurator

路线知识整理 Agent，为路线生成丰富的叙事内容。

**主要方法：**
- `enrichRouteNarrative(routeDirectionId, countryCode)` - 生成路线叙事
- `enrichSegmentNarrative(segmentId, dayIndex, segmentInfo)` - 生成路线段叙事

**特性：**
- RAG 检索相关游记和攻略
- LLM 生成叙事内容
- 包含哲学说明、推荐理由、预期体验等

### LocalInsightService

当地洞察服务，提供当地实用信息（软知识）。

**主要方法：**
- `getLocalInsight(countryCode, tags, region)` - 获取当地洞察
- `refreshLocalInsight(...)` - 刷新当地洞察

**特性：**
- 30 天缓存机制
- RAG 检索 + LLM 生成
- 支持按标签过滤

## API 端点

详见 `rag.controller.ts`，主要端点包括：

- `GET /rag/retrieve` - 检索文档
- `POST /rag/index` - 索引文档
- `POST /rag/compliance/rail-pass` - 提取 Rail Pass 规则
- `GET /rag/route-narrative/:routeDirectionId` - 获取路线叙事
- `GET /rag/local-insight` - 获取当地洞察
- `POST /rag/chat/answer-route-question` - 回答路线问题

完整 API 文档请查看 Swagger UI。

## 测试

### 运行测试

```bash
# 运行所有 RAG 模块测试
npm test -- --testPathPattern=rag

# 运行特定测试文件
npm test -- rag.service.spec.ts

# 监视模式
npm test -- --testPathPattern=rag --watch

# 生成覆盖率报告
npm test -- --testPathPattern=rag --coverage
```

### 测试覆盖

- ✅ `rag.service.spec.ts` - RagService 单元测试
  - 文档检索（向量搜索、降级策略）
  - 文档索引（单个、批量）
  - 文档更新和删除
  - 错误处理

- ✅ `enhanced-chat.service.spec.ts` - EnhancedChatService 单元测试
  - 路线问答
  - 结构化数据回答
  - RAG 补充回答
  - 错误处理

- ✅ `compliance-facts-agent.service.spec.ts` - ComplianceFactsAgent 单元测试
  - Rail Pass 规则提取
  - Trail Access 规则提取
  - 合规规则刷新

- ✅ `local-insight.service.spec.ts` - LocalInsightService 单元测试
  - 缓存机制
  - RAG 检索和生成
  - 批量获取
  - 刷新功能

- ✅ `route-knowledge-curator.service.spec.ts` - RouteKnowledgeCurator 单元测试
  - 路线叙事生成
  - 路线段叙事生成
  - 批量处理

- ⚠️ 待补充测试：
  - 集成测试
  - E2E 测试

## 数据库

### DocumentIndex 表

存储文档索引，支持向量搜索。

**关键字段：**
- `embedding` - pgvector 向量（1536 维）
- `collection` - 集合名称（travel_guides, rail_pass_rules, etc.）
- `countryCode` - 国家代码
- `tags` - 标签数组

**索引：**
- `collection` 索引
- `countryCode` 索引
- `tags` 数组索引
- ⚠️ **需要创建向量索引**：`prisma/migrations/add_document_index_embedding.sql`

### ComplianceEvidence 表

存储从 RAG 提取的结构化合规规则。

### LocalInsight 表

存储生成的当地洞察（带缓存）。

## 使用示例

### 检索文档

```typescript
const results = await ragService.retrieve({
  query: '冰岛 F-road 规则',
  collection: 'travel_guides',
  countryCode: 'IS',
  tags: ['f-road', 'driving'],
  limit: 10,
  minScore: 0.5,
});
```

### 索引文档

```typescript
const id = await ragService.indexDocument({
  collection: 'travel_guides',
  title: '冰岛旅行指南',
  content: '...',
  countryCode: 'IS',
  tags: ['iceland', 'travel'],
  source: 'https://example.com',
});
```

### 回答路线问题

```typescript
const answer = await enhancedChat.answerRouteQuestion(
  '为什么选择这条路线？',
  {
    routeDirectionId: '1',
    countryCode: 'IS',
  }
);
```

## 设计原则

1. **物理世界是 source of truth**
   - RAG 不直接参与核心安全/可达性判断
   - RAG 用于补充结构化数据，提供氛围、细节和软知识

2. **降级策略**
   - 向量搜索失败 → 关键词搜索
   - Embedding 生成失败 → 零向量 → 关键词搜索
   - LLM 提取失败 → 返回空结果或基础内容

3. **缓存机制**
   - LocalInsight 缓存 30 天
   - 避免重复的 RAG 检索和 LLM 生成

## 相关文档

- [RAG 工程状态报告](../../docs/RAG_ENGINEERING_STATUS.md)
- [用户故事 - RAG 模块](../../docs/用户故事.md#19-rag-检索增强生成-rag)
- [Embedding 服务状态](../../docs/EMBEDDING_SERVICE_STATUS.md)

## 待办事项

- [ ] 创建 DocumentIndex 向量索引（迁移文件已创建）
- [x] 补充其他服务的单元测试 ✅
- [ ] 添加集成测试
- [ ] 建立文档导入流程
- [ ] 添加性能监控

## 测试统计

**测试覆盖情况：**
- ✅ 5 个测试文件
- ✅ 47 个测试用例
- ✅ 100% 通过率

**运行测试：**
```bash
npm test -- --testPathPatterns=rag
```
