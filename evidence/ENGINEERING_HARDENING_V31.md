# Engineering hardening — Research V3.1 track

**Stance:** No architecture mega-refactor. Three tracks: harden · evidence · independent RFC.

## P1 completed in this change set

| Item | Result |
|------|--------|
| C018 dangling import | Fixed: `isMemoryShellTripId` → `src/agent/utils/memory-shell-trip-id.util.ts`; AgentController ao-p0 contract **loads PASS** |
| CI freeze smoke + dangling | `npm run ci:dangling-imports` · `npm run ci:freeze-smoke-gate` · `.github/workflows/freeze-smoke-gate.yml` |
| C005-ERRATA | `evidence/errata/C005-ERRATA_VERIFIED_WITH_WARNINGS.md` — CONFIRMED in code+tests |
| OpenAPI freeze | `route-and-run-options.openapi.freeze.ts` + DTO annotations for `execution_mode` / `allow_flawed_draft_narrate` |
| Post-plan + VERIFY/REPAIR budgets | Extended `orchestration-main-chain-protocol.contract.spec.ts` |
| `MAIN_CHAIN_GATE_BLOCK_SCOPE` docs | Protocol MD §GATE BLOCK + matrix constant comment |
| Flawed draft opt-in audit | `metadata.audit_log` + `flawed_draft_opt_in_audit` + logger in repair-guards |
| Unified / Actions idempotency | Dedicated contract specs under gateway + agent contracts |

## P2

- Draft `evidence/claim-evidence-matrix-v2/` (facts only; DRAFT until signed)
- Seven Evidence Work Packages: `evidence/work-packages/` (EWP-01…07) with paths, tests, limitations, Claim IDs

## P3

- `evidence/rfc/RFC-ORTools-Authoritative-Promotion.md` — **INTERNAL_REVIEW**; Shadow remains default; authoritative Apply **not** authorized; promotion blocked without Verification/Freshness/Idempotency/Rollback/Canary/Kill Switch

## Post-EWP decision gate

See `evidence/work-packages/POST_EWP_DECISION_GATE.md` — classifications READY_FOR_INTERNAL_REVIEW.  
Matrix v2: **DRAFT / AWAITING_SIGN** (`evidence/claim-evidence-matrix-v2/FINAL_STATUS.md`).  
Do **not** start Context / Writeback / Rollback / Concurrency / BFF mega-refactors until gate roles APPROVE and only **OPEN_SCOPED_TASK** tickets are filed.

**Scoped landed:** WB-1 (`WRITEBACK_CORRIDOR_AUDIT_MATRIX` v1.1.0 `mixedTargets` for Unified/Actions).  
**Scoped landed:** RB-1 (Unified rollback HTTP contract + Actions `STUB_NO_SIDE_EFFECTS` label).  
**Scoped landed:** CC-1 (Arrange apply dual-signal: phase `CONTEXT_STALE` ≠ HTTP `CONTEXT_VERSION_CONFLICT`).  
**Scoped landed:** BFF-1 (`BFF_CLIENT_CONTRACT_INDEX` pinned to OpenAPI freeze `a7e9bdca5`).  
**Scoped landed:** CTX-1 (`CORRIDOR_LOCAL_FRESHNESS_INVENTORY` + `GLOBAL_TRAVEL_CONTEXT_SSOT_WIRE_FORBIDDEN`).

## Post-scoped-tickets status

Recommended OPEN_SCOPED_TASK order **WB-1 → RB-1 → CC-1 → BFF-1** is complete; **CTX-1** inventory follow-on landed.  
Remaining gate items: EL/TA/QA sign Matrix v2; multi-corridor concurrent e2e / OR-Tools Apply / client source review stay DEFER/BLOCKED.

## Forbidden without new facts+RFC

Microservice · CQRS · GraphQL · global SSOT · Proposal 大一统 · OR-Tools authority flip

## Matrix v2 freeze (current)

- Architecture capability adds: **STOPPED**
- Engineering tip: `bc6e2e6d5…`
- Freeze tag: `claim-evidence-matrix-v2.0` → `c76fff367…`
- Catalog: `evidence/claim-evidence-matrix-v2/`
- **V3.2 Delta Assessment:** COMPLETE (`V32_DELTA_ASSESSMENT.md`)
- **Release pack:** `evidence/release/v31-agent-interface-hardening/` — draft **CONDITIONAL GO**
- **Next:** GitHub PR Approve → merge commit record → Release Readiness Review session

