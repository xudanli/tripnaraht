# RAG 知识库系统 - 快速开始指南

**状态**: ✅ 所有代码已完成，数据库已迁移

---

## 🚀 3 步快速开始

### 1. 启动服务

```bash
npm run dev
```

### 2. 索引知识库（在另一个终端）

```bash
curl -X POST http://localhost:3000/rag/knowledge-base/rebuild-index
```

**预期输出**:
- 开始加载文件
- 逐个处理文件（分块、向量化、存储）
- 显示进度和统计信息

### 3. 测试检索

```bash
curl -X POST http://localhost:3000/rag/chunks/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "冰岛冬季自驾需要什么装备？",
    "limit": 5,
    "credibilityMin": 0.8
  }'
```

---

## 📊 验证索引结果

### 方式 1: 使用 Prisma Studio

```bash
npx prisma studio
```

查看：
- `knowledge_files` 表 - 应该看到 ~25 个文件
- `chunks` 表 - 应该看到数百个分块，都有 `embedding` 数据

### 方式 2: 使用 SQL 查询

```sql
-- 文件统计
SELECT category, COUNT(*) as count 
FROM knowledge_files 
GROUP BY category;

-- 分块统计
SELECT type, COUNT(*) as count 
FROM chunks 
GROUP BY type;

-- 向量统计
SELECT 
  COUNT(*) as total_chunks,
  COUNT(embedding) as chunks_with_embedding
FROM chunks;
```

---

## 🎯 知识库文件位置

知识库文件在：`docs/iceland/`

包含以下目录：
- `decision-support/` - 决策支持（节奏模式、用户画像）
- `geography/` - 地理信息（气候、地形）
- `pois/` - 兴趣点（住宿、景点、服务）
- `practical/` - 实用指南（租车、规则、打包）
- `risks/` - 风险评估（天气、地形、安全）
- `routes/` - 路线信息（黄金圈、环岛路等）

---

## ⚙️ 配置说明

**环境变量**（`.env`）:

```bash
# 必需
DATABASE_URL="postgresql://..."
OPENAI_API_KEY="sk-..."

# 可选（默认值已设置）
KB_PATH=./docs/iceland  # 知识库路径
HTTP_PROXY=http://127.0.0.1:9090  # 代理（如果需要）
```

---

## 🔍 API 端点

### 索引管理

- `POST /rag/knowledge-base/rebuild-index` - 重建索引
- `POST /rag/knowledge-base/clear-index` - 清空索引

### 检索

- `POST /rag/chunks/retrieve` - 从 Chunk 表检索
  ```json
  {
    "query": "查询文本",
    "limit": 5,
    "credibilityMin": 0.8,
    "category": "practical_guides",
    "type": "operational_guide"
  }
  ```

---

## ⏱️ 索引时间估算

- **小文件**（< 10KB）: ~5-10 秒/文件
- **中等文件**（10-100KB）: ~30-60 秒/文件
- **大文件**（> 100KB）: ~1-3 分钟/文件

**总计**: 约 25 个文件，预计需要 **10-30 分钟**

---

## ✅ 完成检查清单

- [ ] 服务已启动
- [ ] 索引 API 调用成功
- [ ] knowledge_files 表有数据
- [ ] chunks 表有数据且有 embedding
- [ ] 检索 API 可以返回结果

---

**准备好了吗？开始索引吧！** 🚀
