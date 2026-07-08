# Canonical POI Resolution Engine (CPRE) — PRD & 技术设计 V1.0

**文档版本：** V1.0  
**优先级：** P0（Foundation）  
**所属模块：** Travel Knowledge Runtime  
**实现路径：** `src/canonical-poi-resolution/`  
**API 前缀：** `/api/poi`

**相关文档：**

- [Exploration 前端联调交接](../exploration/frontend-ai-route-generation-handoff.md)
- [POI Access & Capacity](../../src/poi-access-capacity/)
- [Decision Runtime World State](../../src/decision-runtime/contracts/world-state-snapshot.ts)

---

## 一、产品定位

AI Planner 输出自然语言地点（如「去蓝湖泡温泉」），Travel Runtime 需要唯一可信的 **Travel Primary Key**（如 `is.blue_lagoon`）。

**设计原则（一句话）：**

> TripNARA 的任何旅行地点，都必须先经过 CPRE，转换为唯一的 Canonical POI，再进入 Route / Constraint / Decision / Weather / Ticket 等模块。

**禁止：**

- Planner 写字符串给 Constraint Solver
- Weather / Ticket / Crowd 用名称查数据

**必须：**

- 所有 Runtime 只认 `poiId`（Travel Primary Key）

---

## 二、系统架构

```text
                AI Planner
                     │
                     ▼
         Natural Language POI  { name, resolved: false }
                     │
                     ▼
────────────────────────────────────
Canonical POI Resolution Engine
────────────────────────────────────
① Exact Match
② Alias Match
③ Fuzzy Match          (Sprint 2)
④ Embedding Search     (Sprint 2)
⑤ Geo Context Ranking  (Sprint 2)
⑥ External Resolver    (Sprint 3)
⑦ Human Confirmation   (Sprint 3)
────────────────────────────────────
                     │
                     ▼
         Canonical POI  { poiId, confidence, evidence }
                     │
                     ▼
        Destination Knowledge Runtime
        ├── Route Engine
        ├── Constraint Solver
        ├── Decision Runtime
        ├── Weather / Ticket / Crowd / Risk
        └── Timeline Runtime
```

---

## 三、Travel Primary Key 策略

| 层级 | 格式 | 示例 |
|------|------|------|
| **Travel Primary Key（对外）** | `{country}.{slug}` | `is.blue_lagoon` |
| 内部 DB 关联 | `Place.id` / `Place.uuid` | 映射表（后续 Sprint） |
| 外部新建 POI | `poi_{short_uuid}` | Import Queue 分配（Sprint 3） |

P0 延续 Decision Runtime / POI Access 已使用的 `is.*` slug，与 PRD 示例 `poi_001293` 语义等价。

---

## 四、Resolution Pipeline（分期）

| Stage | P0 Sprint 1 | Sprint 2 | Sprint 3 |
|-------|-------------|----------|----------|
| ① Exact | ✅ canonicalName 精确匹配 | — | — |
| ② Alias | ✅ 冰岛 catalog + `poi_aliases` 表 | 全球扩展 | 飞轮回写 |
| ③ Fuzzy | — | Levenshtein / Jaro / Ngram Top5 | — |
| ④ Embedding | — | 预计算 embedding + Qdrant | — |
| ⑤ Geo Context | 基础 `countryCode` 过滤 | tripContext + distance | — |
| ⑥ External | — | — | Google / OSM → Import Queue |
| ⑦ Human Confirm | — | — | confidence < 0.75 UI |

**P0 置信度阈值：**

| 区间 | status |
|------|--------|
| ≥ 0.75 | `MATCHED` |
| 多候选接近 | `AMBIGUOUS` |
| 无命中 | `NOT_FOUND` |
| < 0.75 单候选 | `NEEDS_CONFIRMATION` |

---

## 五、核心类型

### CanonicalPOI

```typescript
interface CanonicalPOI {
  poiId: string;           // Travel Primary Key, e.g. is.blue_lagoon
  canonicalName: string;
  aliases: string[];
  country: string;         // ISO 3166-1 alpha-2
  city?: string;
  lat?: number;
  lng?: number;
  category?: string;
  subCategory?: string;
  popularity?: number;
  status: 'ACTIVE' | 'DEPRECATED' | 'PENDING';
}
```

### ResolutionResult

