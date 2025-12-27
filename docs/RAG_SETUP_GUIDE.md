# RAG 设置和使用指南

## 前置条件

1. **数据库迁移**
   ```bash
   # 运行 Prisma 迁移创建新表
   npx prisma migrate dev --name add_rag_tables
   
   # 生成 Prisma 客户端
   npx prisma generate
   ```

2. **创建向量索引**
   
   连接到 PostgreSQL 数据库并执行：
   ```sql
   -- 确保 pgvector 扩展已安装
   CREATE EXTENSION IF NOT EXISTS vector;
   
   -- 创建向量索引（使用 IVFFlat，适合大规模数据）
   CREATE INDEX IF NOT EXISTS document_index_embedding_idx ON "document_index" 
     USING ivfflat (embedding vector_cosine_ops) 
     WITH (lists = 100);
   
   -- 对于小规模数据（< 10万），可以使用 HNSW（更快但占用更多空间）
   -- CREATE INDEX IF NOT EXISTS document_index_embedding_hnsw_idx ON "document_index" 
   --   USING hnsw (embedding vector_cosine_ops);
   ```

3. **环境变量配置**
   
   确保 `.env` 文件中配置了：
   ```env
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，如果有代理
   EMBEDDING_PROVIDER=openai  # 或 huggingface/e5
   ```

## 步骤 1: 索引初始文档

运行索引脚本，建立知识库：

```bash
npm run rag:index
```

这个脚本会索引以下类型的文档：
- **Rail Pass 规则**: Eurail Global Pass、Interrail Global Pass、Eurail One Country Pass 的规则
- **游记和攻略**: 冰岛高地 F-road 体验、Landmannalaugar 徒步、尼泊尔 EBC 徒步
- **当地洞察**: 冰岛 F-road 和尼泊尔 EBC 的实用建议

**输出示例**:
```
🚀 开始索引 RAG 文档...

📄 索引文档: Eurail Global Pass - Iceland Rules (rail_pass_rules)
   ✅ 成功: uuid-1234-5678

📄 索引文档: Iceland Highlands F-Road Experience Guide (travel_guides)
   ✅ 成功: uuid-2345-6789

...

📊 索引完成统计:
   ✅ 成功: 7
   ❌ 失败: 0
   📝 总计: 7
```

## 步骤 2: 启动服务器

确保服务器正在运行：

```bash
npm run dev
# 或
npm run backend:dev
```

服务器默认运行在 `http://localhost:3000`

## 步骤 3: 测试 API 端点

运行测试脚本，验证所有 API 端点：

```bash
npm run rag:test
```

或者指定不同的 API URL：

```bash
API_URL=http://localhost:3000 npm run rag:test
```

**测试内容**:
- ✅ 文档检索（Rail Pass 规则、游记）
- ✅ 索引单个文档
- ✅ 提取 Rail Pass 规则
- ✅ 提取 Trail Access 规则
- ✅ 生成路线叙事
- ✅ 生成路线段叙事
- ✅ 获取当地洞察（冰岛、尼泊尔）

**输出示例**:
```
🚀 开始测试 RAG API 端点...
📍 Base URL: http://localhost:3000

🧪 测试: 文档检索 - Rail Pass 规则
   GET /rag/retrieve
   ✅ 成功 (200)
   📦 响应: [{"id":"...","content":"...","score":0.85}]

...

📊 测试结果统计:
==================================================
✅ 1. 文档检索 - Rail Pass 规则
✅ 2. 文档检索 - 游记
✅ 3. 索引单个文档
...
==================================================
总计: 9 个测试
✅ 成功: 9
❌ 失败: 0
📈 成功率: 100.0%

🎉 所有测试通过！
```

## 手动测试 API

### 1. 检索文档

```bash
curl "http://localhost:3000/rag/retrieve?query=Eurail Global Pass rules for Iceland&collection=rail_pass_rules&countryCode=IS&limit=5"
```

### 2. 索引文档

```bash
curl -X POST "http://localhost:3000/rag/index" \
  -H "Content-Type: application/json" \
  -d '{
    "collection": "travel_guides",
    "title": "Test Document",
    "content": "This is a test document.",
    "source": "https://test.com",
    "countryCode": "IS",
    "tags": ["test"]
  }'
```

### 3. 提取 Rail Pass 规则

```bash
curl -X POST "http://localhost:3000/rag/compliance/rail-pass" \
  -H "Content-Type: application/json" \
  -d '{
    "passType": "EURAIL_GLOBAL",
    "countryCode": "IS"
  }'
```

### 4. 生成路线叙事

```bash
curl "http://localhost:3000/rag/route-narrative/1?countryCode=IS"
```

### 5. 获取当地洞察

```bash
curl "http://localhost:3000/rag/local-insight?countryCode=IS&tags=f_road,highlands&region=Highlands"
```

## 常见问题

### 1. 向量索引创建失败

**错误**: `relation "document_index" does not exist`

**解决**: 先运行数据库迁移：
```bash
npx prisma migrate dev --name add_rag_tables
```

### 2. Embedding 生成失败

**错误**: `OPENAI_API_KEY not configured`

**解决**: 检查 `.env` 文件中的 `OPENAI_API_KEY` 配置

### 3. 文档检索返回空结果

**可能原因**:
- 文档尚未索引
- 查询文本与文档内容不匹配
- 向量索引未创建

**解决**:
1. 运行 `npm run rag:index` 索引文档
2. 创建向量索引
3. 尝试不同的查询文本

### 4. Prisma 客户端类型错误

**错误**: `类型"PrismaService"上不存在属性"localInsight"`

**解决**: 运行 `npx prisma generate` 重新生成 Prisma 客户端

## 下一步

1. **添加更多文档**: 编辑 `scripts/index-rag-documents.ts` 添加更多文档
2. **集成到用户对话层**: 在 Chat Service 中使用 RAG 增强回答
3. **监控和优化**: 跟踪 RAG 提取规则准确率，优化 LLM prompt

## 相关文档

- [RAG 融合架构设计](./RAG_FUSION_ARCHITECTURE.md)
- [RAG API 使用指南](./RAG_API_USAGE.md)
- [RAG 实现状态](./RAG_IMPLEMENTATION_STATUS.md)

