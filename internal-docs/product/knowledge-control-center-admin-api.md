# Knowledge Control Center — Admin API

**文档版本：** 1.0.0  
**状态：** 后台治理线设计（随 Phase 1–6 分批实现）  
**生效日期：** 2026-08-13  
**读者：** 后台前端 / 平台工程  
**执行计划：** [tripnara-knowledge-system-execution-plan-v2.md](./tripnara-knowledge-system-execution-plan-v2.md)

> **不要叫「知识图谱管理」。** 产品名：**Knowledge Control Center**  
> 职责：看、查、校验、修正、发布 — **不是**造大图编辑器。  
> 鉴权：与现有 Admin 一致（`AdminStrictAuthGuard` / Bearer / god-key）。  
> 响应：建议统一 `{ success, data, error }`（对齐风险知识库 Admin）。

**Semantic / RAG：** 继续用现有 `/api/rag`，本中心不重写。

---

## 0. 信息架构（IA）

```text
Knowledge Control Center
├── Overview                 （健康度，非知识总量）
├── Entities
│   ├── Entity Registry
│   ├── Alias / Identity
│   └── Unresolved Entities
├── World State
│   ├── Snapshots
│   ├── Facts
│   ├── Stale Facts
│   └── Snapshot Diff
├── Relations
│   ├── Relation Explorer
│   └── Vocabulary
├── Rules                    （聚合查看；不重复 Policy Lab）
│   ├── Rule Registry
│   └── Evaluation Debug
├── Traveler Context
│   └── Effective Context Inspector
├── Decision Knowledge       （Phase 5+）
│   ├── Decision Cases
│   └── Outcome / Regret
└── Semantic Knowledge       （轻量；链到 /api/rag）
    ├── Documents
    └── Retrieval Trace
```

### 七组 API 前缀

```text
/api/admin/knowledge/entities/*
/api/admin/knowledge/world-state/*
/api/admin/knowledge/relations/*
/api/admin/knowledge/vocabulary/*
/api/admin/knowledge/rules/*
/api/admin/knowledge/traveler-context/*
/api/admin/knowledge/decision-cases/*
```

另：`GET /api/admin/knowledge/health`（Overview）  
Ontology 四 Tab：`/api/admin/knowledge/ontology/*`（types / attributes / export / validate）

---

## 1. Entities（第 1 批 · Phase 1）

### 1.1 列表

`GET /api/admin/knowledge/entities`

| Query | 说明 |
|-------|------|
| q | 搜索 canonical / alias / displayName |
| domain | TRAVELER / PLACE / MOBILITY … |
| entityType | Place / RouteSegment … |
| status | ACTIVE / DEPRECATED |
| sourceSystem | cpre / poi / trip_item … |
| page / pageSize | 分页 |

### 1.2 详情

`GET /api/admin/knowledge/entities/:canonicalEntityId`

```json
{
  "canonicalEntityId": "is.reynisfjara",
  "entityType": "Place",
  "domain": "PLACE",
  "displayName": "Reynisfjara",
  "aliases": ["雷尼斯黑沙滩", "Black Sand Beach"],
  "sourceRefs": [
    { "system": "cpre", "sourceId": "is.reynisfjara" },
    { "system": "poi", "sourceId": "poi_481" }
  ],
  "relationsCount": 12,
  "factsCount": 8,
  "rulesCount": 3
}
```

### 1.2b 新建 Identity 规范实体

`POST /api/admin/knowledge/entities`

> **≠** `POST .../resolve`（解析已有 subject）。本接口是往 Identity 目录**显式新建**一条规范实体。

**鉴权**：`AdminStrictAuthGuard`。成功 HTTP **200**（统一信封）。

