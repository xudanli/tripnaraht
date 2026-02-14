# RAG 知识库相关文件索引

**最后更新**: 2026-01-23
**用途**: 快速查找所有 RAG 相关的文档和脚本

---

## 📄 文档（docs/iceland/）

### 核心文档（按阅读顺序）

1. **[RAG-快速开始.md](./RAG-快速开始.md)** ⭐
   - 最简单的入门指南
   - 3 步开始使用 RAG

2. **[RAG-检索问题诊断报告.md](./RAG-检索问题诊断报告.md)**
   - 问题诊断过程
   - 代理配置问题分析
   - 三种解决方案对比

3. **[RAG-问题解决方案-最终版.md](./RAG-问题解决方案-最终版.md)**
   - 详细的解决方案
   - 代理配置修复步骤
   - 验证清单

4. **[RAG-成功解决报告.md](./RAG-成功解决报告.md)** ✅
   - 最终成功报告
   - 完整的问题分析和解决过程
   - 关键教训总结

### 技术文档

5. **[RAG-Node.js集成方案.md](./RAG-Node.js集成方案.md)**
   - Node.js 集成技术细节
   - API 设计
   - 代码示例

6. **[RAG-方案评估报告.md](./RAG-方案评估报告.md)**
   - 不同 RAG 方案对比
   - 技术选型依据

7. **[RAG-迁移执行指南.md](./RAG-迁移执行指南.md)**
   - 数据库迁移步骤
   - Prisma schema 配置

### 实施文档

8. **[RAG-实施完成总结.md](./RAG-实施完成总结.md)**
   - 实施过程总结
   - 已完成功能清单

9. **[RAG-执行索引-最终方案.md](./RAG-执行索引-最终方案.md)**
   - 索引执行方案
   - 两种索引方式对比

10. **[RAG-索引执行方案.md](./RAG-索引执行方案.md)**
    - 早期索引方案
    - 已被最终方案替代

11. **[RAG-下一步操作指南.md](./RAG-下一步操作指南.md)**
    - 后续优化建议
    - 功能扩展方向

---

## 🔧 脚本（scripts/）

### 索引脚本

#### ⭐ 推荐使用

1. **[rebuild-index-final.ts](../../scripts/rebuild-index-final.ts)** ✅ **当前最佳**
   - 完整的索引重建脚本
   - 正确的代理配置（HttpsProxyAgent）
   - 使用原始 SQL 插入向量
   - 完整的错误处理
   - 23/23 成功验证

   ```bash
   # 使用方法
   npx tsx scripts/rebuild-index-final.ts

   # 监控进度
   tail -f /tmp/rebuild-success.log
   ```

#### 备用方案

2. **[rebuild-index-simple.ts](../../scripts/rebuild-index-simple.ts)**
   - 简化版索引脚本
   - 与 final 版类似但略有不同
   - 可作为参考

3. **[index-iceland-kb-standalone.ts](../../scripts/index-iceland-kb-standalone.ts)**
   - 独立索引脚本（旧版）
   - 有代理配置问题
   - 不推荐使用

### 诊断脚本

4. **[check-kb-status.ts](../../scripts/check-kb-status.ts)** ⭐ **常用**
   - 检查知识库索引状态
   - 显示文件数量、分块数量
   - 显示最近索引的文件

   ```bash
   npx tsx scripts/check-kb-status.ts

   # 输出示例:
   # 📈 索引统计:
   #   - 文件总数: 23
   #   - 分块总数: 23
   #   - 有向量的分块: 23
   ```

5. **[check-kb-index-status.ts](../../scripts/check-kb-index-status.ts)**
   - 详细的索引状态检查
   - 包含分类统计
   - 显示每个文件的详情

6. **[debug-retrieval.ts](../../scripts/debug-retrieval.ts)**
   - 调试检索流程
   - 测试 embedding 生成
   - 验证向量检索逻辑

   ```bash
   npx tsx scripts/debug-retrieval.ts
   ```

7. **[debug-vector-format.ts](../../scripts/debug-vector-format.ts)** ⭐ **验证向量质量**
   - 检查向量是否为零向量
   - 测试不同的向量序列化格式
   - 验证向量检索结果

   ```bash
   npx tsx scripts/debug-vector-format.ts

   # 期望输出（修复后）:
   # ✅ 找到样本: xxx.json
   # 📊 向量: [0.123, -0.456, ...]  # 不再是全零！
   # 测试格式: JSON.stringify
   #   ✅ 成功！找到 5 个结果  # 不再是 0 个！
   ```

### 测试脚本

