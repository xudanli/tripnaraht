g# TripNARA RAG API 接口文档

**版本**: v1.0
**更新日期**: 2026-01-25
**Base URL**: `http://localhost:3000` (开发环境)

---

## 📚 目录

1. [RAG核心接口](#rag核心接口)
2. [监控指标接口](#监控指标接口)
3. [评估接口](#评估接口)
4. [工具调用接口](#工具调用接口)
5. [数据结构](#数据结构)
6. [错误码](#错误码)

---

## RAG核心接口

### 1. RAG查询检索

执行RAG检索，支持5层降级策略。

**端点**: `POST /rag/retrieve`

**请求**:
```json
{
  "query": "冰岛蓝湖温泉现在开门吗",
  "category": "POI_HOURS",
  "options": {
    "topK": 5,
    "minScore": 0.7,
    "enableReranking": true,
    "enableQueryExpansion": false
  }
}
```

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | ✅ | 用户查询文本 |
| category | string | ❌ | 查询类别 (WEATHER, POI_HOURS, RULES, GENERAL) |
| options.topK | number | ❌ | 返回结果数量，默认5 |
| options.minScore | number | ❌ | 最小相似度分数，默认0.7 |
| options.enableReranking | boolean | ❌ | 是否启用重排序，默认true |
| options.enableQueryExpansion | boolean | ❌ | 是否启用查询扩展，默认false |

**响应成功** (200):
```json
{
  "success": true,
  "data": {
    "chunks": [
      {
        "chunkId": "chunk-iceland-bluelagoon-001",
        "content": "蓝湖温泉(Blue Lagoon)全年开放，营业时间为8:00-21:00（夏季延长至22:00）",
        "score": 0.92,
        "metadata": {
          "source": "iceland-poi-database",
          "category": "POI_HOURS",
          "location": "Blue Lagoon, Iceland"
        },
        "evidences": [
          {
            "type": "OPENING_HOURS",
            "value": "08:00-21:00",
            "confidence": 0.95,
            "lastVerified": "2026-01-20T10:00:00Z"
          }
        ]
      }
    ],
    "fallbackLevel": "VECTOR_RAG",
    "confidence": 0.92,
    "decisionLog": [
      {
        "step": "VECTOR_RETRIEVAL",
        "timestamp": "2026-01-25T02:00:00Z",
        "success": true,
        "duration": 45
      }
    ]
  }
}
```

**响应失败** (200, 降级到 GRACEFUL_FAILURE):
```json
{
  "success": false,
  "data": {
    "chunks": [],
    "fallbackLevel": "GRACEFUL_FAILURE",
    "confidence": 0.0,
    "fallbackMessage": "抱歉，我暂时无法获取最新的开放时间信息。",
    "officialLinks": [
      "https://www.bluelagoon.com"
    ],
    "gapRecorded": true,
    "decisionLog": [
      {
        "step": "VECTOR_RETRIEVAL",
        "success": false,
        "error": "No relevant chunks found"
      },
      {
        "step": "WEB_BROWSE",
        "success": false,
        "error": "Network timeout"
      }
    ]
  }
}
```

**降级层级说明**:

| Level | 名称 | 说明 | 延迟 |
|-------|------|------|------|
| 1 | VECTOR_RAG | 向量检索 | ~50ms |
| 2 | HYBRID_RAG | 混合检索（向量+稀疏） | ~100ms |
| 3 | KEYWORD_SEARCH | 关键词搜索 | ~150ms |
| 4 | WEB_BROWSE | 网页浏览 | ~2000ms |
| 5 | GRACEFUL_FAILURE | 优雅降级 | ~10ms |

---

### 2. RAG增强对话

基于RAG检索的增强对话，自动调用LLM生成回答。

**端点**: `POST /rag/chat`

**请求**:
```json
{
  "message": "冰岛环岛路线推荐",
  "conversationId": "conv-12345",
  "category": "GENERAL",
  "options": {
    "topK": 5,
    "enableReranking": true
  }
}
```

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | ✅ | 用户消息 |
| conversationId | string | ❌ | 对话ID（用于上下文） |
| category | string | ❌ | 查询类别 |
| options | object | ❌ | 检索选项（同retrieve接口） |

**响应成功** (200):
```json
{
  "success": true,
  "data": {
    "reply": "根据检索到的信息，冰岛环岛路线推荐如下：\n\n1号公路（Ring Road）是最经典的环岛路线...",
    "sources": [
      {
        "chunkId": "chunk-iceland-route-001",
        "title": "冰岛1号公路完整指南",
        "snippet": "1号公路全长约1300公里...",
        "url": "https://..."
      }
    ],
    "fallbackLevel": "VECTOR_RAG",
    "confidence": 0.88,
    "conversationId": "conv-12345"
  }
}
```

---

### 3. Gate决策评估

评估路线/行程是否应该存在（Should-Exist Gate）。

**端点**: `POST /rag/gate/evaluate`

**请求**:
```json
{
  "request": {
    "origin": "Reykjavik",
    "destination": "Landmannalaugar",
    "startDate": "2026-06-15",
    "endDate": "2026-06-17",
    "mode": "drive",
    "party": {
      "adults": 2,
      "children": 0,
      "fitnessLevel": "moderate"
    }
  }
}
```

**响应成功** (200):
```json
{
  "success": true,
  "data": {
    "gateResult": "ADJUST_REQUIRED",
    "decision": "路线可行，但需调整",
    "violations": [
      {
        "type": "SEASONAL_ROAD",
        "severity": "HARD",
        "detail": "F路在6月中旬可能未开放，需确认F208状态"
      }
    ],
    "requiredAdjustments": [
      {
        "action": "VERIFY_ROAD_STATUS",
        "why": "F208通常6月底才开放",
        "alternativeRoute": "经1号公路绕行"
      }
    ],
    "alternatives": [
      {
        "route": "Reykjavik → Selfoss → Landmannalaugar (via 26+F208)",
        "status": "需确认F208开放状态",
        "estimatedDays": 2
      }
    ],
    "confidence": 0.85,
    "decisionLog": [
      {
        "step": "ROAD_STATUS_CHECK",
        "tool": "road_status.check",
        "result": "F208: 状态未知，需人工确认",
        "evidence": {
          "source": "icelandic_road_administration",
          "lastUpdated": "2026-01-20"
        }
      }
    ]
  }
}
```

**Gate结果类型**:

| 结果 | 说明 | 后续操作 |
|------|------|----------|
| ALLOW | 允许，无需调整 | 直接生成行程 |
| ADJUST_REQUIRED | 需要调整 | 应用调整建议后重新评估 |
| BLOCK | 阻止，不可行 | 提供替代方案 |
| NEED_USER_CONFIRM | 需要用户确认 | 显示风险并等待确认 |

---

## 监控指标接口

### 1. Prometheus 指标

暴露Prometheus格式的所有监控指标。

**端点**: `GET /rag/metrics`

**响应** (200, Content-Type: text/plain):
```
# HELP rag_cache_hits_total Total number of cache hits
# TYPE rag_cache_hits_total counter
rag_cache_hits_total{cache_type="redis"} 1234
rag_cache_hits_total{cache_type="memory"} 567

# HELP rag_cache_misses_total Total number of cache misses
# TYPE rag_cache_misses_total counter
rag_cache_misses_total{cache_type="redis"} 89
rag_cache_misses_total{cache_type="memory"} 45

# HELP rag_cache_size Current number of items in cache
# TYPE rag_cache_size gauge
rag_cache_size{cache_type="memory"} 342

# HELP rag_retry_attempts_total Total number of retry attempts
# TYPE rag_retry_attempts_total counter
rag_retry_attempts_total{retry_type="api"} 456

# HELP rag_api_calls_total Total number of external API calls
# TYPE rag_api_calls_total counter
rag_api_calls_total{api_type="weather"} 123
rag_api_calls_total{api_type="places"} 89

# ... (更多指标)
```

---

### 2. 人类可读统计

获取人类可读的缓存统计信息。

**端点**: `GET /rag/metrics/stats`

**响应** (200):
```json
{
  "cache": {
    "hits": 1801,
    "misses": 134,
    "hitRate": "93.08%"
  },
  "timestamp": "2026-01-25T02:30:00.000Z"
}
```

---

## 评估接口

### 1. RAG评估（测试集）

使用测试集评估RAG性能。

**端点**: `POST /rag/evaluation/testset`

**请求**:
```json
{
  "testsetId": "rag-eval-testset-v1",
  "options": {
    "enableReranking": true,
    "enableQueryExpansion": false,
    "topK": 5
  }
}
```

**响应成功** (200):
```json
{
  "success": true,
  "data": {
    "testsetId": "rag-eval-testset-v1",
    "totalCases": 30,
    "passedCases": 28,
    "failedCases": 2,
    "metrics": {
      "accuracy": 0.933,
      "precision": 0.920,
      "recall": 0.945,
      "f1Score": 0.932,
      "averageConfidence": 0.87,
      "averageLatency": 125.5
    },
    "categoryBreakdown": {
      "WEATHER": {
        "total": 10,
        "passed": 10,
        "accuracy": 1.0
      },
      "POI_HOURS": {
        "total": 10,
        "passed": 9,
        "accuracy": 0.9
      },
      "RULES": {
        "total": 10,
        "passed": 9,
        "accuracy": 0.9
      }
    },
    "failedCases": [
      {
        "caseId": "eval-015",
        "query": "冰岛F路什么时候开放",
        "expectedChunks": ["chunk-road-status-001"],
        "actualChunks": ["chunk-road-general-002"],
        "reason": "Retrieved general road info instead of specific F-road status"
      }
    ]
  }
}
```

---

### 2. Gate评估（测试集）

使用测试集评估Gate决策准确率。

**端点**: `POST /rag/evaluation/gate`

**请求**:
```json
{
  "testsetId": "gate-eval-testset-v1"
}
```

**响应成功** (200):
```json
{
  "success": true,
  "data": {
    "testsetId": "gate-eval-testset-v1",
    "totalCases": 20,
    "metrics": {
      "accuracy": 0.95,
      "precision": 0.92,
      "recall": 0.98,
      "f1Score": 0.95
    },
    "confusionMatrix": {
      "ALLOW": {
        "predicted_ALLOW": 8,
        "predicted_ADJUST": 1,
        "predicted_BLOCK": 0
      },
      "ADJUST_REQUIRED": {
        "predicted_ALLOW": 0,
        "predicted_ADJUST": 7,
        "predicted_BLOCK": 0
      },
      "BLOCK": {
        "predicted_ALLOW": 0,
        "predicted_ADJUST": 1,
        "predicted_BLOCK": 3
      }
    },
    "falsePositives": 1,
    "falseNegatives": 1
  }
}
```

---

## 工具调用接口

### 1. 天气查询

查询实时天气信息（通过MCP Tools）。

**端点**: `POST /rag/tools/weather`

**请求**:
```json
{
  "location": "Reykjavik, Iceland",
  "date": "2026-01-25"
}
```

**响应成功** (200):
```json
{
  "success": true,
  "data": {
    "location": "Reykjavik, Iceland",
    "date": "2026-01-25",
    "weather": {
      "temperature": 2,
      "temperatureUnit": "C",
      "condition": "Partly Cloudy",
      "windSpeed": 15,
      "windSpeedUnit": "km/h",
      "humidity": 75,
      "precipitation": 0
    },
    "source": "weather.search",
    "cached": false,
    "timestamp": "2026-01-25T02:00:00Z"
  }
}
```

---

### 2. POI详情查询

查询POI（景点）详细信息（通过Google Places API）。

**端点**: `POST /rag/tools/places`

**请求**:
```json
{
  "query": "Blue Lagoon Iceland",
  "fields": ["name", "address", "opening_hours", "rating"]
}
```

**响应成功** (200):
```json
{
  "success": true,
  "data": {
    "name": "Blue Lagoon",
    "address": "240 Grindavík, Iceland",
    "location": {
      "lat": 63.8804,
      "lng": -22.4495
    },
    "openingHours": {
      "weekday_text": [
        "Monday: 8:00 AM – 9:00 PM",
        "Tuesday: 8:00 AM – 9:00 PM",
        "..."
      ],
      "open_now": true
    },
    "rating": 4.5,
    "user_ratings_total": 12543,
    "source": "google_places",
    "cached": true,
    "cacheTTL": 86400,
    "timestamp": "2026-01-25T02:00:00Z"
  }
}
```

---

### 3. 网页内容抓取

抓取并解析网页内容（通过Web Browse Skill）。

**端点**: `POST /rag/tools/browse`

**请求**:
```json
{
  "url": "https://www.road.is/travel-info/road-conditions-and-weather/",
  "query": "F208 road status"
}
```

**响应成功** (200):
```json
{
  "success": true,
  "data": {
    "url": "https://www.road.is/travel-info/road-conditions-and-weather/",
    "title": "Road Conditions and Weather - Icelandic Road Administration",
    "content": "F208 (Fjallabaksleið nyrðri): CLOSED. Expected opening: Late June 2026...",
    "relevantSections": [
      {
        "heading": "Highland Roads Status",
        "content": "F208 is currently closed due to snow...",
        "relevance": 0.95
      }
    ],
    "source": "web.browse",
    "cached": true,
    "cacheTTL": 3600,
    "timestamp": "2026-01-25T02:00:00Z"
  }
}
```

---

## 数据结构

### Chunk (检索结果块)

```typescript
interface Chunk {
  chunkId: string;           // 唯一标识
  content: string;           // 内容文本
  score: number;             // 相似度分数 (0-1)
  metadata: {
    source: string;          // 数据源
    category: string;        // 类别
    location?: string;       // 地理位置
    tags?: string[];         // 标签
  };
  evidences?: Evidence[];    // 证据列表
}
```

### Evidence (证据)

```typescript
interface Evidence {
  type: string;              // 证据类型 (OPENING_HOURS, WEATHER, ROAD_STATUS, etc.)
  value: any;                // 证据值
  confidence: number;        // 置信度 (0-1)
  source?: string;           // 证据来源
  lastVerified?: string;     // 最后验证时间 (ISO 8601)
  url?: string;              // 证据URL
}
```

### DecisionLogEntry (决策日志条目)

```typescript
interface DecisionLogEntry {
  step: string;              // 步骤名称
  timestamp: string;         // 时间戳 (ISO 8601)
  actor?: string;            // 执行者 (Orchestrator, Planner, etc.)
  success: boolean;          // 是否成功
  duration?: number;         // 耗时（毫秒）
  error?: string;            // 错误信息
  evidence?: any;            // 证据数据
}
```

### GateViolation (Gate违规)

```typescript
interface GateViolation {
  type: string;              // 违规类型 (REACHABILITY, SAFETY, DEM, etc.)
  severity: 'HARD' | 'SOFT'; // 严重程度
  detail: string;            // 详细说明
  affectedSegment?: string;  // 受影响的路段
}
```

### RequiredAdjustment (必需调整)

```typescript
interface RequiredAdjustment {
  action: string;            // 调整动作 (CHANGE_MODE, CHANGE_DATES, etc.)
  why: string;               // 调整原因
  alternativeRoute?: string; // 替代路线
  estimatedImpact?: string;  // 预估影响
}
```

---

## 错误码

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功（包括降级成功） |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |
| 503 | 服务暂时不可用 |

### 业务错误码

```json
{
  "success": false,
  "error": {
    "code": "RAG_NO_RESULTS",
    "message": "No relevant results found",
    "details": {
      "query": "...",
      "fallbackLevel": "GRACEFUL_FAILURE"
    }
  }
}
```

**常见错误码**:

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| RAG_NO_RESULTS | 未找到相关结果 | 已降级到GRACEFUL_FAILURE |
| RAG_TIMEOUT | 检索超时 | 重试或降级 |
| RAG_INVALID_QUERY | 查询无效 | 检查query参数 |
| GATE_BLOCK | Gate阻止 | 查看violations和alternatives |
| TOOL_UNAVAILABLE | 外部工具不可用 | 等待工具恢复或使用降级 |
| CACHE_ERROR | 缓存错误 | 已自动降级到内存/直接查询 |

---

## 认证与授权

### API Key 认证（可选）

如果启用API Key认证，需在请求头中包含：

```http
Authorization: Bearer YOUR_API_KEY
```

示例:
```bash
curl -H "Authorization: Bearer sk-xxx" \
     -H "Content-Type: application/json" \
     -d '{"query":"冰岛天气"}' \
     http://localhost:3000/rag/retrieve
```

---

## 速率限制

默认速率限制（可配置）：

| 端点 | 限制 |
|------|------|
| `/rag/retrieve` | 100 req/min |
| `/rag/chat` | 50 req/min |
| `/rag/gate/evaluate` | 30 req/min |
| `/rag/metrics` | 无限制 |
| `/rag/tools/*` | 60 req/min |

超出限制时返回：
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "retryAfter": 60
  }
}
```

---

## 请求示例（cURL）

### 1. RAG检索

```bash
curl -X POST http://localhost:3000/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "冰岛蓝湖温泉现在开门吗",
    "category": "POI_HOURS",
    "options": {
      "topK": 5,
      "enableReranking": true
    }
  }'
```

### 2. Gate评估

```bash
curl -X POST http://localhost:3000/rag/gate/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "origin": "Reykjavik",
      "destination": "Akureyri",
      "startDate": "2026-06-15",
      "mode": "drive"
    }
  }'
```

### 3. 天气查询

```bash
curl -X POST http://localhost:3000/rag/tools/weather \
  -H "Content-Type: application/json" \
  -d '{
    "location": "Reykjavik, Iceland",
    "date": "2026-01-25"
  }'
