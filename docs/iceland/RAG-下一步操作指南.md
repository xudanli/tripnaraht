# RAG 知识库系统 - 下一步操作指南

**当前状态**: ✅ 数据库迁移已完成  
**下一步**: 测试知识库索引功能

---

## ✅ 已完成

- ✅ 数据库表创建成功（knowledge_files, chunks, keyword_indices, query_history）
- ✅ pgvector 扩展已启用
- ✅ HNSW 向量索引已创建
- ✅ Prisma Client 已生成

---

## 🎯 下一步操作

### 步骤 1: 配置环境变量

在 `.env` 文件中添加或确认：

```bash
# 知识库文件路径（已找到文件在 docs/iceland/）
KB_PATH=./docs/iceland
```

**注意**: 知识库文件已经在 `docs/iceland/` 目录下，包含：
- `decision-support/` - 决策支持（节奏模式、用户画像等）
- `geography/` - 地理信息（气候、地形等）
- `pois/` - 兴趣点（住宿、景点、服务等）
- `practical/` - 实用指南（租车、规则、打包等）
- `risks/` - 风险评估（天气、地形、安全等）
- `routes/` - 路线信息（黄金圈、环岛路等）

### 步骤 2: 准备知识库文件

创建知识库目录并准备 JSON 文件：

```bash
# 创建目录
mkdir -p knowledge-base/iceland

# 示例：创建一个测试文件
# knowledge-base/iceland/test-rhythm-patterns.json
```

**知识库文件格式示例**：

```json
{
  "metadata": {
    "version": "1.0.0",
    "credibility_score": 0.9,
    "language": "zh-CN",
    "data_sources": ["官方文档"],
    "last_updated": "2026-01-23T00:00:00Z"
  },
  "rhythm_patterns": [
    {
      "rhythm_id": "relaxed_001",
      "rhythm_name": "轻松节奏",
      "description": "适合慢节奏旅行的节奏模式"
    }
  ]
}
```

### 步骤 3: 测试索引功能

**方式 1: 使用测试脚本（推荐）**

```bash
npx tsx scripts/test-knowledge-base-index.ts
```

**方式 2: 启动服务并通过 API 测试**

```bash
# 1. 启动服务
npm run dev

# 2. 在另一个终端测试索引 API
curl -X POST http://localhost:3000/rag/knowledge-base/rebuild-index

# 3. 测试检索 API
curl -X POST http://localhost:3000/rag/chunks/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "测试查询",
    "limit": 5
  }'
```

### 步骤 4: 验证索引结果

**使用 Prisma Studio 查看数据**：

```bash
npx prisma studio
```

在 Prisma Studio 中：
1. 查看 `KnowledgeFile` 表 - 应该看到索引的文件
2. 查看 `Chunk` 表 - 应该看到分块后的文档
3. 检查 `embedding` 字段 - 应该有向量数据

**使用 SQL 查询验证**：

```sql
-- 查看文件数量
SELECT COUNT(*) FROM knowledge_files;

-- 查看分块数量
SELECT COUNT(*) FROM chunks;

-- 查看有向量的分块数量
SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL;

-- 查看文件及其分块
SELECT 
  kf.filename,
  kf.category,
  COUNT(c.id) as chunk_count
FROM knowledge_files kf
LEFT JOIN chunks c ON kf.id = c.file_id
GROUP BY kf.id, kf.filename, kf.category;
```

---

## 🔍 故障排查

### 问题 1: 找不到知识库文件

**错误**: `ENOENT: no such file or directory`

**解决方案**:
```bash
# 创建目录
mkdir -p knowledge-base/iceland

# 确认 .env 配置
echo "KB_PATH=./knowledge-base/iceland" >> .env
```

### 问题 2: 索引失败 - 没有文件

**错误**: `总共加载 0 个文件`

**解决方案**:
- 检查 `KB_PATH` 配置是否正确
- 确认目录中有 `.json` 文件
- 检查文件格式是否正确（有效的 JSON）

### 问题 3: Embedding 生成失败

**错误**: `OpenAI API 错误` 或 `嵌入失败`

**解决方案**:
- 检查 `.env` 中的 `OPENAI_API_KEY` 配置
- 确认 API Key 有效且有余额
- 检查网络连接

### 问题 4: 向量索引创建失败

**注意**: 如果表为空，HNSW 索引可能无法创建，这是正常的。索引会在首次插入数据后自动创建。

---

## 📊 预期结果

索引成功后，你应该看到：

1. **knowledge_files 表**：
   - 每个 JSON 文件一条记录
   - 包含文件名、分类、版本等信息

2. **chunks 表**：
   - 每个文件被分块后的记录
   - 包含 content、embedding、type 等字段
   - embedding 字段应该有向量数据

3. **检索功能**：
   - `POST /rag/chunks/retrieve` 应该返回相关文档
   - 结果按相似度排序

---

## 🎉 完成检查清单

- [ ] 环境变量 `KB_PATH` 已配置
- [ ] 知识库目录存在且有 JSON 文件
- [ ] 索引脚本执行成功
- [ ] knowledge_files 表有数据
- [ ] chunks 表有数据且有 embedding
- [ ] 检索 API 可以正常工作

---

## 📞 需要帮助？

如果遇到问题：

1. 查看日志输出
2. 检查数据库中的数据
3. 参考 `docs/iceland/RAG-实施完成总结.md`
4. 参考 `docs/iceland/RAG-迁移执行指南.md`

---

**最后更新**: 2026-01-23
