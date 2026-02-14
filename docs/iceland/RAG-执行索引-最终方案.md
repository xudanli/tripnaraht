# RAG 知识库索引 - 最终执行方案

**当前状态**: ✅ 代码已完成，数据库已迁移  
**问题**: 服务需要重启才能加载新路由

---

## 🎯 方案 1: 重启服务后通过 API（推荐）

### 步骤 1: 重启服务

```bash
# 1. 停止当前服务（如果正在运行）
# 找到占用 3000 端口的进程并停止
kill 30551  # 或使用其他方式停止服务

# 2. 重新启动服务
npm run dev
```

### 步骤 2: 执行索引

```bash
# 等待服务启动完成后（看到 "Application is running on: http://[::]:3000"）
curl -X POST http://localhost:3000/rag/knowledge-base/rebuild-index
```

---

## 🎯 方案 2: 使用独立脚本（无需重启服务）

**优点**: 不需要重启服务，直接执行

```bash
npx tsx scripts/index-iceland-kb-standalone.ts
```

**脚本功能**:
- ✅ 直接使用 Prisma Client
- ✅ 独立的 Embedding 服务
- ✅ 不依赖 NestJS 应用上下文
- ✅ 完整的错误处理和进度显示

---

## 📊 执行后验证

### 1. 检查数据库

```bash
# 使用 Prisma Studio
npx prisma studio
```

查看：
- `knowledge_files` 表应该有 ~25 条记录
- `chunks` 表应该有数百条记录，都有 `embedding` 数据

### 2. 测试检索（如果服务已重启）

```bash
curl -X POST http://localhost:3000/rag/chunks/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "冰岛租车保险",
    "limit": 5
  }'
```

---

## ⏱️ 预计时间

- **索引时间**: 10-30 分钟（取决于文件数量和大小）
- **向量生成**: 每个文件需要生成多个向量，可能需要一些时间

---

## 🔍 如果遇到问题

### 问题 1: 独立脚本执行失败

**检查**:
- OpenAI API Key 是否配置
- 数据库连接是否正常
- 知识库路径是否正确（默认 `./docs/iceland`）

### 问题 2: API 返回 404

**解决**: 重启服务以加载新路由

### 问题 3: Embedding 生成慢

**原因**: 正常现象，需要调用 OpenAI API
**建议**: 耐心等待，查看日志了解进度

---

## ✅ 推荐执行顺序

1. **立即执行**: 使用独立脚本（`npx tsx scripts/index-iceland-kb-standalone.ts`）
2. **后续**: 重启服务，使用 API 方式管理索引

---

**准备好了吗？执行独立脚本开始索引！** 🚀
