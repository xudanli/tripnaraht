# NARA-LOOK-P0 — Travel Field Observation Work Package

**Date opened:** 2026-07-25  
**Status:** **Open Questions CLOSED** · **S1–S6 engineering IMPLEMENTED** · Pilot ship HOLD (Legal TTL + SIGNATURES)  
**Contract freeze date:** 2026-07-25  
**Product:** NARA Look (TripNARA iOS · TRAVELING phase)  
**PRD:** NARA Look V1.0 P0 MVP (user-supplied)  
**Verdict:** CONDITIONAL GO — thin `travel-observation` module; no parallel decision stack

---

## Goal

Freeze Sprint 0 contracts and integration boundaries so S1+ can implement:

```text
Camera / Library
  → TravelObservationEvent
  → Extraction (OCR + multimodal, Schema-gated)
  → Grounding (Trip / GPS / Vehicle / Booking)
  → Reconciliation (official road / weather)
  → ObservationAssessment
  → Unified Assessment / DecisionProblem (optional)
  → Preview → Confirm → Apply (existing UWC / Decision APIs only)
```

---

## Package index

| Doc | Purpose |
|-----|---------|
| [`SCOPE.md`](./SCOPE.md) | IN / OUT / FORBIDDEN |
| [`PROCESS_STATUS.md`](./PROCESS_STATUS.md) | Sprint checklist + owners |
| [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) | **CLOSED** S1 pre-code decisions |
| [`ARCHITECTURE_INTEGRATION.md`](./ARCHITECTURE_INTEGRATION.md) | Reuse map into existing modules |
| [`NAMING_MAP.md`](./NAMING_MAP.md) | PRD terms ↔ repo types |
| [`FORBIDDEN_PARALLEL_WRITES.md`](./FORBIDDEN_PARALLEL_WRITES.md) | Hard bans |
| [`PRIVACY_AND_SAFETY.md`](./PRIVACY_AND_SAFETY.md) | Retention, redaction, driving block |
| [`API_NAMING_MAP.md`](./API_NAMING_MAP.md) | RealityOS PRD paths ↔ engineering `observations` |
| [`REALITYOS_PRD_GAP.md`](./REALITYOS_PRD_GAP.md) | RealityOS PRD v1.0 ↔ 工程差距 |
| [`SIGNATURES.md`](./SIGNATURES.md) | Joint review sign-off |
| [`s0-contracts/`](./s0-contracts/) | Frozen TypeScript-shaped contracts |

### S0 contracts

| Contract | File |
|----------|------|
| TravelObservationEvent | [`s0-contracts/TravelObservationEvent.md`](./s0-contracts/TravelObservationEvent.md) |
| ObservationContext | [`s0-contracts/ObservationContext.md`](./s0-contracts/ObservationContext.md) |
| ObservationAssessment | [`s0-contracts/ObservationAssessment.md`](./s0-contracts/ObservationAssessment.md) |
| RawVisualObservation | [`s0-contracts/RawVisualObservation.md`](./s0-contracts/RawVisualObservation.md) |
| Semantic Keys (P0 freeze) | [`s0-contracts/SemanticKeys.md`](./s0-contracts/SemanticKeys.md) |
| Observation status machine | [`s0-contracts/StatusMachine.md`](./s0-contracts/StatusMachine.md) |
| HTTP API sketch | [`s0-contracts/HTTP_API.md`](./s0-contracts/HTTP_API.md) |
| CTA + roles (Q8) | [`s0-contracts/CTA_AND_ROLES.md`](./s0-contracts/CTA_AND_ROLES.md) |

---

## Exit criteria — Sprint 0

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Three domain contracts + RawVisual + Semantic Keys frozen | FROZEN candidate |
| 2 | Naming map + Forbidden writes reviewed by Arch | FROZEN candidate |
| 3 | CTA / role matrix frozen by PM | **CLOSED** |
| 4 | Privacy retention eng default | **FROZEN** (`min(72h, tripEnd+24h)`); Legal for production |
| 5 | Open questions closed | **CLOSED** |
| 6 | `SIGNATURES.md` person sign-off | OPEN (not blocking S1 mock) |

**S1 scoped coding authorized** per [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md) S1 Entry Conditions.  
**Glasses / continuous video remain HOLD** until PRD §二十五 Go/No-Go.

---

## Suggested ticket order after S0 PASS

1. **S1-BE-01** — ✅ create/status/assessment 409/media/delete (mock assess) — [`S1-BE-01.md`](./S1-BE-01.md)  
2. **S1-iOS-01** — ✅ Capture Mock handoff + TS client — [`S1-iOS-01.md`](./S1-iOS-01.md)  
3. **S2-AI-01** — ✅ Schema + heuristic OCR + ontology map — [`S2-AI-01.md`](./S2-AI-01.md)  
4. **S3-BE-01** — ✅ grounding + reconciliation — [`S3-BE-01.md`](./S3-BE-01.md)  
5. **S4-BE-01** — ✅ DecisionProblem bridge + Preview routing — [`S4-BE-01.md`](./S4-BE-01.md)  
5b. **S4-BE-02** — ✅ Look → RFC-001 projection — [`S4-BE-02.md`](./S4-BE-02.md)  
5c. **S4-BE-03** — ✅ planVersion/snapshot + read-model invalidate — [`S4-BE-03.md`](./S4-BE-03.md)  
5d. **S4-BE-04** — ✅ Look facts → WorldState assertion — [`S4-BE-04.md`](./S4-BE-04.md)  
5e. **S4-BE-05** — ✅ Authority + contextHash + API map — [`S4-BE-05.md`](./S4-BE-05.md)  
6. **S5-iOS-01** — ✅ Result VM + evidence + Preview entry — [`S5-iOS-01.md`](./S5-iOS-01.md)  
7. **S6-QA-01** — ✅ Golden Set + fault injection — [`S6-QA-01.md`](./S6-QA-01.md) (Pilot ship: Legal + SIGNATURES HOLD)  
8. **S7-BE-01** — ✅ Parking P0-A — [`S7-BE-01.md`](./S7-BE-01.md)  
9. **S8-BE-01** — ✅ Rental EvidencePackage P0-B — [`S8-BE-01.md`](./S8-BE-01.md)  
10. **S9-BE-01** — ✅ PATCH context + feedback — [`S9-BE-01.md`](./S9-BE-01.md)

---

## Related existing systems (do not reinvent)

- `WorldObservation` — `src/trips/decision/optimization/realtime/realtime-world-state.interface.ts`
- Evidence / world state — `src/trips/guardian-decision-core/evidence/`
- Constraint gateway — `src/decision-runtime/constraints/`
- Unified Decision API — `src/decision-runtime/gateway/`
- UWC Preview/Confirm — `evidence/work-packages/UWC-01-unified-writeback-contract/`
- F-road × 2WD — `OFFICIAL_IS_FROAD_2WD` in trip-constraint-solver
- OCR / multimodal — `src/providers/ocr/`, `src/skills/world/services/multimodal-world-perception.service.ts`
