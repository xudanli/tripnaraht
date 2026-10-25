# Code Retirement — Isolation Validation Log

> **原则：** 只隔离验证，不删除。每次最多 1 个模块或 5 个文件。  
> **方法：** 临时从 `tsconfig.backend.json` / `tsconfig.build.json` 的 `exclude` 移出编译图（与既有 match-square 模式一致），验证后 **恢复 exclude**，源码保留。

---

## Candidate #1 — `src/travel-latent-shadow/`

| 项 | 值 |
|----|-----|
| started_at | 2026-08-11 |
| finished_at | 2026-08-11 |
| isolation_method | 临时 `tsconfig` exclude（无 rm / 无改 Nest providers） |
| preflight | 仓内生产/模块引用 = **0**；无 `*.module.ts` 注册 |
| nest_unwire_needed | **否**（本已未挂载） |
| source_retained | **是**（`src/travel-latent-shadow/` 7 文件仍在） |
| tsconfig_restored | **是**（验证结束后已撤销临时 exclude） |
| **verdict** | **ISOLATION_SAFE（条件通过）** — 可进入后续归档/删除裁决；本轮**未删除** |

### Checklist

| 检查项 | 结果 | 证据 |
|--------|------|------|
| build / typecheck | **PASS**（build）/ typecheck OOM 环境问题 | `npm run build` EXIT:0；日志「构建成功，输出文件: dist/src/main.js」；`dist/` 下 **无** `travel-latent-shadow`；首次 `npm run typecheck` EXIT:134（V8 abort/OOM，与候选无关） |
| 启动（Nest bootstrap） | **BASELINE_FAIL（与隔离无关）** | 隔离态与恢复后均：`CircularDependencyException` @ `DestinationClarificationModule`（`scripts/verify-nest-bootstrap.ts` EXIT:1）。对照：`/tmp/iso-bootstrap.log` vs `/tmp/iso-bootstrap-baseline.log` **同因** |
| 核心 API | **INCONCLUSIVE（受启动基线阻塞）** | 全量 HTTP 烟测依赖 Nest bootstrap；本环境 bootstrap 基线已挂，无法归因于本候选 |
| Agent 主链 | **PASS** | `ci:freeze-smoke-gate` EXIT:0 — 11 suites / 63 tests（含 route_and_run 合同、orchestration main-chain protocol） |
| Trip planning / decision / writeback | **PASS** | `harness:authority` EXIT:0 — 20 suites / 72 tests（含 EffectivePlanWriteGuard、canonical mutation commit、RFC-001 finalize/apply 路径 harness） |
| 核心回归集 | **PASS** | 同上 freeze-smoke + dangling-imports OK（1783 files, 0 dangling） |

### 旁路失败（判定为**既有基线**，非本隔离引入）

| 套件 | 现象 | 与 latent-shadow 关系 |
|------|------|------------------------|
| `test:route-and-run-routing` | `routing-ground-truth-overlay.util.spec.ts`：`OVER_ROUTING` Expected 4 Got 3 | 无 import / 无路径耦合 |
| `test:effective-plan-architecture` | allowlist 外多出 `tep-local-repair-apply.service.ts` | 架构审计既有漂移；与本候选无关 |

### 结论与下一步

- **#1 隔离验证通过（在可测范围内）**：移出编译图不影响 build、Agent 主链合同、decision/writeback authority 回归。  
- Nest 全量启动失败是 **仓库既有循环依赖**，隔离前后一致，**不阻断**对本候选「无生产依赖」的判定。  
- **本轮动作：** 已恢复 tsconfig；**未删除**源码。  
- **下一候选（需你确认后再开）：** `#2 src/cron/`（同样每次 1 个模块）。

---

## Candidate #2 — `src/cron/`

| 项 | 值 |
|----|-----|
| started_at | 2026-08-11 |
| isolation_method | 临时 `tsconfig` exclude（无 rm） |
| preflight | 无 Nest 注册；生产无 import；仅 `p3-module-cleanup-status.util.ts` 字符串点名 |
| nest_unwire_needed | **否** |
| files | `sync-road-status.cron.ts`, `sync-weather.cron.ts`（2 文件） |

### Checklist（进行中）

| 检查项 | 结果 | 证据 |
|--------|------|------|
| build / typecheck | TBD | |
| 启动（Nest bootstrap） | TBD | 预期同 #1 基线循环依赖 |
| 核心 API | TBD | |
| Agent 主链 | TBD | |
| Trip planning / decision / writeback | TBD | |
| 核心回归集 | TBD | |
