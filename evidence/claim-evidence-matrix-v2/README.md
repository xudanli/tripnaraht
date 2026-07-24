# CLAIM_EVIDENCE_MATRIX v2.0 — fact confirmation only

**Status:** DRAFT (engineering hardening track; not a v1 replacement until signed)  
**Baseline parent:** CLAIM_EVIDENCE_MATRIX_v1.0 @ `a7e9bdca5` (+ hardening commits on this branch)  
**Purpose:** Confirm additional **current** facts. **No** target-architecture redesign.

## Scope additions vs v1

| Area | Intent | Evidence level (initial) |
|------|--------|--------------------------|
| TravelContext SSOT status | Target vs wired status markers | CODE_ONLY / PARTIAL — see `src/travel-context/CURRENT_SSOT_STATUS.md` |
| mixed write target | Writeback matrix `persistence: mixed` corridors | FACT from `writeback-corridor-audit.matrix.ts` |
| Rollback | Unified `POST .../rollback`; Actions rollback op | PARTIAL / CODE_ONLY |
| Cross-corridor concurrency | Phase-2 stale / ifMatch patterns | PARTIAL — dedicated suite may still be DI-blocked |
| Web/iOS protocol | Handoff-only; not client source | NEEDS_MORE_EVIDENCE for client; FACT for handoff existence |
| Shadow data | OR-Tools shadowAuthority false; no apply of shadowChanges | FACT — C017 lineage |
| C005 errata | `VERIFIED_WITH_WARNINGS` | FACT — `evidence/errata/C005-ERRATA_VERIFIED_WITH_WARNINGS.md` |
| C018 remediation | Dangling import fixed via agent `memory-shell-trip-id.util` | FACT after hardening merge |

## Explicit non-goals

- Microservice / CQRS / GraphQL / global SSOT / Proposal 大一统
- OR-Tools authority promotion (see `evidence/rfc/RFC-ORTools-Authoritative-Promotion.md`)

## Machine catalog

See `CLAIM_EVIDENCE_MATRIX_v2.0.json` (skeleton claims). Full blob SHA pinning and freeze worktree Jest batch required before RESEARCH INPUT APPROVED for v2.
