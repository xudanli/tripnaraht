# RAG 知识库迁移执行指南

**创建时间**: 2026-01-23  
**状态**: ⏳ 待执行

---

## 🚀 快速开始

### 步骤 1: 执行数据库迁移

**推荐方式：使用 TypeScript 脚本**

```bash
cd /Users/gaozitai/workspace/tripnara/tripnaraht
npx tsx scripts/setup-knowledge-base-tables.ts
```

**备选方式：手动执行 SQL**

1. 连接到数据库：
   ```bash
   # 使用 psql（如果已安装）
   psql -h pgm-bp11qeau0n455339mo.pg.rds.aliyuncs.com -U tripnara_app -d tripnara_prod
   
   # 或使用数据库管理工具（如 DBeaver、pgAdmin）
   ```

2. 执行 SQL 文件：
   ```sql
   -- 文件位置: prisma/migrations/add_knowledge_base_tables.sql
   -- 复制文件内容并执行
   ```

### 步骤 2: 验证迁移结果

```bash
# 方式1: 使用 Prisma Studio
npx prisma studio

# 在 SQL 编辑器中执行：
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('knowledge_files', 'chunks', 'keyword_indices', 'query_history');
```

**预期结果**：应该看到 4 个表

### 步骤 3: 配置环境变量

在 `.env` 文件中添加：

```bash
# 知识库文件路径
KB_PATH=./knowledge-base/iceland
```

### 步骤 4: 测试索引功能

```bash
# 启动服务
npm run dev

# 在另一个终端测试 API
curl -X POST http://localhost:3000/rag/knowledge-base/rebuild-index
```

---

## 📋 迁移脚本说明

### 脚本位置

- **TypeScript 脚本**: `scripts/setup-knowledge-base-tables.ts`
- **SQL 文件**: `prisma/migrations/add_knowledge_base_tables.sql`

### 脚本功能

1. ✅ 启用 `pgvector` 扩展
2. ✅ 创建 `knowledge_files` 表
3. ✅ 创建 `chunks` 表（带向量字段）
4. ✅ 创建 `keyword_indices` 表
5. ✅ 创建 `query_history` 表
6. ✅ 创建所有必要的索引（包括 HNSW 向量索引）

### 注意事项

- ⚠️ **HNSW 索引**：只有在表中有数据时才能创建。如果表为空，索引创建会失败，这是正常的。索引会在首次插入数据后自动创建。
- ⚠️ **已存在的表**：如果表已存在，脚本会跳过创建，不会报错。
- ⚠️ **权限要求**：确保数据库用户有创建表和索引的权限。

---

## 🔍 故障排查

### 问题 1: 脚本执行超时

**原因**：网络连接问题或数据库响应慢

**解决方案**：
- 使用手动 SQL 方式
- 检查数据库连接
- 分步执行 SQL 语句

### 问题 2: pgvector 扩展无法创建

**原因**：数据库未安装 pgvector 扩展

**解决方案**：
```sql
-- 检查是否已安装
SELECT * FROM pg_extension WHERE extname = 'vector';

-- 如果未安装，需要数据库管理员安装
-- 参考: https://github.com/pgvector/pgvector
```

### 问题 3: 权限不足

**错误信息**：`permission denied` 或 `must be owner`

**解决方案**：
- 联系数据库管理员授予权限
- 或使用有足够权限的数据库用户

### 问题 4: HNSW 索引创建失败

**错误信息**：`cannot create index on empty table`

**解决方案**：
- 这是正常的，HNSW 索引需要数据
- 先插入一些数据，然后手动创建索引：
  ```sql
  CREATE INDEX idx_chunks_embedding_hnsw ON chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
  ```

---

## ✅ 验证清单

迁移完成后，请验证以下项目：

- [ ] `knowledge_files` 表存在
- [ ] `chunks` 表存在
- [ ] `keyword_indices` 表存在
- [ ] `query_history` 表存在
- [ ] `pgvector` 扩展已启用
- [ ] Prisma Client 已生成（`npx prisma generate`）
- [ ] 环境变量 `KB_PATH` 已配置
- [ ] API 端点可以访问（`/rag/knowledge-base/rebuild-index`）

---

## 📞 需要帮助？

如果遇到问题：

1. 检查日志输出
2. 查看数据库错误日志
3. 参考 `docs/iceland/RAG-实施完成总结.md`
4. 参考 `docs/iceland/RAG-方案评估报告.md`

---

**最后更新**: 2026-01-23
