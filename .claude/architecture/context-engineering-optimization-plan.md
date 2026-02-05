# TripNara Context Engineering 架构优化方案

**制定日期**: 2026-02-05  
**制定者**: 架构师  
**目标**: 基于 Context Engineering/Context Learning 框架，优化系统性能、可扩展性和用户体验

---

## 📋 执行摘要

### 当前状态评估

| 维度 | 当前状态 | 目标状态 | 差距 |
|------|---------|---------|------|
| **Context Package 构建延迟** | ~450ms (P95) | < 200ms (P95) | 2.25x |
| **缓存命中率** | ~65% | >= 85% | +20% |
| **Context Learning 样本数** | 初始阶段 | >= 1000/用户 | 需要积累 |
| **个性化 Context 推荐** | ❌ 未实现 | ✅ 实现 | 新功能 |
| **压缩策略学习** | ❌ 未实现 | ✅ 实现 | 新功能 |
| **批量处理能力** | 部分支持 | ✅ 完整支持 | 需要增强 |

### 优化优先级

- **P0（立即）**: 性能瓶颈修复、缓存优化
- **P1（1-2周）**: Context Learning 增强、批量处理优化
- **P2（1个月）**: 个性化推荐、压缩策略学习
- **P3（2-3个月）**: A/B 测试框架、可视化仪表板

---

## 🎯 优化目标

### 1. 性能目标

- ✅ **Context Package 构建延迟**: < 200ms (P95)
- ✅ **缓存命中率**: >= 85%
- ✅ **RAG 检索延迟**: < 200ms (P95)
- ✅ **Context Learning 延迟**: < 50ms (异步，不阻塞主流程)

### 2. 可扩展性目标

- ✅ **支持 10x 并发**: 当前 QPS 的 10 倍
- ✅ **Context Learning 样本数**: >= 1000/用户
- ✅ **批量处理能力**: 支持批量 Context Package 构建

### 3. 用户体验目标

- ✅ **个性化 Context 推荐**: 为不同用户推荐最优 Context 组合
- ✅ **智能压缩**: 自动学习哪些 Block 可以压缩或省略
- ✅ **相关性学习**: 基于用户查询学习 Block 相关性

---

## 🏗️ 架构优化方案

### Phase 1: 性能优化（P0 - 立即）

#### 1.1 Context Package 缓存策略优化

**问题**:
- 当前缓存命中率仅 ~65%
- 缓存 key 粒度不够细，导致缓存失效频繁
- 缺少缓存预热机制

**优化方案**:

```typescript
// 1. 分层缓存策略
interface CacheStrategy {
  // L1: 内存缓存（最快，5分钟TTL）
  l1MemoryCache: Map<string, ContextPackage>;
  
  // L2: Redis 缓存（快速，15分钟TTL）
  l2RedisCache: RedisService;
  
  // L3: 数据库缓存（持久化，用于跨实例共享）
  l3DatabaseCache: PrismaService;
}

// 2. 细粒度缓存 key
function buildCacheKey(options: ContextPackageOptions): string {
  // 包含所有影响 Context Package 的因素
  const factors = [
    `tripId:${options.tripId}`,
    `phase:${options.phase}`,
    `agent:${options.agent}`,
    `topics:${options.requiredTopics?.sort().join(',') || 'none'}`,
    `excludeTopics:${options.excludeTopics?.sort().join(',') || 'none'}`,
    `tokenBudget:${options.tokenBudget || 3600}`,
    // 添加 userQuery hash（前100字符）
    `queryHash:${hash(options.userQuery?.substring(0, 100) || '')}`,
  ];
  return factors.join('|');
}

// 3. 缓存预热机制
async function warmupCache(tripId: string, commonPhases: string[]): Promise<void> {
  // 为常见 phase 和 agent 组合预构建 Context Package
  const commonAgents = ['PLANNER', 'GATEKEEPER', 'CORE_DECISION'];
  for (const phase of commonPhases) {
    for (const agent of commonAgents) {
      await contextEngineer.build({
        tripId,
        phase,
        agent,
        userQuery: '', // 通用查询
        tokenBudget: 3600,
      });
    }
  }
}
```

**预期效果**:
- 缓存命中率: 65% → 85% (+20%)
- Context Package 构建延迟: 450ms → 200ms (P95)

#### 1.2 RAG 检索性能优化

**问题**:
- 向量检索延迟较高（~150ms）
- 缺少结果缓存
- 批量检索未优化

