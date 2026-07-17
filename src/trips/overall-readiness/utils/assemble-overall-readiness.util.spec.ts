import { assembleOverallReadinessSnapshot } from './assemble-overall-readiness.util';
import type { OverallReadinessFactInput } from '../types/overall-trip-readiness.types';
import {
  resolveWeightTemplateId,
  resolveWeights,
} from '../config/readiness-weight-templates';
import { computeDimensionScoreFromChecks } from './check-result-scores.util';
import { resolveOverallReadinessState } from './overall-readiness-state.util';

describe('overall trip readiness', () => {
  it('resolves Iceland self-drive group weights', () => {
    expect(
      resolveWeightTemplateId({
        countryCode: 'IS',
        isSelfDrive: true,
        memberCount: 4,
      }),
    ).toBe('ICELAND_SELF_DRIVE_GROUP');
    const w = resolveWeights('ICELAND_SELF_DRIVE_GROUP');
    expect(w.route).toBe(0.28);
    expect(w.member).toBe(0.15);
  });

  it('weights dimension checks', () => {
    const score = computeDimensionScoreFromChecks([
      {
        checkCode: 'a',
        title: 'a',
        result: 'VERIFIED_READY',
        score: 100,
        weight: 0.5,
        severity: 'MUST',
        evidenceRefs: [],
        affectedTripObjectRefs: [],
      },
      {
        checkCode: 'b',
        title: 'b',
        result: 'NOT_READY',
        score: 20,
        weight: 0.5,
        severity: 'MUST',
        evidenceRefs: [],
        affectedTripObjectRefs: [],
      },
    ]);
    expect(score).toBe(60);
  });

  it('keeps score when blocked', () => {
    const state = resolveOverallReadinessState({
      score: 90,
      dimensions: [
        {
          code: 'ROUTE',
          score: 90,
          weight: 0.25,
          state: 'READY',
          checks: [],
          evidenceCount: 0,
          blockerCount: 0,
        },
      ],
      blockers: [
        {
          issueCode: 'x',
          title: '道路关闭',
          dimension: 'ROUTE',
          severity: 'BLOCKER',
        },
      ],
      evidenceConfidence: 90,
      needsRevalidation: false,
    });
    expect(state).toBe('BLOCKED');
  });

  it('assembles example snapshot ~78 with insurance pending', () => {
    const input: OverallReadinessFactInput = {
      tripId: 'trip-1',
      calculatedAt: '2026-07-15T00:00:00.000Z',
      countryCode: 'IS',
      isSelfDrive: true,
      memberCount: 4,
      feasibility: {
        overallScore: 84,
        verdictStatus: 'ADJUST_REQUIRED',
        dimensions: [
          { key: 'schedule', score: 84, blockerCount: 0 },
          { key: 'transport', score: 80, blockerCount: 0 },
          { key: 'environment', score: 85, blockerCount: 0 },
          { key: 'itinerary_completeness', score: 90, blockerCount: 0 },
          { key: 'access_capacity', score: 80, blockerCount: 0 },
        ],
        mustHandleCount: 0,
        suggestAdjustCount: 1,
      },
      accommodation: {
        expectedNightCount: 5,
        coveredNightCount: 5,
        bookedNightCount: 5,
        needBookingNightCount: 0,
        missingDocumentCount: 0,
      },
      transport: {
        hasVehicleOrPrimaryMode: true,
        vehicleConfirmed: true,
        insuranceConfirmed: false,
        driverArrangementConfirmed: true,
      },
      activities: [
        {
          id: 'act1',
          title: '冰川徒步',
          isCoreExperience: true,
          isMustDo: true,
          bookingStatus: 'NEED_BOOKING',
          memberConfirmedCount: 2,
          memberTotalCount: 4,
        },
      ],
      members: {
        totalCount: 4,
        confirmedParticipationCount: 4,
        profilingCompletionRate: 60,
        openCriticalDecisionCount: 1,
        rolesAssigned: true,
      },
      evidenceFreshness: { isStale: false, revalidationRequired: false },
    };

    const snapshot = assembleOverallReadinessSnapshot(input);
    expect(snapshot.weightTemplateId).toBe('ICELAND_SELF_DRIVE_GROUP');
    expect(snapshot.dimensions.accommodation.score).toBeGreaterThanOrEqual(85);
    expect(snapshot.dimensions.transport.score).toBeLessThan(85);
    expect(snapshot.blockers.length).toBe(0);
    expect(snapshot.state).not.toBe('READY');
    expect(snapshot.pendingConfirmations.some((i) => i.issueCode === 'TRANSPORT_INSURANCE_PENDING')).toBe(
      true,
    );
    expect(snapshot.score).toBeGreaterThan(50);
    expect(snapshot.score).toBeLessThan(90);
    expect(snapshot.evidence).toBeDefined();
    expect(
      snapshot.recommendations.some((r) => (r.estimatedScoreLift ?? 0) > 0),
    ).toBe(true);
    expect(snapshot.displayLabelZh).toBe('尚未就绪');
    expect(snapshot.homepage.headline).toContain('整体准备度');
    expect(snapshot.homepage.dimensionRows).toHaveLength(5);
    expect(snapshot.homepage.mustHandleNow.length).toBeGreaterThan(0);
  });

  it('blocks on missing accommodation night without collapsing score to zero', () => {
    const snapshot = assembleOverallReadinessSnapshot({
      tripId: 'trip-2',
      countryCode: 'IS',
      isSelfDrive: true,
      memberCount: 1,
      feasibility: {
        overallScore: 90,
        verdictStatus: 'EXECUTABLE',
        dimensions: [
          { key: 'schedule', score: 90 },
          { key: 'transport', score: 90 },
          { key: 'environment', score: 90 },
          { key: 'itinerary_completeness', score: 90 },
        ],
      },
      accommodation: {
        expectedNightCount: 3,
        coveredNightCount: 2,
        bookedNightCount: 2,
        needBookingNightCount: 0,
        missingDocumentCount: 0,
      },
      transport: {
        hasVehicleOrPrimaryMode: true,
        vehicleConfirmed: true,
        insuranceConfirmed: true,
        driverArrangementConfirmed: true,
      },
      members: {
        totalCount: 1,
        confirmedParticipationCount: 1,
        profilingCompletionRate: 100,
        openCriticalDecisionCount: 0,
      },
    });

    expect(snapshot.state).toBe('BLOCKED');
    expect(snapshot.score).toBeGreaterThan(40);
    expect(snapshot.blockers.some((b) => b.issueCode === 'ACCOM_MISSING_NIGHT')).toBe(true);
  });
});
