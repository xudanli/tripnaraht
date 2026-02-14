# RAG 架构实施指南
**基于 TripNARA 决策优先架构**
**日期**: 2026-01-24

---

## 📋 执行摘要

本指南详细说明如何在 TripNARA 项目中实施 RAG 架构改进，包含 P0 必须实现的 3 个核心服务和后续优化建议。

**实施状态**: ✅ **P0 服务已完成开发**

---

## ✅ 已完成工作

### P0 核心服务（必须实现）

#### 1. RagFallbackService - RAG 降级策略服务

**文件**: [src/rag/services/rag-fallback.service.ts](../src/rag/services/rag-fallback.service.ts)

**功能**: 实现 5 层降级策略，保证 RAG 检索稳定性

**降级策略**:
```
Level 1: Vector RAG (similarity >= 0.75)
  ↓ 失败
Level 2: Hybrid RAG (0.60 <= similarity < 0.75)
  ↓ 失败
Level 3: Keyword Fallback (0.40 <= similarity < 0.60)
  ↓ 失败
Level 4: Web Browse (仅 RULES/GATE 类查询)
  ↓ 失败
Level 5: Graceful Failure (返回官方链接 + 记录数据缺口)
```

**使用示例**:
```typescript
import { RagFallbackService, QueryCategory } from './services/rag-fallback.service';

// 注入服务
constructor(private readonly fallbackService: RagFallbackService) {}

// 使用降级策略查询
const result = await this.fallbackService.queryWithFallback(
  '瓦德拉海德隧道怎么收费？',
  { limit: 5 },
  { category: QueryCategory.RULES, requiresCitation: true }
);

// 检查降级方法
console.log(result.method); // VECTOR_RAG | HYBRID_RAG | KEYWORD_FALLBACK | ...
console.log(result.confidence); // 0-1
console.log(result.metadata.attemptedMethods); // ['VECTOR_RAG', 'HYBRID_RAG', ...]
```

**状态**: ✅ 完成（待集成 Web Browse Skill）

---

#### 2. GateDecisionLoggerService - Gate 决策日志服务

**文件**: [src/rag/services/gate-decision-logger.service.ts](../src/rag/services/gate-decision-logger.service.ts)

**功能**: 记录 Should-Exist Gate 的完整决策过程

**决策日志结构**:
```typescript
interface DecisionLogEntry {
  request_id: string;
  step: 'INTAKE' | 'RESEARCH' | 'GATE_EVAL' | 'PLAN_GEN' | 'VERIFY' | 'REPAIR' | 'NARRATE';
  actor: 'Orchestrator' | 'Planner' | 'Gatekeeper' | 'Compliance' | 'LocalInsight' | 'CoreDecision' | 'Narrator';
  timestamp: string;

  inputs_summary: { ... };
  outputs_summary: {
    gate_result: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
    confidence: number;
    violations: Violation[];
    required_adjustments: RequiredAdjustment[];
    alternatives: Alternative[];
  };

  evidence_refs: EvidenceRef[]; // RAG chunks + Tool 调用
  retrieval_trace: {
    rag_chunks: [...];
    tool_calls: [...];
  };
}
```

**使用示例**:
```typescript
import { GateDecisionLoggerService, GateResult } from './services/gate-decision-logger.service';

// 注入服务
constructor(private readonly logger: GateDecisionLoggerService) {}

// 记录 Gate 决策
await this.logger.logGateDecision(
  requestId,
  {
    gate_result: GateResult.BLOCK,
    confidence: 0.98,
    violations: [
      { type: 'ROAD_CLOSURE', severity: 'HARD', detail: 'F208 冬季封闭' }
    ],
    required_adjustments: [
      { action: 'CHANGE_DATES', why: '建议 6-9月访问', priority: 1 }
    ],
    alternatives: [
      { description: '1号环岛公路替代路线', type: 'ROUTE', ... }
    ],
    ragChunks: [...],
    toolCalls: [...]
  },
  evidenceRefs,
  { latency_ms: 1050 }
);

// 查询决策链路
const chain = await this.logger.getDecisionChain(requestId);
```

**状态**: ✅ 完成（待创建 decision_logs 数据库表）

---

