# Phase 4b 合入 — GitHub PR 描述模板

复制下方对应区块到 GitHub PR 页面（本文件随 `chore/internal-architecture-docs` 进库）。

---

## PR 1：Phase 4b 主线

**分支：** `feat/orchestration-phase-4b-routing-shell`  
**新建 PR：** https://github.com/xudanli/tripnaraht/pull/new/feat/orchestration-phase-4b-routing-shell

**标题：**

```
feat(orchestration): Phase 4b routing shell — post_plan out, L1 smoke gate
```

**描述：**

```markdown
## Summary

本 PR 彻底完成了对 `claude-orchestrator.service.ts` 大单体的物理剥离（Phase 4b），将核心执行治理完全让渡给独立的 Executor 与声明式图节点控制器。编排核心退化为清爽的 **Routing Shell**，职责单一、边界清晰。

## Key Changes

- **pre_plan 声明式管道：** `intake`, `state_update`, `research`, `poi_selection`, `gate_eval`, `context_build` 六大阶段 100% 实现 Host 隔离与节点委派。
- **plan-verify 状态机：** 引入不变量递减的瞬态预算机制，彻底收拢局部死锁、重试计数与 `REPAIR` / `OPTIMIZE` 执行体。
- **post_plan 全子图：** `NARRATE` / `FEEDBACK` / `hallucination` 迁出至 `src/agent/orchestration/post-plan/`（executor + `nodes/*.node`）。
- **双层守卫自动化门禁：** 沉淀 L1 Smoke Gate，在严格边界审计（`STRICT=1`）与故障触发式黑匣子（`on-failure`）常驻高压下对齐指纹。

## Verification Metrics

- **验证命令：** `ORCHESTRATOR_CONTEXT_LINT_STRICT=1 HARNESS_TRACE_MODE=on-failure npm run harness:l1-smoke`
- **指纹基线（零漂移）：** `0537ff978954174142a770d18fbadddaad23743b3850b82c9d224fbaf9b965cf`
- **执行时间：** ~26s（Exit Code: 0）

## Test plan

- [x] `npm run harness:l1-smoke`（STRICT=1, on-failure）
- [x] `plan-verify-loop.runner.spec.ts`
- [x] `post-plan` unit specs + `claude-orchestrator.decision-replay-wiring.spec.ts`

## Notes

- 路径 2（plan_gen / verify 薄包装拓扑美化）留待后续独立 PR。
- Trip 6.x / hiking 等沙箱改动未包含在本 PR。
```

---

## PR 2：架构资产留档

**分支：** `chore/internal-architecture-docs`  
**新建 PR：** https://github.com/xudanli/tripnaraht/pull/new/chore/internal-architecture-docs

**标题：**

```
chore(docs): establish internal-docs for 1.x harness & orchestrator architecture
```

**描述：**

```markdown
## Summary

为防止团队核心设计资产发生「信息断层」，建立不受全局 `docs/` 忽略限制的 `internal-docs/` 常态跟踪目录。

## Assets Archived

- `internal-docs/orchestration/harness-1x-roadmap.md`：沉淀 1.x 演进的四梯队依赖栈，以及 `HARNESS_TRACE_MODE=on-failure` 故障拦截与逆向黑匣子轨迹合成的详细设计草案。
- `internal-docs/orchestration/orchestrator-graph-refactor-backlog.md`：同步更新 §10/§11 对照表，将 `RETURN_TO_RESEARCH` 及 Phase 4b 节点委派状态修正为【已全面落地接入主链路】。

## Convention

- 团队共享架构文档请编辑 **`internal-docs/`**；本地草稿可继续使用被 gitignore 的 `docs/`。
```

**建议合并顺序：** 先 PR 1，再 PR 2（无代码冲突，可并行 Review）。
