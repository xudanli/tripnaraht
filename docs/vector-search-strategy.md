# 向量搜索技术策略标准件

## 1. 目标与边界

### 目标

实现语义地点搜索，让用户可以用自然语言描述氛围和感觉，找到相关但不含关键词的地点。

**核心能力**：
- 理解语义相似性（如"像京都那样的地方"）
- 混合搜索：向量搜索 + 关键词搜索
- 可解释性：显示推荐原因

### 非目标（MVP 可不做）

- 图像向量搜索
- 实时向量更新
- 多模态搜索

## 2. 技术栈

### Embedding 模型

#### 推荐方案 1：OpenAI text-embedding-3-small（推荐用于生产）

**优点**：
- 性能稳定，质量高
- 支持多语言（包括中文）
- API 调用简单
- 向量维度：1536

**缺点**：
- 需要 API 调用（有成本）
- 依赖网络

**使用方式**：
```typescript
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: text,
});
const embedding = response.data[0].embedding;
```

#### 推荐方案 2：multilingual-e5-large（开源，推荐用于开发/测试）

**优点**：
- 完全免费，本地运行
- 对中文和多语言支持极好
- 向量维度：1024
- 可自托管

**缺点**：
- 需要本地部署模型（资源消耗）
- 首次加载较慢

**使用方式**：
```typescript
// 使用 @huggingface/inference 或本地模型
import { HfInference } from '@huggingface/inference';
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
const response = await hf.featureExtraction({
  model: 'intfloat/multilingual-e5-large',
  inputs: text,
});
```

### 数据库：pgvector

**为什么选择 pgvector**：
- 与现有 PostgreSQL + PostGIS 架构一致
- 无需引入新的向量数据库（如 Milvus/Pinecone）
- 支持混合查询（向量 + SQL）
- 性能足够（对于中小规模数据）

**安装**：
```sql
-- 在 PostgreSQL 中安装扩展
CREATE EXTENSION IF NOT EXISTS vector;
```

