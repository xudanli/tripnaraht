# RAG API 前端迁移指南

## ⚠️ 重要变更

`document_index` 表已删除，旧的 RAG 检索接口已废弃。前端需要迁移到新的 Chunk 检索接口。

---

## 接口变更对比

### ❌ 旧接口（已废弃）

#### 1. GET `/api/rag/retrieve`
```typescript
// ❌ 已废弃，返回空数组
GET /api/rag/retrieve?query=冰岛环岛路线&collection=iceland&limit=10
```

**问题**:
- 调用已废弃的 `RagService.retrieve()`
- `document_index` 表已删除
- 现在直接返回空数组 `[]`
- 控制台会显示警告：`⚠️ document_index表已删除，RagService.retrieve()不再可用`

#### 2. POST `/api/rag/search`
```typescript
// ❌ 已废弃，返回空数组
POST /api/rag/search
{
  "query": "冰岛环岛路线",
  "collection": "iceland",
  "limit": 10
}
```

**问题**: 同样调用已废弃的 `RagService.retrieve()`

---

### ✅ 新接口（推荐使用）

#### POST `/api/rag/chunks/retrieve`

**接口**: `POST /api/rag/chunks/retrieve`

**描述**: 使用新的知识库系统（KnowledgeFile + Chunk）检索文档，默认启用混合检索（Dense + Sparse），对中文查询更有效。

**请求体**:
```typescript
{
  query: string;                    // 查询文本（必填）
  limit?: number;                   // 返回数量限制（默认 10）
  credibilityMin?: number;          // 最小可信度（默认 0.5）
  type?: string;                    // 文档类型（可选）
  category?: string;                // 文件分类（可选）
  fileId?: string;                  // 文件ID（可选）
  chunkCategory?: string;           // Chunk分类过滤 (RULES, POI_INFO, GATE, WEATHER, GENERAL)
  
  // Hybrid Search 配置（推荐启用）
  useHybridSearch?: boolean;        // 是否使用混合检索（默认 true，推荐）
  denseWeight?: number;              // Dense检索权重（默认 0.6）
  sparseWeight?: number;             // Sparse检索权重（默认 0.4）
  
  // 高级功能（可选）
  useReranking?: boolean;           // 是否使用重排序（默认 false，启用后准确率可达100%，但延迟+2-3秒）
  rerankTopK?: number;              // 重排序的Top-K数量（默认 20）
  useQueryExpansion?: boolean;      // 是否使用查询扩展（默认 false，会增加延迟和成本但提升召回率）
  maxQueryVariants?: number;        // 最大查询变体数量（默认 3）
  useIntentClassification?: boolean; // 是否使用意图分类自动过滤（默认 false）
}
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "chunkId": "chunk-123",
      "content": "冰岛环岛路线推荐...",
      "score": 0.85,
      "fileId": "file-456",
      "fileName": "iceland-ring-road.md",
      "type": "MARKDOWN",
      "category": "ROUTE_GUIDE",
      "chunkCategory": "POI_INFO",
      "metadata": {
        "page": 1,
        "section": "路线推荐"
      }
    }
  ]
}
```

---

## 迁移步骤

### 步骤 1: 更新 API 调用

#### 旧代码（需要替换）
```typescript
// ❌ 旧代码
const response = await fetch(
  `/api/rag/retrieve?query=${encodeURIComponent(query)}&collection=iceland&limit=10`
);
const results = await response.json();
```

#### 新代码（推荐）
```typescript
// ✅ 新代码
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: query,
    limit: 10,
    useHybridSearch: true,  // 推荐启用，对中文查询更有效
    chunkCategory: 'POI_INFO',  // 可选：根据需求过滤分类
  }),
});
const result = await response.json();
if (result.success) {
  const chunks = result.data;
  // 处理检索结果
}
```

---

### 步骤 2: 更新响应数据结构

#### 旧响应结构
```typescript
interface OldRagResult {
  id: string;
  title: string;
  content: string;
  source?: string;
  score: number;
  metadata?: Record<string, any>;
}
```

