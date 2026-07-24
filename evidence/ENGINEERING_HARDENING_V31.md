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

## P3

- `evidence/rfc/RFC-ORTools-Authoritative-Promotion.md` — Shadow remains default; promotion blocked without Verification/Freshness/Idempotency/Rollback/Canary/Kill Switch

## Forbidden without new facts+RFC

Microservice · CQRS · GraphQL · global SSOT · Proposal 大一统 · OR-Tools authority flip
