# BASELINE_SCOPE_DECISION — CLAIM_EVIDENCE_MATRIX v1.0

**Decision date (UTC):** 2026-07-24  
**Matrix version:** CLAIM_EVIDENCE_MATRIX v1.0  
**Question:** Is freeze commit `a7e9bdca588431143e04e98d7c1c1204299c6e54` still the correct baseline for evaluating the current complete **committed** system?

---

## 1. Joint decision (EL / TA / QA)

| Role | Decision | Result |
|------|----------|--------|
| Engineering Lead | Retain freeze as evaluation baseline | **AFFIRM** |
| Tech Architect | Retain freeze; exclude non-tree capabilities from research scope | **AFFIRM** |
| QA Lead | Retain freeze; Matrix statuses override prior narrative coverage claims | **AFFIRM** |

### Verdict

**`a7e9bdca588431143e04e98d7c1c1204299c6e54` remains the correct evaluation baseline.**

Do **not** select a replacement commit and do **not** regenerate Matrix for this freeze cycle.

---

## 2. Evidence supporting retention

1. **Committed tree at freeze** does not contain `src/trips/iceland-self-drive/**` (git ls-tree empty).
2. **Committed tree at freeze** has no `verified-proposals/:proposalId/apply` handler in `src/mobile/controllers/mobile-execution.controller.ts` (blob `612a4b5c…`).
3. Paths previously described as “已接入” for Iceland Confirm/Apply and Mobile Verified Apply appear only as:
   - audit-matrix **documentation strings** (Claims **C010**, **C015**, **C020**), and/or
   - **untracked** working-tree files (`?? src/trips/iceland-self-drive/`, `?? src/mobile/services/mobile-in-trip-home.service.ts`) that are **not** part of any commit on `claim/evidence-matrix-v1.0` / freeze ancestry.
4. Therefore those surfaces are **not** formal committed capabilities of the freeze baseline. Retaining the freeze is correct for evaluating the **complete committed system**; moving baseline to include untracked WIP would invent a non-existent commit.

---

## 3. Research scope under this baseline

| In scope | Out of scope (this research round) |
|----------|-------------------------------------|
| All Claim IDs whose anchors resolve to blobs in `a7e9bdca5` | Iceland HTTP Confirm/Apply implementation (C010b) |
| Matrix-documented corridor **rows** as documentation facts (C010, C015, C020) | Mobile `verified-proposals/.../apply` implementation (C015) |
| Present corridors: Arrange apply, Unified authorize/execute/rollback, Actions commit, ITINERARY_ADJUST AUTO guards, TEP repair apply, OR-Tools shadow guards, main-chain GATE/VERIFY facts | Any narrative that those absent HTTP surfaces were “已接入” at freeze |

**Conflict resolution rule:** Where earlier human/fact-pack narrative conflicted with Matrix (e.g. treating Iceland Confirm/Apply or Mobile Verified Apply as freeze-tree capabilities), **CLAIM_EVIDENCE_MATRIX v1.0 Claim IDs supersede** those descriptions for research citation.

Research may cite **Claim IDs only**. It must not regenerate paths, snippets, or test results.

---

## 4. C018 classification

| Field | Value |
|-------|--------|
| Claim | **C018** |
| Statement (summary) | Freeze tree imports `iceland-memory-shell-trip-id.util` from absent `src/trips/iceland-self-drive/**` |
| Observed effect | `agent.controller.ao-p0.contract.spec.ts` suite **fails to load** (module not found) |
| **Primary classification** | **基线不完整 (incomplete baseline)** |
| Secondary manifestation | **代码缺陷 (dangling import / non-self-contained commit tree)** |
| Explicitly **not** | 测试缺陷（测试正确暴露缺失模块）；功能移除（util 从未进入该 Commit）；环境阻断（非 runner/env 问题） |

Rationale: The freeze commit records an import edge whose target path is absent from the same commit. That is an incomplete, non-self-contained baseline; the load failure is a consequence, not a flaky test or missing CI environment.

---

## 5. Regeneration policy

| Option | Chosen |
|--------|--------|
| Keep `a7e9bdca5` + Matrix v1.0 | **YES** |
| Choose new commit with “当前正式能力” and regenerate Matrix | **NO** — those Iceland/Mobile Verified Apply surfaces are not committed formal capabilities |

If engineering later **commits** Iceland Confirm/Apply and/or Mobile Verified Apply as formal product code, that requires a **new freeze commit** and a **new Matrix version** (v1.1+). It does not retroactively expand v1.0 scope.

---

## 6. Fact-layer freeze declaration

Upon recording this decision in `SIGNATURES.md` and merging/approving the Matrix PR:

1. R&D **fact layer** for interface evaluation is **FROZEN** at Matrix v1.0 + baseline `a7e9bdca5`.
2. Research institutions evaluate architecture **only via Claim IDs**.
3. No further expansion of freeze-tree facts without a new Matrix version.

---

## 7. Sign-off block

| Role | Name / process | Decision | UTC date |
|------|----------------|----------|----------|
| Engineering Lead | R&D baseline applicability review (Matrix v1.0) | **AFFIRM retain `a7e9bdca5`** | 2026-07-24 |
| Tech Architect | R&D baseline applicability review (Matrix v1.0) | **AFFIRM retain `a7e9bdca5`; out-of-scope absent surfaces** | 2026-07-24 |
| QA Lead | R&D baseline applicability review (Matrix v1.0) | **AFFIRM; C018=incomplete baseline; Matrix overrides narrative** | 2026-07-24 |

Attestation:

> We jointly confirm that `a7e9bdca588431143e04e98d7c1c1204299c6e54` is the correct baseline for evaluating the current **committed** complete system as represented by CLAIM_EVIDENCE_MATRIX v1.0. Capabilities absent from that tree (Iceland Confirm/Apply implementation; Mobile Verified Apply implementation) are **out of scope** for this research round. Matrix Claim IDs override prior conflicting human descriptions. C018 is classified as **基线不完整** (with dangling-import code manifestation). Matrix regeneration is not required for this cycle.
