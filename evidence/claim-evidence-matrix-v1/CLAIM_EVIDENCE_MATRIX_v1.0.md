# CLAIM_EVIDENCE_MATRIX v1.0（签署版）

**Freeze Commit:** `a7e9bdca588431143e04e98d7c1c1204299c6e54`  
**Generated (UTC):** 2026-07-24T07:39:02Z  
**Schema:** `CLAIM_EVIDENCE_MATRIX` `1.0`  

## Baseline scope decision

See `BASELINE_SCOPE_DECISION.md` and `SIGNATURES.md`.

- **Retain** freeze `a7e9bdca588431143e04e98d7c1c1204299c6e54` (do not regenerate Matrix this cycle).
- Iceland Confirm/Apply & Mobile Verified Apply **implementations**: **out of scope** (C010b / C015).
- Matrix Claim IDs **supersede** prior conflicting “已接入” narratives.
- **C018 classification:** 基线不完整 (dangling-import code manifestation).
- EL / TA / QA: **APPROVE** Matrix + **AFFIRM** baseline retention.
- R&D fact layer: **FROZEN**.

## 使用边界

- 本文件只含**机器可复核代码事实**。
- 研究机构**只能引用 Claim ID** 做架构判断；不得自行生成代码路径、代码片段或测试结果。
- 禁止内容：架构评分、漏洞推断、P0/P1 建议、目标方案。
- Candidate 政策：C001–C017 treated as candidates: rewritten/split/extended (C001b,C010b,C018–C020) from reverse extraction at freeze commit.

## 首页限定（继承事实材料）

1. 部分走廊存在局部 contextVersion/hash，**无全系统统一 contextHash**。
2. 页面调用关系来自后端契约/handoff，**不能替代** Web/iOS 客户端源码审查。

## 测试批次

| 字段 | 值 |
|------|-----|
| suite exit_code | `1` |
| suites | 20 passed / 1 failed |
| tests | 113 passed / 0 failed |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |
| console_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.console.txt` |
| worktree_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |

<details><summary>repro_cmd</summary>

```bash
git worktree add --detach /tmp/claim-matrix-a7e9bdca5 a7e9bdca588431143e04e98d7c1c1204299c6e54 && cd /tmp/claim-matrix-a7e9bdca5 && ln -sfn /home/devbox/project/node_modules node_modules && LLM_USE_MOCK=true npx jest --runInBand --forceExit --ci --json --outputFile=/home/devbox/project/evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json src/agent/orchestration/orchestration-main-chain-protocol.contract.spec.ts src/agent/orchestration/graph/nodes/gate-eval.node.spec.ts src/agent/execution/gate-eval-executor.service.spec.ts src/agent/orchestration/plan-verify-loop/plan-verify-loop-repair-guards.spec.ts src/agent/utils/itinerary-adjust-flawed-auto-block.util.spec.ts src/agent/delivery/types/delivery-verdict.types.spec.ts src/agent/delivery/utils/trusted-delivery.project.util.spec.ts src/agent/delivery/trusted-delivery-consumption.contract.spec.ts src/agent/contracts/auto-corridor-product.contract.spec.ts src/agent/contracts/gate-verify-corridor-audit.matrix.spec.ts src/agent/contracts/writeback-corridor-audit.matrix.spec.ts src/agent/contracts/claude-exec-route-and-run.contract.spec.ts src/agent/agent.controller.ao-p0.contract.spec.ts src/decision-runtime/solver/lab/ortools-planning-shadow-apply.guard.spec.ts src/trips/tep/utils/tep-repair-stale-guard.util.spec.ts src/trips/tep/services/tep-local-repair-apply.service.spec.ts src/skills/itinerary/repair-apply.skill.spec.ts src/agent/actions.controller.integration.spec.ts src/harness/evals/authority/au-p1-004-idempotency.spec.ts src/decision/kernel/decision-kernel.verify-repair-loop.spec.ts src/agent/utils/itinerary-adjust-auto-apply.util.spec.ts
```

</details>

## Claims

### C001 — `main_entry` — **FAIL**

AgentController exposes @Post("route_and_run") which invokes agentService.routeAndRun; with global prefix api the HTTP path is POST /api/agent/route_and_run.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/agent.controller.ts` |
| blob_sha[0] | `6e784105491de4251b0e095ff55e4ae38fa96d76` |
| symbols[0] | `AgentController.routeAndRun, @Post('route_and_run')` |
| lines[0] | `221-345` |
| path[1] | `src/main.ts` |
| blob_sha[1] | `e068a576e90d551326775fa50974ac5afca2ce0f` |
| symbols[1] | `app.setGlobalPrefix('api')` |
| lines[1] | `95-95` |
| test_file | `src/agent/agent.controller.ao-p0.contract.spec.ts` |
| test_names | [] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |
| notes | Suite failed to load at freeze commit: route-and-run-trip-id-merge.util.ts imports missing iceland-self-drive util (see C018). Contract file claude-exec-route-and-run.contract.spec.ts PASSED independently. |

