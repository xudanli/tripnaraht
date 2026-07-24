# Destination Insight BFF — 草案与字段映射

> **定位**：冰岛/目的地 **知识与证据层** 的统一读模型。  
> 页面 **不得** 直调 `POST /api/rag/chunks/retrieve` 或 `GET /api/rag/destination-insights`；须经 Planning Decision BFF。

**相关架构共识**：RAG 负责「理解、解释、引用」；Destination Pack + POI Access + 路线引擎负责「规定与计算」；World State 负责「现在发生什么」。

---

## 1. 统一读模型

```typescript
/** schema: tripnara.destination_insight@v1 */
export interface DestinationInsight {
  id: string;
  type:
    | 'RULE'
    | 'RISK'
    | 'SEASONAL_GUIDANCE'
    | 'ACTIVITY_GUIDANCE'
    | 'EXPLANATION'
    | 'ALTERNATIVE';

  title: string;
  summary: string;

  applicability: {
    season?: string[];
    travelerTypes?: string[];
    transportModes?: string[];
    regions?: string[];
    poiSlugs?: string[];
    roadIds?: string[];
  };

  /** L1=实时事实 L2=结构化规则 L3=官方文档 L4=目的地包 L5=经验/RAG */
  sourceLevel: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  sourceRefs: DestinationInsightEvidenceRef[];

  relatedConstraintIds?: string[];
  relatedTripObjectIds?: string[];
  relatedProblemIds?: string[];

  verifiedAt?: string;
  expiresAt?: string;

  /** 是否仅解释，不可单独触发硬约束 */
  explanatoryOnly: boolean;
}

export interface DestinationInsightEvidenceRef {
  system:
    | 'RAG'
    | 'POI_ACCESS'
    | 'DESTINATION_PACK'
    | 'PLACE_ONTOLOGY'
    | 'ROAD_ONTOLOGY'
    | 'ROAD_IS'
    | 'FEASIBILITY'
    | 'OFFICIAL';
  refId: string;
  label?: string;
  url?: string;
  confidence?: number;
}

export interface DestinationInsightBundle {
  schemaId: 'tripnara.destination_insight_bundle@v1';
  tripId: string;
  contextPackageId?: string;
  focus?: {
    conflictId?: string;
    problemId?: string;
    placeId?: number;
    poiSlug?: string;
    dayIndex?: number;
  };
  generatedAt: string;
  insights: DestinationInsight[];
  meta: {
    ragRetrievalSkipped?: boolean;
    skipReason?: string;
  };
}
```

---

## 2. BFF 端点（MVP — **已实现**）

| 方法 | 路径 | 状态 |
|------|------|------|
| GET | `/api/trips/:tripId/destination-insights` | ✅ |
| POST | `/api/trips/:tripId/destination-insights/query` | 待办 |

**Query 参数**

| 参数 | 说明 |
|------|------|
| `focusConflictId` | 冲突 ID（与 planning-conflicts 对齐） |
| `problemId` | 决策问题 ID（支持 `dp_id:` 前缀） |
| `placeId` | Place 数字 id |
| `poiSlug` | 如 `is.reynisfjara` |
| `dayIndex` | 影响天数 |
| `includeRag` | `1` / `true` 时追加最多 3 条 scoped RAG（默认关） |

**示例**

```bash
curl -s "http://localhost:3000/api/trips/{tripId}/destination-insights?problemId=dp_id:poi-access:...:poi_access_risk"
curl -s ".../destination-insights?focusConflictId=poi-access:...&includeRag=1"
```

**实现文件**

- `services/destination-insight.service.ts`
- `utils/destination-insight.projection.util.ts`
- `types/destination-insight.types.ts`
- Controllers: `decision-semantics.controller.ts` + `decision-semantics-l1.controller.ts`

---

## 2b. 原计划端点（扩展）

**Context Package 输入（POST body 示意）**：

