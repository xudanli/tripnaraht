# Context Lint 生产 Runbook（Control / State）

> **Companion**：[harness-production-checklist.md](./harness-production-checklist.md) §3.3 · [harness-quality-loop-runbook.md](./harness-quality-loop-runbook.md)

## 1. 语义

| 变量 | 作用 |
|------|------|
| `ORCHESTRATOR_CONTEXT_LINT_ENABLED=1` | Kernel 各 `execute*` 前审计 DSO / request 边界 |
| `ORCHESTRATOR_CONTEXT_LINT_STRICT=1` | 违规 **抛错**（非 warn） |
| `ORCHESTRATOR_CONTEXT_LINT_MAX_BYTES` | 可见载荷 size guard（默认 100KB） |

源码：`OrchestratorContextLintService` · `DecisionKernelService.runContextLintBeforePhase`

## 2. 推荐 rollout

### Staging（先 warn 等价于 ENABLED without STRICT）

```bash
ORCHESTRATOR_CONTEXT_LINT_ENABLED=1
# 观察日志 3–7 天后再开 STRICT
```

### 生产（与 L1 / quality loop 对齐）

```bash
ORCHESTRATOR_CONTEXT_LINT_ENABLED=1
ORCHESTRATOR_CONTEXT_LINT_STRICT=1
```

发版前本地/CI：

```bash
ORCHESTRATOR_CONTEXT_LINT_STRICT=1 HARNESS_TRACE_MODE=on-failure npm run harness:l1-smoke
npm run harness:quality-loop
```

## 3. 验收

Admin：

```bash
tripnara harness quality status --token "$ADMIN_DIAGNOSTICS_TOKEN"
# quality_loop.context_lint_enabled=true context_lint_strict=true
```

## 4. 回滚

去掉 `ORCHESTRATOR_CONTEXT_LINT_STRICT`（或两者皆关）并滚动重启；主链恢复 warn-only / 关闭审计。

## 5. 与 Agentic loop

Context Lint 覆盖 **Kernel phase** 入口；Agentic fast path 若绕过 Kernel 仍可能堆 prompt — 见 checklist §2.1 已知 gap。

---

*维护：新增 DSO 顶层字段或旁路 key 时同步更新 `DSO_TOP_LEVEL_ALLOWLIST` / `FORBIDDEN_TRANSIENT_REQUEST_KEYS`。*
