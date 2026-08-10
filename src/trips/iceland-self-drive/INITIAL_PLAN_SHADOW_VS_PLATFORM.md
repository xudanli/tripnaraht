# Initial Plan — Shadow vs Platform Unified Assessment Contrast

## Purpose

Calibrate Iceland **Shadow Unified Assessment** (Confirm/Apply gate authority) against the **platform comparable constraint surface** so Preview authority does not silently drift from mainline keys.

This harness is **evidence for converge-or-dual-track**. It does **not** replace Shadow as Confirm/Apply authority.

## Decision: river = converge

`ICELAND_VEHICLE_RIVER_001` ↔ `RIVER_CROSSING_SELF_DRIVE`.

## Layers

| Layer | When | Entry |
|-------|------|--------|
| **Peer** | Preview VERIFY | `evaluatePlatformComparableRules` (offline keys) |
| **Gateway** | Preview VERIFY (Nest) | `verificationSnapshotToEvaluatePlan` → `ConstraintEvaluationGateway.evaluatePlan` (+ peer BLOCK/WARNING as guardianAssertions ingress) |
| **Post-Apply bundle** | After Apply | `UnifiedConstraintAssessmentService.buildBundle(prismaTripId)` vs Shadow `allowConfirm` at VERIFY |

## Allowed claim

> Same verification snapshot can be dual-run (Shadow + peer [+ Gateway]); after Apply, `buildBundle` can be contrasted for materialization drift.

## Forbidden claims

- Contrast PASS ⇒ Shadow ≡ platform Unified Assessment
- Contrast changes Confirm / Apply gates
- Post-Apply bundle failure ⇒ Apply rollback

## CID map

| Iceland cid | Platform key |
|-------------|--------------|
| `ICELAND_DAY_DRIVE_CAP_001` | `MAX_DAILY_DRIVE` |
| `ICELAND_VEHICLE_FROAD_001` | `OFFICIAL_IS_FROAD_2WD` |
| `ICELAND_VEHICLE_4WD_001` | `VEHICLE_4WD_REQUIRED` |
| `ICELAND_VEHICLE_RIVER_001` | `RIVER_CROSSING_SELF_DRIVE` |
| `ICELAND_LODGING_ANCHOR_001` | `CONFIRMED_LODGING_ANCHOR` |

Unmapped by design: day-scope, highlands mix, booking, empty-plan.

## Diff report

`ShadowVsPlatformContrastReport`:

- `gateAligned` — Shadow ↔ **peer**
- `gateAlignedWithGateway` — Shadow ↔ **Gateway** (when injected)
- `postApplyBundle` — Shadow VERIFY allowConfirm ↔ bundle blocking keys (after Apply)
- `mapped[]`, `unmappedIcelandCids`

## HTTP

| Path | Field |
|------|--------|
| `GET …/proposals/:id` | `calibration.shadowVsPlatform` (+ optional `platform.gateway`, `postApplyBundle`) |
| `GET …/proposals/:id/shadow-vs-platform` | Full report |
| `POST …/apply` | `calibration.postApplyBundle` summary |

## Frontend

See [`FRONTEND_PREVIEW_INTEGRATION.md`](./FRONTEND_PREVIEW_INTEGRATION.md).  
**Never gate Confirm/Apply on calibration.**

## Golden fixtures (peer)

| Fixture | Expect |
|---------|--------|
| `golden_circle` | `gateAligned` |
| `highlands_froad_2wd` | mapped HARD; Gateway INFEASIBLE when wired |
| `highlands_river` | river mapped HARD; `gateAligned` |
| `drive_cap_block` | drive mapped HARD |

## Paths

- Service: `services/iceland-shadow-vs-platform-contrast.service.ts`
- Peer: `peers/platform-comparable-rule.peer.ts`
- Adapter: `adapters/verification-snapshot-to-evaluate-plan.adapter.ts`
- Gateway ingress: `adapters/peer-findings-to-guardian.adapter.ts`
- Post-Apply: `utils/post-apply-bundle-contrast.util.ts`
