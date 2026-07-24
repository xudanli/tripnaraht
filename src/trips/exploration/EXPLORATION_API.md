# Exploration Consumer API

**Base URL:** `/api/exploration`  
**Research:** `/api/research`  
**鉴权:** `Authorization: Bearer <JWT>`  
**PRD:** [prd-exploration-reliability-closure-v1.1.md](../../../internal-docs/exploration/prd-exploration-reliability-closure-v1.1.md)  
**前端集成:** [frontend-integration-guide.md](../../../internal-docs/exploration/frontend-integration-guide.md)  
**E2E Checklist:** [frontend-e2e-checklist.md](../../../internal-docs/exploration/frontend-e2e-checklist.md)  
**页面骨架:** [frontend-routes-scaffold.md](../../../internal-docs/exploration/frontend-routes-scaffold.md)  
**TS Client:** [frontend-exploration-api-client.ts](./dto/frontend-exploration-api-client.ts)  
**Ontology 前端接入（NEW）：** [frontend-ontology-integration-guide.md](../../../internal-docs/exploration/frontend-ontology-integration-guide.md)

## 当前 MVP 范围

**本阶段交付（P0）：** 探索流程 · 可靠性闭环 · Travel Ontology 约束投影 · Travel Context 读模型。**不含 Sprint 4B 支付。**

| 能力 | MVP | 说明 |
|------|-----|------|
| check → issues → apply → revalidate | ✅ | 含 `ontologyIssueCount` / `blockerIssueCount` |
| Travel Context views | ✅ | `feasibility` / `exploration` 含 `ontologyConstraints` |
| Sprint 4A commitments（NOTIFY_ME / SELF_CHECK） | ✅ | 非支付，留资/承诺 |
| Sprint 4B 订金 / Stripe / price-lock | ❌ 默认关闭 | 见下文「支付与价格锁定（条件触发）」 |

## 环境 Gate

- `DECISION_GATEWAY_UNIFIED=1` — 可靠性闭环必需
- `EXPLORATION_CONSUMER_MVP_ENABLED=1` — Consumer 探索管线
- `EXPLORATION_AI_ROUTE_GENERATION=1` — AI 路线个性化（Phase 1）
- `EXPLORATION_ROUTE_GENERATION_MODE` — `STATIC` \| `PERSONALIZED` \| `ENGINE`（默认：开 AI flag 时为 PERSONALIZED）
- `MAPBOX_ACCESS_TOKEN` — ENGINE 模式贴路几何（Phase 2）
- 数据库迁移：`npx prisma migrate deploy`（含 `20260705120000_exploration_route_generation`、`20260705140000_canonical_poi_resolution`）
- Redis — Check job 跨 Pod 持久化（Sprint 5）；不可用时单 Pod 内存降级
- `CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED` + `CONSTRAINT_GATEWAY_ON_SCENARIOS=iceland-ontology-vehicle-route,iceland-ontology-insurance-entry,...` — Iceland Ontology 约束 Gateway 灰度（staging）

**以下仅 Sprint 4B 条件触发（当前 MVP 不接）：**

- `RESEARCH_PAYMENT_COMMITMENT_ENABLED=1` — 订金 / 价格锁定
- `STRIPE_SECRET_KEY` — 真实 Stripe；缺省可沙箱

### Travel Context Protocol（RFC-003 Phase 0–6）

探索场景 **`contextId === scenarioId`**（materialize 后不变）。

| 方法 | 路径 |
|------|------|
| GET | `/travel-contexts/resolve/by-trip/:tripId` |
| GET | `/travel-contexts/:contextId` |
| GET | `/travel-contexts/:contextId/views` |
| GET | `/travel-contexts/:contextId/views/overview` |
| GET | `/travel-contexts/:contextId/views/exploration` |
| GET | `/travel-contexts/:contextId/views/plan` |
| GET | `/travel-contexts/:contextId/views/decisions` |
| GET | `/travel-contexts/:contextId/views/monitoring` |
| GET | `/travel-contexts/:contextId/views/participants` |
| GET | `/travel-contexts/:contextId/views/feasibility` |
| GET | `/travel-contexts/:contextId/views/assistant` |
| **POST** | **`/travel-contexts/:contextId/intents`** — 唯一写路径；需 `basedOnRevision`；冲突 **409 `REVISION_CONFLICT`** |
| GET | `/travel-contexts/:contextId/diff?sinceRevision=N` — revision 增量 diff |
| GET | `/travel-contexts/:contextId/events` — SSE `CONTEXT_REVISION_CHANGED`（Bearer auth via fetch stream） |

