# RAG 测试集使用指南

## 📋 概述

测试集用于评估 RAG 检索质量，包含查询和对应的正确答案（ground truth chunks）。

**文件位置**: `e2e-cases/rag-eval-testset.json`

---

## 🚀 快速开始

### 方法1：使用自动填充脚本（推荐）

```bash
# 自动填充测试集的 groundTruthChunkIds
npx ts-node scripts/populate-testset-ground-truth.ts
```

脚本会自动：
1. 读取测试集文件
2. 对每个查询执行向量检索和关键词匹配
3. 自动选择相关 chunks 作为 groundTruthChunkIds
4. 更新测试集文件（自动备份）

### 方法2：快速测试 API 接口

```bash
# 快速测试所有相关接口
npx ts-node scripts/quick-test-rag-api.ts
```

### 方法3：使用 API 手动填充

见下方详细说明。

---

## 🔍 如何找到 Chunk UUID

### 方法1：使用 API 查找相关 chunks（推荐）

```bash
# 1. 查找与查询相关的 chunks
curl "http://localhost:3000/api/rag/evaluation/testset/find-chunks?query=冰岛租车保险&limit=10"

# 响应示例：
{
  "success": true,
  "data": {
    "query": "冰岛租车保险",
    "chunks": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",  // ← 这就是 UUID
        "chunkId": "car_rental_insurance_001",
        "content": "冰岛租车保险包括...",
        "type": "operational_guide",
        "keywords": ["租车", "保险", "冰岛"],
        "filename": "iceland-car-rental-guide.json",
        "category": "practical",
        "similarity": 8  // 相关性分数
      }
    ],
    "count": 10
  }
}
```

### 方法2：列出所有 chunks 浏览

```bash
# 列出所有 chunks（用于浏览）
curl "http://localhost:3000/rag/evaluation/testset/list-chunks?limit=100"

# 响应示例：
{
  "success": true,
  "data": {
    "chunks": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",  // ← UUID
        "chunkId": "car_rental_insurance_001",
        "content": "...",
        "filename": "iceland-car-rental-guide.json"
      }
    ],
    "count": 100
  }
}
```

### 方法3：使用检索 API 查找

```bash
# 使用 Chunk 检索 API，查看返回结果的 id
curl -X POST "http://localhost:3000/api/rag/chunks/retrieve" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "冰岛租车保险",
    "limit": 10
  }'

# 响应中的 id 字段就是 chunk UUID
```

---

## 📝 更新测试集

### 1. 获取当前测试集

```bash
curl "http://localhost:3000/api/rag/evaluation/testset"
```

### 2. 更新 groundTruthChunkIds

```bash
curl -X PUT "http://localhost:3000/rag/evaluation/testset" \
  -H "Content-Type: application/json" \
  -d '{
    "version": 1,
    "name": "iceland-kb-smoke",
    "testCases": [
      {
        "id": "is-car-insurance-001",
        "query": "冰岛租车保险怎么选？有哪些必买的险种？",
        "groundTruthChunkIds": [
          "550e8400-e29b-41d4-a716-446655440000",  // 从 find-chunks API 获取
          "660e8400-e29b-41d4-a716-446655440001"
        ],
        "tags": ["iceland", "car-rental", "insurance"]
      }
    ]
  }'
```

---

## 🚀 运行测试集评估

```bash
# 运行测试集评估
curl -X POST "http://localhost:3000/api/rag/evaluation/testset/run" \
  -H "Content-Type: application/json" \
  -d '{
    "params": {
      "useHybridSearch": true,
      "useReranking": false,
      "useQueryExpansion": false
    },
    "limit": 10
  }'

# 响应示例：
{
  "success": true,
  "data": {
    "testset": {
      "name": "iceland-kb-smoke",
      "version": 1
    },
    "result": {
      "averageRecallAtK": {
        "1": 0.5,
        "5": 0.8,
        "10": 0.9
      },
      "averageMRR": 0.75,
      "averageNDCGAtK": {
        "1": 0.6,
        "5": 0.85,
        "10": 0.92
      },
      "perQueryResults": [...]
    }
  }
}
```

---

## 📊 测试集文件格式

```json
{
  "version": 1,
  "name": "iceland-kb-smoke",
  "description": "冰岛知识库测试集",
  "createdAt": "2026-01-23T00:00:00.000Z",
  "updatedAt": "2026-01-23T00:00:00.000Z",
  "testCases": [
    {
      "id": "is-car-insurance-001",
      "query": "冰岛租车保险怎么选？有哪些必买的险种？",
      "groundTruthChunkIds": [
        "550e8400-e29b-41d4-a716-446655440000",
        "660e8400-e29b-41d4-a716-446655440001"
      ],
      "tags": ["iceland", "car-rental", "insurance"],
      "notes": "正确答案应该包含租车保险的相关信息"
    }
  ]
}
```

---

## 🎯 快速开始

1. **查找相关 chunks**:
   ```bash
   # 对每个测试用例，查找相关 chunks
   curl "http://localhost:3000/rag/evaluation/testset/find-chunks?query=冰岛租车保险"
   ```

2. **复制 UUID**:
   - 从响应中复制 `id` 字段（chunk UUID）

3. **更新测试集**:
   ```bash
   # 使用 PUT API 更新测试集，填入 groundTruthChunkIds
   curl -X PUT "http://localhost:3000/api/rag/evaluation/testset" \
     -H "Content-Type: application/json" \
     -d @updated-testset.json
   ```

4. **运行评估**:
   ```bash
   # 运行测试集评估
   curl -X POST "http://localhost:3000/api/rag/evaluation/testset/run"
   ```

---

## 💡 提示

- **如何选择 Ground Truth**: 
  - 选择与查询最相关的 1-3 个 chunks
  - 查看 `similarity` 分数，选择分数较高的
  - 查看 `content` 预览，确认内容确实相关

- **测试集维护**:
  - 定期运行评估，跟踪质量变化
  - 根据评估结果调整 groundTruthChunkIds
  - 添加新的测试用例覆盖更多场景

---

**相关文档**:
- [RAG优化实现总结](./RAG优化实现总结.md)
- [RAG模块技术评估报告](./RAG模块技术评估报告.md)
