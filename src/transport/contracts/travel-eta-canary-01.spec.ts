import {
  classifyExecutionActualSampleQuality,
  computeActualDurationMin,
  computeActualDurationsV1,
  isEligibleForMaeCalibration,
} from './travel-eta-actual.contract';
import {
  executionEventRequiresEtaSnapshot,
  P0_EXECUTION_EVENT_TYPES,
} from './travel-eta-field-events.contract';
import { projectTravelEtaUserEvidence } from './travel-eta-user-evidence.contract';
import {
  applyPlanningAdjustments,
  projectLegacyDurationToEtaEnvelope,
} from './travel-eta.contract';
import {
  buildCanaryMetricsFromEvents,
  evaluateIcelandDefaultGateReview,
  ICELAND_CANARY_5_FIRST_ROUND_THRESHOLDS,
  type TravelEtaCanaryDashboardSnapshotV1,
} from '../ops/travel-eta-l2-canary.gate';
import { TRAVEL_ETA_ERROR_ATTRIBUTION_TABLE } from '../ops/travel-eta-error-attribution';
import {
  attachActualDuration,
  buildExecutionEtaReconciliation,
  buildPlanningReconciliationEvent,
} from './travel-eta-reconciliation.contract';

describe('travel-eta-execution-actual contract', () => {
  it('computes net driving duration excluding stops', () => {
    const net = computeActualDurationMin({
      actualDepartureAt: '2026-07-18T10:00:00.000Z',
      actualArrivalAt: '2026-07-18T12:30:00.000Z',
      excludedStopDurationMin: 20,
    });
    expect(net).toBe(130); // 150 elapsed − 20
  });

  it('Case A/B: elapsed / excluded / driving triad', () => {
    expect(
      computeActualDurationsV1({
        actualDepartureAt: '2026-07-18T09:00:00.000Z',
        actualArrivalAt: '2026-07-18T10:30:00.000Z',
        excludedStopDurationMin: 0,
      }),
    ).toEqual({
      elapsedDurationMin: 90,
      excludedStopDurationMin: 0,
      actualDrivingDurationMin: 90,
    });

    expect(
      computeActualDurationsV1({
        actualDepartureAt: '2026-07-18T09:00:00.000Z',
        actualArrivalAt: '2026-07-18T11:00:00.000Z',
        excludedStopDurationMin: 25,
      }),
    ).toEqual({
      elapsedDurationMin: 120,
      excludedStopDurationMin: 25,
      actualDrivingDurationMin: 95,
    });
  });

  it('P0 events: only DEPARTED freezes ETA snapshot', () => {
    expect(P0_EXECUTION_EVENT_TYPES).toEqual([
      'SEGMENT_DEPARTED',
      'SEGMENT_ARRIVED',
      'NON_DRIVING_STOP_RECORDED',
    ]);
    expect(executionEventRequiresEtaSnapshot('SEGMENT_DEPARTED')).toBe(true);
    expect(executionEventRequiresEtaSnapshot('SEGMENT_ARRIVED')).toBe(false);
    expect(executionEventRequiresEtaSnapshot('NON_DRIVING_STOP_RECORDED')).toBe(false);
  });

  it('classifies VALID without GPS; INVALID on destination change; PARTIAL on uncertain stop', () => {
    const base = {
      hasDepartedAt: true,
      hasArrivedAt: true,
      hasTravelEtaSnapshot: true,
      reachedPlannedDestination: true,
      destinationChanged: false,
      routeMateriallyChanged: false,
      nonDrivingStopsResolved: true,
      actualDrivingDurationMin: 90,
      timestampsImplausible: false,
      segmentUniquelyBound: true,
      userMarkedInaccurate: false,
    };
    expect(classifyExecutionActualSampleQuality(base).quality).toBe('VALID');

    expect(
      classifyExecutionActualSampleQuality({
        ...base,
        stopDurationUncertain: true,
      }).quality,
    ).toBe('PARTIAL');

    expect(
      classifyExecutionActualSampleQuality({
        ...base,
        destinationChanged: true,
        reachedPlannedDestination: false,
      }).quality,
    ).toBe('INVALID');

    expect(isEligibleForMaeCalibration('VALID')).toBe(true);
    expect(isEligibleForMaeCalibration('PARTIAL')).toBe(false);
  });

  it('builds planning vs base improvement for VALID samples', () => {
    const r = buildExecutionEtaReconciliation({
      tripId: 't',
      segmentId: 's',
      planVersionId: 'pv1',
      baseDurationMin: 166,
      planningDurationMin: 216,
      actualDrivingDurationMin: 208,
      uncertaintyMin: 30,
      adjustments: [{ type: 'F_ROAD', durationDeltaMin: 50 }],
    });
    expect(r.baseAbsoluteErrorMin).toBe(42);
    expect(r.planningAbsoluteErrorMin).toBe(8);
    expect(r.planningVsBaseImprovementMin).toBe(34);
    expect(r.sampleQuality).toBe('VALID');
  });

  it('freezes first-round 5% data gate and attribution table', () => {
    expect(ICELAND_CANARY_5_FIRST_ROUND_THRESHOLDS.validSegmentSampleMin).toBe(20);
    expect(TRAVEL_ETA_ERROR_ATTRIBUTION_TABLE.some((r) => r.code === 'F_ROAD_BUFFER_INSUFFICIENT')).toBe(
      true,
    );
  });
});