```json
{
  "destination": "IS",
  "region": "SOUTH_COAST",
  "season": "WINTER",
  "tripMode": "SELF_DRIVE",
  "memberProfile": ["SENIOR"],
  "activities": ["GLACIER_HIKE", "REYNISFJARA"],
  "decisionQuestion": "Day 3 冰川徒步是否需要分流"
}
```

**门禁**：须携带 `DecisionContextV0`（与 RAG Reality Policy 一致）；无 context 时返回 `explanatoryOnly` 缓存或 `meta.ragRetrievalSkipped: true`。

---

## 3. 与现有读模型字段映射

### 3.1 `planning-conflicts.conflicts[]`

| PlanningConflictItem | → DestinationInsight | 规则 |
|----------------------|----------------------|------|
| `issue.proofs[]` | `sourceRefs` (L2/L1) | 结构化事实 → `explanatoryOnly: false` 的引用 |
| `issue.visitorAccess.evaluation.message` | `summary` | POI 准入结论文案 |
| `issue.visitorAccess.planBHints[]` | `type: ALTERNATIVE` | 映射 planB action → title |
| `category: access_capacity` | `type: RISK` / `ACTIVITY_GUIDANCE` | |
| `semanticKey` | `relatedTripObjectIds` | 去重键 |

**不映射为 insight 的字段**：`priority`、`affectedDays`（保留在 conflict 本体）。

### 3.2 `decision-problems` + assertions

| DecisionProblemDetail | → DestinationInsight |
|-----------------------|----------------------|
| `assertions[].proofs[]` | `sourceRefs` |
| `assertions[].conclusion` | `summary` |
| `assertions[].domain: ACCESS` | `type: ACTIVITY_GUIDANCE` |
| `sourceRefs[].system: GUARDIAN` | `sourceLevel: L1` |
| `sourceRefs[].system: FEASIBILITY` | `sourceLevel: L2` |
| `problemId` | `relatedProblemIds` |

### 3.3 `decision-checker.evidence.items[]`（**已实现** `destination_knowledge`）

| 现有 DecisionCheckerEvidenceItemDto | 说明 |
|-------------------------------------|------|
| `kind: route_engine` | L1，不变 |
| `kind: weather_road` | L1，不变 |
| **`kind: destination_knowledge`** | POI Access proofs、`visitorAccess`、Plan B hints |
| `judgmentExplanation` | 仍以 issue 为主；destination 条目在 evidence Tab |

### 3.4 RAG chunk → insight（内部，不暴露给页面）

| ChunkRetrievalResult | DestinationInsight |
|----------------------|-------------------|
| `category: ROAD_STATUS` | `type: RULE`, `sourceLevel: L3`, 且需 pack 确认后才 `explanatoryOnly: false` |
| `category: GENERAL` | `type: EXPLANATION`, `explanatoryOnly: true` |
| `metadata.roadId` | `applicability.roadIds` |
| `chunkId` | `sourceRefs[].refId` |

---

## 4. POI / 路线本体 — 使用审计（2026-07 dev）

### 4.1 POI 本体（`Place.ontologyRules`）

| 项 | 现状 |
|----|------|
| DB | `Place` 共 **28,491** 条；**32** 条有 `ontologyRules` |
| 冰岛黑沙滩 `381039` | `ontologyRules: null` |
| 规划工作台热路径 | **未使用** — `trip-constraint-solver` / `readiness` / `planning-conflicts` 不读 `Place.ontologyRules` |
| Agent | `route-run-itinerary-poi-hydrator` 读出并透传 `ontologyRules` 到 route_and_run payload |
| PhysicalValidator | 仅当 `action_input.ontologyRules` 传入时做 SHACL shape 校验 |
| 实际 POI 准入 | **`PoiAccessRule` 表（10 条）→ 无则 fixture**（`is-b-tier.rules.ts` 等），与 `Place.ontologyRules` **分离** |

**结论**：POI **本体字段存在但未接入规划 BFF**；live 黑沙滩等问题来自 **`poi-access-capacity` 规则表/种子**，不是 `Place.ontologyRules`。

