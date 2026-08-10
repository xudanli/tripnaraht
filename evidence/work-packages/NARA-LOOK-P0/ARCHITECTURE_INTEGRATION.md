# Architecture Integration — NARA Look P0

**Status:** FROZEN candidate (Q1/Q2 applied 2026-07-25)  
**Rule:** Thin adapter module; call existing gateways; no parallel decision stack.  
**Channel:** `ObservationChannel = 'LOOK_FIELD'` — never extend `UnifiedAssessmentLaneKind`.

---

## Target module layout

```text
src/travel-observation/          # or src/trips/travel-observation/
├── observation.controller.ts
├── observation.service.ts
├── observation.repository.ts
├── observation.types.ts
├── media/
│   ├── upload.service.ts          # wraps trip-files / object store
│   ├── privacy-redaction.service.ts
│   └── retention.service.ts
├── extraction/
│   ├── provider.interface.ts
│   ├── multimodal.service.ts      # wraps MultimodalWorldPerception + Schema
│   ├── ocr.service.ts             # wraps providers/ocr
│   └── extraction-schema.ts
├── ontology/
│   ├── observation-ontology.mapper.ts
│   └── semantic-keys.ts
├── grounding/
│   ├── context-builder.ts
│   ├── geo-grounding.service.ts
│   └── trip-grounding.service.ts
├── reconciliation/
│   ├── state-reconciliation.service.ts
│   └── evidence-conflict.service.ts
└── assessment/
    ├── observation-assessment.service.ts
    └── observation-action.builder.ts
```

---

## Call graph (normative)

```text
iOS Look
  → observation.controller
      → media upload (trip-files)
      → extraction (OCR + multimodal) → Schema validate
      → ontology mapper → TravelObservationEvent.observations
      → context-builder → ObservationContext
      → reconciliation
           ├→ EvidenceResolverService / WorldStateStoreService  (durable assertions)
           └→ RealtimeWorldStateService.submitObservation      (optional fusion)
      → observation-assessment.service
           ├→ ConstraintEvaluationGatewayService (F-road / ROAD_STATUS)
           ├→ UnifiedConstraintAssessmentService (read / link)
           └→ DecisionEngineGatewayService (open/link DecisionProblem when needed)
  → actions.PREVIEW / NAVIGATION
      → existing UWC Preview/Confirm OR Unified Decision preview/submit
      → NEVER Look-local itinerary writer
```

---

## Reuse inventory

| Concern | Existing path | Look usage |
|---------|---------------|------------|
| User field report | `realtime-user.controller` `POST report` | Pattern only; Look has richer media lifecycle |
| WorldObservation | `realtime-world-state.interface.ts` | Optional projection after grounding |
| Evidence resolve | `guardian-decision-core/evidence/` | Primary durable evidence path |
| Constraints | `constraint-evaluation.gateway.service.ts` | Vehicle-road / road status |
| Unified UI cards | `unified-constraint-assessment` + frontend card util | Status tones |
| Decisions | `decision-runtime/gateway/` | Linked problems |
| Writeback | UWC-1e / Arrange corridors | Preview only from Look CTA |
| Vehicle / F-road | `OFFICIAL_IS_FROAD_2WD`, repair `TERRAIN_F_ROAD_UNFIT` | Assessment rules |
| OCR | `src/providers/ocr/*` | Sign / badge / operator text |
| Multimodal | `multimodal-world-perception.service.ts` | Scene facts under Schema |
| Media | `trip-files` | New category for field photos |

---

## Persistence guidance

| Data | Store |
|------|-------|
| TravelObservationEvent + assessment | New trip-scoped store (metadata table or dedicated rows — Arch chooses in S1; **not** only in-memory) |
| Media blobs | Object store via trip-files |
| World assertions | WorldStateStore (RFC-001 path) |
| Decision records | Rfc001DecisionLedger when escalation occurs |
| Realtime fusion cache | RealtimeWorldStateService (ephemeral; not sole SSOT) |

---

## Iceland Country Pack note

Road / highland / F-road conclusions for `countryCode=IS` must respect pack readiness and seasonality.  
DEM / official evidence missing → `DATA_UNCERTAINTY` or REJECT-style block — **never** silent ALLOW from photo alone.
