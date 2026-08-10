# Contract — ObservationContext

**Status:** FROZEN candidate (Q3 applied 2026-07-25)  
**Built by:** grounding layer (`context-builder` + trip/geo grounding)  
**Consumed by:** reconciliation + assessment

---

## Purpose

Read-only snapshot of trip / spatial / vehicle / execution / external evidence **at assessment time**.  
Does not mutate trip. Missing fields force degraded assessment (INFO / UNKNOWN), not invented values.

---

## Shape

```ts
/** P0 Look drivetrain — not an extension of VehicleProfile (Q3) */
type LookDrivetrain = '2WD' | '4WD' | 'UNKNOWN';

interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

interface ObservationContext {
  trip: {
    tripId: string;
    phase: 'TRAVELING'; // P0: reject or degrade if not TRAVELING
    dayIndex: number;
  };

  spatial: {
    location?: GeoPoint;
    heading?: number;
    nearbyRoadIds: string[];
    nearbyPoiIds: string[];
  };

  temporal: {
    localTime: string;   // local wall clock ISO or offset form
    capturedAt: string;
  };

  vehicle?: {
    vehicleId: string;
    /** Map to existing VehicleClass — do not mutate core VehicleProfile */
    vehicleClass: string; // SEDAN | SUV_4WD | CAMPERVAN | EV_CAMPERVAN | UNKNOWN
    /**
     * Look-local only. AWD is NOT a P0 decision value.
     * Resolution: intake/booking → rental metadata → VehicleClass → image → UNKNOWN.
     * Image must never override higher-ranked structured data.
     */
    drivetrain: LookDrivetrain;
  };

  execution: {
    currentActivityId?: string;
    nextActivityId?: string;
    destinationId?: string;
    bookingId?: string;
  };

  externalEvidence: {
    weatherSnapshotId?: string;
    roadStatusSnapshotId?: string;
    /** ISO timestamp of official road status used */
    roadStatusUpdatedAt?: string;
  };
}
```

---

## Build rules

| Input missing | Assessment consequence |
|---------------|------------------------|
| Location permission / GPS | Vision INFO / generic explain only (Q5); no formal road-fit, entry distance, or road-based `EXECUTION_BLOCK` |
| Vehicle profile | Vehicle-road mismatch cannot be `EXECUTION_BLOCK` from vision alone |
| Booking / activity | Activity entry → `UNKNOWN` or recapture / order missing copy |
| Road status snapshot | `DATA_UNCERTAINTY` path; no deterministic “open and safe” |
| Heading | Road-entry matching confidence down; may request recapture |

Closed-sign ROAD CLOSED / no-entry without GPS → `NOTICE / SAFETY_GENERIC` only (not formal road `EXECUTION_BLOCK`). See Q5.

---

## Alignment with existing types

| Context field | Prefer reading from |
|---------------|---------------------|
| `vehicle.vehicleClass` | `VehicleProfile` / trip self-drive profile |
| `externalEvidence.roadStatus*` | `WorldStateStore` / road-status providers |
| `execution.*` | Trip day state / activity booking |
| `spatial.nearbyRoadIds` | routing / spatial graph (Iceland pack) |

P0 **does not** extend core `VehicleProfile` with `drivetrain`. Follow-up RFC for AWD / clearance / tires / rental road bans.
