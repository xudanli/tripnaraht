# RAG 知识库检索问题诊断报告

**日期**: 2026-01-23
**状态**: 🔴 待解决

---

## 📊 当前状态

### ✅ 成功完成的部分

1. **知识库索引**：
   - ✅ 23 个 JSON 文件已索引
   - ✅ 39 个分块（chunks）已创建
   - ✅ 所有分块都已生成 embedding 向量（1536维，使用 text-embedding-3-small）
   - ✅ 数据已存储在 PostgreSQL（`knowledge_files` 和 `chunks` 表）

2. **服务和 API**：
   - ✅ NestJS 服务运行正常（端口 3000）
   - ✅ RAG API 端点已注册：`POST /api/rag/chunks/retrieve`
   - ✅ 数据库连接正常

3. **脚本工具**：
   - ✅ 状态检查脚本：`scripts/check-kb-status.ts`
   - ✅ 独立索引脚本：`scripts/index-iceland-kb-standalone.ts`

---

## ❌ 问题：OpenAI API 代理配置冲突

### 问题描述

检索时需要为用户查询生成 embedding 向量，但 OpenAI API 调用失败：

1. **使用代理时**（`HTTPS_PROXY=http://127.0.0.1:9090`）：
   - 错误：HTTP 403 Forbidden
   - 原因：OpenAI API 收到的是 HTTP 请求而非 HTTPS
   - 详细错误：`"The OpenAI API is only accessible over HTTPS. Ensure the URL starts with 'https://' and not 'http://'"`

2. **不使用代理时**：
   - 错误：`read ECONNRESET`
   - 原因：无法直接访问 OpenAI API（网络限制）

### 技术原因

代理服务器（`http://127.0.0.1:9090`）可能配置不正确：
- 使用 HTTP 代理而非 HTTPS 代理
- 代理未正确转发 HTTPS 流量
- 或者代理本身对 OpenAI API 的支持有问题

---

## 🔧 解决方案

### 方案 1: 修复代理配置（推荐）

#### 步骤 A: 使用 SOCKS5 代理（如果可用）

```bash
# 在 .env 中
HTTPS_PROXY=socks5://127.0.0.1:9090
# 或
ALL_PROXY=socks5://127.0.0.1:9090
```

#### 步骤 B: 使用正确的 HTTPS 代理

1. 确保代理服务器支持 HTTPS CONNECT 方法
2. 配置代理：
   ```bash
   # 在 .env 中
   HTTPS_PROXY=https://127.0.0.1:9090  # 注意是 https://
   ```

#### 步骤 C: 测试代理

```bash
# 测试代理是否正确转发 HTTPS
npx tsx scripts/test-openai-api.ts

# 应该看到：
# ✅ 成功！
# ⏱️  耗时: 2.xx 秒
# 📊 向量维度: 1536
```

---

### 方案 2: 使用本地 Embedding 模型（备选）

如果无法修复代理，可以切换到本地 embedding 模型：

#### 选项 A: HuggingFace Transformers

```typescript
// 安装依赖
npm install @huggingface/transformers

// 修改 EmbeddingService 支持本地模型
// 例如：sentence-transformers/all-MiniLM-L6-v2
```

#### 选项 B: Ollama + Embeddings

```bash
# 安装 Ollama
# 拉取 embedding 模型
ollama pull nomic-embed-text

# 在代码中调用本地 API
# http://localhost:11434/api/embeddings
```

---

### 方案 3: 临时测试方案（验证检索逻辑）

为了验证检索逻辑是否正确，可以使用数据库中已有的向量进行测试：

```typescript
// scripts/test-retrieval-with-existing-vector.ts
const prisma = new PrismaClient();

// 1. 从数据库随机选一个向量
const sampleChunk = await prisma.chunk.findFirst({
  where: { embedding: { not: null } }
});

// 2. 用这个向量进行相似度搜索
const similar = await prisma.$queryRaw`
  SELECT
    c.id,
    c.content,
    kf.filename,
    1 - (c.embedding <=> ${sampleChunk.embedding}::vector) as similarity
  FROM chunks c
  INNER JOIN knowledge_files kf ON c.file_id = kf.id
  WHERE c.embedding IS NOT NULL
  ORDER BY c.embedding <=> ${sampleChunk.embedding}::vector
  LIMIT 5
`;

console.log('Top 5 similar chunks:', similar);
```

如果这个测试成功，说明：
- ✅ 数据库向量存储正确
- ✅ 向量检索逻辑正确
- ✅ 问题仅在 embedding 生成环节

---

## 📋 下一步行动

### 立即执行

1. **检查代理服务器类型**：
   ```bash
   # 查看代理服务器是什么（V2Ray/Clash/etc.）
   ps aux | grep -E "(v2ray|clash|proxy)" | grep -v grep
   ```

2. **测试代理对 HTTPS 的支持**：
   ```bash
   # 测试代理是否支持 HTTPS
   curl -v -x http://127.0.0.1:9090 https://api.openai.com/v1/models 2>&1 | grep "< HTTP"
   ```

3. **尝试不同的代理协议**：
   - `http://127.0.0.1:9090`
   - `https://127.0.0.1:9090`
   - `socks5://127.0.0.1:9090`（如果是 SOCKS 代理）

### 后续优化

1. **实现 Embedding 缓存**：
   - 对常见查询缓存 embedding
   - 减少 API 调用次数

2. **添加降级策略**：
   - 主提供商（OpenAI）失败时
   - 自动切换到本地模型或缓存

3. **监控和日志**：
   - 添加 Embedding 生成成功率监控
   - 记录失败原因和频率

---

## 🧪 验证清单

完成修复后，执行以下测试验证：

```bash
# 1. 重启服务
npm run dev

# 2. 测试 Embedding 生成
npx tsx scripts/test-openai-api.ts
# 期望：✅ 成功！

# 3. 测试 RAG 检索
curl -X POST http://localhost:3000/api/rag/chunks/retrieve \
  -H "Content-Type: application/json" \
  -d '{"query": "冰岛租车保险", "limit": 5}'

# 期望：返回相关文档
# {
#   "success": true,
#   "data": [
#     {
#       "id": "...",
#       "content": "...",
#       "similarity": 0.85,
#       ...
#     }
#   ]
# }

# 4. 验证检索质量
npx tsx scripts/check-kb-status.ts
# 期望：显示正常的统计信息
```

---

## 📞 需要帮助？

如果问题持续，请提供：
1. 代理服务器类型和版本
2. OpenAI API Key 配额状态
3. 网络环境（是否在中国大陆）
4. 完整的错误日志（`tail -100 /tmp/tripnara-dev.log`）

---

**最后更新**: 2026-01-23 20:12
