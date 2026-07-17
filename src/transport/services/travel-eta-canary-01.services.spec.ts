import { TravelEtaActualCaptureService } from './travel-eta-actual-capture.service';
import { TravelEtaReconciliationService } from './travel-eta-reconciliation.service';
import {
  TravelEtaCanaryDashboardService,
  MIN_VALID_SAMPLES_FOR_RULE_VERDICT,
} from './travel-eta-canary-dashboard.service';
import {
  applyPlanningAdjustments,
  projectLegacyDurationToEtaEnvelope,
} from '../contracts/travel-eta.contract';
import type { TravelEtaReconciliationEventV1 } from '../contracts/travel-eta-reconciliation.contract';

describe('TravelEtaActualCaptureService', () => {
  it('captures net duration, sample source, and VALID for MAE', () => {
    const recon = new TravelEtaReconciliationService();
    const svc = new TravelEtaActualCaptureService(recon);
    const eta = applyPlanningAdjustments(
      projectLegacyDurationToEtaEnvelope({
        durationMin: 120,
        provider: 'MAPBOX',
        sourceKind: 'ROUTE_API',
      }),
      [{ reason: 'F_ROAD', deltaMin: 30 }],
      { authority: 'AUTHORITATIVE' },
    );
    recon.recordPlanningPrediction({
      eta,
      tripId: 't-is-1',
      fromItemId: 'a',
      toItemId: 'b',
    });

    const result = svc.capture({
      tripId: 't-is-1',
      fromItemId: 'a',
      toItemId: 'b',
      plannedRouteGeometryRef: 'poly:f208',
      actualDepartureAt: '2026-07-18T10:00:00.000Z',
      actualArrivalAt: '2026-07-18T12:40:00.000Z',
      excludedStopDurationMin: 10,
      routeDeviation: false,
      dataSource: 'GPS',
      sampleSource: 'INTERNAL_PILOT',
      sampleSourceNote: 'canary cohort 1',
      eta,
    });

    expect(result.capture.actualDurationMin).toBe(150); // 160 − 10
    expect(result.capture.sampleSource).toBe('INTERNAL_PILOT');
    expect(result.capture.sampleQuality).toBe('VALID');
    expect(result.enteredMaeCalibration).toBe(true);
    expect(result.reconciliationEventId).toBeDefined();
  });

  it('marks MANUAL as PARTIAL — not MAE eligible', () => {
    const svc = new TravelEtaActualCaptureService();
    const result = svc.capture({
      tripId: 't2',
      plannedRouteGeometryRef: 'poly:1',
      actualDepartureAt: '2026-07-18T10:00:00.000Z',
      actualArrivalAt: '2026-07-18T11:00:00.000Z',
      routeDeviation: false,
      dataSource: 'MANUAL_CONFIRMATION',
      sampleSource: 'PARTNER_GUIDE',
      eta: projectLegacyDurationToEtaEnvelope({
        durationMin: 60,
        provider: 'GOOGLE',
        sourceKind: 'ROUTE_API',
      }),
    });
    expect(result.capture.sampleQuality).toBe('PARTIAL');
    expect(result.enteredMaeCalibration).toBe(false);
  });
});

describe('TravelEtaCanaryDashboardService', () => {
  function makeActual(
    planning: number,
    actual: number,
    reasons: string[],
  ): TravelEtaReconciliationEventV1 {
    return {
      schema: 'tripnara/travel-eta-reconciliation/v1',
      eventId: `e-${planning}-${actual}-${Math.random()}`,
      recordedAt: new Date().toISOString(),
      phase: 'ACTUAL',
      baseDurationMin: planning - 30,
      planningDurationMin: planning,
      actualDurationMin: actual,
      baseErrorMin: actual - (planning - 30),
      planningErrorMin: actual - planning,
      uncertaintyMin: 30,
      bufferHit: true,
      adjustmentReasons: reasons as any,
      provider: 'MAPBOX',
      providerTraceStatus: 'CONFIRMED',
      authority: 'AUTHORITATIVE',
      sampleQuality: 'VALID',
    };
  }

  it('builds dashboard with VALID-only MAE', () => {
    const dash = new TravelEtaCanaryDashboardService();
    const events = [
      makeActual(150, 145, ['F_ROAD']),
      {
        ...makeActual(150, 200, ['F_ROAD']),
        sampleQuality: 'PARTIAL' as const,
      },
    ];
    const snap = dash.buildSnapshot({
      events,
      authoritativeTripCount: 2,
      authoritativeSegmentCount: 10,
      dem20mHitRate: 0.97,
      requiredTerrainCoverage: 1,
      stage: 'selected_trips',
    });
    expect(snap.validActualSampleCount).toBe(1);
    expect(snap.partialActualSampleCount).toBe(1);
    expect(snap.baseMaeMin).toBe(25); // |145 - 120|
  });

  it('forbids single-sample TUNE — INSUFFICIENT_EVIDENCE', () => {
    const dash = new TravelEtaCanaryDashboardService();
    const report = dash.adjudicateAdjustmentRules([makeActual(150, 180, ['F_ROAD'])]);
    expect(report.minValidSamples).toBe(MIN_VALID_SAMPLES_FOR_RULE_VERDICT);
    expect(report.rows[0].verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(report.rows[0].validSampleCount).toBe(1);
  });

  it('KEEP when enough VALID samples and mild error', () => {
    const dash = new TravelEtaCanaryDashboardService();
    const events = Array.from({ length: 5 }, (_, i) =>
      makeActual(150, 148 + (i % 3), ['F_ROAD']),
    );
    const report = dash.adjudicateAdjustmentRules(events);
    expect(report.rows[0].verdict).toBe('KEEP');
  });

  it('promotion review holds without enough VALID samples', () => {
    const dash = new TravelEtaCanaryDashboardService();
    const review = dash.reviewPromotionToCanary5pct({
      snapshot: dash.buildSnapshot({
        events: [],
        stage: 'selected_trips',
        safety: {
          closedScheduledCount: 0,
          twoWdOnForced4WdCount: 0,
          requiredTerrainSkippedCount: 0,
          unknownProviderAuthoritativeCount: 0,
          killSwitchRollbackFailures: 0,
        },
      }),
    });
    expect(review.recommendNextStage).toBe('hold');
  });
});