#### 新响应结构
```typescript
interface ChunkRetrievalResult {
  chunkId: string;           // Chunk ID（新）
  content: string;           // 内容
  score: number;             // 相似度分数
  fileId: string;            // 所属文件ID（新）
  fileName: string;          // 文件名（新）
  type: string;              // 文件类型（MARKDOWN, PDF等）
  category: string;          // 文件分类
  chunkCategory?: string;    // Chunk分类（RULES, POI_INFO, GATE, WEATHER, GENERAL）
  metadata?: Record<string, any>;
}
```

**主要差异**:
- `id` → `chunkId`
- 新增 `fileId` 和 `fileName`
- 新增 `type`、`category`、`chunkCategory` 字段
- `title` 字段已移除（可通过 `fileName` 获取）

---

### 步骤 3: 更新前端组件

#### 示例：React Hook

```typescript
// hooks/useRagRetrieval.ts
import { useState } from 'react';

interface ChunkResult {
  chunkId: string;
  content: string;
  score: number;
  fileId: string;
  fileName: string;
  type: string;
  category: string;
  chunkCategory?: string;
  metadata?: Record<string, any>;
}

interface UseRagRetrievalOptions {
  query: string;
  limit?: number;
  chunkCategory?: string;
  useHybridSearch?: boolean;
}

export function useRagRetrieval(options: UseRagRetrievalOptions) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ChunkResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const retrieve = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/rag/chunks/retrieve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: options.query,
          limit: options.limit || 10,
          chunkCategory: options.chunkCategory,
          useHybridSearch: options.useHybridSearch !== false, // 默认 true
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        setResults(result.data);
      } else {
        setError(result.error?.message || '检索失败');
      }
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setLoading(false);
    }
  };

  return {
    retrieve,
    loading,
    results,
    error,
  };
}
```

#### 使用示例

```typescript
// components/RagSearch.tsx
import { useRagRetrieval } from '@/hooks/useRagRetrieval';

export function RagSearch() {
  const [query, setQuery] = useState('');
  const { retrieve, loading, results, error } = useRagRetrieval({
    query,
    limit: 10,
    useHybridSearch: true,
  });

  const handleSearch = () => {
    if (query.trim()) {
      retrieve();
    }
  };

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="输入查询..."
      />
      <button onClick={handleSearch} disabled={loading}>
        {loading ? '搜索中...' : '搜索'}
      </button>

      {error && <div className="error">{error}</div>}

      <div className="results">
        {results.map((chunk) => (
          <div key={chunk.chunkId} className="chunk-item">
            <div className="chunk-header">
              <span className="file-name">{chunk.fileName}</span>
              <span className="score">相似度: {chunk.score.toFixed(2)}</span>
            </div>
            <div className="chunk-content">{chunk.content}</div>
            {chunk.chunkCategory && (
              <span className="category">{chunk.chunkCategory}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 参数映射指南

### 旧参数 → 新参数

| 旧参数 | 新参数 | 说明 |
|--------|--------|------|
| `collection` | `category` | 文件分类（注意：语义略有不同） |
| `countryCode` | ❌ 已移除 | 不再支持国家代码过滤 |
| `tags` | ❌ 已移除 | 不再支持标签过滤 |
| `minScore` | `credibilityMin` | 最小可信度阈值 |

### 新增参数（推荐使用）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `useHybridSearch` | `true` | 混合检索（Dense + Sparse），对中文查询更有效 |
| `chunkCategory` | - | Chunk分类过滤，可选值：`RULES`, `POI_INFO`, `GATE`, `WEATHER`, `GENERAL` |
| `useReranking` | `false` | 启用后准确率可达100%，但延迟+2-3秒 |
| `useQueryExpansion` | `false` | 查询扩展，提升召回率但增加延迟和成本 |

---

## 最佳实践

### 1. 基础检索（推荐配置）

```typescript
// 对大多数场景，使用默认配置即可
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '冰岛环岛路线推荐',
    limit: 10,
    // useHybridSearch: true (默认)
  }),
});
```

### 2. 高精度检索（需要更高准确率）

```typescript
// 启用重排序，准确率可达100%，但延迟+2-3秒
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '冰岛F路开放时间',
    limit: 5,
    useHybridSearch: true,
    useReranking: true,        // 启用重排序
    rerankTopK: 20,            // 对Top-20结果重排序
  }),
});
```

### 3. 分类过滤检索

```typescript
// 只检索特定分类的Chunk
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '冰岛租车规则',
    limit: 10,
    chunkCategory: 'RULES',    // 只检索规则类Chunk
  }),
});
```

### 4. 意图分类自动过滤（实验性）

```typescript
// 启用意图分类，自动识别查询意图并过滤
const response = await fetch('/api/rag/chunks/retrieve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '冰岛天气怎么样',
    limit: 10,
    useIntentClassification: true,  // 启用意图分类
  }),
});
```

---

## 错误处理

### 常见错误

1. **空结果**
   ```json
   {
     "success": true,
     "data": []
   }
   ```
   **原因**: 知识库中没有相关数据，或查询不匹配
   **处理**: 提示用户调整查询或检查知识库数据

2. **参数错误**
   ```json
   {
     "success": false,
     "error": {
       "code": "VALIDATION_ERROR",
       "message": "query参数必填"
     }
   }
   ```
   **处理**: 检查请求参数是否正确

3. **服务器错误**
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_ERROR",
       "message": "检索失败: ..."
     }
   }
   ```
   **处理**: 记录错误日志，提示用户稍后重试