#### 3. RagFreshnessService - RAG 数据新鲜度服务

**文件**: [src/rag/services/rag-freshness.service.ts](../src/rag/services/rag-freshness.service.ts)

**功能**: 自动验证和更新过期数据

**新鲜度规则**:
```typescript
RULES:      { staleDays: 30,  mustVerify: true,  verifyTool: 'web_browse' }
POI_HOURS:  { staleDays: 7,   mustVerify: true,  verifyTool: 'google_places' }
POI_INFO:   { staleDays: 90,  mustVerify: false }
GATE:       { staleDays: 1,   mustVerify: true,  verifyTool: 'road_status,weather_api' }
WEATHER:    { staleDays: 0,   mustVerify: true,  verifyTool: 'weather_api' } // 实时
GENERAL:    { staleDays: 180, mustVerify: false }
```

**使用示例**:
```typescript
import { RagFreshnessService, ChunkCategory } from './services/rag-freshness.service';

// 注入服务
constructor(private readonly freshnessService: RagFreshnessService) {}

// 确保检索结果的新鲜度
const chunks = await this.chunkRetrievalService.retrieve({ query, ... });
const freshChunks = await this.freshnessService.ensureFreshness(
  chunks,
  ChunkCategory.POI_HOURS
);

// 检查新鲜度状态
freshChunks.forEach(chunk => {
  console.log(chunk.metadata.freshness); // FRESH | STALE | EXPIRED
  console.log(chunk.metadata.staleDays); // 距离上次验证的天数
});

// 手动刷新过期数据
await this.freshnessService.refreshStaleChunks({
  category: ChunkCategory.RULES,
  force: false
});

// 定时任务（每日验证）
await this.freshnessService.dailyFreshnessCheck();
```

**状态**: ✅ 完成（待集成实时验证工具）

---

### P1 优化（已完成）

#### 4. RAGEvaluationService 扩展 - Gate 专属评估指标

**文件**: [src/rag/services/rag-evaluation.service.ts](../src/rag/services/rag-evaluation.service.ts)

**新增方法**:

1. **`evaluateGateAccuracy`** - 评估 Gate 决策准确率
   ```typescript
   const result = await this.evaluationService.evaluateGateAccuracy(testSet);
   // 返回: accuracy, avgConfidence, avgEvidenceCount, alternativesCoverage
   ```

2. **`evaluateEvidenceCoverage`** - 评估证据覆盖率
   ```typescript
   const coverage = await this.evaluationService.evaluateEvidenceCoverage(decisionLogs);
   // 充分证据定义: >= 2 RAG chunks + >= 1 Tool 调用
   // 返回: coverageRate, avgRagEvidence, avgToolEvidence
   ```

3. **`evaluateAlternativesQuality`** - 评估替代方案质量
   ```typescript
   const quality = await this.evaluationService.evaluateAlternativesQuality(testSet);
   // 返回: provisionRate, avgAlternativesCount, typeMatchRate
   ```

**状态**: ✅ 完成

---

## 🔧 待完成工作

### 数据库迁移

#### 1. 创建 `decision_logs` 表

```sql
-- prisma/migrations/YYYYMMDDHHMMSS_add_decision_logs/migration.sql

CREATE TABLE "decision_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" TEXT NOT NULL,
  "step" TEXT NOT NULL, -- INTAKE, RESEARCH, GATE_EVAL, etc.
  "actor" TEXT NOT NULL, -- Orchestrator, Planner, Gatekeeper, etc.
  "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
  "inputs_summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "outputs_summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "evidence_refs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "retrieval_trace" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX "idx_decision_logs_request_id" ON "decision_logs"("request_id");
CREATE INDEX "idx_decision_logs_step" ON "decision_logs"("step");
CREATE INDEX "idx_decision_logs_timestamp" ON "decision_logs"("timestamp" DESC);
CREATE INDEX "idx_decision_logs_gate_result" ON "decision_logs" USING GIN ((outputs_summary->'gate_result'));

-- Prisma Schema 更新
-- 添加到 schema.prisma:
model DecisionLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  requestId       String   @map("request_id")
  step            String
  actor           String
  timestamp       DateTime @db.Timestamptz
  inputsSummary   Json     @map("inputs_summary") @default("{}")
  outputsSummary  Json     @map("outputs_summary") @default("{}")
  evidenceRefs    Json     @map("evidence_refs") @default("[]")
  retrievalTrace  Json?    @map("retrieval_trace")
  metadata        Json?
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([requestId], name: "idx_decision_logs_request_id")
  @@index([step], name: "idx_decision_logs_step")
  @@index([timestamp(sort: Desc)], name: "idx_decision_logs_timestamp")
  @@map("decision_logs")
}
```

