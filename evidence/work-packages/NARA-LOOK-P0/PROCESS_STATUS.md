# NARA-LOOK-P0 — Process Status

**Updated:** 2026-07-25  
**Overall:** S0 CLOSED · S1–S6 engineering **IMPLEMENTED** · Pilot ship **HOLD** (Legal TTL + SIGNATURES)

```text
NARA Look S0 Open Questions: CLOSED
S1 Code Entry: APPROVED
Contract Freeze Date: 2026-07-25
```

```text
Media retention pending final legal confirmation,
but engineering default is frozen as LOOK_MEDIA_SHORT_TERM_V1.
```

Legal may further **shorten** TTL; must **not** lengthen without re-review.

---

## Sprint 0 checklist

| ID | Work | Owner | Status |
|----|------|-------|--------|
| S0-CS-01 | Freeze Event / Context / Assessment / RawVisual / Semantic Keys | CS + Arch | FROZEN candidate — decisions applied |
| S0-ARCH-01 | Integration + naming map + forbidden writes | Arch | FROZEN candidate — Q1/Q2/Q6/Q7 applied |
| S0-PM-01 | CTA matrix, recapture copy, role permissions | PM | **CLOSED** — [`s0-contracts/CTA_AND_ROLES.md`](./s0-contracts/CTA_AND_ROLES.md) |
| S0-SEC-01 | Retention, sensitive content, driving block | SEC + Legal | Eng default **FROZEN** (Q4); Legal CONFIRM for production |
| S0-OQ | Open questions Q1–Q8 | Joint | **CLOSED** — [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) |
| S0-SIGN | Joint sign-off | See SIGNATURES | OPEN (does not block S1 mock / contract code) |

---

## S1 allowed scope (from OPEN_QUESTIONS close-out)

| Allowed | Forbidden |
|---------|-----------|
| Types + contracts in code | Look Apply / PlanVersion write |
| Observation create + status machine | Extend Assessment Lane with LOOK_FIELD |
| Media append + captureRevision | Image overwrite of VehicleProfile |
| Assessment GET → 409 until COMPLETED | Long-term original media retention |
| iOS Capture Mock | No-GPS road EXECUTION_BLOCK |
| No-GPS degrade to INFO | New observationId for same recapture |
| Role gates + CTA mapping | Member / Advisor Confirm Apply |
| Preview refs with zero writes | |

---

## Post-S0 tickets

| ID | Work | Depends | Status |
|----|------|---------|--------|
| S1-BE-01 | Observation API + media upload/delete + 409 | OQ CLOSED | **IMPLEMENTED** — [`S1-BE-01.md`](./S1-BE-01.md) |
| S1-iOS-01 | Camera / confirm / progressive permissions + CTA | OQ CLOSED | **IMPLEMENTED** (handoff + TS client) — [`S1-iOS-01.md`](./S1-iOS-01.md) |
| S2-AI-01 | Extraction Schema + mappers + recapture | S1 types | **IMPLEMENTED** — [`S2-AI-01.md`](./S2-AI-01.md) |
| S3-BE-01 | Grounding + reconciliation | S1-BE + S2 | **IMPLEMENTED** — [`S3-BE-01.md`](./S3-BE-01.md) |
| S4-BE-01 | Assessment → Unified / DecisionProblem | S3 | **IMPLEMENTED** — [`S4-BE-01.md`](./S4-BE-01.md) |
| S4-BE-02 | Look DP → RFC-001 projection (Gateway) | S4-BE-01 | **IMPLEMENTED** — [`S4-BE-02.md`](./S4-BE-02.md) |
| S4-BE-03 | planVersion/snapshot resolve + read-model invalidate | S4-BE-02 | **IMPLEMENTED** — [`S4-BE-03.md`](./S4-BE-03.md) |
| S4-BE-04 | Look facts → WorldState assertion (non-authoritative) | S3 + S4-BE-03 | **IMPLEMENTED** — [`S4-BE-04.md`](./S4-BE-04.md) |
| S4-BE-05 | AssessmentAuthority + contextHash + API naming map | RealityOS PRD | **IMPLEMENTED** — [`S4-BE-05.md`](./S4-BE-05.md) |
| S5-iOS-01 | Result + evidence + Preview | S4 + CTA freeze | **IMPLEMENTED** — [`S5-iOS-01.md`](./S5-iOS-01.md) |
| S6-QA-01 | Golden Set + fault injection + Pilot gate | S5 | **IMPLEMENTED** (eng PASS; Legal/Signatures HOLD) — [`S6-QA-01.md`](./S6-QA-01.md) |
| S7-BE-01 | Parking P0-A (`CHECK_PARKING`) | RealityOS §11.2 | **IMPLEMENTED** — [`S7-BE-01.md`](./S7-BE-01.md) |
| S8-BE-01 | Rental EvidencePackage P0-B (`CHECK_RENTAL_HANDOVER`) | RealityOS P0-B | **IMPLEMENTED** — [`S8-BE-01.md`](./S8-BE-01.md) |
| S9-BE-01 | PATCH context + assessment feedback | RealityOS §16.5 / §16.7 | **IMPLEMENTED** — [`S9-BE-01.md`](./S9-BE-01.md) |

---

## Hard holds

| Hold | Until |
|------|-------|
| AI glasses work | PRD §二十五 Go/No-Go all green |
| Look-only Apply corridor | **CLOSED as NEVER for P0** — RFC only if corridors insufficient |
| Authoritative World State from vision | Never — Observation Channel only |
| Production media TTL longer than eng default | Re-review; Legal may only shorten |
