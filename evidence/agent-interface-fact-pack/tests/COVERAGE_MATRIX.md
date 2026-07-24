# 关键测试覆盖矩阵（证据会话）

**审查基线：** `a7e9bdca588431143e04e98d7c1c1204299c6e54`  
**主结果文件：** `jest-results-stable.json`（29 suites passed / 1 failed；177 passed / 6 failed / 183 total）  
**补充宽跑：** `jest-results.json`（含 DI 缺失等失败，见下文「未纳入绿测」）

图例：`PASS` = 本会话绿测可复核；`FAIL` = 本会话失败（如实记录）；`PARTIAL` = 相关测例通过但目标接口无专测或写回被 seal 挡住；`CODE_ONLY` = 代码/契约存在但无专测绿证。

| 要求场景 | 状态 | 证据用例（相对仓库根） | 备注 |
|----------|------|------------------------|------|
| route_and_run 主链 | PASS | `src/agent/contracts/claude-exec-route-and-run.contract.spec.ts`, `src/agent/agent.controller.ao-p0.contract.spec.ts`, `src/agent/contracts/p1-route-and-run-validators.spec.ts` | Controller/契约层；全量 Nest DI 集成见宽跑 FAIL |
| GATE BLOCK | PASS | `src/agent/orchestration/graph/nodes/gate-eval.node.spec.ts`, `src/agent/execution/gate-eval-executor.service.spec.ts`, `src/agent/contracts/gate-verify-corridor-audit.matrix.spec.ts` | 主链 GATE BLOCK → `terminal_blocked` / 不进 PLAN_GEN；矩阵保持独立走廊 `needs_audit` |
| VERIFY fatal | PASS | `src/decision/kernel/decision-kernel.verify-repair-loop.spec.ts`, `src/agent/services/guardians-debate.service.spec.ts` | Kernel VERIFY/REPAIR；fatal 判定 |
| flawed draft 显式 opt-in | PASS | `src/agent/orchestration/plan-verify-loop/plan-verify-loop-repair-guards.spec.ts`, `plan-verify-loop.runner.spec.ts` | 仅 `allow_flawed_draft_narrate===true` |
| flawed 禁止 AUTO | PASS | `src/agent/utils/itinerary-adjust-flawed-auto-block.util.spec.ts`, `src/agent/delivery/types/delivery-verdict.types.spec.ts`, `trusted-delivery.project.util.spec.ts` | `FLAWED_DRAFT` + AUTO block reason |
| Iceland Confirm / Apply | PASS | `iceland-initial-plan-preview.service.spec.ts`, `iceland-initial-plan-prisma-apply.service.spec.ts`, `iceland-initial-plan-preview.client.spec.ts` | Confirm→canApply；Prisma Apply |
| Arrange Apply 禁止 shadowChanges | PASS | `src/decision-runtime/solver/lab/ortools-planning-shadow-apply.guard.spec.ts` | `selectAuthoritativePlanProposalChanges` 只用 `proposal.changes` |
| Proposal stale / context conflict | PASS | `src/trips/tep/utils/tep-repair-stale-guard.util.spec.ts`, `mobile-spatial-route.service.spec.ts`（ifMatch conflict）, `iceland-shadow-vs-platform-contrast.service.spec.ts` | 宽跑中 `phase2-stale-concurrency.e2e` 因 mock 缺方法 FAIL，不计入绿测 |
| Actions 幂等 | PASS | `src/agent/actions.controller.integration.spec.ts`, `src/harness/evals/authority/au-p1-004-idempotency.spec.ts` | |
| Mobile Verified Apply | PARTIAL | `src/mobile/utils/in-trip-home.projection.util.spec.ts`, `mobile-spatial-route.service.spec.ts`, `mobile-planning.service.spec.ts` | 存在 `POST .../verified-proposals/:id/apply`；**无** `applyVerifiedProposal` 专测绿证；相关 apply/idempotency/ifMatch 绿测可复核 |
| TEP Repair Apply | PARTIAL | PASS: `src/skills/itinerary/repair-apply.skill.spec.ts`, `tep-repair-stale-guard.util.spec.ts`；FAIL: `is-cert-writeback.integration.spec.ts`（6） | 失败原因：`FAILED_SAFE: missing assessmentId for effective write (caller=tep-local-repair-apply.setEffective)` — **不**改标为已安全 |

## 宽跑未纳入绿测（`jest-results.json`）

| 套件 | 失败原因（摘要） |
|------|------------------|
| `claude-orchestrator.gate-eval-step.spec.ts` 等 | Nest DI：缺少 `ContextSlidingWindowAdapter` |
| `agent.service.route-and-run-ao-p0.integration.spec.ts` | Nest DI：AgentService 依赖未解析 |
| `agent.route-and-run.phase2-stale-concurrency.e2e.spec.ts` | mock 缺 `scheduleEpisodicSummarizerAfterRouteAndRun` |
| `ontology-gate1-canonical-apply.spec.ts` | Ontology authority seal / Gate1 环境条件 |
| `tep-local-repair-apply.service.spec.ts` | 同上 `missing assessmentId` seal |

## `needs_audit` 声明

`src/agent/contracts/gate-verify-corridor-audit.matrix.ts` 与 `writeback-corridor-audit.matrix.ts` 中标注为 `needs_audit` 的走廊**保持原状态**；本会话测试通过**不**构成将这些走廊升级为“已安全/proven”的证据。