**优化方案**:

```typescript
// 1. 结果缓存（RAG 查询结果）
interface RAGResultCache {
  // 缓存 key: queryHash + category + limit
  cacheKey: string;
  results: Chunk[];
  timestamp: number;
  ttl: number; // 根据 category 动态设置
}

// 2. 批量检索优化
async function batchRetrieve(
  queries: string[],
  category: ChunkCategory
): Promise<Map<string, Chunk[]>> {
  // 使用并行执行器批量检索
  const tasks = queries.map(query => ({
    id: hash(query),
    operation: () => this.retrieve(query, category),
  }));
  
  const results = await this.parallelExecutor.executeAll(tasks, {
    maxConcurrency: 10, // 提高并发度
    taskTimeout: 5000,
  });
  
  return new Map(results.map((r, i) => [queries[i], r.result]));
}

// 3. 预计算热门查询
async function precomputeHotQueries(): Promise<void> {
  // 从日志中提取热门查询
  const hotQueries = await this.extractHotQueries();
  
  // 预计算并缓存结果
  for (const query of hotQueries) {
    await this.retrieve(query, ChunkCategory.GENERAL);
  }
}
```

**预期效果**:
- RAG 检索延迟: 150ms → 100ms (P95)
- 缓存命中率: +15%

#### 1.3 并发请求去重优化

**问题**:
- 并发请求可能导致重复的 Context Package 构建
- Embedding 生成存在竞态条件

**优化方案**:

```typescript
// 1. In-Flight Request Deduplication
class ContextEngineerService {
  // 正在进行的构建任务
  private readonly inFlightBuilds = new Map<string, Promise<ContextPackage>>();
  
  async build(options: ContextPackageOptions): Promise<ContextPackage> {
    const cacheKey = this.buildCacheKey(options);
    
    // 检查是否有正在进行的构建
    const inFlight = this.inFlightBuilds.get(cacheKey);
    if (inFlight) {
      this.logger.debug(`复用正在进行的构建: ${cacheKey}`);
      return inFlight;
    }
    
    // 创建新的构建任务
    const buildPromise = this.doBuild(options);
    this.inFlightBuilds.set(cacheKey, buildPromise);
    
    try {
      const result = await buildPromise;
      return result;
    } finally {
      // 完成后移除
      this.inFlightBuilds.delete(cacheKey);
    }
  }
}

// 2. Embedding 生成去重（已部分实现，需要增强）
class EmbeddingService {
  private readonly inFlightRequests = new Map<string, Promise<number[]>>();
  
  async generateEmbedding(text: string): Promise<number[]> {
    const cacheKey = this.generateCacheKey(text);
    
    // 检查缓存
    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;
    
    // 检查是否有正在进行的请求
    const inFlight = this.inFlightRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
    
    // 创建新请求
    const requestPromise = this.doGenerateEmbedding(text);
    this.inFlightRequests.set(cacheKey, requestPromise);
    
    try {
      const result = await requestPromise;
      // 写入缓存（先内存，后 Redis）
      await this.cacheService.set(cacheKey, result);
      return result;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }
}
```

**预期效果**:
- 减少重复构建: -30%
- 减少重复 Embedding 生成: -40%

---

### Phase 2: Context Learning 增强（P1 - 1-2周）

#### 2.1 批量学习优化

**问题**:
- Context Learning 逐条处理，效率低
- 缺少批量学习接口

**优化方案**:

```typescript
// 1. 批量学习接口
interface BatchLearningInput {
  events: ContextLearningInput[];
  batchSize?: number; // 默认 100
}

async function batchLearn(input: BatchLearningInput): Promise<ContextLearningOutput[]> {
  const batches = chunk(input.events, input.batchSize || 100);
  const results: ContextLearningOutput[] = [];
  
  for (const batch of batches) {
    // 并行处理批次
    const batchResults = await Promise.all(
      batch.map(event => this.learn(event))
    );
    results.push(...batchResults);
  }
  
  return results;
}

// 2. 异步学习队列
class ContextLearningQueue {
  private readonly queue: Queue<ContextLearningInput>;
  
  constructor() {
    this.queue = new Queue({
      concurrency: 5, // 并发处理 5 个学习任务
      interval: 100, // 100ms 间隔
    });
  }
  
  async enqueue(event: ContextLearningInput): Promise<void> {
    await this.queue.add(async () => {
      await this.learningService.learn(event);
    });
  }
  
  // 批量入队
  async enqueueBatch(events: ContextLearningInput[]): Promise<void> {
    for (const event of events) {
      await this.enqueue(event);
    }
  }
}
```