| 字段 | 中文名 | 必填 | 说明 |
|------|--------|------|------|
| `name` | 展示名 | 是 | 如 Tokyo Station |
| `type` | 本体类型码 | 是 | 须在 `GET /ontology/types` 的 `typeId` 中 |
| `canonicalEntityId` | 规范实体ID | 否 | 不传则后端生成且全局唯一 |
| `domain` | 领域 | 否 | Place / Mobility 或 PLACE / MOBILITY |
| `country` | 国家码 | 否 | JP / IS |
| `aliases` | 别名列表 | 否 | string[] |
| `description` | 描述 | 否 | |
| `status` | 状态 | 否 | enabled / draft |
| `properties` | 扩展属性 | 否 | object |

```json
// req
{
  "name": "Tokyo Station",
  "type": "Place",
  "canonicalEntityId": "place:tokyo_station",
  "domain": "Place",
  "country": "JP",
  "aliases": ["東京駅", "Tokyo Sta."],
  "description": "中央车站"
}

// res data（前端读 canonicalEntityId / id / subjectId 跳转详情）
{
  "canonicalEntityId": "place:tokyo_station",
  "id": "place:tokyo_station",
  "subjectId": "place:tokyo_station",
  "name": "Tokyo Station",
  "type": "Place",
  "domain": "PLACE",
  "status": "enabled",
  "aliases": ["東京駅"],
  "createdAt": "..."
}
```

失败：`VALIDATION_ERROR`（缺字段 / type 不在本体投影）· `CONFLICT`（显式 ID 已存在）。

### 1.2c 新建可选类型

`GET /api/admin/knowledge/entities/create-types`

返回目录全部类型，每项含 `cascade`（`country` / `poi` / `linkableTypeLabels` 等）。前端据此自建表单。  
`POST /entities` 支持 `linkedPoiId`、`linkedEntityIds`、`country`。

### 1.2d 更新 Identity

`PATCH /api/admin/knowledge/entities/:canonicalEntityId`

部分更新：`name` / `type` / `domain` / `country` / `aliases`（替换）/ `description` / `status` / `properties`（浅合并）/ `linkedPoiId` / `linkedEntityIds`（替换）。  
不可改 ID。失败：`NOT_FOUND` · `VALIDATION_ERROR` · `CONFLICT`。  
写入 `origin=ADMIN` 并持久化到 `knowledge_entity_identities`（DB 可用时）；后续 CPRE/Country Pack sync **不会覆盖**该行。

### 1.2e Identity 同步（CPRE / Country Pack → DB）

`POST /api/admin/knowledge/entities/sync`  
`GET /api/admin/knowledge/entities/sync`  
`GET /api/admin/knowledge/entities/sync/runs`

将 CPRE 目录、`CountryProfile`（Country Pack）、place_db→CPRE 链接写入 Identity 表，并落 ontology catalog 快照。  
`sources` 可选：`cpre` | `country_pack` | `place_db` | `ontology_snapshot`（默认全部）。  
Country Pack 同步产出 `entityType=Country`、`canonicalEntityId=country:{iso}`。

### 1.3 Identity 解析调试（高优先级）

`POST /api/admin/knowledge/entities/resolve`

```json
// req
{ "system": "poi", "sourceId": "poi_481" }
// 或
{ "alias": "雷尼斯海滩" }

// res
{
  "canonicalEntityId": "is.reynisfjara",
  "matchType": "SOURCE_REF",
  "confidence": 1
}
```

### 1.4 未解析实体

`GET /api/admin/knowledge/entities/unresolved`

列出 WorldFact.subjectId / Trip 引用无法 resolve 的条目 — **核心运营页**。

### 1.5 实体关系 / 事实（只读聚合）

`GET /api/admin/knowledge/entities/:entityId/relations`  
`GET /api/admin/knowledge/entities/:entityId/facts`（可代理 world-state/facts?entityId=）

---

## 2. World State（第 2 批 · Phase 2）

> 重要程度 **≥** Relations。回答：NARA 当前认为世界是什么样？

### 2.0 Monitoring（产品大盘）

