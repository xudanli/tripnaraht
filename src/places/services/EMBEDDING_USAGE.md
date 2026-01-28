# Embedding 服务调用场景说明

## 概述

`EmbeddingService` 用于将文本转换为向量（embedding），主要用于 RAG（Retrieval-Augmented Generation）系统的语义搜索。

## 调用场景

### 1. RAG 文档检索

**触发时机**：
- 用户查询需要从知识库中检索相关文档时
- 系统需要理解用户意图并找到相关上下文时

**调用路径**：
```
用户请求
  ↓
RAG Controller (/api/rag/extract-compliance-rules)
  ↓
RagService.retrieve() 或 ChunkRetrievalService.retrieve()
  ↓
EmbeddingService.generateEmbedding(query)
  ↓
OpenAI Embedding API
```

**具体场景**：

#### 场景 1: 提取合规规则
```
POST /api/rag/extract-compliance-rules
{
  "tripId": "...",
  "countryCodes": ["IS", "NO"],
  "ruleTypes": ["VISA", "TRANSPORT"]
}
```

**流程**：
1. 为每个国家代码生成查询 embedding
   - 查询: `"IS trail access rules permits"`
   - 查询: `"IS visa requirements"`
2. 使用 embedding 进行向量相似度搜索
3. 返回最相关的文档片段

#### 场景 2: 通用文档检索
```
POST /api/rag/retrieve
{
  "query": "冰岛自驾注意事项",
  "collection": "travel_guides",
  "countryCode": "IS"
}
```

**流程**：
1. 生成查询 embedding: `"冰岛自驾注意事项"`
2. 在 `document_index` 或 `chunk` 表中进行向量搜索
3. 返回相似度最高的文档

### 2. 工具选择（Tool Selection）

**触发时机**：
- Agent 需要根据用户查询选择合适的工具时
- 系统需要理解用户意图并匹配可用技能时

**调用路径**：
```
Agent 处理用户请求
  ↓
ToolsSelectSkill.execute()
  ↓
EmbeddingService.generateEmbedding(userQuery)
  ↓
与工具描述的 embedding 进行相似度匹配
```

### 3. 地点搜索（Place Search）

**触发时机**：
- 用户搜索地点时（语义搜索模式）
- 需要理解地点名称的语义含义时

**调用路径**：
```
PlacesService.search()
  ↓
EmbeddingService.generateEmbedding(query)
  ↓
与地点描述的 embedding 进行相似度匹配
```

### 4. 行程规划上下文构建

**触发时机**：
- Trip Planner 需要理解用户需求时
- 需要从历史对话中提取关键信息时

**调用路径**：
```
TripPlannerService.chat()
  ↓
RagService.retrieve() 或 ChunkRetrievalService.retrieve()
  ↓
EmbeddingService.generateEmbedding(userMessage)
```

## 错误处理

### 代理连接错误

**错误信息**：
```
ERROR [EmbeddingService] OpenAI Embedding API error details: {
  "message": "connect ECONNREFUSED 127.0.0.1:9090",
  "code": "ECONNREFUSED"
}
```

**原因**：
- `.env` 文件中配置了代理 `HTTP_PROXY=http://127.0.0.1:9090`
- 代理服务器未运行
- OpenAI API 调用被路由到代理，但代理不可用

**影响**：
- Embedding 生成失败
- 返回零向量（降级策略）
- RAG 检索返回空结果
- 系统降级到关键词搜索

**降级策略**：
1. 尝试主提供商（OpenAI）
2. 如果失败，尝试备用提供商
3. 如果所有提供商都失败，返回零向量
4. RAG 检索检测到零向量后，返回空结果
5. 系统降级到关键词搜索（如果支持）

## 修复方案

### ✅ 已修复

**EmbeddingService**:
- 默认禁用代理（`disableProxy: true`）
- 通过 `createOpenAIHttp` 工厂函数禁用代理

**LlmService**:
- 默认禁用代理（`disableProxy: true`）
- `httpsAgent` 不使用代理
- OpenAI HTTP 客户端禁用代理

### 方案 1: 环境变量控制（推荐）

如果需要启用代理，可以在 `.env` 中设置：
```bash
# 禁用代理（默认）
OPENAI_DISABLE_PROXY=true
LLM_DISABLE_PROXY=true
```

### 方案 2: 启动代理服务器

如果确实需要代理，确保代理服务器运行在 `127.0.0.1:9090`，并设置：
```bash
OPENAI_DISABLE_PROXY=false
LLM_DISABLE_PROXY=false
```

### 方案 3: 移除环境变量

从 `.env` 文件中移除或注释掉代理配置：
```bash
# HTTP_PROXY="http://127.0.0.1:9090"
# HTTPS_PROXY="http://127.0.0.1:9090"
```

## 性能影响

### Embedding 生成延迟

- **正常情况**: 200-500ms
- **代理错误**: 5-10秒（超时）
- **降级到零向量**: 立即返回

### RAG 检索影响

- **有 embedding**: 语义搜索，结果更准确
- **零向量**: 返回空结果，降级到关键词搜索（如果支持）

## 监控指标

### 关键指标

1. **Embedding 生成成功率**
   - 正常: > 95%
   - 警告: 80-95%
   - 错误: < 80%

2. **Embedding 生成延迟**
   - 正常: < 500ms
   - 警告: 500-2000ms
   - 错误: > 2000ms

3. **零向量返回率**
   - 正常: < 5%
   - 警告: 5-20%
   - 错误: > 20%

### 日志示例

**成功**：
```
[DEBUG] ✅ 使用缓存的embedding: 冰岛自驾注意事项...
[DEBUG] Dense检索: 查询embedding生成成功，维度=1536, 非零值=1536
```

**失败（降级）**：
```
[WARN] 主提供商 openai 失败: OpenAI API 调用失败: connect ECONNREFUSED 127.0.0.1:9090，尝试备用提供商...
[ERROR] 所有 embedding 提供商都失败，返回零向量
[WARN] Embedding 失败，返回零向量（维度: 1536），将降级到关键词搜索
[WARN] ⚠️ Dense检索: 查询embedding是零向量，可能API调用失败。查询: "IS trail access rules permits..."
[DEBUG] RAG 检索完成: 找到 0 个相关文档
```

## 相关文件

- **EmbeddingService**: `src/places/services/embedding.service.ts`
- **RagService**: `src/rag/services/rag.service.ts`
- **ChunkRetrievalService**: `src/rag/services/chunk-retrieval.service.ts`
- **RAG Controller**: `src/rag/rag.controller.ts`

## 参考

- OpenAI Embedding API: https://platform.openai.com/docs/guides/embeddings
- RAG 系统文档: `src/rag/README.md`
