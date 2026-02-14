# RAG 知识库索引执行方案

**当前状态**: ✅ 数据库表已创建，代码已实现  
**待执行**: 索引知识库文件

---

## 🎯 推荐方案：通过 API 执行索引

由于直接运行脚本可能遇到依赖注入问题，**推荐通过 API 执行索引**：

### 步骤 1: 启动服务

```bash
npm run dev
```

### 步骤 2: 执行索引（在另一个终端）

```bash
curl -X POST http://localhost:3000/rag/knowledge-base/rebuild-index
```

### 步骤 3: 验证结果

```bash
# 查看索引的文件数
curl http://localhost:3000/rag/knowledge-base/stats

# 或使用 Prisma Studio
npx prisma studio
```

---

## 🔧 备选方案：独立脚本

如果 API 方式不可用，可以使用独立脚本：

```bash
npx tsx scripts/index-iceland-kb-standalone.ts
```

**脚本特点**：
- ✅ 不依赖 NestJS 应用上下文
- ✅ 直接使用 Prisma Client
- ✅ 独立的 Embedding 服务
- ✅ 完整的错误处理

---

## 📋 环境变量配置

确保 `.env` 文件中有以下配置：

```bash
# 数据库连接
DATABASE_URL="postgresql://..."

# OpenAI API Key（用于生成向量）
OPENAI_API_KEY="sk-..."

# 知识库路径（可选，默认是 ./docs/iceland）
KB_PATH=./docs/iceland

# HTTP 代理（如果需要）
HTTP_PROXY=http://127.0.0.1:9090
```

---

## ✅ 验证索引成功

索引成功后，应该看到：

1. **knowledge_files 表**有数据
   ```sql
   SELECT COUNT(*) FROM knowledge_files;
   -- 应该返回文件数量（约 25 个）
   ```

2. **chunks 表**有数据且有向量
   ```sql
   SELECT COUNT(*) FROM chunks;
   SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL;
   ```

3. **可以检索**
   ```bash
   curl -X POST http://localhost:3000/rag/chunks/retrieve \
     -H "Content-Type: application/json" \
     -d '{"query": "冰岛租车", "limit": 5}'
   ```

---

## 🚨 常见问题

### 问题 1: 脚本执行失败

**解决方案**: 使用 API 方式（推荐）

### 问题 2: Embedding 生成失败

**检查**:
- OpenAI API Key 是否正确
- 网络连接是否正常
- 代理配置是否正确

### 问题 3: 索引速度慢

**原因**: 每个文件需要生成多个向量，可能需要几分钟到几十分钟

**建议**: 
- 耐心等待
- 查看日志了解进度
- 可以先索引少量文件测试

---

## 📊 预期结果

索引完成后，你应该有：

- **~25 个文件**在 `knowledge_files` 表
- **数百个分块**在 `chunks` 表
- **所有分块都有向量**（1536 维）

---

**最后更新**: 2026-01-23
