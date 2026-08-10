# Contract — P0 Semantic Keys (frozen set)

**Status:** DRAFT (S0 freeze candidate)  
**Rule:** Assessment and Event facts may only use keys listed here.  
**Add key:** requires CS+Arch amendment to this file (no silent string invent).

---

## Vehicle

| Key | Meaning |
|-----|---------|
| `OBSERVATION.VEHICLE.CLASS_DETECTED` | Detected vehicle class cue |
| `OBSERVATION.VEHICLE.DRIVETRAIN_DETECTED` | 2WD / AWD / 4WD cue |
| `OBSERVATION.VEHICLE.MODEL_DETECTED` | Make/model string |
| `DATA_UNCERTAINTY.VEHICLE_DRIVETRAIN_UNKNOWN` | Cannot establish drivetrain |
| `RULE_TRIGGER.FROAD_VEHICLE_MISMATCH` | Planned F-road vs vehicle unfit |

**Constraint bridge:** prefer linking to `OFFICIAL_IS_FROAD_2WD` / `TERRAIN_F_ROAD_UNFIT` when mismatch fires.

---

## Road

| Key | Meaning |
|-----|---------|
| `OBSERVATION.ROAD.FROAD_SIGN_DETECTED` | F-road / highland sign |
| `OBSERVATION.ROAD.CLOSED_SIGN_DETECTED` | Closure / no-entry sign |
| `OBSERVATION.ROAD.GRAVEL_SURFACE_DETECTED` | Gravel / rough surface cue |
| `OBSERVATION.ROAD.WATER_CROSSING_DETECTED` | Ford / water crossing cue |
| `DATA_UNCERTAINTY.ROAD_ID_UNKNOWN` | Road id not readable / unmatched |
| `DATA_CONFLICT.ROAD_STATUS_CONFLICT` | Field vs official status conflict |

**Constraint bridge:** `ROAD_STATUS` / road authority snapshots via EvidenceResolver.

---

## Activity entry

| Key | Meaning |
|-----|---------|
| `OBSERVATION.ACTIVITY.OPERATOR_SIGN_DETECTED` | Operator name / brand on sign |
| `OBSERVATION.ACTIVITY.ENTRY_DETECTED` | Entry / meeting-point visual |
| `EXECUTION_DEVIATION.WRONG_MEETING_POINT` | GPS/POI ≠ booking meeting point |
| `EXECUTION_DEVIATION.MEETING_POINT_DISTANCE` | Distance / walk-time cue |
| `RISK.ACTIVITY_LATE_ARRIVAL` | Late risk vs start time |

---

## Parking (V1.1 amendment — RealityOS P0-A)

| Key | Meaning |
|-----|---------|
| `OBSERVATION.PARKING.SIGN_DETECTED` | Parking regulation sign present |
| `OBSERVATION.PARKING.NO_PARKING_DETECTED` | No-parking / stop prohibited cue |
| `OBSERVATION.PARKING.PAID_ZONE_DETECTED` | Paid parking / ticket zone |
| `OBSERVATION.PARKING.TIME_LIMIT_DETECTED` | Time window / max duration (value string) |
| `OBSERVATION.PARKING.RESIDENT_ONLY_DETECTED` | Resident / permit-only cue |
| `DATA_UNCERTAINTY.PARKING_RULE_INCOMPLETE` | Incomplete supplementary plate / OCR |
| `RULE_TRIGGER.PARKING_NOT_ALLOWED_NOW` | Local time + official/rules say not allowed |

**Authority:** visual-only parking explanations never claim “绝对不会被罚款”; formal “现在不能停” requires GPS + local time + rule/official corroboration.

---

## Rental handover (V1.2 amendment — RealityOS P0-B)

| Key | Meaning |
|-----|---------|
| `OBSERVATION.RENTAL.HANDOVER_TYPE` | `PICKUP` / `RETURN` |
| `OBSERVATION.RENTAL.DAMAGE_SUSPECTED` | Suspected scratch/dent cue (not liability) |
| `OBSERVATION.RENTAL.MILEAGE_DETECTED` | Odometer reading |
| `OBSERVATION.RENTAL.FUEL_LEVEL_DETECTED` | Fuel / charge level cue |
| `OBSERVATION.RENTAL.PLATE_DETECTED` | Plate text (mask in UI) |
| `DATA_UNCERTAINTY.RENTAL_VIEWS_INCOMPLETE` | Required capture angles missing |

**Boundary:** AI flags suspected damage only; `liabilityAssigned=false`; never auto-send to lessor; PDF export = P0.5 (`exportStatus=NOT_REQUESTED`).

---

## Cross-cutting (allowed)

| Key | Meaning |
|-----|---------|
| `DATA_UNCERTAINTY.GPS_INSUFFICIENT` | Accuracy / missing location |
| `DATA_UNCERTAINTY.CONTEXT_MISSING` | Trip/day/vehicle/booking missing |
| `DATA_CONFLICT.IMAGE_LOCATION_MISMATCH` | Photo content vs GPS inconsistency |
| `DATA_UNCERTAINTY.OFFICIAL_DATA_UNAVAILABLE` | Road/weather snapshot missing |

---

## Explicitly not in P0 freeze

- Contract / insurance document keys  
- Dashboard fault codes  
- Emotion / face identity keys  
- Glasses-specific stream keys  

---

## Version

`semanticKeysVersion: 'NARA_LOOK_P0_V1_2'`  
Bump version string on any additive/breaking change after sign-off.  
V1.1 adds Parking keys for RealityOS P0-A (2026-07-26).  
V1.2 adds Rental handover keys for RealityOS P0-B (2026-07-26).
