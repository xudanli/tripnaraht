# Internal architecture docs (version-controlled)

Repository root `docs/` is gitignored for local scratch notes. **Team-canonical** design docs live here.

| Path | Purpose |
|------|---------|
| [product/TRIPNARA_AI_NATIVE_POSITIONING.md](./product/TRIPNARA_AI_NATIVE_POSITIONING.md) | **AI Native 产品定位 SSOT** — 四阶段、收敛战略、核心指标、与 Roadmap 对齐 |
| [product/travel-ontology-world-model-v1.md](./product/travel-ontology-world-model-v1.md) | **旅行本体与世界模型 SSOT** — Ontology / World Model / Destination Pack / Harness 场景 |
| [product/travel-ontology-world-model-p0-gap-backlog.md](./product/travel-ontology-world-model-p0-gap-backlog.md) | **冰岛 P0 差距清单** — 十二领域对照代码的可执行 backlog |
| [product/rfc-travel-context-protocol-v1.md](./product/rfc-travel-context-protocol-v1.md) | **RFC-003 Travel Context Protocol** — Snapshot / Intent / Revision / Harness |
| [product/prd-cpre-v1.md](./product/prd-cpre-v1.md) | **CPRE V1.0** — Canonical POI Resolution Engine PRD + API 契约 + P0 冰岛 seed |
| [orchestration/harness-1x-roadmap.md](./orchestration/harness-1x-roadmap.md) | Post-freeze four-tier Harness evolution, trace modes, L1 smoke |
| [orchestration/harness-architecture-map.md](./orchestration/harness-architecture-map.md) | Module dependency + env var map (mermaid) |
| [orchestration/harness-architecture-map.md](./orchestration/harness-architecture-map.md) | **Module dependency + environment variable map** (companion diagram) |
| [orchestration/orchestrator-graph-refactor-backlog.md](./orchestration/orchestrator-graph-refactor-backlog.md) | Graph node/edge catalog, Phase 1–4b backlog |
| [agent/route-and-run-sse-rollout.md](./agent/route-and-run-sse-rollout.md) | **编排 SSE + Event Bus**：多 Pod 部署、Staging AC、排障、PR 模板 |
| [agent/route-and-run-sse-frontend-guide.md](./agent/route-and-run-sse-frontend-guide.md) | **前端集成**：async + EventSource/fetch SSE、类型、Hook、兜底轮询 |
| [agent/pa-context-memory-p0.md](./agent/pa-context-memory-p0.md) | **PA 多轮上下文 P0**：Redis `pa_conversation:*`、route_and_run 桥接、Staging 验收与排障 |
| [agent/context-sliding-window-adapter-p1.md](./agent/context-sliding-window-adapter-p1.md) | **P1 设计（待实现）**：`ContextSlidingWindowAdapter`、Consumer Profile、迁移清单 |
| [odyssey-intake/frontend-integration-guide.md](./odyssey-intake/frontend-integration-guide.md) | **Odyssey Intake 前端集成**：旅行人格卡片、5 题测评、旅伴匹配 API 契约 |
| [odyssey-intake/prd-3.1.3-asset-verification-privacy.md](./odyssey-intake/prd-3.1.3-asset-verification-privacy.md) | **PRD 3.1.3**：学信网/企业邮箱/OCR/OAuth 授信闭环与隐私脱敏规范 |
| [odyssey-intake/credential-gateway-production.md](./odyssey-intake/credential-gateway-production.md) | **生产对接**：合规网关 URL、HTTP 契约、环境变量 |
| [match-square/structural-match-engine.md](./match-square/structural-match-engine.md) | **Match Engine v2**：Graph Clustering + CSP 双层撮合算法 |
| [match-square/frontend-integration-guide.md](./match-square/frontend-integration-guide.md) | **Match Square 前端集成**：搭子广场、招募帖、申请审批 API 契约 |
| [reputation-os/frontend-integration-guide.md](./reputation-os/frontend-integration-guide.md) | **Reputation OS 前端集成**：行后 48h 五星互评、信用资产、安全预警 |
| [match-learning/frontend-integration-guide.md](./match-learning/frontend-integration-guide.md) | **Match Learning P3**：每周 Soft Weights 自迭代、运维 API |
| [exploration/prd-exploration-reliability-closure-v1.1.md](./exploration/prd-exploration-reliability-closure-v1.1.md) | **探索规划与可靠性决策闭环 PRD V1.1** |
| [exploration/frontend-integration-guide.md](./exploration/frontend-integration-guide.md) | **Exploration 前端集成** — Hub ①「告诉 AI 我想去哪」 |
| [exploration/frontend-cpre-integration-guide.md](./exploration/frontend-cpre-integration-guide.md) | **CPRE POI 解析前端集成** — Compare chips / 确认 / Evidence |
| [exploration/frontend-routes-scaffold.md](./exploration/frontend-routes-scaffold.md) | **Exploration 页面路由与组件骨架** |
| [exploration/frontend-e2e-checklist.md](./exploration/frontend-e2e-checklist.md) | **Exploration 端到端对接 Checklist**（联调 / QA） |
| [exploration/user-configurable-conditions-backend.md](./exploration/user-configurable-conditions-backend.md) | **用户可配置旅行条件** — Consumer / Research 模式 API |
| [../src/trips/exploration/EXPLORATION_API.md](../src/trips/exploration/EXPLORATION_API.md) | **Exploration API 清单**（含 Sprint 4A–5） |

Edit **`internal-docs/`** when changes should ship with the repo; keep ephemeral notes under `docs/`.