**预期效果**:
- 学习处理速度: +5x
- 学习延迟: < 50ms (异步，不阻塞)

#### 2.2 学习结果应用优化

**问题**:
- 学习结果未实时应用到 Context Package 构建
- 缺少学习结果缓存

**优化方案**:

```typescript
// 1. 学习结果缓存
class ContextLearningService {
  // 缓存学习结果（按 userId + phase + agent）
  private readonly learningResultCache = new Map<string, {
    result: ContextLearningOutput;
    timestamp: number;
    ttl: number; // 1小时
  }>();
  
  async getLearningResult(
    userId?: string,
    phase?: string,
    agent?: string
  ): Promise<ContextLearningOutput> {
    const cacheKey = `${userId || 'global'}:${phase || 'all'}:${agent || 'all'}`;
    
    // 检查缓存
    const cached = this.learningResultCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.result;
    }
    
    // 从数据库查询
    const result = await this.queryLearningResult(userId, phase, agent);
    
    // 更新缓存
    this.learningResultCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      ttl: 60 * 60 * 1000, // 1小时
    });
    
    return result;
  }
}

// 2. 实时应用学习结果到 Context Package 构建
async function build(options: ContextPackageOptions): Promise<ContextPackage> {
  // 1. 获取学习结果
  const learningResult = await this.learningService.getLearningResult(
    options.userId,
    options.phase,
    options.agent
  );
  
  // 2. 应用学习结果（调整 Block 优先级）
  if (learningResult.learningResult.updatedPriorities) {
    // 调整 requiredTopics 的优先级
    options.requiredTopics = this.applyLearningPriorities(
      options.requiredTopics || [],
      learningResult.learningResult.updatedPriorities
    );
  }
  
  // 3. 使用推荐的 Block 组合
  if (learningResult.learningResult.recommendedBlocks) {
    options.requiredTopics = learningResult.learningResult.recommendedBlocks;
  }
  
  // 4. 构建 Context Package
  return this.doBuild(options);
}
```

**预期效果**:
- 学习结果应用延迟: < 10ms
- Context Package 质量提升: +15%

---

### Phase 3: 个性化推荐（P2 - 1个月）

#### 3.1 个性化 Context 组合推荐

**问题**:
- 当前 Context Package 构建是通用的，未考虑用户个性化需求
- 缺少用户画像学习

**优化方案**:

```typescript
// 1. 用户画像学习
interface UserProfile {
  userId: string;
  preferredBlockTypes: string[]; // 用户偏好的 Block 类型
  preferredTopics: string[]; // 用户偏好的主题
  blockImportanceScores: Record<string, number>; // Block 重要性评分
  lastUpdated: Date;
}

class UserProfileService {
  async learnUserProfile(
    userId: string,
    events: ContextLearningInput[]
  ): Promise<UserProfile> {
    // 从学习事件中提取用户偏好
    const profile = await this.buildUserProfile(userId, events);
    
    // 更新用户画像
    await this.updateUserProfile(userId, profile);
    
    return profile;
  }
  
  async getRecommendedContext(
    userId: string,
    phase: string,
    agent: string
  ): Promise<string[]> {
    // 1. 获取用户画像
    const profile = await this.getUserProfile(userId);
    
    // 2. 获取全局学习结果
    const globalLearning = await this.learningService.getLearningResult(
      undefined,
      phase,
      agent
    );
    
    // 3. 融合用户画像和全局学习结果
    const recommended = this.fuseRecommendations(
      profile,
      globalLearning.learningResult.recommendedBlocks || []
    );
    
    return recommended;
  }
}

// 2. Context Package 构建时应用个性化推荐
async function build(options: ContextPackageOptions): Promise<ContextPackage> {
  // 1. 获取个性化推荐
  if (options.userId) {
    const recommended = await this.userProfileService.getRecommendedContext(
      options.userId,
      options.phase,
      options.agent
    );
    
    // 2. 合并用户推荐和显式指定的 topics
    options.requiredTopics = [
      ...(options.requiredTopics || []),
      ...recommended.filter(t => !options.requiredTopics?.includes(t))
    ];
  }
  
  // 3. 构建 Context Package
  return this.doBuild(options);
}
```