`GET /api/admin/knowledge/world-state/monitoring`  
返回：`sources[]`（road.is / weather.is · online · onlineRate · latencyMsP50 · degraded）· `kpis`（snapshotSuccessRate · freshnessPassRate · highConfidenceRate · writeLatencyMsP50 · openAlertCount）· `alerts[]` · `trends`（freshness / confidence / latencyMs）

`GET /api/admin/knowledge/world-state/sources`  
`GET /api/admin/knowledge/world-state/alerts?status=OPEN`

### 2.1 Snapshots

`GET /api/admin/knowledge/world-state/snapshots`  
Query：`tripId` · `status` · `page` · `pageSize`  
列表字段：`factCount` · `staleFactCount` · `status` · `recentChangeCategories` · `roadCount`/`weatherCount`/`poiCount`

`GET /api/admin/knowledge/world-state/snapshots/:snapshotId`

`POST /api/admin/knowledge/world-state/snapshots/generate`  
Body：`{ tripId, mode?: "clone_latest"|"demo_tick", note? }` — **真正「生成快照」**，与 register 分开。

`POST /api/admin/knowledge/world-state/snapshots/register` — 注册已有 Canonical JSON 到治理台。

### 2.2 Facts

`GET /api/admin/knowledge/world-state/facts`  
Query（契约）：`country` · `factType` · `entityType` · `entityId` · `predicate` · `provider`/`source` · `freshness` · `confidenceMin`/`confidenceMax` · `timeFrom`/`timeTo` · `tripId` · `snapshotId` · `page`/`pageSize`

`GET /api/admin/knowledge/world-state/facts/:factId`  
展示：subject · predicate · value · source · observedAt · confidence · freshness · **`provenance`**（jobId / dataset / license / contractVersion）

### 2.3 Stale

`GET /api/admin/knowledge/world-state/stale-facts` — 运营监控必开

### 2.4 Diff（结构化）

`GET /api/admin/knowledge/world-state/diff?fromSnapshotId=&toSnapshotId=`  

固定契约：
- `summary`: `{ added, updated, removed, worsened, improved, total }`
- `changes[]`: `{ object, objectId, oldValue, newValue, impactLevel, polarity, source, kind, category }`

例：`Road 208 OPEN → CLOSED` → `kind: WORSENED`, `impactLevel: HIGH`

---

## 3. Relations / Vocabulary（第 3 批 · Phase 3）

**先做表格 + Entity 详情 Relations Tab，不做酷炫节点图。**

`GET /api/admin/knowledge/relations`  
Query：`from` · `to` · `type` · `domain` · `source` · `country`  
SSOT：`knowledge_relations`（启动加载 + reproject 写回；`source=manual` 保留）

`GET /api/admin/knowledge/relations/:relationId`

`GET /api/admin/knowledge/vocabulary/relations`  
表：Relation · 含义 · Source · Count

`GET /api/admin/knowledge/relations/projections`  
Adapter 调试：Golden Set `SOFT_ALTERNATIVE` → 标准 `SOFT_ALTERNATIVE` / `ALTERNATIVE_TO`+kind

`GET /api/admin/knowledge/entities/:canonicalEntityId`  
详情含 `relationsCount` · `factsCount`（World State subject）· `rulesCount`（知识包规则命中）

`POST /api/admin/knowledge/relations` · `PATCH/DELETE .../relations/:relationId`  
manual 边写入 `knowledge_relations`，reproject 不覆盖。

### 图谱浏览 / 路径 / 影响（产品 UI · 投影拼装）

> 基于 `knowledge_relations` 投影；**不是** Neo4j。前端亦可继续用 relations 列表兜底。

`GET /api/admin/knowledge/graph/subgraph`  
Query：`q` · `entityType` · `relationType` · `country` · `focusEntityId` · `limit`  
→ `nodes[]` · `edges[]` · `stats`