---

## 性能优化建议

### 1. 合理设置 limit

- **列表展示**: `limit: 10`（默认）
- **详情页**: `limit: 5`
- **搜索建议**: `limit: 3`

### 2. 根据场景选择功能

| 场景 | 推荐配置 |
|------|----------|
| 快速搜索 | `useHybridSearch: true`, `useReranking: false` |
| 精确匹配 | `useHybridSearch: true`, `useReranking: true` |
| 高召回率 | `useQueryExpansion: true` |
| 分类查询 | `chunkCategory: 'RULES'` 等 |

### 3. 缓存策略

```typescript
// 使用浏览器缓存或内存缓存
const cacheKey = `rag:${query}:${limit}`;
const cached = sessionStorage.getItem(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

const response = await fetch('/api/rag/chunks/retrieve', { ... });
const result = await response.json();

if (result.success) {
  sessionStorage.setItem(cacheKey, JSON.stringify(result.data));
}
```

---

## 迁移检查清单

- [ ] 替换所有 `GET /api/rag/retrieve` 调用为 `POST /api/rag/chunks/retrieve`
- [ ] 替换所有 `POST /api/rag/search` 调用为 `POST /api/rag/chunks/retrieve`
- [ ] 更新请求参数（移除 `collection`，添加 `useHybridSearch`）
- [ ] 更新响应数据结构处理（`id` → `chunkId`，新增 `fileId`、`fileName`）
- [ ] 移除对 `title` 字段的依赖（使用 `fileName` 替代）
- [ ] 测试所有 RAG 相关功能
- [ ] 检查控制台是否还有警告信息
- [ ] 更新相关文档和注释

---

## 兼容性说明

### 旧接口状态

- `GET /api/rag/retrieve` - ⚠️ 已废弃，返回空数组
- `POST /api/rag/search` - ⚠️ 已废弃，返回空数组

**注意**: 旧接口仍然存在，但会返回空结果并显示警告。建议尽快迁移。

### 新接口状态

- `POST /api/rag/chunks/retrieve` - ✅ 推荐使用，功能完整

---

## 示例代码

### 完整迁移示例

```typescript
// 旧代码（需要替换）
async function oldRagSearch(query: string) {
  const response = await fetch(
    `/api/rag/retrieve?query=${encodeURIComponent(query)}&collection=iceland&limit=10`
  );
  const result = await response.json();
  return result.data; // 现在返回空数组 []
}

// 新代码（推荐）
async function newRagSearch(query: string) {
  const response = await fetch('/api/rag/chunks/retrieve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: query,
      limit: 10,
      useHybridSearch: true,
    }),
  });
  
  const result = await response.json();
  
  if (result.success) {
    return result.data; // 返回 ChunkRetrievalResult[]
  } else {
    throw new Error(result.error?.message || '检索失败');
  }
}
```

---

## 相关文档

- [RAG README](./README.md)
- [ChunkRetrievalService 源码](../rag/services/chunk-retrieval.service.ts)
- [RAG Controller 源码](../rag/rag.controller.ts)

---

## 问题反馈

如果迁移过程中遇到问题，请检查：
1. 控制台是否有警告信息
2. 网络请求是否成功（状态码 200）
3. 响应格式是否符合预期
4. 知识库中是否有相关数据

如有问题，请联系后端团队或查看相关文档。