```typescript
type ResolutionStatus =
  | 'MATCHED'
  | 'AMBIGUOUS'
  | 'NOT_FOUND'
  | 'NEEDS_CONFIRMATION';

type ResolutionMethod =
  | 'EXACT'
  | 'ALIAS'
  | 'FUZZY'
  | 'EMBEDDING'
  | 'GEO_RANK'
  | 'EXTERNAL'
  | 'HUMAN';

interface ResolutionResult {
  status: ResolutionStatus;
  method?: ResolutionMethod;
  poiId?: string;
  confidence: number;
  matchedPoi?: CanonicalPOI;
  candidates?: Array<{
    poiId: string;
    canonicalName: string;
    confidence: number;
  }>;
  evidence?: ResolutionEvidenceStep[];
  reason?: string;
}

interface ResolutionEvidenceStep {
  stage: string;       // INPUT | EXACT | ALIAS | CANONICAL | ...
  label: string;
  detail?: string;
}
```

### Planner 接入契约

```typescript
// 生成阶段 — 未解析
interface UnresolvedPoiRef {
  name: string;
  resolved: false;
}

// Resolve POIs 之后
interface ResolvedPoiRef {
  name: string;
  poiId: string;
  confidence: number;
  resolved: true;
  method?: ResolutionMethod;
}
```

---

## 六、HTTP API 契约

所有接口返回统一格式 `{ success: true, data: ... }`（见 `standard-response.dto.ts`）。

### POST `/api/poi/resolve`

解析单个自然语言 POI。

**Request**

```json
{
  "name": "蓝湖",
  "countryCode": "IS",
  "locale": "zh",
  "lat": 64.0,
  "lng": -22.0
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 自然语言 POI 名称 |
| `countryCode` | string | — | ISO 国家码，用于 Geo 过滤 |
| `locale` | string | — | 用户语言偏好 |
| `lat` / `lng` | number | — | 上下文坐标（Sprint 2 rerank） |
| `tripId` | string | — | 行程上下文（Sprint 2） |

**Response `data`**

```json
{
  "status": "MATCHED",
  "method": "ALIAS",
  "poiId": "is.blue_lagoon",
  "confidence": 0.97,
  "matchedPoi": {
    "poiId": "is.blue_lagoon",
    "canonicalName": "Blue Lagoon",
    "aliases": ["蓝湖", "Bláa Lónið"],
    "country": "IS",
    "status": "ACTIVE"
  },
  "evidence": [
    { "stage": "INPUT", "label": "蓝湖" },
    { "stage": "ALIAS", "label": "蓝湖", "detail": "alias exact match" },
    { "stage": "CANONICAL", "label": "is.blue_lagoon", "detail": "Blue Lagoon" }
  ]
}
```

**status 枚举响应示例**

```json
{ "status": "AMBIGUOUS", "confidence": 0.72, "candidates": [
  { "poiId": "is.studlagil", "canonicalName": "Stuðlagil Canyon", "confidence": 0.68 },
  { "poiId": "is.fjadrargljufur", "canonicalName": "Fjaðrárgljúfur", "confidence": 0.65 }
]}
```

```json
{ "status": "NOT_FOUND", "confidence": 0, "reason": "no match in registry" }
```

---

### POST `/api/poi/resolve/batch`

批量解析（Planner 生成结束后统一调用）。

**Request**

```json
{
  "items": [
    { "name": "Blue Lagoon", "countryCode": "IS" },
    { "name": "黑沙滩", "countryCode": "IS" },
    { "name": "Secret Canyon", "countryCode": "IS" }
  ]
}
```

**Response `data`**

```json
{
  "results": [ /* ResolutionResult[] */ ],
  "summary": {
    "total": 3,
    "matched": 2,
    "ambiguous": 0,
    "notFound": 1,
    "needsConfirmation": 0
  }
}
```

---

### GET `/api/poi/canonical/:poiId`

按 Travel Primary Key 查询 Canonical POI（只读）。

**Response `data`：** `CanonicalPOI | null`

---

### POST `/api/poi/confirm`

用户确认 POI 解析（Learning Flywheel）。**需 JWT。**

**Request**

```json
{
  "queryName": "Secret Canyon",
  "selectedPoiId": "is.studlagil",
  "countryCode": "IS",
  "locale": "zh"
}
```

**Response `data`：** `ResolutionResult`，`method: "HUMAN"`, `confidence: 1.0`

**前端集成：** [frontend-cpre-integration-guide.md](../exploration/frontend-cpre-integration-guide.md)

---

## 七、数据模型（Prisma）

```prisma
model PoiAlias {
  id         Int      @id @default(autoincrement())
  poiId      String   // Travel Primary Key
  alias      String
  locale     String?
  source     String   // SYSTEM | USER_CONFIRMED | LLM
  confidence Float    @default(1.0)
  @@unique([poiId, alias])
  @@index([alias])
}

