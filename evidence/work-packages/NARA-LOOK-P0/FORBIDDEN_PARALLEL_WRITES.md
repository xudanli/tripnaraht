# Forbidden Parallel Writes — NARA Look P0

**Status:** FROZEN candidate (Q2 applied 2026-07-25)  
**Severity:** HARD BAN — CI / review reject if violated

---

## Ban list

| # | Forbidden | Correct path |
|---|-----------|--------------|
| 1 | Look API directly mutates `ItineraryItem` / trip day plan | UWC Preview → Confirm → Apply |
| 2 | Vision / multimodal provider emits Apply commands | Extraction → facts only |
| 3 | OCR result patches authoritative road status SSOT | Evidence assertion with source=`USER_REPORT` / Look; reconcile vs official |
| 4 | Auto-update `VehicleProfile` from photo without Confirm | Suggest + user Confirm via Decision/UWC |
| 5 | New Look-only “decision ledger” store for formal decisions | Append RFC-001 ledger / WorldStateStore |
| 6 | Treat in-memory `RealtimeWorldStateService` as sole persistence | Durable Event + WorldStateStore |
| 7 | Client calls Apply for Look (UWC-1e violation) | Client Preview + Confirm only |
| 8 | `EXECUTION_BLOCK` cleared by ACKNOWLEDGE into write | Safety Preview / navigate only |
| 9 | Emulate composite plan fix by chaining undeclared corridors | Existing Arrange/UWC slice contracts |
| 10 | Bypass Constraint Gateway for F-road / ROAD_STATUS | Gateway evaluate + Unified Assessment |
| 11 | Extend `UnifiedAssessmentLaneKind` with `LOOK_FIELD` | Use `ObservationChannel` (Q1) |
| 12 | Image result overwrites `VehicleProfile` | Suggest + Confirm only (Q3) |
| 13 | No-GPS road-based `EXECUTION_BLOCK` / formal road-fit | INFO / SAFETY_GENERIC only (Q5) |
| 14 | New `observationId` for same recapture task | Same id + `captureRevision++` (Q7) |
| 15 | Member / Advisor Confirm Apply | Role matrix (Q8) |
| 16 | Original media TTL longer than eng default without review | `LOOK_MEDIA_SHORT_TERM_V1` (Q4) |

---

## Allowed writes (narrow)

| Write | Allowed when |
|-------|--------------|
| Persist `TravelObservationEvent` | Always (trip-scoped Look store) |
| Persist `ObservationAssessment` | After assess |
| Media object create/delete | User submit / user delete / retention job |
| WorldState assertion from Look | After grounding; marked non-authoritative / user-observed provenance |
| DecisionProblem create/link | Trip impact requires decision |
| UWC Apply | Only after sealed Confirm on existing corridor |

---

## Review checklist (PR)

- [ ] No new `*Apply*` handler under `travel-observation` that writes itinerary  
- [ ] No provider JSON field for `command` / `mutation`  
- [ ] Assessment actions use `commandRef` / `payloadRef` into existing Preview APIs  
- [ ] Tests cover CONFLICTING → non-deterministic conclusion  
- [ ] Delete path does not leave orphan media without queue entry  
