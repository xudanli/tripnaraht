# Contract — TravelObservationEvent

**Status:** FROZEN candidate (Q1 / Q4 / Q7 applied 2026-07-25)  
**Code target (S1):** `src/travel-observation/observation.types.ts` (path negotiable under `src/trips/`)  
**Maps to:** see [`../NAMING_MAP.md`](../NAMING_MAP.md)

---

## Purpose

Durable, trip-scoped record of a user-submitted field observation.  
**Not** authoritative World State. Downstream may project into evidence / `WorldObservation` / DecisionProblem after grounding + reconciliation.

---

## Shape

```ts
/** Q1 — fact acquisition channel; NOT UnifiedAssessmentLaneKind */
type ObservationChannel = 'LOOK_FIELD';

type ObservationSource =
  | 'IPHONE_CAMERA'
  | 'PHOTO_LIBRARY';
  // SMART_GLASSES — future channel/source; not S1 product surface

type ObservationIntent =
  | 'CHECK_VEHICLE'
  | 'CHECK_ROAD'
  | 'CHECK_ACTIVITY_ENTRY';

type VerificationStatus =
  | 'UNVERIFIED'
  | 'CORROBORATED'
  | 'CONFLICTING'
  | 'VERIFIED'
  | 'INSUFFICIENT';

type ObservationFactSource = 'VISION' | 'OCR' | 'ON_DEVICE';

interface ObservationCaptureRevision {
  observationId: string;
  captureRevision: number;
  mediaRefs: string[];
  addedAt: string;
  reason: 'SYSTEM_RECAPTURE_REQUEST' | 'USER_ADDED_VIEW';
}

interface TravelObservationEvent {
  observationId: string;
  tripId: string;
  dayIndex?: number;

  channel: ObservationChannel; // always LOOK_FIELD in S1
  source: ObservationSource;
  intent: ObservationIntent;

  capturedAt: string;
  submittedAt: string;

  mediaRefs: string[];
  captureRevision: number; // increments on append (Q7)
  captureRevisions?: ObservationCaptureRevision[];

  latestAssessmentRevision?: number;

  spatialContext: {
    latitude?: number;
    longitude?: number;
    altitude?: number;
    heading?: number;
    accuracyMeters?: number;
    routeSegmentId?: string;
  };

  tripContext: {
    vehicleId?: string;
    currentActivityId?: string;
    nextActivityId?: string;
    bookingId?: string;
  };

  observations: Array<{
    semanticType: string;
    semanticKey: string;
    value: unknown;
    confidence: number;
    source: ObservationFactSource;
  }>;

  verificationStatus: VerificationStatus;

  privacy: {
    containsFace: boolean;
    containsPlate: boolean;
    containsDocument: boolean;
    redactionApplied: boolean;
    retentionPolicy: 'LOOK_MEDIA_SHORT_TERM_V1';
  };

  status: ObservationPipelineStatus;
  userQuestion?: string;
}
```

---

## Invariants

| # | Rule |
|---|------|
| 1 | `intent` ∈ P0 three values only |
| 2 | Every `observations[].semanticKey` ∈ frozen Semantic Key set |
| 3 | `mediaRefs` non-empty for submit (except cancelled draft) |
| 4 | Vision facts alone ⇒ `verificationStatus` cannot be `VERIFIED` |
| 5 | Conflict ⇒ `CONFLICTING` or `INSUFFICIENT`, never silent overwrite |
| 6 | Event **must not** contain itinerary mutation commands |
| 7 | Delete enqueues media hard-delete; `LOOK_MEDIA_SHORT_TERM_V1 = min(72h, tripEnd+24h)` |
| 8 | Recapture keeps same `observationId` + increments `captureRevision` (Q7) |
| 9 | Re-assess appends `assessmentRevision`; never overwrite prior assessment |
| 10 | `channel` is independent of `UnifiedAssessmentLaneKind` |

---

## New observationId required when (Q7)

```text
distanceFromOriginal > 250m
or timeSinceOriginal > 30min
or routeSegmentId changed
or intent changed
```

Also: different object, history “重新判断”, new DecisionProblem event, different trip/day.

---

## Mapping → existing `WorldObservation` (optional projection)

| Look field | WorldObservation field |
|------------|------------------------|
| `observationId` | `observationId` |
| derived type ROAD / TRANSPORT / HAZARD | `type` |
| fixed `USER_REPORT` | `source` |
| `capturedAt` | `timestamp` |
| lat/lng + routeSegmentId | `location` |
| semantic facts payload | `data` |
| fact confidence (min or joint) | `confidence` |
| policy default (e.g. 6h) | `validityHours` |

Projection is **additive**. Look persistence remains SSOT for media + privacy + assessment link.

---

## Non-goals

- Replacing RFC-001 world-state assertions  
- Storing raw model prompts  
- Auto-updating `VehicleProfile` from image  
- Extending Assessment Lane with `LOOK_FIELD`
