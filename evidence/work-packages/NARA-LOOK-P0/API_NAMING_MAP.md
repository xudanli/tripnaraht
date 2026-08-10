# API Naming Map — RealityOS PRD ↔ NARA Look engineering

**Status:** FROZEN candidate (2026-07-26)  
**Purpose:** Avoid dual SSOT between RealityOS PRD §16 and `travel-observation` HTTP.

---

## Rule

| Surface | Canonical in this repo (P0) |
|---------|------------------------------|
| Nest path | `/api/v1/trips/:tripId/observations` |
| PRD draft path | `/v1/trips/{tripId}/reality-observations` |

**P0 decision:** keep engineering path `observations`.  
Clients and BFF may expose `reality-observations` as an **alias** later; do not fork business logic.

| PRD (§16) | Engineering | Notes |
|-----------|-------------|-------|
| `POST …/reality-observations` | `POST …/observations` | create |
| `POST …/reality-observations/{id}/media` | `POST …/observations/{id}/media` | append / recapture |
| `POST …/reality-observations/{id}/assess` | (sync in create pipeline) | assess is automatic; optional explicit endpoint = future |
| `GET …/reality-observations/{id}` | `GET …/observations/{id}` | status |
| `GET …/…/assessments/latest` | `GET …/observations/{id}/assessment` | **409** until COMPLETED |
| `GET …/reality-assessments/{id}/evidence` | `GET …/observations/{id}/evidence-package` (rental P0-B) + Assessment `evidenceIds` / Evidence Sheet | PDF export = P0.5 |
| `PATCH …/context` | `PATCH …/observations/{id}/context` | merge + optional reassess; `look_context_corrected` |
| `POST …/decision-entry` | auto on assess + `GET …/decision-problem` | Q2 Preview only |
| `POST …/feedback` | `POST …/observations/{id}/assessment/feedback` | `look_feedback_submitted`; no Apply |
| `DELETE …/reality-observations/{id}` | `DELETE …/observations/{id}` | deletion receipt |

---

## Type aliases (docs only)

| RealityOS PRD | Code |
|---------------|------|
| `RealityObservation` | `TravelObservationEvent` |
| `LookAssessment` | `ObservationAssessment` |
| `ObservationChannel` | `'LOOK_FIELD'` |
| `AssessmentAuthority` | `AssessmentAuthority` (S4-BE-05) |
| `contextHash` | `contextHash` / grounding `contextHash` |