### 4.2 路线本体

| 层 | 现状 |
|----|------|
| `data/destination-packs/is/rules/is-road-rules.json` | ✅ **已用** — Decision Runtime pack 规则（`ROAD_SEGMENT_UNAVAILABLE` 等） |
| `destination.pack.json` → `ontology/is-road-types.json` | ✅ **已落地** — `DestinationPackLoaderService` 启动时加载；`pack-ontology.loader.ts` |
| `spatial_domain_segments` | ⚠️ 种子脚本就绪 — `npm run seed:iceland-spatial-domain-segments`（需 `SEED_ICELAND_SPATIAL_DOMAIN_WRITE=1`） |
| `OntologyRoadStatusProviderService` | ✅ 从 pack ontology 解析 `roadIsKeys`（Agent 轻量问答 + EnvSync 缓存命中） |
| `IcelandRoadConstraintPack` (guide-to-plan) | ✅ F-road/季节/车型 + Road.is，**Guide 链路** |
| Guardian F208 | ✅ 路政事件 + RFC001，**非 ontology 文件** |

**结论**：路线 **结构化规则（pack + Guardian + guide pack）在用**；**路线 ontology 图** 已通过 `is-road-types.json` + pack loader 接入，`spatial_domain_segments` 需执行种子脚本后 PhysicalValidator 才有路段数据。

### 4.2.1 路线本体文件结构

`data/destination-packs/is/ontology/is-road-types.json`：

- `nodes[]` — Region / Corridor / Road 节点（`ontologyNodeId`、`roadIsKeys`、`roadIds`、触发词）
- `spatialSeed.pois[]` + `spatialSeed.segments[]` — 供 `scripts/seed-iceland-spatial-domain-segments.ts` upsert

加载路径：

```
destination.pack.json (ontologyMappings)
  → DestinationPackLoaderService.loadOntologyForPack()
  → OntologyRoadStatusProviderService.resolveRoadIsKeys()
  → lightweight-hard-road-ontology-appendix.util (Region/Corridor 定义)
```

### 4.3 三层与 RAG 对照

| 层 | POI | 路线 |
|----|-----|------|
| 结构化约束 SSOT | `PoiAccessRule` + fixtures | `is-road-rules.json` + Guardian |
| 实时状态 | 容量/拥挤 snapshot、Parka | Road.is、Guardian events |
| 知识/RAG | chunks GENERAL | chunks ROAD_STATUS（P0 seed） |
| **本体 JSON** | `Place.ontologyRules`（32/28491）→ **`getRulesForPoi` fallback** | `is-road-types.json` ✅ + `spatial_domain_segments`（种子后可用） |

### 4.4 POI 本体 fallback（**已实现**）

`PoiAccessCapacityService.getRulesForPoi()` 链：

```
PoiAccessRule 表 → Place.ontologyRules（rules_v1）→ fixture 种子
```

行程评估传入 `placeId` + `placeOntologyRules`（见 `poi-access-capacity-engine.service.ts`）。

---

## 5. MVP 落地顺序

1. **BFF** `GET /trips/:id/destination-insights?focusConflictId=` — 聚合 conflict proofs + 可选 scoped RAG（带 decision_context）。
2. **decision-checker** 增加 `evidence.kind: destination_knowledge` — ✅ 已实现
3. **POI 本体接线**：`getRulesForPoi` ontology fallback — ✅ 已实现
4. **路线本体**：`is-road-types.json` + pack loader + `seed:iceland-spatial-domain-segments` — ✅ 已实现（DB 种子需手动执行）
5. 标记 `GET /rag/destination-insights` 为 **internal deprecated** — 待办

---

## 6. 前端消费约定

- Tab 首屏 / `loadFirstPaint`：**不**请求 destination-insights。
- 打开决策检查器证据 / 点击冲突 / Plan Gate：**才**请求 bundle。
- 同一 `focusConflictId` 使用 `If-None-Match` / 短 TTL 缓存，避免重复 RAG。