`POST /api/admin/knowledge/graph/path-query`  
Body：`startEntityId` · `endEntityId` · `maxDepth?` · `pathType?(shortest|semantic|constraint)` · `country?` · `allowedRelationTypes?`  
→ `candidates[]` · `analytics` · `inventory`

`POST /api/admin/knowledge/graph/impact-analysis`  
Body：`sourceEntityIds[]` · `impactType?(all|direct|indirect|risk|alternative)` · `maxDepth?` · `country?`  
→ `summary` · `graph` · `entities[]` · `charts`

---

## 4. Rules（聚合 · 可与第 2–3 批并行只读）

**不重复造 Policy Lab。** Knowledge Center 只聚合查看。

`GET /api/admin/knowledge/rules`  
Query：`country` · `kind` · `severity` · `entityType` · `active` · `source`

`GET /api/admin/knowledge/rules/:ruleId`  
condition · scope · effect · severity · evidenceRequirement · source · version

`GET /api/admin/knowledge/rules/:ruleId/references`  
引用了哪些 entityType / predicate / relation

`POST /api/admin/knowledge/rules/:ruleId/evaluate`  
Body：`{ snapshotId, travelerContextId? }`  
→ matched · factsUsed · missingEvidence · result · severity

---

## 5. Traveler Context（第 4 批 · Phase 4）

`GET /api/admin/knowledge/traveler-context/:tripId`

```json
{
  "effectiveTravelerContext": {},
  "sourceBreakdown": {
    "pace": { "value": "RELAXED", "source": "TRIP_OVERRIDE" },
    "drivingExperience": { "value": "LOW", "source": "TRAVELER_MEMORY" }
  },
  "tripOverrides": [],
  "memoryInputs": [],
  "runtimeInputs": []
}
```

`GET /api/admin/knowledge/traveler-context/:tripId/diff`  
Long-term Memory → override → Effective

`GET /api/admin/knowledge/traveler-context`  
ETC consume coverage（`EFFECTIVE_TRAVELER_CONTEXT_CONSUME`）；可选 `?tripId=`

Demo：`tripId=demo-ks-phase4`

---

## 6. Decision Cases（第 5 批 · Phase 5）

`GET /api/admin/knowledge/decision-cases`  
Query：`country` · `decisionType` · `riskType` · `outcome` · `userChoice` · `regret` · `tripId`

`GET /api/admin/knowledge/decision-cases/:caseId`  
完整 Situation → … → Outcome / Regret

`GET /api/admin/knowledge/decision-cases/:caseId/similar`  
**V1 SQL：** country + decisionType + situationTags + riskType  
**不做** embedding

`POST /api/admin/knowledge/decision-cases/ingest` · `POST .../reproject`  
Episode → 耐久注册表（超出 TravelMemory 热 Map）

Demo：`tripId=demo-ks-phase5` · caseId 形如 `kdc_demo-ep-f208-closed`

---

## 7. Semantic（第 6 批 · 轻量）

优先直接链现有：

- `GET /api/rag/documents` …
- 薄封装：`GET /api/admin/knowledge/documents` → `knowledge_files` / demo
- `GET /api/admin/knowledge/retrieval-traces`

字段：来源 · 国家 · 类型 · Verified/Stale · embedding 状态 · **`hardBlockEligible: false` 恒定**

红线工具：`assertVectorMustNotHardBlock`（`src/knowledge-system/semantic/`）

---

## 8. Overview Health

`GET /api/admin/knowledge/health` · `GET /api/admin/knowledge/overview`

| 指标 | 意义 |
|------|------|
| canonicalEntityCoverage | ID 统一比例 |
| unresolvedEntityCount | Fact 找不到实体 |
| snapshotSsotCoverage | Gate 只读 Snapshot 比例 |
| staleFactRate | 过期动态事实 |
| relationStandardizationRate | 关系统一投影率 |
| etcConsumeCoverage | 决策链统一上下文 |
| decisionCaseCaptureRate | 决策沉淀率 |
| evidenceMissingRate | 缺证据比例 |
| vectorHardBlockBanned | Vector 永不 HARD BLOCK |