**表结构**：
```sql
-- 在 Place 表中添加向量字段
ALTER TABLE "Place" ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS place_embedding_idx ON "Place" 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

## 3. 数据准备

### 构建搜索文本

从 Place 数据中提取文本用于生成 embedding：

```typescript
function buildSearchText(place: Place): string {
  const parts: string[] = [];
  
  // 名称
  if (place.nameCN) parts.push(place.nameCN);
  if (place.nameEN) parts.push(place.nameEN);
  
  // 地址
  if (place.address) parts.push(place.address);
  
  // 从 metadata 中提取
  const metadata = place.metadata as any;
  if (metadata?.description) parts.push(metadata.description);
  if (metadata?.tags) {
    if (Array.isArray(metadata.tags)) {
      parts.push(metadata.tags.join(' '));
    }
  }
  if (metadata?.reviews) {
    // 提取前3条评论的关键词
    const reviews = Array.isArray(metadata.reviews) ? metadata.reviews.slice(0, 3) : [];
    reviews.forEach((review: any) => {
      if (review.text) parts.push(review.text);
    });
  }
  
  return parts.join(' ');
}
```

### 批量生成 Embedding

```typescript
async function generateEmbeddingsForPlaces(places: Place[]): Promise<void> {
  for (const place of places) {
    const searchText = buildSearchText(place);
    const embedding = await generateEmbedding(searchText);
    
    await prisma.place.update({
      where: { id: place.id },
      data: { embedding },
    });
  }
}
```

## 4. 混合搜索策略

### 搜索流程

1. **向量搜索**：使用 embedding 相似度召回相关结果
2. **关键词搜索**：使用 SQL LIKE 召回精确匹配
3. **混合得分**：`Final_Score = Vector_Score * 0.7 + Keyword_Score * 0.3`
4. **排序**：按最终得分排序

### 实现

```typescript
async function hybridSearch(
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  // 1. 生成查询向量
  const queryEmbedding = await generateEmbedding(query);
  
  // 2. 向量搜索（使用余弦相似度）
  const vectorResults = await prisma.$queryRaw<VectorSearchResult[]>`
    SELECT 
      id,
      "nameCN",
      "nameEN",
      1 - (embedding <=> ${queryEmbedding}::vector) as vector_score
    FROM "Place"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${queryEmbedding}::vector
    LIMIT ${limit * 2}  -- 召回更多结果用于混合
  `;
  
  // 3. 关键词搜索
  const keywordResults = await prisma.$queryRaw<KeywordSearchResult[]>`
    SELECT 
      id,
      "nameCN",
      "nameEN",
      CASE
        WHEN "nameCN" ILIKE ${`%${query}%`} THEN 1.0
        WHEN "nameEN" ILIKE ${`%${query}%`} THEN 0.8
        WHEN address ILIKE ${`%${query}%`} THEN 0.6
        ELSE 0.4
      END as keyword_score
    FROM "Place"
    WHERE (
      "nameCN" ILIKE ${`%${query}%`} OR
      "nameEN" ILIKE ${`%${query}%`} OR
      address ILIKE ${`%${query}%`}
    )
    LIMIT ${limit * 2}
  `;
  
  // 4. 合并结果并计算混合得分
  const resultMap = new Map<number, SearchResult>();
  
  // 添加向量搜索结果
  vectorResults.forEach((result) => {
    resultMap.set(result.id, {
      ...result,
      vectorScore: result.vector_score,
      keywordScore: 0,
      finalScore: result.vector_score * 0.7,
    });
  });
  
  // 合并关键词搜索结果
  keywordResults.forEach((result) => {
    const existing = resultMap.get(result.id);
    if (existing) {
      existing.keywordScore = result.keyword_score;
      existing.finalScore = existing.vectorScore * 0.7 + result.keyword_score * 0.3;
    } else {
      resultMap.set(result.id, {
        ...result,
        vectorScore: 0,
        keywordScore: result.keyword_score,
        finalScore: result.keyword_score * 0.3,
      });
    }
  });
  
  // 5. 排序并返回
  return Array.from(resultMap.values())
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);
}
```

## 5. 推荐原因生成

### 提取匹配原因

```typescript
function extractMatchReasons(
  place: Place,
  query: string,
  vectorScore: number,
  keywordScore: number
): string[] {
  const reasons: string[] = [];
  
  // 向量相似度高
  if (vectorScore > 0.7) {
    const metadata = place.metadata as any;
    
    // 检查评论中的关键词
    if (metadata?.reviews) {
      const reviews = Array.isArray(metadata.reviews) ? metadata.reviews : [];
      const matchingReviews = reviews.filter((review: any) => {
        const text = review.text?.toLowerCase() || '';
        // 提取与查询相关的关键词（简化版，实际可用 NLP）
        return text.includes('安静') || text.includes('静谧') || text.includes('日式');
      });
      
      if (matchingReviews.length > 0) {
        reasons.push(`根据评论提到的"${extractKeywords(matchingReviews)}"推荐`);
      }
    }
    
    // 检查标签
    if (metadata?.tags) {
      const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
      const matchingTags = tags.filter((tag: string) => 
        tag.includes('日式') || tag.includes('庭院') || tag.includes('安静')
      );
      
      if (matchingTags.length > 0) {
        reasons.push(`标签：${matchingTags.join('、')}`);
      }
    }
  }
  
  // 关键词匹配
  if (keywordScore > 0.5) {
    if (place.nameCN?.includes(query)) {
      reasons.push(`名称包含"${query}"`);
    }
  }
  
  return reasons;
}
```

## 6. API 接口设计

### 语义搜索接口

```typescript
interface SemanticSearchRequest {
  query: string;  // 自然语言查询，如"像京都那样的地方"
  lat?: number;
  lng?: number;
  radius?: number;
  category?: PlaceCategory;
  limit?: number;
}

interface SemanticSearchResponse {
  results: Array<{
    id: number;
    nameCN: string;
    nameEN?: string;
    address?: string;
    category: PlaceCategory;
    matchReasons: string[];  // 推荐原因
    vectorScore: number;
    keywordScore: number;
    finalScore: number;
    distance?: number;
  }>;
  total: number;
}
```

## 7. 性能优化

### 索引优化

```sql
-- IVFFlat 索引（适合大规模数据）
CREATE INDEX place_embedding_idx ON "Place" 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- 对于小规模数据（< 10万），可以使用 HNSW（更快但占用更多空间）
CREATE INDEX place_embedding_hnsw_idx ON "Place" 
  USING hnsw (embedding vector_cosine_ops);
```

### 缓存策略

- **查询向量缓存**：相同查询的 embedding 缓存 24 小时
- **结果缓存**：热门查询结果缓存 1 小时

## 8. 实现建议

### 分阶段实施

1. **Phase 1（MVP）**：
   - 使用 OpenAI API 生成 embedding
   - 实现基础向量搜索
   - 简单的混合搜索（固定权重）

2. **Phase 2（优化）**：
   - 添加推荐原因提取
   - 优化混合搜索权重
   - 添加缓存

3. **Phase 3（进阶）**：
   - 支持本地模型（multilingual-e5-large）
   - 实时向量更新
   - 更智能的原因提取（使用 LLM）

### 错误处理

- Embedding API 失败：降级到纯关键词搜索
- 向量字段为空：跳过向量搜索，仅使用关键词搜索
- 数据库查询超时：返回部分结果

## 9. 监控指标

- 向量搜索响应时间
- Embedding API 调用次数和成本
- 混合搜索效果（A/B 测试）
- 用户点击率（CTR）提升