**V1 Intent 类型（首批）：** `CHANGE_EXPLORATION_CONDITIONS` · `SET_PRINCIPLES` · `GENERATE_CANDIDATES` · `SELECT_ROUTE` · `MATERIALIZE_TRIP` · `RUN_FEASIBILITY_CHECK` · `ACCEPT_DECISION_OPTION` · `APPLY_DECISION`

Exploration REST **保留**为 adapter；内部可转发 Intent，对外逐步 deprecate。

**Phase 4 — Materialize 连续性：** `materializeShell` 与 `selectRoute` / `savePrinciples` 会将 `explorationArchive` 写入 `trip.metadata.travelContext`；Travel Context snapshot 优先从 trip metadata 读取 archive。

**Phase 5 — Diff + SSE：** Intent 成功后写入 revision journal 并推送 SSE；客户端 `fetchDiff(sinceRevision)` 或 `subscribeRevisionEvents()` 做局部 invalidate。

**Phase 6 — Agent 绑定：** `POST /context/build` 支持 `contextId` / `revision` / `includeDomains`；注入 `TRAVEL_CONTEXT` block；`metadata.travelContextGrounding` 含 `{ contextId, snapshotId, revision }`。

**前端 Client：** [travel-context-api-client.ts](../../travel-context/client/travel-context-api-client.ts) · [travel-context-provider.ts](../../travel-context/client/travel-context-provider.ts)

文档：[rfc-travel-context-protocol-v1.md](../../../internal-docs/product/rfc-travel-context-protocol-v1.md)

---

## 已交付 API

### 探索流程（Sprint 0.5–3 + 5）

| 方法 | 路径 |
|------|------|
| GET | `/conditions/catalog` |
| POST | `/scenarios` |
| GET | `/scenarios/:id` |
| PATCH | `/scenarios/:id/conditions` | DRAFT 或 MATERIALIZED（未选路）；同步 Trip + invalidate 候选 |
| POST | `/scenarios/:id/materialize` |
| GET | `/principles/catalog` |
| PUT | `/scenarios/:id/principles` |
| POST | `/scenarios/:id/principles/summary` | 原则页智能总结预览（不落库） |
| POST | `/scenarios/:id/candidates` |
| POST | `/scenarios/:id/candidates/regenerate` |
| GET | `/scenarios/:id/routes/:routeId` |
| GET | `/scenarios/:id/candidates/compare` |
| POST | `/scenarios/:id/selections` |
| POST | `/scenarios/:id/check` |
| GET | `/check-jobs/:jobId` |
| GET | `/scenarios/:id/issues` |
| GET | `/scenarios/:id/issues/:issueId/options` |
| POST | `/scenarios/:id/decisions/:problemId/submit` |
| POST | `/scenarios/:id/decisions/:problemId/apply` |
| POST | `/scenarios/:id/revalidate` |

**Sprint 5：** `POST /check` 创建的 job 经 `CacheService` → Redis 持久化（TTL 默认 24h，`EXPLORATION_CHECK_JOB_TTL_SEC` 可配）。

### AI 路线生成（Phase 1–2）

