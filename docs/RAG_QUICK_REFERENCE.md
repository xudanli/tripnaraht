# RAG 文档库快速参考

## 常用命令

### 索引文档
```bash
# 索引初始文档（使用 scripts/index-rag-documents.ts）
npm run rag:index

# 或直接运行脚本
npx ts-node --project tsconfig.backend.json scripts/index-rag-documents.ts
```

### 测试 API
```bash
# 测试所有 RAG API 端点
npm run rag:test

# 或指定 API URL
API_URL=http://localhost:3000 npm run rag:test
```

## API 快速参考

### 检索文档
```bash
GET /rag/retrieve?query={query}&collection={collection}&countryCode={code}&limit={n}
```

### 索引单个文档
```bash
POST /rag/index
Content-Type: application/json

{
  "collection": "travel_guides",
  "title": "标题",
  "content": "内容",
  "source": "来源URL",
  "countryCode": "IS",
  "tags": ["tag1", "tag2"]
}
```

### 批量索引
```bash
POST /rag/index/batch
Content-Type: application/json

[{文档1}, {文档2}, ...]
```

## 文档集合类型

| 集合名称 | 用途 | 示例标签 |
|---------|------|---------|
| `rail_pass_rules` | Rail Pass 规则 | `eurail`, `global`, `iceland` |
| `travel_guides` | 游记和攻略 | `iceland`, `highlands`, `travel-guide` |
| `local_insights` | 当地洞察 | `iceland`, `f-road`, `local-insights` |
| `trail_access_rules` | 徒步路线准入规则 | `nepal`, `ebc`, `permit` |

## 标签规范

### 必用标签
- 国家标签（如 `iceland`, `nepal`）
- 文档类型标签（如 `travel-guide`, `local-insights`）

### 推荐标签
- 路线类型（如 `f-road`, `highlands`, `ebc`）
- 活动类型（如 `hiking`, `driving`, `camping`）
- 主题标签（如 `tips`, `safety`, `culture`）

### 标签数量
- 最少：3 个标签
- 推荐：4-6 个标签
- 最多：8 个标签

## 文档质量标准

### 内容长度
- Rail Pass 规则: 500-2000 字
- 游记和攻略: 1000-5000 字
- 当地洞察: 300-1500 字
- 准入规则: 300-1000 字

### 内容要求
- ✅ 结构化（使用标题、段落、列表）
- ✅ 具体（避免模糊描述）
- ✅ 实用（可操作的建议）
- ✅ 准确（验证过的信息）

## 工作流程

### 添加新文档
1. 准备文档内容（使用模板）
2. 编辑 `scripts/index-rag-documents.ts`
3. 添加到 `documents` 数组
4. 运行 `npm run rag:index`
5. 验证索引结果

### 更新文档
1. 编辑 `scripts/index-rag-documents.ts`
2. 修改对应文档内容
3. 重新运行索引脚本
4. （可选）删除旧文档

### 查询文档
1. 使用检索 API 测试查询
2. 检查返回结果相关性
3. 调整查询文本或标签

## 常见问题速查

**Q: 文档索引失败？**
- 检查 API 密钥配置
- 检查文档格式
- 查看服务器日志

**Q: 检索结果不相关？**
- 优化查询文本
- 检查标签是否正确
- 增加文档内容质量

**Q: 如何避免重复？**
- 索引前先检索相似内容
- 使用清晰的标题区分
- 定期审查文档库

## 相关文档

- [RAG 文档库管理操作指南](./RAG_DOCUMENT_LIBRARY_MANAGEMENT.md) - 详细操作指南
- [RAG 文档模板](./RAG_DOCUMENT_TEMPLATE.md) - 文档模板
- [RAG API 使用指南](./RAG_API_USAGE.md) - API 详细文档
- [RAG 设置和使用指南](./RAG_SETUP_GUIDE.md) - 初始设置

