# Naming Map — PRD ↔ TripNARA repo

**Status:** FROZEN candidate (Q1 applied 2026-07-25)  
**Owner:** Arch  
**Rule:** Prefer repo names in code; PRD names allowed in product copy.

---

## Core terms

| PRD term | Repo / S0 term | Notes |
|----------|----------------|-------|
| Observed Lane (deprecated wording) | `ObservationChannel` = `'LOOK_FIELD'` | Prefer “Observation Channel / Observed Evidence / Observed State”. **Never** Assessment / Authoritative / Executability Lane |
| TravelObservationEvent | `TravelObservationEvent` | New |
| ObservationContext | `ObservationContext` | New; built from trip grounding |
| ObservationAssessment | `ObservationAssessment` | New; may link DecisionProblem |
| World State | RFC-001 `WorldStateAssertion` / snapshots | Vision cannot write authority |
| Unified Assessment | `UnifiedConstraintAssessmentService` + card DTO | Reuse |
| DecisionProblem | RFC-001 / gateway DecisionProblem | Link via `linkedDecisionProblemId` |
| Evidence Ledger | Prefer `Rfc001DecisionLedger` + WorldStateStore | Do not create 4th ledger |
| Preview → Confirm → Apply | UWC-1e + Decision submit/apply | No Look Apply API |
| VehicleProfile | `VehicleProfile.vehicleClass` | P0: `LookDrivetrain` = 2WD\|4WD\|UNKNOWN on Context only; no AWD decision value |
| Road Status Snapshot | road-status providers + WorldStateStore | Bind `roadStatusSnapshotId` |
| Semantic Key | Frozen list in `SemanticKeys.md` | Bridge to constraint keys where listed |

---

## Assessment status mapping (UI)

| PRD result status | AssessmentStatus | Constraint aggregate tone (approx) |
|-------------------|------------------|------------------------------------|
| 可以继续 | INFO | PASS / info |
| 需要注意 | NOTICE | WARN |
| 需要确认 | NEED_CONFIRM | WARN / decision required |
| 建议替换 | SUGGEST_REPLACE | WARN |
| 不要继续 | EXECUTION_BLOCK | EXECUTION_BLOCK |
| 暂时无法判断 | UNKNOWN | — |

---

## Intent ↔ sceneType

| Intent | Expected sceneType(s) |
|--------|------------------------|
| CHECK_VEHICLE | VEHICLE |
| CHECK_ROAD | ROAD_SIGN, ROAD_ENTRY |
| CHECK_ACTIVITY_ENTRY | ACTIVITY_ENTRY |

Mismatch → raise uncertainty / recapture, do not force map.

---

## WorldObservation.type projection hints

| Look intent / facts | Suggested `WorldObservation.type` |
|---------------------|-----------------------------------|
| Road closed / F-road / gravel | `ROAD_STATUS` or `HAZARD` |
| Vehicle class / drivetrain | `TRANSPORT` |
| Meeting point wrong | Prefer DecisionProblem / execution deviation — not weather |