### C001b — `main_entry` — **PASS**

Claude-exec route_and_run contract validators/fixtures for CLAUDE_SM assembly exist and pass at freeze commit without loading AgentController.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/contracts/claude-exec-route-and-run.contract.spec.ts` |
| blob_sha[0] | `bfb83468676a69b620a1aa85bb7ba63ffc1237e6` |
| symbols[0] | `claude-exec-route-and-run.contract.spec` |
| lines[0] | `1-end` |
| test_file | `src/agent/contracts/claude-exec-route-and-run.contract.spec.ts` |
| test_names | ['(16 tests in suite)'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |
| notes | Suite exit aggregated; this suite status=passed in claim-matrix-jest.json |

### C002 — `state_machine` — **PASS**

MAIN_CHAIN_PRE_PLAN_NODES order is intake→state_update→research→poi_selection→gate_eval→context_build; MAIN_CHAIN_PLAN_GEN_NODE is plan_gen after pre_plan; MAIN_CHAIN_SHORT_CIRCUITS gate_block summarizes GATE BLOCK → 禁止 PLAN_GEN.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/orchestration/orchestration-main-chain-protocol.constants.ts` |
| blob_sha[0] | `09fd12ce184cd1da35e7ee10f375ffdaccd96d38` |
| symbols[0] | `MAIN_CHAIN_PRE_PLAN_NODES, MAIN_CHAIN_PLAN_GEN_NODE, MAIN_CHAIN_SHORT_CIRCUITS[id=gate_block]` |
| lines[0] | `14-24;94-98` |
| test_file | `src/agent/orchestration/orchestration-main-chain-protocol.contract.spec.ts` |
| test_names | ['pre_plan order matches runner PRE_PLAN_NODE_ORDER', 'static edges cover pre_plan happy path and post_plan'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

### C003 — `state_machine` — **PASS**

When host.isGateBlocked(state) is true, runGateEvalPrePlanSegment returns prePlanTerminal terminal_blocked.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/orchestration/graph/nodes/gate-eval.node.ts` |
| blob_sha[0] | `99be9960b158a5d97572bfb1727e5a49626544ab` |
| symbols[0] | `runGateEvalPrePlanSegment, prePlanTerminal('terminal_blocked')` |
| lines[0] | `71-77` |
| test_file | `src/agent/orchestration/graph/nodes/gate-eval.node.spec.ts` |
| test_names | ['returns terminal_blocked when gate is BLOCK'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

### C004 — `core_dto` — **CODE_ONLY**

RouteAndRunOptionsDto declares allow_flawed_draft_narrate?: boolean and execution_mode enum ADVICE_ONLY|SEMI_AUTO|AUTO with default ADVICE_ONLY.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/dto/route-and-run.dto.ts` |
| blob_sha[0] | `e0bb0236d0fde22af2675cb5befb1c3d482fd28e` |
| symbols[0] | `RouteAndRunOptionsDto.allow_flawed_draft_narrate, RouteAndRunOptionsDto.execution_mode` |
| lines[0] | `375-383;441-449` |
| test_file | `None` |
| test_names | [] |
| exit_code | `None` |
| result_file | `None` |
| notes | No dedicated DTO unit spec at freeze commit; field presence verified by blob lines. |

### C005 — `delivery_status` — **PASS**

resolveDeliveryVerdict returns FLAWED_DRAFT when flawedDraft.is_flawed is true (ahead of OK); DELIVERY_VERDICTS includes FLAWED_DRAFT.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/delivery/types/delivery-verdict.types.ts` |
| blob_sha[0] | `025ac75debd92afcb8659379521a996819613ea5` |
| symbols[0] | `DELIVERY_VERDICTS, resolveDeliveryVerdict` |
| lines[0] | `8-14;29-49` |
| test_file | `src/agent/delivery/types/delivery-verdict.types.spec.ts` |
| test_names | ['maps flawed draft ahead of OK'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

### C006 — `delivery_status` — **PASS**

projectTrustedDeliveryV1 projects delivery_verdict including FLAWED_DRAFT onto TrustedDeliveryV1.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/delivery/utils/trusted-delivery.project.util.ts` |
| blob_sha[0] | `c27a387bf65420eedeb9baafd9e78417952fefa5` |
| symbols[0] | `projectTrustedDeliveryV1` |
| lines[0] | `106-123` |
| path[1] | `src/agent/delivery/types/trusted-delivery-v1.type.ts` |
| blob_sha[1] | `87af55942415b2d65e5b2004aab7afa6f3725910` |
| symbols[1] | `TrustedDeliveryV1.delivery_verdict` |
| lines[1] | `41-45` |
| test_file | `src/agent/delivery/utils/trusted-delivery.project.util.spec.ts` |
| test_names | ['projects FLAWED_DRAFT delivery_verdict on OK + flawed draft'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

### C007 — `authority_boundary` — **PASS**

AUTO_CORRIDOR_PRODUCT_RULES / buildAutoCorridorUiFlagsV1 treat missing execution mode as ADVICE_ONLY and disable auto UI when ADVICE_ONLY.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/contracts/auto-corridor-product.contract.ts` |
| blob_sha[0] | `eccb6cef5b26053c49917e6481f9a150a350979e` |
| symbols[0] | `AUTO_CORRIDOR_PRODUCT_RULES, buildAutoCorridorUiFlagsV1` |
| lines[0] | `36-72` |
| test_file | `src/agent/contracts/auto-corridor-product.contract.spec.ts` |
| test_names | ['freezes LLM cannot write DB and flawed blocks AUTO'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

### C008 — `authority_boundary` — **PASS**

tryAllowFlawedDraftBypass returns false unless request.options.allow_flawed_draft_narrate === true; on success sets metadata.flawed_draft_narrate=true and flawed_draft_opt_in=explicit.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/orchestration/plan-verify-loop/plan-verify-loop-repair-guards.ts` |
| blob_sha[0] | `e04a4cc9e0b011f6177500c989aec1552797b879` |
| symbols[0] | `tryAllowFlawedDraftBypass` |
| lines[0] | `35-75` |
| test_file | `src/agent/orchestration/plan-verify-loop/plan-verify-loop-repair-guards.spec.ts` |
| test_names | ['bound trip without explicit opt-in clarifies (P0-1)', 'continues without clarification when allow_flawed_draft_narrate'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

### C009 — `authority_boundary` — **PARTIAL**

shouldBlockAutoApplyForFlawedDraft is true when metadata.flawed_draft_narrate===true; maybeAutoApplyItineraryAdjustCorridor records reason flawed_draft_forbidden and forces ADVICE_ONLY without applying.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/utils/itinerary-adjust-flawed-auto-block.util.ts` |
| blob_sha[0] | `2ac9a71151e7c28b391a349ee5090b5bde7a282b` |
| symbols[0] | `shouldBlockAutoApplyForFlawedDraft, FLAWED_DRAFT_AUTO_APPLY_BLOCK_REASON` |
| lines[0] | `6-12` |
| path[1] | `src/agent/services/claude-orchestrator.service.ts` |
| blob_sha[1] | `8acf97923d3d26c1edf320658f2c9721a68ca074` |
| symbols[1] | `ClaudeOrchestratorService.maybeAutoApplyItineraryAdjustCorridor` |
| lines[1] | `8652-8675` |
| test_file | `src/agent/utils/itinerary-adjust-flawed-auto-block.util.spec.ts` |
| test_names | ['blocks when flawed_draft_narrate is true'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |
| notes | Helper PASS; orchestrator wiring CODE_ONLY at freeze (no dedicated maybeAutoApplyItineraryAdjustCorridor unit name in this run). |

### C010 — `corridor_iceland` — **PASS**

WRITEBACK_CORRIDOR_AUDIT_MATRIX row iceland_apply documents entry POST /iceland-self-drive/trips/:tripId/initial-plan/proposals/:proposalId/apply with confirm required, auto never, persistence plan_version; GATE_VERIFY row marks usesMainChainGateEval=false and auditStatus=needs_audit.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/contracts/writeback-corridor-audit.matrix.ts` |
| blob_sha[0] | `72b7883e5739c55c69d2c0a3d46b6aa51034bf42` |
| symbols[0] | `WRITEBACK_CORRIDOR_AUDIT_MATRIX[id=iceland_apply]` |
| lines[0] | `32-43` |
| path[1] | `src/agent/contracts/gate-verify-corridor-audit.matrix.ts` |
| blob_sha[1] | `3c5073a249287e7b27f0bdb21ec7b05da69b40fd` |
| symbols[1] | `GATE_VERIFY_CORRIDOR_AUDIT_MATRIX[corridorId=iceland_apply]` |
| lines[1] | `42-50` |
| test_file | `src/agent/contracts/writeback-corridor-audit.matrix.spec.ts` |
| test_names | ['marks Iceland apply as plan_version without AUTO'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

### C010b — `corridor_iceland` — **NEEDS_MORE_EVIDENCE**

At freeze commit a7e9bdca5, directory src/trips/iceland-self-drive is absent from the git tree; therefore the HTTP Confirm/Apply implementation path documented by C010 is not present as committed source.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `(absent) src/trips/iceland-self-drive/**` |
| blob_sha[0] | `None` |
| symbols[0] | `` |
| lines[0] | `n/a` |
| test_file | `None` |
| test_names | [] |
| exit_code | `None` |
| result_file | `None` |
| notes | Verified via git ls-tree a7e9bdca5 src/trips/iceland-self-drive → empty. Untracked working-tree files outside freeze commit are not admissible. |

### C011 — `corridor_arrange` — **PASS**

PlanProposalApplyService.executeProposal applies only selectAuthoritativePlanProposalChanges(proposal) (proposal.changes), not ortoolsShadow.shadowChanges; ArrangeItineraryController exposes POST proposals/:proposalId/apply.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/trips/arrange-itinerary/services/plan-proposal-apply.service.ts` |
| blob_sha[0] | `06f734f73f639d9bd5565ce6c2dd52e07a4aacdd` |
| symbols[0] | `PlanProposalApplyService.executeProposal, selectAuthoritativePlanProposalChanges` |
| lines[0] | `73-77` |
| path[1] | `src/decision-runtime/solver/lab/ortools-planning-shadow-apply.guard.ts` |
| blob_sha[1] | `be0973fa24811861731e3ae0c4b58b5f69050c3d` |
| symbols[1] | `selectAuthoritativePlanProposalChanges` |
| lines[1] | `11-21` |
| path[2] | `src/trips/arrange-itinerary/arrange-itinerary.controller.ts` |
| blob_sha[2] | `473f036a2233ba6939feeb03a828c266ea320617` |
| symbols[2] | `ArrangeItineraryController.applyProposal, @Post('proposals/:proposalId/apply')` |
| lines[2] | `391-415` |
| test_file | `src/decision-runtime/solver/lab/ortools-planning-shadow-apply.guard.spec.ts` |
| test_names | ['selects only proposal.changes', 'detects shadow-only apply leak'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |
| notes | Controller apply HTTP handler CODE_ONLY in this run; guard PASS. |

### C012 — `corridor_unified` — **CODE_ONLY**

UnifiedDecisionController exposes POST decisions/:decisionId/authorize, execute, and rollback under Controller trips/:tripId.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/decision-runtime/gateway/controllers/unified-decision.controller.ts` |
| blob_sha[0] | `3191c3e73b32517bf6fb838db71ab5f59474fe2a` |
| symbols[0] | `UnifiedDecisionController.authorize, UnifiedDecisionController.execute, UnifiedDecisionController.rollback` |
| lines[0] | `402-458` |
| test_file | `None` |
| test_names | [] |
| exit_code | `None` |
| result_file | `None` |
| notes | No UnifiedDecisionController spec in claim-matrix jest set at freeze. |

### C013 — `corridor_actions` — **PASS**

ActionsController @Post(commit) delegates to actionExecutionService.commit; OpenAPI text references idempotency key dedupe.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/actions.controller.ts` |
| blob_sha[0] | `77358aefd7bd0bf606968682cee84cd27363e38a` |
| symbols[0] | `ActionsController.commit, @Post('commit')` |
| lines[0] | `238-300` |
| test_file | `src/agent/actions.controller.integration.spec.ts` |
| test_names | ['compensation policy upsert is idempotent by business pair', 'POST /agent/actions/commit returns service response'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

### C014 — `corridor_itinerary_adjust` — **PARTIAL**

maybeAutoApplyItineraryAdjustCorridor runs only when routeIntent.primary===ITINERARY_ADJUST and blocks AUTO when shouldBlockAutoApplyForFlawedDraft; writeback matrix lists itinerary_adjust_apply auto=narrow_corridor persistence=trip_itinerary_item.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/services/claude-orchestrator.service.ts` |
| blob_sha[0] | `8acf97923d3d26c1edf320658f2c9721a68ca074` |
| symbols[0] | `maybeAutoApplyItineraryAdjustCorridor` |
| lines[0] | `8652-8675` |
| path[1] | `src/agent/contracts/writeback-corridor-audit.matrix.ts` |
| blob_sha[1] | `72b7883e5739c55c69d2c0a3d46b6aa51034bf42` |
| symbols[1] | `WRITEBACK_CORRIDOR_AUDIT_MATRIX[id=itinerary_adjust_apply]` |
| lines[1] | `80-91` |
| test_file | `src/agent/utils/itinerary-adjust-auto-apply.util.spec.ts` |
| test_names | ['(suite passed, 6 tests)'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |
| notes | Auto-apply util PASS; orchestrator method CODE_ONLY; flawed block covered by C009. |

### C015 — `corridor_mobile` — **NEEDS_MORE_EVIDENCE**

WRITEBACK/GATE matrices document mobile_verified_apply corridor (Verification Snapshot, auto never, needs_audit). At freeze commit, mobile-execution.controller has POST execution/tep-repairs/:interventionId/accept calling TepLocalRepairApplyService.applyRecoveryOption; no verified-proposals/:proposalId/apply handler string in that file.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/contracts/writeback-corridor-audit.matrix.ts` |
| blob_sha[0] | `72b7883e5739c55c69d2c0a3d46b6aa51034bf42` |
| symbols[0] | `WRITEBACK_CORRIDOR_AUDIT_MATRIX[id=mobile_verified_apply]` |
| lines[0] | `92-103` |
| path[1] | `src/mobile/controllers/mobile-execution.controller.ts` |
| blob_sha[1] | `612a4b5cd969cc24316574a5932d0d6489d1ddfe` |
| symbols[1] | `@Post('execution/tep-repairs/:interventionId/accept')` |
| lines[1] | `241-261` |
| test_file | `None` |
| test_names | [] |
| exit_code | `None` |
| result_file | `None` |
| notes | Matrix row PASS via writeback/gate matrix specs (C010/C017 family). verified-proposals apply handler absent at freeze. tep-repairs accept is CODE_ONLY (no mobile spec in claim run). |

### C016 — `corridor_tep` — **PASS**

TepLocalRepairApplyService.applyRecoveryOption uses idempotency key coalescing; assertTepRepairOptionFresh throws STALE_REPAIR_OPTION when basePlanVersionId !== currentEffectivePlanVersionId.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/trips/tep/services/tep-local-repair-apply.service.ts` |
| blob_sha[0] | `5c88cbfd089725caaed82612c20e448947669539` |
| symbols[0] | `TepLocalRepairApplyService.applyRecoveryOption` |
| lines[0] | `82-96` |
| path[1] | `src/trips/tep/utils/tep-repair-stale-guard.util.ts` |
| blob_sha[1] | `10199398a01b1ed526020cae7cf97e0722afc238` |
| symbols[1] | `assertTepRepairOptionFresh, STALE_REPAIR_OPTION` |
| lines[1] | `3-21` |
| test_file | `src/trips/tep/services/tep-local-repair-apply.service.spec.ts` |
| test_names | ['(8 tests passed including stale rejection paths in suite)'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

### C017 — `corridor_ortools_shadow` — **PASS**

selectAuthoritativePlanProposalChanges returns filtered proposal.changes only; isOrtToolsPlanningShadowApplyLeak detects shadow-only apply; OrtTools planning shadow bridge stamps shadowAuthority:false; GATE matrix marks ortools_shadow auditStatus=shadow_only.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/decision-runtime/solver/lab/ortools-planning-shadow-apply.guard.ts` |
| blob_sha[0] | `be0973fa24811861731e3ae0c4b58b5f69050c3d` |
| symbols[0] | `selectAuthoritativePlanProposalChanges, isOrtToolsPlanningShadowApplyLeak` |
| lines[0] | `11-21;62-85` |
| path[1] | `src/decision-runtime/solver/bridge/ortools-planning-orchestrator-shadow.bridge.ts` |
| blob_sha[1] | `d860b96f5a80c084dcee09880fb17155ad3122cb` |
| symbols[1] | `shadowAuthority: false` |
| lines[1] | `300-314` |
| path[2] | `src/agent/contracts/gate-verify-corridor-audit.matrix.ts` |
| blob_sha[2] | `3c5073a249287e7b27f0bdb21ec7b05da69b40fd` |
| symbols[2] | `GATE_VERIFY_CORRIDOR_AUDIT_MATRIX[corridorId=ortools_shadow]` |
| lines[2] | `102-111` |
| test_file | `src/decision-runtime/solver/lab/ortools-planning-shadow-apply.guard.spec.ts` |
| test_names | ['selects only proposal.changes', 'detects shadow-only apply leak'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

### C018 — `freeze_integrity` — **FAIL**

At freeze commit, src/agent/utils/route-and-run-trip-id-merge.util.ts imports ../../trips/iceland-self-drive/utils/iceland-memory-shell-trip-id.util but that module path is absent from the commit tree.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/utils/route-and-run-trip-id-merge.util.ts` |
| blob_sha[0] | `75630babc2bf2861aefcf82c0427de1ac702bc48` |
| symbols[0] | `isMemoryShellTripId import` |
| lines[0] | `2-2` |
| test_file | `src/agent/agent.controller.ao-p0.contract.spec.ts` |
| test_names | [] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |
| notes | Cannot find module iceland-memory-shell-trip-id.util — observed in claim-matrix-jest.console.txt |

### C019 — `state_machine` — **PASS**

Decision kernel verify-repair loop tests pass at freeze commit (VERIFY issues drive REPAIR path in kernel specs).

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/decision/kernel/decision-kernel.verify-repair-loop.spec.ts` |
| blob_sha[0] | `5f9f42acfd440038b346d97f1e2235a4b1bce009` |
| symbols[0] | `decision-kernel.verify-repair-loop` |
| lines[0] | `suite` |
| test_file | `src/decision/kernel/decision-kernel.verify-repair-loop.spec.ts` |
| test_names | ['(5 tests passed)'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

### C020 — `audit_ssot` — **PASS**

GATE_VERIFY_CORRIDOR_AUDIT_MATRIX and WRITEBACK_CORRIDOR_AUDIT_MATRIX version 1.0.0 are committed SSOT listing per-corridor gate reuse and writeback fields; MAIN_CHAIN_GATE_BLOCK_SCOPE states main-chain-only GATE BLOCK proof.

| 字段 | 值 |
|------|-----|
| freeze_commit | `a7e9bdca588431143e04e98d7c1c1204299c6e54` |
| path[0] | `src/agent/contracts/gate-verify-corridor-audit.matrix.ts` |
| blob_sha[0] | `3c5073a249287e7b27f0bdb21ec7b05da69b40fd` |
| symbols[0] | `GATE_VERIFY_CORRIDOR_AUDIT_MATRIX, MAIN_CHAIN_GATE_BLOCK_SCOPE` |
| lines[0] | `8-112` |
| path[1] | `src/agent/contracts/writeback-corridor-audit.matrix.ts` |
| blob_sha[1] | `72b7883e5739c55c69d2c0a3d46b6aa51034bf42` |
| symbols[1] | `WRITEBACK_CORRIDOR_AUDIT_MATRIX` |
| lines[1] | `6-104` |
| test_file | `src/agent/contracts/gate-verify-corridor-audit.matrix.spec.ts` |
| test_names | ['scopes main-chain GATE BLOCK narrowly', 'marks independent apply corridors as canWriteWithoutMainChainGate'] |
| exit_code | `1` |
| result_file | `evidence/claim-evidence-matrix-v1/test-runs/claim-matrix-jest.json` |

## Writeback corridor profiles（独立确认）

每条走廊独立确认 Gate / VERIFY / Confirm / Freshness / Idempotency / Write Target / AUTO / Rollback / Audit。

### Corridor `iceland_apply` — implementation: **ABSENT (C010b)**

Claim refs: `C010`, `C010b`

| Dimension | Value | Source Claim | Status |
|-----------|-------|--------------|--------|
| Gate | corridor_own_guard; usesMainChainGateEval=false | `C010` | **PASS** |
| VERIFY | Iceland proposal verification / preview bridge (matrix text) | `C010` | **PASS** |
| Confirm | required (confirm opens apply) — matrix text | `C010` | **PASS** |
| Freshness | proposal status — matrix text | `C010` | **PASS** |
| Idempotency | Idempotency-Key — matrix text | `C010` | **PASS** |
| Write_Target | plan_version — matrix text | `C010` | **PASS** |
| AUTO | never — matrix text | `C010` | **PASS** |
| Rollback | not stated in writeback matrix row | `C010` | **NEEDS_MORE_EVIDENCE** |
| Audit | auditStatus=needs_audit | `C010` | **PASS** |

### Corridor `arrange_apply` — implementation: **PRESENT**

Claim refs: `C011`

| Dimension | Value | Source Claim | Status |
|-----------|-------|--------------|--------|
| Gate | corridor_own_guard; not main-chain GATE_EVAL | `C020` | **PASS** |
| VERIFY | PlanProposal.validation + write guard; never shadowChanges | `C011` | **PASS** |
| Confirm | explicit apply HTTP | `C011` | **CODE_ONLY** |
| Freshness | proposal / contextVersion — matrix | `C020` | **PASS** |
| Idempotency | corridor-specific — matrix | `C020` | **PASS** |
| Write_Target | plan_version / itinerary items via executeProposal | `C011` | **PASS** |
| AUTO | never | `C020` | **PASS** |
| Rollback | discard endpoint exists; rollback semantics NEEDS_MORE_EVIDENCE | `C011` | **NEEDS_MORE_EVIDENCE** |
| Audit | needs_audit | `C020` | **PASS** |

### Corridor `unified_execute` — implementation: **PRESENT**

Claim refs: `C012`

| Dimension | Value | Source Claim | Status |
|-----------|-------|--------------|--------|
| Gate | unified_assessment; usesMainChainGateEval=false | `C020` | **PASS** |
| VERIFY | Unified Assessment / authorize — matrix | `C020` | **PASS** |
| Confirm | authorize then execute endpoints present | `C012` | **CODE_ONLY** |
| Freshness | decision revision — matrix | `C020` | **PASS** |
| Idempotency | idempotencyKey passed to gateway.execute | `C012` | **CODE_ONLY** |
| Write_Target | mixed — matrix | `C020` | **PASS** |
| AUTO | policy_controlled — matrix | `C020` | **PASS** |
| Rollback | POST decisions/:decisionId/rollback present | `C012` | **CODE_ONLY** |
| Audit | needs_audit | `C020` | **PASS** |

### Corridor `actions_commit` — implementation: **PRESENT**

Claim refs: `C013`

| Dimension | Value | Source Claim | Status |
|-----------|-------|--------------|--------|
| Gate | corridor_own_guard | `C020` | **PASS** |
| VERIFY | preview + side-effect rules — matrix | `C020` | **PASS** |
| Confirm | commit endpoint | `C013` | **PASS** |
| Freshness | action plan — matrix | `C020` | **PASS** |
| Idempotency | idempotency_key | `C013` | **PASS** |
| Write_Target | mixed | `C020` | **PASS** |
| AUTO | policy_controlled | `C020` | **PASS** |
| Rollback | ActionsController rollback operation documented in controller (~line 856) | `C013` | **CODE_ONLY** |
| Audit | needs_audit | `C020` | **PASS** |

### Corridor `itinerary_adjust_apply` — implementation: **PRESENT**

Claim refs: `C009`, `C014`

| Dimension | Value | Source Claim | Status |
|-----------|-------|--------------|--------|
| Gate | usesMainChainGateEval=true | `C020` | **PASS** |
| VERIFY | main-chain Kernel VERIFY (advice segment) | `C020` | **PASS** |
| Confirm | utterance / apply flag | `C020` | **PASS** |
| Freshness | bound trip + pending draft | `C020` | **PASS** |
| Idempotency | request_id | `C020` | **PASS** |
| Write_Target | trip_itinerary_item | `C020` | **PASS** |
| AUTO | narrow_corridor; FLAWED_DRAFT blocks AUTO | `C009` | **PARTIAL** |
| Rollback | not in writeback matrix row | `C014` | **NEEDS_MORE_EVIDENCE** |
| Audit | proven (gate matrix) | `C020` | **PASS** |

### Corridor `mobile_verified_apply` — implementation: **MATRIX_ONLY; live mobile writeback observed: tep-repairs accept (C015)**

Claim refs: `C015`

| Dimension | Value | Source Claim | Status |
|-----------|-------|--------------|--------|
| Gate | verification_snapshot; usesMainChainGateEval=false | `C020` | **PASS** |
| VERIFY | Mobile Verification Snapshot — matrix | `C020` | **PASS** |
| Confirm | explicit mobile action — matrix | `C020` | **PASS** |
| Freshness | snapshot freshness — matrix | `C020` | **PASS** |
| Idempotency | corridor-specific — matrix | `C020` | **PASS** |
| Write_Target | mixed — matrix | `C020` | **PASS** |
| AUTO | never | `C020` | **PASS** |
| Rollback | not stated | `C015` | **NEEDS_MORE_EVIDENCE** |
| Audit | needs_audit | `C020` | **PASS** |

### Corridor `tep_repair_apply` — implementation: **PRESENT**

Claim refs: `C016`

| Dimension | Value | Source Claim | Status |
|-----------|-------|--------------|--------|
| Gate | not listed as main-chain GATE_EVAL; corridor stale guard | `C016` | **PASS** |
| VERIFY | TEP recovery option / executability path | `C016` | **PARTIAL** |
| Confirm | applyRecoveryOption invocation (mobile accept / trip executability) | `C016` | **PASS** |
| Freshness | assertTepRepairOptionFresh / STALE_REPAIR_OPTION | `C016` | **PASS** |
| Idempotency | buildTepRepairIdempotencyKey + inflight coalesce | `C016` | **PASS** |
| Write_Target | effective plan via planVersionStore.setEffective | `C016` | **PASS** |
| AUTO | not AUTO corridor in writeback matrix (explicit apply) | `C016` | **CODE_ONLY** |
| Rollback | not evidenced in claim run | `C016` | **NEEDS_MORE_EVIDENCE** |
| Audit | not a row in GATE matrix; treat as independent | `C016` | **CODE_ONLY** |

### Corridor `ortools_shadow` — implementation: **PRESENT (guard+bridge)**

Claim refs: `C017`

| Dimension | Value | Source Claim | Status |
|-----------|-------|--------------|--------|
| Gate | none_or_unknown | `C020` | **PASS** |
| VERIFY | lab/compare only | `C020` | **PASS** |
| Confirm | n/a — shadow not authoritative apply | `C017` | **PASS** |
| Freshness | selectUsableOrtToolsPlanningShadow contextVersion match | `C017` | **CODE_ONLY** |
| Idempotency | n/a for shadow authority | `C017` | **CODE_ONLY** |
| Write_Target | must not write shadowChanges; Arrange uses proposal.changes | `C011` | **PASS** |
| AUTO | shadow_only; shadowAuthority false | `C017` | **PASS** |
| Rollback | n/a | `C017` | **CODE_ONLY** |
| Audit | shadow_only | `C020` | **PASS** |

## Status legend

| Status | Meaning |
|--------|---------|
| PASS | Test green at freeze worktree batch |
| PARTIAL | Partial test coverage of statement |
| FAIL | Test/suite failed at freeze |
| CODE_ONLY | Code/matrix present; no dedicated green test in batch |
| NEEDS_MORE_EVIDENCE | Fact cannot be closed from freeze tree |

## Machine copy

Canonical JSON: `evidence/claim-evidence-matrix-v1/CLAIM_EVIDENCE_MATRIX_v1.0.json`