**预期效果**:
- 用户满意度: +20%
- Context Package 相关性: +25%

#### 3.2 压缩策略学习

**问题**:
- 当前压缩策略是静态的，未考虑实际使用情况
- 缺少学习哪些 Block 可以压缩或省略

**优化方案**:

```typescript
// 1. 压缩策略学习
interface CompressionLearning {
  blockKey: string;
  blockType: string;
  compressionScore: number; // 0-1，越高表示越可以压缩
  omissionScore: number; // 0-1，越高表示越可以省略
  sampleSize: number;
  confidence: number;
}

class CompressionLearningService {
  async learnCompressionStrategy(
    event: ContextLearningInput
  ): Promise<void> {
    if (event.eventType === 'context_used') {
      // 学习哪些 Block 被使用，哪些未被使用
      const usedBlocks = event.eventData.usedBlocks || [];
      const allBlocks = event.eventData.contextPackage?.blocks || [];
      
      for (const block of allBlocks) {
        const wasUsed = usedBlocks.includes(block.key);
        
        // 更新压缩评分
        await this.updateCompressionScore(
          block.key,
          block.type,
          wasUsed ? 0.1 : 0.9, // 未使用的 Block 可以压缩
          wasUsed ? 0.0 : 0.5   // 未使用的 Block 可以省略
        );
      }
    }
  }
  
  async getCompressionStrategy(
    blocks: ContextBlock[]
  ): Promise<CompressionStrategy> {
    // 获取每个 Block 的压缩评分
    const compressionScores = await Promise.all(
      blocks.map(block => this.getCompressionScore(block.key, block.type))
    );
    
    // 生成压缩策略
    return {
      compress: blocks.filter((_, i) => compressionScores[i].compressionScore > 0.7),
      omit: blocks.filter((_, i) => compressionScores[i].omissionScore > 0.8),
      keep: blocks.filter((_, i) => 
        compressionScores[i].compressionScore <= 0.7 &&
        compressionScores[i].omissionScore <= 0.8
      ),
    };
  }
}

// 2. 应用压缩策略到 Context Package 构建
async function build(options: ContextPackageOptions): Promise<ContextPackage> {
  // 1. 构建初始 Context Package
  const initialPackage = await this.doBuild(options);
  
  // 2. 检查是否需要压缩
  if (initialPackage.totalTokens > options.tokenBudget) {
    // 3. 获取压缩策略
    const strategy = await this.compressionLearningService.getCompressionStrategy(
      initialPackage.blocks
    );
    
    // 4. 应用压缩策略
    const compressedBlocks = this.applyCompressionStrategy(
      initialPackage.blocks,
      strategy
    );
    
    // 5. 重新计算 Token
    const compressedPackage = {
      ...initialPackage,
      blocks: compressedBlocks,
      totalTokens: this.calculateTokens(compressedBlocks),
      compressed: true,
    };
    
    return compressedPackage;
  }
  
  return initialPackage;
}
```

**预期效果**:
- Token 使用减少: -20%
- Context Package 质量保持: >= 95%

---

### Phase 4: 监控和可观测性（P2 - 1个月）

#### 4.1 性能指标收集

**优化方案**:

```typescript
// 1. Context Package 构建指标
interface ContextPackageMetrics {
  buildTimeMs: number;
  cacheHit: boolean;
  tokenCount: number;
  blockCount: number;
  compressionRate?: number;
  learningApplied: boolean;
}

// 2. Context Learning 指标
interface ContextLearningMetrics {
  eventType: ContextLearningEventType;
  processingTimeMs: number;
  sampleSize: number;
  confidence: number;
  updatedPrioritiesCount: number;
}

// 3. 指标收集服务
class MetricsCollectorService {
  async recordContextPackageMetrics(
    metrics: ContextPackageMetrics
  ): Promise<void> {
    // 记录到 Prometheus
    this.prometheus.histogram('context_package_build_time_ms')
      .observe(metrics.buildTimeMs);
    
    this.prometheus.counter('context_package_cache_hit')
      .inc(metrics.cacheHit ? 1 : 0);
    
    this.prometheus.histogram('context_package_token_count')
      .observe(metrics.tokenCount);
  }
  
  async recordContextLearningMetrics(
    metrics: ContextLearningMetrics
  ): Promise<void> {
    this.prometheus.histogram('context_learning_processing_time_ms')
      .observe(metrics.processingTimeMs);
    
    this.prometheus.gauge('context_learning_sample_size')
      .set(metrics.sampleSize);
    
    this.prometheus.gauge('context_learning_confidence')
      .set(metrics.confidence);
  }
}
```

