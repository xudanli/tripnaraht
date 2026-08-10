/**
 * Platform-comparable rule surface for offline Shadow contrast.
 *
 * Uses platform constraint keys (MAX_DAILY_DRIVE, OFFICIAL_IS_FROAD_2WD, …)
 * evaluated from the same verification snapshot facts as Iceland Shadow.
 * This is NOT UnifiedConstraintAssessmentService.buildBundle (Prisma/TEP).
 */

import type { InitialPlanVerificationSnapshot } from '../types/iceland-initial-plan-verification.types';
import type {
  PlatformComparableFinding,
  PlatformComparableReport,
  ContrastSeverityBand,
} from '../types/iceland-shadow-vs-platform-contrast.types';
import { resolvePlaceAccessFacts } from '../utils/iceland-place-access-facts.util';
import {
  expectedConfirmedLodgingByDayIndex,
  isGoldenSetLodgingPlaceId,
  resolveLodgingAnchor,
  type ConfirmedLodgingRef,
} from '../utils/iceland-lodging-anchor-assessment.util';
import type { ConstraintEvaluationStatus } from '../../../decision-runtime/constraints/contracts/constraint-assertion';
import type { CanonicalOverallStatus } from '../../../decision-runtime/constraints/contracts/canonical-constraint-report';

function bandFor(status: ConstraintEvaluationStatus): ContrastSeverityBand {
  if (status === 'BLOCK') return 'HARD';
  if (status === 'WARNING' || status === 'REQUIRES_VERIFICATION') return 'SOFT';
  if (status === 'UNKNOWN') return 'SOFT';
  return 'PASS';
}

function deriveOverall(
  findings: PlatformComparableFinding[],
): CanonicalOverallStatus {
  if (findings.some((f) => f.status === 'BLOCK')) return 'INFEASIBLE';
  if (findings.some((f) => f.status === 'REQUIRES_VERIFICATION')) {
    return 'UNVERIFIED';
  }
  if (findings.some((f) => f.status === 'WARNING' || f.status === 'UNKNOWN')) {
    return 'CONDITIONALLY_FEASIBLE';
  }
  return 'FEASIBLE';
}

export function evaluatePlatformComparableRules(
  snapshot: InitialPlanVerificationSnapshot,
): PlatformComparableReport {
  const findings: PlatformComparableFinding[] = [];
  const vehicle = snapshot.tripContext.vehicleProfile ?? {};
  const driveLimit = snapshot.tripContext.dailyDrivingLimitMin ?? 360;

  for (const day of snapshot.days) {
    const slack = driveLimit - day.totalDrivingMin;
    const driveStatus: ConstraintEvaluationStatus =
      slack < 0 ? 'BLOCK' : 'PASS';
    findings.push({
      constraintKey: 'MAX_DAILY_DRIVE',
      status: driveStatus,
      severityBand: bandFor(driveStatus),
      affectedDayIndex: day.dayIndex,
      message:
        driveStatus === 'BLOCK'
          ? `Day ${day.dayIndex} drive ${day.totalDrivingMin}min exceeds limit ${driveLimit}min`
          : `Day ${day.dayIndex} drive within ${driveLimit}min`,
      evidenceRefs: [`day:${day.dayIndex}:drive`],
      basis: 'platform_comparable.max_daily_drive',
    });

    for (const item of day.items) {
      const road = {
        ...resolvePlaceAccessFacts(item.canonicalPlaceId),
        ...item.roadRequirements,
      };

      if (road.requiresFroad) {
        const ok = vehicle.allowsFRoad === true;
        const status: ConstraintEvaluationStatus = ok ? 'PASS' : 'BLOCK';
        findings.push({
          constraintKey: 'OFFICIAL_IS_FROAD_2WD',
          status,
          severityBand: bandFor(status),
          affectedDayIndex: day.dayIndex,
          message: ok
            ? 'Vehicle allows F-road'
            : 'F-road required but vehicle disallows F-road (2WD / contract)',
          evidenceRefs: [
            `place:${item.canonicalPlaceId}`,
            'vehicle.allowsFRoad',
          ],
          basis: 'platform_comparable.official_is_froad_2wd',
        });
      }

      if (road.requires4wd) {
        const ok = vehicle.is4wd === true;
        const status: ConstraintEvaluationStatus = ok ? 'PASS' : 'BLOCK';
        findings.push({
          constraintKey: 'VEHICLE_4WD_REQUIRED',
          status,
          severityBand: bandFor(status),
          affectedDayIndex: day.dayIndex,
          message: ok
            ? 'Vehicle is 4WD'
            : '4WD required but vehicle is not 4WD',
          evidenceRefs: [`place:${item.canonicalPlaceId}`, 'vehicle.is4wd'],
          basis: 'platform_comparable.vehicle_4wd',
        });
      }

      if (road.riverCrossingRisk) {
        const ok = vehicle.allowsRiverCrossing === true;
        const status: ConstraintEvaluationStatus = ok ? 'PASS' : 'BLOCK';
        findings.push({
          constraintKey: 'RIVER_CROSSING_SELF_DRIVE',
          status,
          severityBand: bandFor(status),
          affectedDayIndex: day.dayIndex,
          message: ok
            ? 'Vehicle allows river crossing'
            : 'River crossing required but vehicle disallows self-drive ford',
          evidenceRefs: [
            `place:${item.canonicalPlaceId}`,
            'vehicle.allowsRiverCrossing',
          ],
          basis: 'platform_comparable.river_crossing_self_drive',
        });
      }
    }
  }

  findings.push(...evaluateConfirmedLodgingAnchors(snapshot));

  const overallStatus = deriveOverall(findings);
  const allowConfirm =
    overallStatus === 'FEASIBLE' || overallStatus === 'CONDITIONALLY_FEASIBLE';

  return {
    peerId: 'platform_comparable_rule_surface@v1',
    overallStatus,
    allowConfirm,
    findings,
    evaluatedAt: new Date().toISOString(),
  };
}