8. **[test-embedding-simple.ts](../../scripts/test-embedding-simple.ts)** ⭐ **测试 API**
   - 测试 OpenAI Embedding API
   - 验证代理配置
   - 快速检查 API 可用性

   ```bash
   npx tsx scripts/test-embedding-simple.ts

   # 期望输出:
   # ✅ 成功！
   # ⏱️  耗时: 1.94 秒
   # 📊 向量维度: 1536
   ```

---

## 🌐 API 端点

### 知识库管理

```bash
# 1. 重建索引（通过 API）
POST http://localhost:3000/api/rag/knowledge-base/rebuild-index

# 2. 清空索引
POST http://localhost:3000/api/rag/knowledge-base/clear-index
```

### RAG 检索

```bash
# 检索文档
POST http://localhost:3000/api/rag/chunks/retrieve
Content-Type: application/json

{
  "query": "冰岛租车保险",
  "limit": 5,
  "credibilityMin": 0.5
}
```

---

## 📊 日志文件

### 索引日志

- `/tmp/rebuild-success.log` - rebuild-index-final.ts 的输出
- `/tmp/rebuild-simple.log` - rebuild-index-simple.ts 的输出
- `/tmp/reindex.log` - 早期索引尝试的日志
- `/tmp/manual-index.log` - 手动索引脚本的日志

### 服务日志

- `/tmp/tripnara-dev.log` - NestJS 服务的开发日志

---

## 🎯 常用工作流

### 1. 首次设置

```bash
# 1. 确保代理配置正确
grep HTTPS_PROXY .env
# 应该显示: HTTPS_PROXY=http://127.0.0.1:9090

# 2. 测试 OpenAI API
npx tsx scripts/test-embedding-simple.ts

# 3. 执行索引
npx tsx scripts/rebuild-index-final.ts

# 4. 验证索引
npx tsx scripts/check-kb-status.ts
npx tsx scripts/debug-vector-format.ts
```

### 2. 检查问题

```bash
# 1. 检查索引状态
npx tsx scripts/check-kb-status.ts

# 2. 检查向量质量
npx tsx scripts/debug-vector-format.ts

# 3. 调试检索
npx tsx scripts/debug-retrieval.ts

# 4. 测试 API
curl -X POST http://localhost:3000/api/rag/chunks/retrieve \
  -H "Content-Type: application/json" \
  -d '{"query": "冰岛租车保险", "limit": 5}'
```

### 3. 重建索引

```bash
# 方式 1: 使用脚本（推荐）
npx tsx scripts/rebuild-index-final.ts

# 方式 2: 使用 API
curl -X POST http://localhost:3000/api/rag/knowledge-base/rebuild-index
```

---

## 📝 快速参考

### 环境变量

```bash
# .env
HTTPS_PROXY=http://127.0.0.1:9090
OPENAI_API_KEY=sk-proj-...
OPENAI_BASE_URL=https://api.openai.com/v1
KB_PATH=./docs/iceland
```

### 数据库表

- `knowledge_files` - 知识库文件记录
- `chunks` - 文档分块和向量
- `rag_documents` - 旧的 RAG 文档表（已废弃）

### 向量维度

- OpenAI text-embedding-3-small: **1536 维**
- 数据库字段: `vector(1536)`

---

## 🆘 故障排查

### 问题: 检索返回空结果

**解决方案**:
1. 检查向量是否为零向量: `npx tsx scripts/debug-vector-format.ts`
2. 如果是零向量，重新索引: `npx tsx scripts/rebuild-index-final.ts`

### 问题: Embedding 生成失败

**解决方案**:
1. 测试 API: `npx tsx scripts/test-embedding-simple.ts`
2. 检查代理配置: `grep HTTPS_PROXY .env`
3. 验证 API Key: `echo $OPENAI_API_KEY`

### 问题: 索引脚本超时

**解决方案**:
1. 检查代理连接: `curl -x http://127.0.0.1:9090 https://api.openai.com/v1/models`
2. 使用正确的脚本: `rebuild-index-final.ts`（不是 `index-iceland-kb-standalone.ts`）

---

## 📚 相关资源

- [Prisma Schema](../../prisma/schema.prisma) - 数据库模型定义
- [RagController](../../src/rag/rag.controller.ts) - RAG API 控制器
- [EmbeddingService](../../src/places/services/embedding.service.ts) - Embedding 服务
- [ChunkRetrievalService](../../src/rag/services/chunk-retrieval.service.ts) - 检索服务

---

**维护者**: 请保持此文档与实际文件同步更新
