# CLAIM_EVIDENCE_MATRIX v2.0 — fact confirmation only

**Status:** DRAFT (backed by Evidence Work Packages; not a v1 replacement until signed)  
**Baseline parent:** CLAIM_EVIDENCE_MATRIX_v1.0 @ `a7e9bdca5` (+ V3.1 hardening + EWP commits)  
**Purpose:** Confirm additional **current** facts. **No** target-architecture redesign.

## Evidence Work Packages

See `evidence/work-packages/README.md`. Each claim below cites an EWP where applicable.

| Claim | Area | Evidence level |
|-------|------|----------------|
| C021 / C021b | TravelContext SSOT + no global contextHash | PASS (contracts) |
| C022 / C022b / C022c | mixed write decomposition | PASS |
| C023 / C023b–e | Rollback corridor facts | PASS / PARTIAL |
| C023f / C023g | Iceland / Mobile apply rollback | NEEDS_MORE_EVIDENCE |
| C024 / C024b | Corridor-local concurrency; no multi-corridor suite | PASS |
| C025 / C025b | Handoff inventory vs client compliance | PASS / NEEDS_MORE_EVIDENCE |
| C026 / C026b | OR-Tools Shadow + metrics sample | PASS |
| C030 / C030b | NestJS BFF/API + client contract anchors | PASS |
| C031 | OR-Tools RFC INTERNAL_REVIEW, Shadow only | CODE_ONLY |

## Explicit non-goals

- Microservice / CQRS / GraphQL / global SSOT / Proposal 大一统
- OR-Tools authority promotion (RFC remains Shadow; Apply not authorized)
- Starting Context / Writeback / Rollback / Concurrency / BFF mega-refactors without a separate internal decision after these packs

## Machine catalog

`CLAIM_EVIDENCE_MATRIX_v2.0.json` — DRAFT until signatures + freeze Jest batch.