function resolveConfirmedLodgings(
  snapshot: InitialPlanVerificationSnapshot,
): ConfirmedLodgingRef[] {
  const fromCtx = snapshot.tripContext.confirmedLodgings ?? [];
  if (fromCtx.length) {
    return fromCtx
      .filter((l) => typeof l.placeId === 'number' && l.placeId > 0)
      .map((l) => ({
        placeId: l.placeId!,
        label: l.label,
        nightDate: l.nightDate,
      }));
  }
  return (snapshot.tripContext.confirmedLodgingPlaceIds ?? []).map(
    (placeId) => ({ placeId }),
  );
}

/** Mirrors Shadow ICELAND_LODGING_ANCHOR_001 severity bands. */
function evaluateConfirmedLodgingAnchors(
  snapshot: InitialPlanVerificationSnapshot,
): PlatformComparableFinding[] {
  const confirmed = resolveConfirmedLodgings(snapshot);
  if (!confirmed.length) return [];

  const findings: PlatformComparableFinding[] = [];
  const expectedByIdx = expectedConfirmedLodgingByDayIndex(
    snapshot.days,
    confirmed,
  );

  for (const lodging of confirmed) {
    if (isGoldenSetLodgingPlaceId(lodging.placeId)) continue;
    findings.push({
      constraintKey: 'CONFIRMED_LODGING_ANCHOR',
      status: 'BLOCK',
      severityBand: 'HARD',
      message: `Confirmed lodging place ${lodging.placeId} is not a Golden Set LODGING`,
      evidenceRefs: [`place:${lodging.placeId}`],
      basis: 'platform_comparable.confirmed_lodging_invalid',
    });
  }

  for (let i = 0; i < snapshot.days.length; i++) {
    const day = snapshot.days[i]!;
    const expected = expectedByIdx.get(i);
    const anchor = resolveLodgingAnchor({
      date: day.date,
      dayIndex: day.dayIndex,
      lodgingAnchor: day.lodgingAnchor,
      endAnchor: day.endAnchor,
      itemCount: day.items.length,
    });

    if (expected) {
      if (!isGoldenSetLodgingPlaceId(expected.placeId)) continue;
      if (!anchor?.placeId) {
        findings.push({
          constraintKey: 'CONFIRMED_LODGING_ANCHOR',
          status: 'BLOCK',
          severityBand: 'HARD',
          affectedDayIndex: day.dayIndex,
          message: `Day ${day.dayIndex} missing overnight anchor for confirmed lodging ${expected.placeId} on ${expected.nightDate}`,
          evidenceRefs: [
            `night:${expected.nightDate}`,
            `expected:${expected.placeId}`,
          ],
          basis: 'platform_comparable.confirmed_lodging_missing',
        });
      } else if (anchor.placeId === expected.placeId) {
        findings.push({
          constraintKey: 'CONFIRMED_LODGING_ANCHOR',
          status: 'PASS',
          severityBand: 'PASS',
          affectedDayIndex: day.dayIndex,
          message: `Day ${day.dayIndex} overnight matches confirmed lodging ${expected.placeId}`,
          evidenceRefs: [`lodging:${anchor.placeId}`, `night:${expected.nightDate}`],
          basis: 'platform_comparable.confirmed_lodging_match',
        });
      } else {
        findings.push({
          constraintKey: 'CONFIRMED_LODGING_ANCHOR',
          status: 'BLOCK',
          severityBand: 'HARD',
          affectedDayIndex: day.dayIndex,
          message: `Day ${day.dayIndex} overnight ${anchor.placeId} mismatches confirmed lodging ${expected.placeId}`,
          evidenceRefs: [
            `lodging:${anchor.placeId}`,
            `expected:${expected.placeId}`,
            `night:${expected.nightDate}`,
          ],
          basis: 'platform_comparable.confirmed_lodging_mismatch',
        });
      }
      continue;
    }

    if (anchor?.source === 'GOLDEN_SET_SOFT') {
      findings.push({
        constraintKey: 'CONFIRMED_LODGING_ANCHOR',
        status: 'WARNING',
        severityBand: 'SOFT',
        affectedDayIndex: day.dayIndex,
        message: `Day ${day.dayIndex} uses soft lodging fill while other nights have confirmed bookings`,
        evidenceRefs: [`lodging:${anchor.placeId}`, `night:${day.date}`],
        basis: 'platform_comparable.confirmed_lodging_partial_soft',
      });
    }
  }

  return findings;
}