**首页不要做知识总量仪表盘。**

---

## 8b. Ontology 目录（产品四 Tab · 旅行本体投影）

前缀：`/api/admin/knowledge/ontology`  
数据源：契约投影灌入表 `knowledge_ontology_types` / `knowledge_ontology_attributes` / `knowledge_ontology_predicates`；Admin 列表读表（`dataSource=db`），DB 不可用回退内存投影。`POST /ontology/sync` 可强制灌表。**不要**回退前端本地目录或在 Admin 层硬编码枚举。  
**中文名**：类型 `displayName`、属性 `displayName`、枚举 `enumValues[].displayName` 均为中文，Admin UI **必须**展示中文名。  
**source**：`travel-ontology-contract`（契约投影）| `identity-extension`（Place/Road/Flight/WeatherRegion）。

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/overview` | 领域卡 / 统计 / 最近更新 |
| GET | `/types` · `/types/:id` | 类型词汇 |
| GET | `/attributes` · `/attributes/:id` | 属性管理（表 `knowledge_ontology_attributes`） |
| POST | `/sync` | 投影灌表并刷新 |
| POST | `/export` | 本体导出（JSON） |
| GET | `/export/history` | 导出历史 |
| GET | `/export/:exportId` | 某次导出 |
| GET | `/validate` | 校验摘要 |

### 类型字段（`/types`）

| 字段 | 中文名 | 说明 |
|------|--------|------|
| `typeId` | 类型ID | 如 Place、RouteSegment |
| `name` | 英文名 | |
| `displayName` | 中文名 | UI 必显（地点 / 路线区段 …） |
| `kind` | 种类 | ENTITY / VALUE_OBJECT / FACT / ASSESSMENT |
| `domain` | 领域码 | PLACE / MOBILITY … |
| `description` | 描述 | |
| `attributeIds` | 属性ID列表 | |
| `status` | 状态 | |
| `updatedAt` | 更新时间 | |

### 属性字段（`/attributes`）

与 Identity 新建/编辑「填写属性」**同源**：`GET /attributes?ownerTypeId={type}&limit=200`。  
默认 `status=enabled`；`domain` 大小写不敏感。响应项含 `attributeId` / `displayName` / `valueKind` / `valueKindDisplayName` / `enumValues` / `required` / `applicableEntityTypes` 等。  
`POST/PATCH /entities` 的 `properties` 按同一目录校验。

| 字段 | 中文名 | 说明 |
|------|--------|------|
| `attributeId` | 属性ID | `OwnerType.fieldName` |
| `name` | 英文字段名 | |
| `displayName` | 中文名 | UI 必显（当前道路状态 …） |
| `ownerTypeId` | 所属类型ID | |
| `domain` | 领域码 | |
| `valueKind` | 值类型 | string/number/boolean/enum/… |
| `enumValues` | 枚举选项 | `{ value, displayName }`；`displayName` 为中文说明，UI 必显 |
| `required` | 是否必填 | |
| `description` | 描述 | |
| `status` | 状态 | |
| `updatedAt` | 更新时间 | |

**枚举值**：`enumValues[]` 为 `{ value, displayName }`，`displayName` 为中文说明（如 `CLOSED` →「封闭」）。

---

## 9. 实现批次勾选

| 批 | Admin 模块 | 依赖 Phase | 状态 |
|----|------------|-----------|------|
| 1 | Entities + resolve + unresolved + health | Phase 1 | **✅** `src/knowledge-system/` |
| 2 | World State + stale + diff | Phase 2 | **✅** snapshots/facts/stale/diff + SSOT guard |
| 3 | Relations + vocabulary + projections | Phase 3 | **✅** Golden Set / POI alt / Causal / Spatial 投影 |
| 4 | Traveler Context inspector | Phase 4 | **✅** ETC Inspector + diff + SSOT guard |
| 5 | Decision Cases | Phase 5 | **✅** Episode→Case + similar + Admin |
| 6 | Health Overview 全量 + RAG 轻链 | Phase 6 | **✅** documents / traces / overview + vector ban |

### Phase 1–6 已上线路径

| 方法 | 路径 |
|------|------|
| GET | `/api/admin/knowledge/health` |
| GET | `/api/admin/knowledge/entities` |
| POST | `/api/admin/knowledge/entities` |
| PATCH | `/api/admin/knowledge/entities/:id` |
| POST | `/api/admin/knowledge/entities/sync` |
| GET | `/api/admin/knowledge/entities/sync` |
| GET | `/api/admin/knowledge/entities/sync/runs` |
| GET | `/api/admin/knowledge/entities/unresolved` |
| GET | `/api/admin/knowledge/entities/:id` |
| GET | `/api/admin/knowledge/entities/:id/relations` |
| POST | `/api/admin/knowledge/entities/resolve` |
| POST | `/api/admin/knowledge/entities/check-subjects` |
| GET | `/api/admin/knowledge/world-state/monitoring` |
| GET | `/api/admin/knowledge/world-state/sources` |
| GET | `/api/admin/knowledge/world-state/alerts` |
| GET | `/api/admin/knowledge/world-state/snapshots` |
| GET | `/api/admin/knowledge/world-state/snapshots/:id` |
| GET | `/api/admin/knowledge/world-state/diff` |
| GET | `/api/admin/knowledge/world-state/facts` |
| GET | `/api/admin/knowledge/world-state/stale-facts` |
| POST | `/api/admin/knowledge/world-state/snapshots/generate` |
| POST | `/api/admin/knowledge/world-state/snapshots/register` |
| GET | `/api/admin/knowledge/relations` |
| GET | `/api/admin/knowledge/relations/projections` |
| GET | `/api/admin/knowledge/relations/:relationId` |
| POST | `/api/admin/knowledge/relations` |
| PATCH | `/api/admin/knowledge/relations/:relationId` |
| DELETE | `/api/admin/knowledge/relations/:relationId` |
| POST | `/api/admin/knowledge/relations/reproject` |
| GET | `/api/admin/knowledge/vocabulary/relations` |
| GET | `/api/admin/knowledge/graph/subgraph` |
| POST | `/api/admin/knowledge/graph/path-query` |
| POST | `/api/admin/knowledge/graph/impact-analysis` |
| GET | `/api/admin/knowledge/ontology/overview` |
| GET | `/api/admin/knowledge/ontology/types` |
| GET | `/api/admin/knowledge/ontology/types/:id` |
| GET | `/api/admin/knowledge/ontology/attributes` |
| GET | `/api/admin/knowledge/ontology/attributes/:id` |
| POST | `/api/admin/knowledge/ontology/sync` |
| POST | `/api/admin/knowledge/ontology/export` |
| GET | `/api/admin/knowledge/ontology/export/history` |
| GET | `/api/admin/knowledge/ontology/validate` |
| GET | `/api/admin/knowledge/traveler-context` |
| GET | `/api/admin/knowledge/traveler-context/:tripId` |
| GET | `/api/admin/knowledge/traveler-context/:tripId/diff` |
| GET | `/api/admin/knowledge/decision-cases` |
| GET | `/api/admin/knowledge/decision-cases/:caseId` |
| GET | `/api/admin/knowledge/decision-cases/:caseId/similar` |
| POST | `/api/admin/knowledge/decision-cases/ingest` |
| POST | `/api/admin/knowledge/decision-cases/reproject` |
| GET | `/api/admin/knowledge/overview` |
| GET | `/api/admin/knowledge/documents` |
| GET | `/api/admin/knowledge/documents/:documentId` |
| GET | `/api/admin/knowledge/retrieval-traces` |