model PoiImportQueue {
  id              String   @id @default(uuid())
  queryName       String
  externalSource  String   // GOOGLE | OSM | MAPBOX
  externalId      String
  lat             Float
  lng             Float
  status          String   // PENDING | APPROVED | REJECTED
  resolvedPoiId   String?
  createdAt       DateTime @default(now())
}

model PoiResolutionLog {
  id         String   @id @default(uuid())
  queryName  String
  poiId      String?
  method     String?
  confidence Float
  evidence   Json
  userId     String?
  confirmed  Boolean  @default(false)
  createdAt  DateTime @default(now())
}
```

Migration: `20260705140000_canonical_poi_resolution`

---

## 八、P0 冰岛 Alias Seed

种子来源（代码 SSOT → DB `poi_aliases`）：

| 来源 | 路径 |
|------|------|
| A/B/C 级 slug + 正则 | `poi-access-capacity/fixtures/iceland-poi-registry.ts` |
| 规划关键词 | `planning-policy/regions/iceland-poi-slugs.ts` |
| 黄金圈锚点 | `planning-policy/regions/golden-circle-anchor-retrieval-profile.ts` |

启动时 `PoiAliasSeedService` 执行 upsert（幂等）。

---

## 九、前端表现（Sprint 3 联调）

| 状态 | UI |
|------|-----|
| `MATCHED` confidence ≥ 0.75 | 📍 Blue Lagoon · ✓ 已验证 · 98% · 官方 POI |
| `NEEDS_CONFIRMATION` / `AMBIGUOUS` | ⚠ 等待确认 · 候选列表 |
| `NOT_FOUND` | ⚠ 未找到 · 手动选择或上报 |

**Resolution Evidence 抽屉：** 展示 `evidence[]` 链（AI 识别 → Alias → Canonical）。

---

## 十、Learning Flywheel（Sprint 3）

```text
AI 输出 → CPRE → 用户确认 → PoiAlias (USER_CONFIRMED) → 下次直接 ALIAS 命中
                              → PoiResolutionLog (confirmed=true)
                              → popularity++ (后续)
```

---

## 十一、接入路线图

| 优先级 | 接入点 | Sprint |
|--------|--------|--------|
| P0 | `POST /api/poi/resolve` + 冰岛 registry | Sprint 1 ✅ |
| P0 | Exploration `generateCandidates` 后 batch resolve | Sprint 1.5 ✅ |
| P1 | Constraint Solver 只读 `poiId` | Sprint 2 ✅ |
| P1 | Decision Runtime world-state 校验 | Sprint 2 ✅ |
| P2 | 前端行程卡片 + Evidence UI | Sprint 3 — [前端集成指南](../exploration/frontend-cpre-integration-guide.md) |
| P2 | Human Confirmation API + 飞轮 | Sprint 3 ✅ `POST /api/poi/confirm` |
| P2 | Agent `EntityResolutionService` 路由到 CPRE | Sprint 3 ✅ 冰岛 via `CpreEntityResolutionBridge` |

---

## 十二、与现有模块关系

| 现有模块 | 关系 |
|----------|------|
| `EntityResolutionService` | 冰岛场景经 `CpreEntityResolutionBridge` 路由 CPRE；中国等仍走 legacy 链 |
| `ICELAND_POI_SLUG_RESOLVERS` | P0 seed 来源；解析逻辑收敛到 CPRE |
| `poi-access-capacity` | 消费 `is.*` poiId，无需改动 |
| `Place` / `poi_canonical` | 后续 Sprint 建立 poiId ↔ placeId 映射 |

---

## 十三、验收 Checklist（P0 Sprint 1）

- [ ] `POST /api/poi/resolve` — `蓝湖` → `is.blue_lagoon` confidence ≥ 0.95
- [ ] `POST /api/poi/resolve` — `Blue Lagoon` → `is.blue_lagoon`
- [ ] `POST /api/poi/resolve` — `黑沙滩` → `is.reynisfjara`
- [ ] `POST /api/poi/resolve/batch` — 混合命中 / NOT_FOUND
- [ ] `GET /api/poi/canonical/is.blue_lagoon` — 返回 CanonicalPOI
- [ ] Migration deploy + alias seed 幂等
- [ ] 单元测试 `canonical-poi-resolution.service.spec.ts`

本地验证：

```bash
npm run build
PORT=3001 node dist/src/main.js

curl -s -X POST http://localhost:3001/api/poi/resolve \
  -H 'Content-Type: application/json' \
  -d '{"name":"蓝湖","countryCode":"IS"}' | jq
```