#### 4.2 学习效果评估

**优化方案**:

```typescript
// 1. A/B 测试框架
class ABTestService {
  async createExperiment(
    name: string,
    variants: string[]
  ): Promise<ABExperiment> {
    // 创建 A/B 测试实验
  }
  
  async assignVariant(
    userId: string,
    experimentName: string
  ): Promise<string> {
    // 为用户分配变体
  }
  
  async recordResult(
    userId: string,
    experimentName: string,
    variant: string,
    result: {
      success: boolean;
      satisfaction?: number;
      metrics?: Record<string, number>;
    }
  ): Promise<void> {
    // 记录实验结果
  }
}

// 2. 学习效果评估
class LearningEffectivenessEvaluator {
  async evaluateLearningEffectiveness(
    userId?: string,
    phase?: string,
    agent?: string
  ): Promise<LearningEffectivenessReport> {
    // 1. 获取学习结果
    const learningResult = await this.learningService.getLearningResult(
      userId,
      phase,
      agent
    );
    
    // 2. 获取实际使用数据
    const usageData = await this.getUsageData(userId, phase, agent);
    
    // 3. 评估学习效果
    const effectiveness = this.calculateEffectiveness(
      learningResult,
      usageData
    );
    
    return {
      learningResult,
      usageData,
      effectiveness,
      recommendations: this.generateRecommendations(effectiveness),
    };
  }
}
```

---

## 📊 实施计划

### 第1周：性能优化（P0）

- [ ] Context Package 缓存策略优化
- [ ] RAG 检索性能优化
- [ ] 并发请求去重优化
- [ ] 性能指标收集

### 第2-3周：Context Learning 增强（P1）

- [ ] 批量学习优化
- [ ] 学习结果应用优化
- [ ] 学习结果缓存
- [ ] 学习效果评估

### 第4-6周：个性化推荐（P2）

- [ ] 用户画像学习
- [ ] 个性化 Context 组合推荐
- [ ] 压缩策略学习
- [ ] A/B 测试框架

### 第7-8周：监控和可观测性（P2）

- [ ] 性能指标收集
- [ ] 学习效果评估
- [ ] 可视化仪表板
- [ ] 告警机制

---

## 🎯 成功指标

### 性能指标

- ✅ Context Package 构建延迟: < 200ms (P95)
- ✅ 缓存命中率: >= 85%
- ✅ RAG 检索延迟: < 100ms (P95)
- ✅ Context Learning 延迟: < 50ms (异步)

### 质量指标

- ✅ Context Package 相关性: +25%
- ✅ 用户满意度: +20%
- ✅ Token 使用减少: -20%
- ✅ Context Package 质量保持: >= 95%

### 可扩展性指标

- ✅ 支持 10x 并发
- ✅ Context Learning 样本数: >= 1000/用户
- ✅ 批量处理能力: 支持批量 Context Package 构建

---

## 📝 技术债务清理

### 1. 代码重构

- [ ] ContextEngineerService 方法拆分（当前 1455 行，目标 < 500 行/文件）
- [ ] ContextLearningService 优化（当前 727 行，可以进一步优化）
- [ ] 统一缓存接口（当前有多个缓存实现）

### 2. 测试覆盖

- [ ] Context Package 构建单元测试覆盖率: >= 85%
- [ ] Context Learning 单元测试覆盖率: >= 85%
- [ ] 集成测试: 覆盖主要流程

### 3. 文档完善

- [ ] API 文档更新
- [ ] 架构设计文档更新
- [ ] 性能优化指南

---

## 🚀 下一步行动

1. **立即开始（本周）**:
   - Context Package 缓存策略优化
   - RAG 检索性能优化
   - 并发请求去重优化

2. **短期（1-2周）**:
   - Context Learning 批量处理优化
   - 学习结果应用优化
   - 性能指标收集

3. **中期（1个月）**:
   - 个性化推荐实现
   - 压缩策略学习
   - A/B 测试框架

4. **长期（2-3个月）**:
   - 可视化仪表板
   - 迁移学习
   - 跨用户学习

---

**文档版本**: v1.0  
**最后更新**: 2026-02-05  
**维护者**: 架构师团队
