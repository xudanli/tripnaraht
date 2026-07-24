# Post-EWP Decision Gate

**Status:** READY_FOR_INTERNAL_REVIEW  
**Input:** Evidence Work Packages EWP-01…07 + CLAIM_EVIDENCE_MATRIX v2.0 **DRAFT**  
**Rule:** This gate **classifies** candidate engineering tasks. It does **not** authorize mega-refactors, global SSOT flips, or OR-Tools Apply.

| Decision | Meaning |
|----------|---------|
| **OPEN_SCOPED_TASK** | Facts justify a **bounded** follow-up ticket (tests/docs/narrow hardening). Still needs owner + acceptance criteria. |
| **DEFER** | Facts incomplete or risk > value; wait for more evidence or product ask. |
| **BLOCKED** | Explicitly forbidden without new RFC / Matrix upgrade / client source. |

---

## Classification

| Track | Decision | Claim anchors | Rationale (facts only) | Allowed next ticket shape |
|-------|----------|---------------|------------------------|---------------------------|
| **Context** (TravelContext ↔ Web/iOS projection) | **DEFER** primary; **OPEN_SCOPED_TASK** for inventory only | C021, C021b, C025b | Runtime SSOT remains OS∥DSO; no main-chain `contextHash`; no in-repo client proof of TravelContext consumption | Optional: document corridor-local hash map for FE; **forbid** “wire TravelContext as global SSOT” |
| **Writeback** (mixed Unified/Actions) | **OPEN_SCOPED_TASK** | C022, C022b, C022c | Mixed is **decomposed** into concrete writers; matrix label no longer opaque | Audit doc / per-target persistence checklist in writeback matrix comments; **forbid** unifying all writers into one store |
| **Rollback / Compensation** | **OPEN_SCOPED_TASK** (Actions stub + Unified HTTP e2e); **DEFER** Iceland/Mobile | C023, C023b–g | Actions = stub; Unified path exists but controller e2e thin; Iceland/Mobile rollback **NEEDS_MORE_EVIDENCE** | (1) Actions rollback: product decision stub→real or document forever-stub; (2) Unified rollback HTTP contract test; **not** cross-product rollback bus |
| **Concurrency** | **OPEN_SCOPED_TASK** (Arrange stale test + isolation doc); **DEFER** multi-corridor e2e | C024, C024b | Corridor-local guards evidenced; **no** Arrange+TEP+Mobile+… concurrent suite | Add Arrange `CONTEXT_STALE` / `CONTEXT_VERSION_CONFLICT` behavior spec; document isolation; **forbid** inventing global lock unless product requires |
| **BFF / client contracts** | **OPEN_SCOPED_TASK** (contract catalog); **DEFER** client compliance | C025, C025b, C030, C030b | Repo is NestJS BFF/API; handoffs exist; production clients absent | Publish versioned client-contract index from OpenAPI+handoffs; client compliance needs **external** source review |
| **OR-Tools authority** | **BLOCKED** | C026, C026b, C031 | RFC **INTERNAL_REVIEW**; Shadow only; sample/metrics OK | Lab/metrics only; **no** Apply / `shadowAuthority: true` |

---

## Explicit non-starts (this gate)

- Microservice split · CQRS · GraphQL · global TravelContext SSOT · Proposal 大一统  
- OR-Tools authoritative Apply  
- Cross-corridor distributed transaction / compensation saga “platform”  
- Claiming Web/iOS “already compliant” without client repo review  

---

## Recommended ticket order (if engineering opens work)

1. **WB-1** — ✅ DONE — `mixedTargets` on Unified/Actions + `MIXED_WRITE_UNIFICATION_FORBIDDEN` (see `EWP-02-mixed-write-targets/WB-1.md`).  
2. **RB-1** — ✅ DONE — Unified rollback HTTP contract + Actions `STUB_NO_SIDE_EFFECTS` product label (see `EWP-03-rollback-compensation/RB-1.md`).  
3. **CC-1** — Arrange apply stale conflict behavior spec (phase vs error code).  
4. **BFF-1** — Client contract index (paths from EWP-07) pinned to OpenAPI freeze commit.  
5. Hold Context / multi-corridor concurrency / OR-Tools Apply until separate decisions.

---

## Sign-off (process)

| Role | Decision on this gate | Date | Notes |
|------|----------------------|------|-------|
| Engineering Lead | _pending_ | | Approve which OPEN_SCOPED_TASK tickets to file |
| Tech Architect | _pending_ | | Confirm BLOCKED list |
| QA Lead | _pending_ | | Confirm test gaps listed under Rollback/Concurrency |

Until signed, Matrix v2 remains **DRAFT** and is **not** RESEARCH INPUT APPROVED.

## Index

| Artifact | Path |
|----------|------|
| EWP index | `evidence/work-packages/README.md` |
| Batch results | `evidence/work-packages/_shared/RESULTS.md` |
| Matrix v2 | `evidence/claim-evidence-matrix-v2/CLAIM_EVIDENCE_MATRIX_v2.0.json` |
| Signatures | `evidence/claim-evidence-matrix-v2/SIGNATURES.md` |
| Final status | `evidence/claim-evidence-matrix-v2/FINAL_STATUS.md` |