**执行**:
```bash
npx prisma migrate dev --name add_decision_logs
npx prisma generate
```

---

#### 2. 创建 `knowledge_gaps` 表

```sql
-- prisma/migrations/YYYYMMDDHHMMSS_add_knowledge_gaps/migration.sql

CREATE TABLE "knowledge_gaps" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "query" TEXT NOT NULL,
  "category" TEXT NOT NULL, -- RULES, GATE, POI, SPATIAL, GENERAL
  "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
  "attempted_methods" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "source" TEXT,
  "needs_index" BOOLEAN NOT NULL DEFAULT true,
  "indexed_at" TIMESTAMP WITH TIME ZONE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX "idx_knowledge_gaps_category" ON "knowledge_gaps"("category");
CREATE INDEX "idx_knowledge_gaps_needs_index" ON "knowledge_gaps"("needs_index") WHERE "needs_index" = true;
CREATE INDEX "idx_knowledge_gaps_timestamp" ON "knowledge_gaps"("timestamp" DESC);

-- Prisma Schema 更新
model KnowledgeGap {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  query            String
  category         String
  timestamp        DateTime  @db.Timestamptz
  attemptedMethods Json      @map("attempted_methods") @default("[]")
  source           String?
  needsIndex       Boolean   @map("needs_index") @default(true)
  indexedAt        DateTime? @map("indexed_at") @db.Timestamptz
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz

  @@index([category], name: "idx_knowledge_gaps_category")
  @@index([needsIndex], name: "idx_knowledge_gaps_needs_index", where: needsIndex == true)
  @@index([timestamp(sort: Desc)], name: "idx_knowledge_gaps_timestamp")
  @@map("knowledge_gaps")
}
```

**执行**:
```bash
npx prisma migrate dev --name add_knowledge_gaps
npx prisma generate
```

---

#### 3. 扩展 `chunks` 表添加新鲜度字段

```sql
-- prisma/migrations/YYYYMMDDHHMMSS_add_chunks_freshness/migration.sql

ALTER TABLE "chunks"
ADD COLUMN "last_verified_at" TIMESTAMP WITH TIME ZONE,
ADD COLUMN "category" TEXT; -- RULES, POI_HOURS, POI_INFO, GATE, WEATHER, GENERAL

-- 更新现有数据（根据文件名推断类别）
UPDATE "chunks" c
SET category = CASE
  WHEN EXISTS (
    SELECT 1 FROM "knowledge_files" kf
    WHERE kf.id = c.file_id AND kf.filename LIKE '%rule%'
  ) THEN 'RULES'
  WHEN EXISTS (
    SELECT 1 FROM "knowledge_files" kf
    WHERE kf.id = c.file_id AND (kf.filename LIKE '%poi%' OR kf.filename LIKE '%attraction%')
  ) THEN 'POI_INFO'
  WHEN EXISTS (
    SELECT 1 FROM "knowledge_files" kf
    WHERE kf.id = c.file_id AND kf.filename LIKE '%weather%'
  ) THEN 'WEATHER'
  ELSE 'GENERAL'
END;

-- 索引
CREATE INDEX "idx_chunks_category" ON "chunks"("category");
CREATE INDEX "idx_chunks_last_verified" ON "chunks"("last_verified_at");

-- Prisma Schema 更新
model Chunk {
  // ... 现有字段
  lastVerifiedAt DateTime? @map("last_verified_at") @db.Timestamptz
  category       String?

  @@index([category], name: "idx_chunks_category")
  @@index([lastVerifiedAt], name: "idx_chunks_last_verified")
}
```

**执行**:
```bash
npx prisma migrate dev --name add_chunks_freshness
npx prisma generate
```

---

### MCP Skills 集成

