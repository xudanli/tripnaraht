# Internal architecture docs (version-controlled)

Repository root `docs/` is gitignored for local scratch notes. **Team-canonical** design docs live here.

| Path | Purpose |
|------|---------|
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

Edit **`internal-docs/`** when changes should ship with the repo; keep ephemeral notes under `docs/`.
