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

Edit **`internal-docs/`** when changes should ship with the repo; keep ephemeral notes under `docs/`.