```

### 4. 监控指标

```bash
# Prometheus格式
curl http://localhost:3000/rag/metrics

# 人类可读统计
curl http://localhost:3000/rag/metrics/stats
```

---

## SDK 示例（TypeScript）

```typescript
import axios from 'axios';

const RAG_BASE_URL = 'http://localhost:3000';

// RAG检索
async function ragRetrieve(query: string, category?: string) {
  const response = await axios.post(`${RAG_BASE_URL}/rag/retrieve`, {
    query,
    category,
    options: {
      topK: 5,
      enableReranking: true
    }
  });

  return response.data;
}

// Gate评估
async function gateEvaluate(request: any) {
  const response = await axios.post(`${RAG_BASE_URL}/rag/gate/evaluate`, {
    request
  });

  return response.data;
}

// 使用示例
(async () => {
  // 检索
  const result = await ragRetrieve('冰岛蓝湖温泉现在开门吗', 'POI_HOURS');
  console.log('Chunks:', result.data.chunks);
  console.log('Fallback Level:', result.data.fallbackLevel);

  // Gate评估
  const gateResult = await gateEvaluate({
    origin: 'Reykjavik',
    destination: 'Akureyri',
    startDate: '2026-06-15',
    mode: 'drive'
  });
  console.log('Gate Decision:', gateResult.data.gateResult);
})();
```

---

## Webhook 通知（可选）

### 评估完成通知

当批量评估完成时，可配置Webhook通知。

**配置**:
```json
{
  "webhookUrl": "https://your-domain.com/webhook",
  "events": ["evaluation.completed", "gate.blocked"]
}
```

**通知示例**:
```json
{
  "event": "evaluation.completed",
  "timestamp": "2026-01-25T02:00:00Z",
  "data": {
    "testsetId": "rag-eval-testset-v1",
    "accuracy": 0.933,
    "totalCases": 30,
    "passedCases": 28
  }
}
```

---

## 更新日志

### v1.0 (2026-01-25)
- ✅ RAG核心接口
- ✅ Prometheus监控指标接口
- ✅ Gate评估接口
- ✅ 工具调用接口（天气、POI、网页浏览）
- ✅ 评估接口（测试集）

---

## 相关文档

- [Prometheus监控指南](./PROMETHEUS_MONITORING_GUIDE.md)
- [RAG架构总览](../README_RAG_ARCHITECTURE.md)
- [Phase 5.5 完成总结](./PHASE5.5_MONITORING_COMPLETE.md)

---

**维护者**: Claude Code
**联系方式**: 通过GitHub Issues
**文档版本**: v1.0
**更新日期**: 2026-01-25