#### 1. Web Browse Skill

**用途**: Level 4 降级策略 + 数据新鲜度验证

**集成步骤**:
```typescript
// 1. 安装 MCP Client SDK
npm install @modelcontextprotocol/sdk

// 2. 创建 MCP Client
// src/skills/mcp-client.service.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

@Injectable()
export class MCPClientService {
  private client: Client;

  async initialize() {
    this.client = new Client({
      name: 'tripnara-mcp-client',
      version: '1.0.0',
    }, {
      capabilities: {}
    });

    // 连接到 MCP Skills Server
    await this.client.connect(new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search']
    }));
  }

  async webBrowse(url: string): Promise<string> {
    const result = await this.client.callTool({
      name: 'brave_web_search',
      arguments: { url }
    });
    return result.content[0].text;
  }
}

// 3. 在 RagFallbackService 中集成
constructor(
  private readonly mcpClient: MCPClientService
) {}

private async webBrowseSearch(query: string): Promise<any> {
  const result = await this.mcpClient.webBrowse(`https://www.road.is/search?q=${encodeURIComponent(query)}`);
  // 解析结果并索引到知识库
  return result;
}
```

---

#### 2. Google Places Skill

**用途**: POI 开放时间新鲜度验证

**集成步骤**:
```typescript
// src/skills/google-places.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GooglePlacesService {
  constructor(private readonly config: ConfigService) {}

  async getPlaceDetails(placeId: string): Promise<{
    opening_hours: any;
    formatted_phone_number: string;
    website: string;
  }> {
    const apiKey = this.config.get('GOOGLE_PLACES_API_KEY');
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours,formatted_phone_number,website&key=${apiKey}`
    );
    const data = await response.json();
    return data.result;
  }
}

// 在 RagFreshnessService 中集成
constructor(
  private readonly googlePlaces: GooglePlacesService
) {}

private async verifyPOIHours(chunk: Chunk): Promise<string> {
  const placeId = chunk.metadata?.google_place_id;
  if (!placeId) return null;

  const details = await this.googlePlaces.getPlaceDetails(placeId);
  // 格式化开放时间并返回更新后的内容
  return JSON.stringify(details.opening_hours);
}
```

---

### 使用示例

#### 完整 Gate 决策流程

```typescript
// src/agents/gatekeeper.service.ts

import { Injectable } from '@nestjs/common';
import { RagFallbackService, QueryCategory } from '../rag/services/rag-fallback.service';
import { GateDecisionLoggerService, GateResult } from '../rag/services/gate-decision-logger.service';
import { RagFreshnessService, ChunkCategory } from '../rag/services/rag-freshness.service';

@Injectable()
export class GatekeeperService {
  constructor(
    private readonly fallbackService: RagFallbackService,
    private readonly logger: GateDecisionLoggerService,
    private readonly freshnessService: RagFreshnessService,
  ) {}

  async shouldExist(request: TripPlanRequest): Promise<GateEvaluation> {
    const requestId = generateRequestId();
    const startTime = Date.now();

    // 1. RAG 检索（带降级策略）
    const ragResult = await this.fallbackService.queryWithFallback(
      `${request.origin} 到 ${request.destination} ${request.start_date} 路线可行性`,
      {
        limit: 5,
        category: 'decision_support',
        useHybridSearch: true,
      },
      {
        category: QueryCategory.GATE,
        requiresCitation: true,
        allowWebBrowse: true,
      }
    );

    // 2. 确保数据新鲜度
    const freshChunks = await this.freshnessService.ensureFreshness(
      ragResult.results,
      ChunkCategory.GATE
    );

    // 3. 调用 Tools（并行）
    const [weatherData, roadStatus, demProfile] = await Promise.all([
      this.weatherService.getForecast(request.destination, request.start_date),
      this.roadStatusService.getClosures(request.route),
      this.demService.getProfile(request.route),
    ]);

    // 4. 综合决策
    const gateEvaluation = this.evaluateGate(
      request,
      freshChunks,
      { weather: weatherData, road: roadStatus, dem: demProfile }
    );

    // 5. 创建证据引用
    const evidenceRefs = [
      ...this.logger.createEvidenceRefsFromChunks(freshChunks),
      ...this.logger.createEvidenceRefsFromTools([
        { tool_name: 'weather.getForecast', input: {...}, output: weatherData, success: true },
        { tool_name: 'road_status.getClosures', input: {...}, output: roadStatus, success: true },
        { tool_name: 'dem.getProfile', input: {...}, output: demProfile, success: true },
      ]),
    ];

    // 6. 记录决策日志
    await this.logger.logGateDecision(
      requestId,
      {
        ...gateEvaluation,
        ragChunks: freshChunks,
        toolCalls: [
          { tool_name: 'weather.getForecast', input: {...}, output: weatherData, success: true, latency_ms: 500 },
          { tool_name: 'road_status.getClosures', input: {...}, output: roadStatus, success: true, latency_ms: 300 },
          { tool_name: 'dem.getProfile', input: {...}, output: demProfile, success: true, latency_ms: 200 },
        ],
      },
      evidenceRefs,
      { latency_ms: Date.now() - startTime }
    );

    return gateEvaluation;
  }

  private evaluateGate(request, chunks, tools): GateEvaluation {
    const violations: Violation[] = [];
    const required_adjustments: RequiredAdjustment[] = [];

    // 检查道路封闭
    if (tools.road.closures.length > 0) {
      violations.push({
        type: ViolationType.ROAD_CLOSURE,
        severity: ViolationSeverity.HARD,
        detail: `路段封闭: ${tools.road.closures.map(c => c.road_name).join(', ')}`,
      });
      required_adjustments.push({
        action: AdjustmentAction.CHANGE_ROUTE,
        why: '避开封闭路段',
        priority: 1,
      });
    }

    // 检查天气风险
    if (tools.weather.alerts.length > 0) {
      violations.push({
        type: ViolationType.WEATHER,
        severity: ViolationSeverity.SOFT,
        detail: `天气警告: ${tools.weather.alerts[0].description}`,
      });
    }

    // 决策
    const gate_result = violations.some(v => v.severity === 'HARD')
      ? GateResult.BLOCK
      : violations.some(v => v.severity === 'SOFT')
      ? GateResult.ADJUST_REQUIRED
      : GateResult.ALLOW;

    return {
      gate_result,
      confidence: violations.length === 0 ? 0.95 : 0.80,
      violations,
      required_adjustments,
      alternatives: gate_result !== GateResult.ALLOW ? this.generateAlternatives(request) : [],
    };
  }
}
```

---

## 📊 评估与测试

### 创建 Gate 测试集

```typescript
// e2e-cases/gate-test-cases.json
[
  {
    "requestId": "gate_test_001",
    "request": {
      "origin": "Reykjavik",
      "destination": "F208 Highland Road",
      "start_date": "2026-02-15", // 冬季
      "mode": "drive",
      "vehicle": "2WD"
    },
    "expectedGateResult": "BLOCK",
    "expectedViolations": ["ROAD_CLOSURE", "SEASONAL"],
    "expectedAlternatives": [{"type": "DATES"}, {"type": "ROUTE"}]
  },
  // ... 更多测试用例
]
```

### 运行评估

```typescript
// scripts/evaluate-gate-quality.ts
import { RAGEvaluationService } from '../src/rag/services/rag-evaluation.service';
import gateTestCases from '../e2e-cases/gate-test-cases.json';

async function evaluateGate() {
  const evaluationService = new RAGEvaluationService(...);

  const result = await evaluationService.evaluateGateAccuracy(gateTestCases);

  console.log(`Gate Accuracy: ${(result.accuracy * 100).toFixed(1)}%`);
  console.log(`Avg Confidence: ${result.avgConfidence.toFixed(2)}`);
  console.log(`Avg Evidence Count: ${result.avgEvidenceCount.toFixed(1)}`);
  console.log(`Alternatives Coverage: ${(result.alternativesCoverage * 100).toFixed(1)}%`);

  // 目标指标
  const targetAccuracy = 0.98;
  if (result.accuracy >= targetAccuracy) {
    console.log('✅ Gate 质量达标');
  } else {
    console.log(`⚠️  Gate 质量未达标（目标: ${targetAccuracy}）`);
  }
}
```

---

## 📈 性能监控

### 1. 降级策略监控

```typescript
// 定期分析降级统计
const stats = await this.monitoringService.getDegradationStats({
  startDate: new Date('2026-01-01'),
  endDate: new Date(),
});

console.log('降级统计:', {
  total: stats.totalQueries,
  byMethod: stats.byMethod, // { VECTOR_RAG: 8500, HYBRID_RAG: 1200, KEYWORD_FALLBACK: 300 }
  gracefulFailureRate: stats.gracefulFailureRate, // 0.01 (1%)
});

// 优化建议
if (stats.byMethod.KEYWORD_FALLBACK / stats.totalQueries > 0.05) {
  console.warn('⚠️  关键词降级率过高，建议优化向量检索阈值');
}
```

### 2. 新鲜度监控

```typescript
// 每周检查新鲜度统计
const freshnessStats = await this.freshnessService.getFreshnessStats();

console.log('新鲜度统计:', {
  totalChunks: freshnessStats.totalChunks,
  byCategory: freshnessStats.byCategory,
  staleChunksCount: freshnessStats.staleChunks.length,
});

// 触发刷新
if (freshnessStats.staleChunks.length > 100) {
  await this.freshnessService.refreshStaleChunks({ force: false });
}
```

---

## ✅ 验收标准

### P0 服务（必须全部通过）

- [ ] RagFallbackService 降级策略可正常工作
  - [ ] Level 1-3 降级流程正确
  - [ ] Level 5 优雅失败并记录到 knowledge_gaps 表
  - [ ] 降级统计可查询

- [ ] GateDecisionLoggerService 决策日志可持久化
  - [ ] decision_logs 表创建成功
  - [ ] 决策日志可查询
  - [ ] 证据引用完整（RAG + Tool）

- [ ] RagFreshnessService 新鲜度验证正常
  - [ ] chunks 表扩展 freshness 字段
  - [ ] 过期检测正确
  - [ ] 实时验证工具集成（Google Places / Web Browse）

- [ ] RAGEvaluationService Gate 评估可用
  - [ ] evaluateGateAccuracy 返回正确指标
  - [ ] evaluateEvidenceCoverage 计算正确
  - [ ] 测试集评估通过（accuracy >= 0.98）

---

## 🚀 下一步优化（P1 / P2）

### P1 - 高优先级

1. **并行化 Tools 调用** (Gate 场景)
   - 使用 `Promise.all` 并行调用 weather + road_status + dem
   - 目标: 延迟从 ~2650ms (串行) → ~1050ms (并行)

2. **成本监控服务**
   - 记录每次 RAG 查询的 embedding 成本
   - 记录每次 Tool 调用的 API 成本
   - 生成月度成本报告

3. **缓存热点查询**
   - Redis 缓存停车/收费等高频规则查询
   - TTL: RULES (7天), POI (1天), GATE (1小时)

### P2 - 可选优化

1. **多模态 RAG**
   - 索引 POI 图片的 CLIP embeddings
   - 支持 "类似这张图的景点" 查询

2. **Graph RAG 增强**
   - 时空图（Temporal-Spatial Graph）
   - 支持 "顺路" 查询的时间窗约束

3. **个性化权重**
   - 根据用户 persona 动态调整 route_score 权重
   - 效率优先 vs 体验优先

---

## 📝 文档完整性

已创建文档:
- ✅ [RAG_ARCHITECTURE_EVALUATION.md](RAG_ARCHITECTURE_EVALUATION.md) - 架构评估报告
- ✅ [RAG_IMPLEMENTATION_GUIDE.md](RAG_IMPLEMENTATION_GUIDE.md) - 本文档
- ✅ [VECTOR_EMBEDDING_SUCCESS.md](VECTOR_EMBEDDING_SUCCESS.md) - 向量化成功报告

待创建文档:
- [ ] `docs/skills/web_browse.md` - Web Browse Skill 使用指南
- [ ] `docs/skills/google_places.md` - Google Places API 集成指南
- [ ] `docs/gate/GATE_EVALUATION_GUIDE.md` - Gate 评估指南

---

**文档生成时间**: 2026-01-24
**实施状态**: ✅ P0 服务开发完成，待数据库迁移和 Skills 集成
**预计完成时间**: Week 2-3
