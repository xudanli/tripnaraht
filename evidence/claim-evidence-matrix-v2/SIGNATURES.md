# CLAIM_EVIDENCE_MATRIX v2.0 — Engineering Sign-off

**Document:** `CLAIM_EVIDENCE_MATRIX_v2.0.json`  
**V3.1 feature tip:** `bc6e2e6d5a087a6a20c47576ebdba295370ebec1`  
**Parent OpenAPI freeze:** `a7e9bdca588431143e04e98d7c1c1204299c6e54`  
**Tag:** `claim-evidence-matrix-v2.0`  
**Branch:** `feat/v31-engineering-hardening`  
**Baseline decision:** `BASELINE_SCOPE_DECISION.md`  
**DEFER/BLOCKED:** `DEFER_BLOCKED_REGISTRY.md`  
**Regression:** `test-runs/`  

---

## Roles — Matrix v2 + baseline (same PR)

| Role | Matrix v2.0 | Engineering baseline `bc6e2e6d5…` | Date (UTC) | Notes |
|------|-------------|-----------------------------------|------------|-------|
| Engineering Lead | **APPROVE** | **AFFIRM** | 2026-07-24 | EWP+tickets bound; no new architecture capability |
| Tech Architect | **APPROVE** | **AFFIRM** | 2026-07-24 | DEFER/BLOCKED registry + OR-Tools Shadow retained |
| QA Lead | **APPROVE** | **AFFIRM** | 2026-07-24 | Regression batch in `test-runs/` matches PASS claims |

### Attestation

> We reviewed CLAIM_EVIDENCE_MATRIX v2.0 against engineering tip `bc6e2e6d5…`, EWP-01…07, scoped tickets WB-1/RB-1/CC-1/BFF-1/CTX-1, and DEFER_BLOCKED_REGISTRY.  
> Claims cite paths/tests on this baseline or are marked HISTORICAL / NEEDS_MORE_EVIDENCE / PARTIAL / CODE_ONLY.  
> We approve v2 as an **additive** catalog. Research must not use v2 until this APPROVE.  
> After APPROVE, research may run **V3.2 Delta Assessment only**; then **Release Readiness Review**.  
> OR-Tools remains Shadow; global SSOT / Proposal unification / microservice-CQRS-GraphQL remain prohibited.

GitHub PR UI Approve clicks should mirror this table.  
**Platform Approve is mandatory** for the governance chain; in-repo rows alone are insufficient for release.

### GitHub PR / merge (fill after platform Approve + merge)

| Field | Value |
|-------|--------|
| pr_url | _PENDING_ |
| pr_number | _PENDING_ |
| final_merge_commit | _PENDING_ |
| merged_at | _PENDING_ |
| release_tag | _PENDING_ (e.g. `v31-agent-interface-hardening-rc1`) |
| evidence_tag (immutable) | `claim-evidence-matrix-v2.0` → `c76fff367…` |

See `evidence/release/v31-agent-interface-hardening/MERGE_RECORD.md`.


---

## Status markers

| Marker | Value |
|--------|--------|
| ENGINEERING FACT LAYER (v2) | **FROZEN** (on APPROVE) |
| ENGINEERING BASELINE | **AFFIRMED** `bc6e2e6d5…` |
| ARCHITECTURE CAPABILITY ADDS | **STOPPED** |
| RESEARCH INPUT (v2) | **APPROVED** (on APPROVE; V3.2 Delta only) |
| RESEARCH INPUT (v1) | unchanged APPROVED for historical Claim IDs |

**Pre-APPROVE:** research institutes **must not** cite Matrix v2.  
**Post-APPROVE:** V3.2 Delta Assessment only → then Release Readiness Review.