describe('travel-eta-user-evidence', () => {
  it('projects schedulable ETA copy', () => {
    const eta = applyPlanningAdjustments(
      projectLegacyDurationToEtaEnvelope({
        durationMin: 125,
        provider: 'MAPBOX',
        sourceKind: 'ROUTE_API',
      }),
      [{ reason: 'F_ROAD', deltaMin: 35 }],
      { authority: 'SHADOW' },
    );
    const ev = projectTravelEtaUserEvidence(eta);
    expect(ev.kind).toBe('SCHEDULABLE_ETA');
    expect(ev.baseDurationLabel).toContain('小时');
    expect(ev.planningDurationLabel).toBeDefined();
    expect(ev.reasonBullets.some((b) => /非铺装|高地/.test(b))).toBe(true);
  });

  it('projects BLOCKED for 2WD — not longer drive', () => {
    const eta = {
      ...projectLegacyDurationToEtaEnvelope({
        durationMin: 125,
        provider: 'MAPBOX',
        sourceKind: 'ROUTE_API',
      }),
      schedulability: 'BLOCKED' as const,
      gateReasons: ['OFFICIAL_IS_FROAD_2WD'],
    };
    const ev = projectTravelEtaUserEvidence(eta);
    expect(ev.kind).toBe('ROUTE_BLOCKED');
    expect(ev.blockedTitle).toContain('不可按计划执行');
    expect(ev.suggestedAction).toMatch(/4WD|替代/);
  });
});

describe('travel-eta-l2-canary gate', () => {
  it('excludes PARTIAL/INVALID from MAE metrics', () => {
    const base = projectLegacyDurationToEtaEnvelope({
      durationMin: 120,
      provider: 'MAPBOX',
      sourceKind: 'ROUTE_API',
    });
    const planned = applyPlanningAdjustments(base, [{ reason: 'F_ROAD', deltaMin: 30 }], {
      authority: 'AUTHORITATIVE',
    });
    const p = buildPlanningReconciliationEvent({ eta: planned, tripId: 't' });
    const valid = { ...attachActualDuration(p, 145), sampleQuality: 'VALID' as const };
    const partial = {
      ...attachActualDuration({ ...p, eventId: 'p2' }, 200),
      sampleQuality: 'PARTIAL' as const,
    };

    const m = buildCanaryMetricsFromEvents([valid, partial]);
    expect(m.validActualSampleCount).toBe(1);
    expect(m.partialActualSampleCount).toBe(1);
    expect(m.baseMaeMin).toBe(25);
  });

  it('NO_GO when safety counter non-zero', () => {
    const snapshot: TravelEtaCanaryDashboardSnapshotV1 = {
      schemaId: 'tripnara.travel_eta_l2_canary_dashboard@v1',
      stage: 'selected_trips',
      generatedAt: new Date().toISOString(),
      authoritativeTripCount: 3,
      authoritativeSegmentCount: 40,
      validActualSampleCount: 40,
      partialActualSampleCount: 0,
      invalidActualSampleCount: 0,
      providerKnownRate: 0.99,
      dem20mHitRate: 0.96,
      requiredTerrainCoverage: 1,
      baseMaeMin: 30,
      planningMaeMin: 20,
      maeImprovementRatio: 0.33,
      underestimateRate: 0.1,
      severeUnderestimateRate: 0.05,
      overBufferRate: 0.1,
      bufferHitRate: 0.85,
      safety: {
        closedScheduledCount: 1,
        twoWdOnForced4WdCount: 0,
        requiredTerrainSkippedCount: 0,
        unknownProviderAuthoritativeCount: 0,
        killSwitchRollbackFailures: 0,
      },
      killSwitchActive: false,
    };
    const review = evaluateIcelandDefaultGateReview({ snapshot });
    expect(review.decision).toBe('NO_GO');
    expect(review.blockedReasons).toContain('safety_closed');
  });
});