| 响应字段 | 说明 |
|----------|------|
| `generationMode` | `STATIC` \| `PERSONALIZED` \| `ENGINE` |
| `candidates[].generationSource` | `STATIC_CATALOG` \| `PERSONALIZED` \| `ENGINE_MAPBOX` \| `LLM` |
| `candidates[].resolvedPois` | CPRE 解析结果 — **始终存在**（可为 `[]`）— `{ name, resolved, poiId?, confidence?, status? }` |
| `POST .../check` → `job.result` | 含 `verdictStatus`、`totalIssueCount`、`feasibilitySummary`、`unresolvedPoiCount`、`ontologyIssueCount`、`blockerIssueCount`、`diagnosis` |
| CPRE 未确认 POI | 经 `ExplorationPoiIssueBridgeService` 并入 `issues.totalIssueCount`（`issueId` 前缀 `cpre-poi-`） |
| Travel Ontology 约束 | 经 `ExplorationOntologyIssuesBridgeService` 只读 Trip Snapshot 投影（`issueId` 前缀 `ontology:`）；`issues.ontologyIssueCount` / `blockerIssueCount` 含全量计数（不受 displayPolicy 截断） |
| Materialize → 入境事实 | 冰岛目的地物化后写入 entry eligibility facts；国籍优先 `UserProfile.preferences.nationality`，缺省 CN |
| Materialize / 条件 PATCH → 保险事实 | `insuranceContext.coverageTier`（`BASIC` / `STANDARD` / `FULL` / `UNKNOWN`）→ `InsurancePolicy` facts；catalog 见 `GET /conditions/catalog` → `insuranceTiers` |
| Materialize / 条件 PATCH → 租车合同事实 | `rentalContext`（`pickupLocation` / `pickupTimeLocal` / `afterHoursPickupConfirmed`）+ `mobilityContext.vehicleType` → `RentalContract` / `Flight` facts；2WD 默认 `F_ROAD` 禁止 |
| `GET .../issues` 响应 | `ontologyIssueCount`、`blockerIssueCount` 与 `gatewayIssueCount`、`unresolvedPoiIssueCount` 并列 |
| Travel Context `views/exploration` | 含 `planExecutability`、`ontologyConstraints`、`ontologyIssueCount`、`ontologyBlockerCount` |
| Travel Context `views/feasibility` | 含 `ontologyConstraints`（Snapshot SSOT 摘要） |
| `candidatesStatus.status` | `EMPTY` \| `READY` \| `STALE` \| `SELECTED`（GET scenario / PUT principles） |

**Regenerate 流程：** 原则变更 → DRAFT 候选归档 → `STALE` → `POST .../candidates/regenerate`

### 原则页智能总结

| 方法 | 路径 |
|------|------|
| POST | `/scenarios/:id/principles/summary` |

- Request body 与 `PUT .../principles` 同构（`principles[]` 预览，**不落库**）
- `principles: []` → `{ summary: null, placeholder: "请选择最多 3 项…" }`
- 1–3 项合法原则 → `{ summary, highlights?, source: "RULES" \| "LLM", generatedAt }`
- 非法原则 / rank → `400 INVALID_PRINCIPLES`
- Scenario `COMPLETED` / `ABANDONED` → `409 SCENARIO_LOCKED`
- Feature 未开 → `503 SUMMARY_UNAVAILABLE`

Env：`EXPLORATION_PRINCIPLE_SUMMARY=1`（默认随 `EXPLORATION_CONSUMER_MVP_ENABLED`）；`EXPLORATION_LLM_PRINCIPLE_SUMMARY_LIVE=1` 启用 DeepSeek。

**TS Client：** `previewPrinciplesSummary(token, scenarioId, principles)`

**TS Client 辅助：** [frontend-exploration-api.helpers.ts](./dto/frontend-exploration-api.helpers.ts) — badge / 文案 / `ensureFreshCandidates()` / **`getPoiResolutionBadge()`**（CPRE POI 验证态）

**CPRE 设计文档：** [prd-cpre-v1.md](../../../internal-docs/product/prd-cpre-v1.md)

### 商品包装与承诺（Sprint 4A）

| 方法 | 路径 |
|------|------|
| GET | `/scenarios/:id/continue/packages` |
| POST | `/scenarios/:id/continue/feedback` |
| POST | `/research/sessions/:sessionId/commitments` |
| POST | `/research/sessions/:sessionId/events/batch` |

### 支付与价格锁定（Sprint 4B · 条件触发 · 当前 MVP 不接）

需 `RESEARCH_PAYMENT_COMMITMENT_ENABLED=1` 且产品明确开启 4B。

| 方法 | 路径 |
|------|------|
| GET | `/research/payments/catalog` |
| POST | `/research/sessions/:sessionId/payments/deposit/start` |
| POST | `/research/sessions/:sessionId/payments/deposit/confirm` |
| GET | `/research/sessions/:sessionId/payments/deposit/status` |
| POST | `/research/sessions/:sessionId/payments/deposit/refund` |
| POST | `/research/sessions/:sessionId/price-lock` |

---

## 完整流程

```text
POST /scenarios → principles → candidates → selections
  → check → [poll check-jobs] → issues → options → submit → apply → revalidate
  → GET /continue/packages → POST /continue/feedback
  → POST /research/sessions/:id/commitments  (NOTIFY_ME / SELF_CHECK)
  → [4B 可选] deposit/start → Stripe → deposit/confirm → refund
  → [4B 可选] price-lock
```
