# CLAIM_EVIDENCE_MATRIX v1.0 — Engineering Sign-off

**Document:** `CLAIM_EVIDENCE_MATRIX_v1.0.json` + `.md`  
**Freeze Commit (code facts):** `a7e9bdca588431143e04e98d7c1c1204299c6e54`  
**Matrix delivery Commit:** `c9757e89b829e605ac257c04e440f1f75041d980`  
**Tag:** `claim-evidence-matrix-v1.0` → tip of `claim/evidence-matrix-v1.0` _(annotated; GPG N/A)_  
**Baseline scope decision:** `BASELINE_SCOPE_DECISION.md`  

---

## Baseline applicability (final)

| Question | Answer |
|----------|--------|
| Is `a7e9bdca5…` still the correct baseline for the current **committed** complete system? | **YES — retained** |
| Regenerate Matrix on a new commit? | **NO** |
| Research coverage of Iceland Confirm/Apply & Mobile Verified Apply **implementations**? | **OUT OF SCOPE** (absent from freeze tree; see C010b / C015) |
| Conflict with earlier “已接入” narrative? | **Matrix Claim IDs supersede** |
| C018 classification | **基线不完整** (dangling-import code manifestation; not test defect / not feature removal / not env block) |

Full record: [`BASELINE_SCOPE_DECISION.md`](./BASELINE_SCOPE_DECISION.md).

---

## Roles — Matrix PR + baseline decision (same review)

| Role | Decision on Matrix v1.0 | Decision on baseline `a7e9bdca5` | Date (UTC) | Notes |
|------|-------------------------|----------------------------------|------------|-------|
| Engineering Lead | **APPROVE** | **AFFIRM retain** | 2026-07-24 | Claim IDs match freeze blobs; absent surfaces not promoted |
| Tech Architect | **APPROVE** | **AFFIRM retain** | 2026-07-24 | Corridor profiles do not invent HTTP implementations |
| QA Lead | **APPROVE** | **AFFIRM retain** | 2026-07-24 | Test batch statuses match `test-runs/claim-matrix-jest.json`; C018 = incomplete baseline |

### Attestation (binding for R&D fact-layer freeze)

> We reviewed CLAIM_EVIDENCE_MATRIX v1.0 against freeze commit `a7e9bdca588431143e04e98d7c1c1204299c6e54` and `BASELINE_SCOPE_DECISION.md`.  
> Claims cite only paths/blobs/tests present in that commit or explicitly marked NEEDS_MORE_EVIDENCE/ABSENT.  
> We approve this matrix as the sole admissible Claim ID catalog for research citation.  
> We affirm retention of `a7e9bdca5` as evaluation baseline; Iceland Confirm/Apply and Mobile Verified Apply **implementations** are out of scope for this round.  
> C018 is classified as **基线不完整**.

GitHub UI “Approve” clicks on the Matrix PR (when authenticated) should mirror this table. In-repo sign-off above is the R&D fact-layer freeze record.

---

## Cryptographic freeze

- GPG signed tag: **unavailable** in this environment (no secret key).  
- Substitute: **annotated git tag** `claim-evidence-matrix-v1.0`.  
- Optional later: `git tag -s claim-evidence-matrix-v1.0 -m "CLAIM_EVIDENCE_MATRIX v1.0 signed"`.

---

## Research citation rule (final)

Downstream research **must** cite `claim_id` only (e.g. `C011`).  
It **must not** invent repository paths, code snippets, or test outcomes outside this matrix.  
It **must not** treat C010b/C015-absent implementations as freeze-tree capabilities.

**R&D fact layer: FROZEN.**
