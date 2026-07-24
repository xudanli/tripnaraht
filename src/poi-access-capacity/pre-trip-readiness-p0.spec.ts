/**
 * Readiness P0 — Handoff T1–T9 契约测试
 */

import { evaluatePoiAccessCapacity } from './utils/evaluate-poi-access.util';
import {
  ICELAND_A_TIER_ACCESS_RULES,
  ICELAND_A_TIER_POI_SLUGS,
} from './fixtures/is-a-tier.rules';
import { ICELAND_B_TIER_ACCESS_RULES, ICELAND_B_TIER_POI_SLUGS } from './fixtures/is-b-tier.rules';
import { ICELAND_THINGVELLIR_PARKING_FEE_RULE } from './fixtures/is-thingvellir.rules';
import {
  mapAccessVerdictToIssueKind,
  toPoiAccessEvaluationView,
} from './types/poi-access-readiness.types';
import { poiAccessEvaluationToFeasibilityIssue, buildExperienceRegretIssue } from './utils/poi-access-feasibility-mapper.util';
import { computeGateExecute } from './utils/gate-execute.util';
import {
  hasReservationEvidenceForSlot,
  readReservationEvidenceStore,
} from './utils/trip-reservation-evidence.util';
import {
  estimatePlanRegret,
  isRegretBoundConfirmed,
  shouldRequireRegretConfirmation,
} from '../trips/trip-constraint-solver/utils/experience-regret-bound.util';
import type { PoiAccessTripEvaluation } from './types/poi-access-readiness.types';

describe('pre-trip-readiness-p0 (T1–T9)', () => {
  const landmannRules = ICELAND_A_TIER_ACCESS_RULES.filter(
    (r) => r.poiId === ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
  );

  it('T1 Landmannalaugar 10:30 无停车证据 → reservation_required · gate=false', () => {
    const raw = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
      dateISO: '2026-07-15',
      arrivalTime: '10:30',
      rules: landmannRules,
    });
    expect(raw.verdict).toBe('RESERVATION_REQUIRED');
    const kind = mapAccessVerdictToIssueKind(raw.verdict);
    expect(kind).toBe('poi_access_reservation_required');

    const evalRow: PoiAccessTripEvaluation = {
      tripItemId: 'item-lm',
      tripDayId: 'd1',
      dayNumber: 1,
      poiId: raw.poiId,
      poiName: 'Landmannalaugar',
      dateISO: '2026-07-15',
      arrivalTime: '10:30',
      raw,
      hasReservationEvidence: false,
    };
    const issue = poiAccessEvaluationToFeasibilityIssue(evalRow, landmannRules)!;
    expect(issue.priority).toBe('must_handle');
    expect(issue.repairOptions?.some((o) => o.type === 'book_parking')).toBe(true);
    expect(issue.repairOptions?.some((o) => o.type === 'manual_confirm')).toBe(true);

    const gate = computeGateExecute([issue]);
    expect(gate.blocked).toBe(false);
  });

  it('T2 Þingvellir 仅收费 → 无 reservation issue', () => {
    const raw = evaluatePoiAccessCapacity({
      poiId: 'is.thingvellir',
      dateISO: '2026-07-15',
      arrivalTime: '11:00',
      rules: [ICELAND_THINGVELLIR_PARKING_FEE_RULE],
    });
    expect(raw.verdict).toBe('FEASIBLE');
    expect(mapAccessVerdictToIssueKind(raw.verdict)).toBeUndefined();
  });

  it('T3 Blue Lagoon 11:00 sold_out → blocked · gate=true', () => {
    const blueRules = ICELAND_A_TIER_ACCESS_RULES.filter(
      (r) => r.poiId === ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
    );
    const raw = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
      dateISO: '2026-08-01',
      arrivalTime: '11:00',
      rules: blueRules,
      capacitySnapshots: [
        {
          poiId: ICELAND_A_TIER_POI_SLUGS.BLUE_LAGOON,
          dateISO: '2026-08-01',
          slotStartTime: '09:00',
          slotEndTime: '12:00',
          remaining: 0,
          soldOut: true,
          signalSource: 'BOKUN',
          observedAt: '2026-06-20T00:00:00.000Z',
        },
      ],
    });
    expect(raw.verdict).toBe('BLOCKED');
    const issue = poiAccessEvaluationToFeasibilityIssue(
      {
        tripItemId: 'item-bl',
        tripDayId: 'd1',
        dayNumber: 1,
        poiId: raw.poiId,
        poiName: 'Blue Lagoon',
        dateISO: '2026-08-01',
        arrivalTime: '11:00',
        raw,
        hasReservationEvidence: false,
      },
      blueRules,
    )!;
    expect(computeGateExecute([issue]).blocked).toBe(true);
  });

  it('T4 Dyrhólaey PENDING_CONFIRMATION → unknown · gate=false', () => {
    const rule = ICELAND_B_TIER_ACCESS_RULES.find(
      (r) => r.poiId === ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY,
    )!;
    const pending = { ...rule, status: 'PENDING_CONFIRMATION' as const };
    const raw = evaluatePoiAccessCapacity({
      poiId: ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY,
      dateISO: '2026-06-15',
      arrivalTime: '10:00',
      rules: [pending],
      staleRuleDays: 365,
    });
    expect(raw.verdict).toBe('NEEDS_CONFIRMATION');
    const issue = poiAccessEvaluationToFeasibilityIssue(
      {
        tripItemId: 'item-d',
        tripDayId: 'd1',
        dayNumber: 1,
        poiId: raw.poiId,
        poiName: 'Dyrhólaey',
        dateISO: '2026-06-15',
        arrivalTime: '10:00',
        raw,
        hasReservationEvidence: false,
      },
      [pending],
    )!;
    expect(issue.issueKind).toBe('poi_access_unknown');
    expect(computeGateExecute([issue]).blocked).toBe(false);
  });

  it('T5 crowding 含 predictedWait 必须有 disclosureLabel', () => {
    const view = toPoiAccessEvaluationView({
      verdict: 'FEASIBLE_WITH_RISK',
      poiId: 'is.gullfoss',
      reason: '拥挤',
      confidence: 'INFERRED',
      signalSources: ['MODEL'],
      predictedWaitP50: 25,
      crowdLevel: 'HIGH',
      planB: [],
    });
    expect(view.crowding?.disclosureLabel).toBeTruthy();
  });

  it('T6 POST reservation-evidence 有效码 → 匹配 slot', () => {
    const store = readReservationEvidenceStore({
      reservationEvidence: {
        revision: 1,
        items: [
          {
            id: 'e1',
            tripItemId: 'item-lm',
            poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
            resource: 'PARKING',
            dateISO: '2026-07-15',
            confirmationCode: 'PARKA-123',
            createdAt: '2026-06-26T00:00:00.000Z',
          },
        ],
      },
    });
    expect(
      hasReservationEvidenceForSlot({
        evidence: store,
        tripItemId: 'item-lm',
        poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
        resource: 'PARKING',
        dateISO: '2026-07-15',
        plannedArrival: '10:30',
      }),
    ).toBe(true);

    const raw = evaluatePoiAccessCapacity({
      poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
      dateISO: '2026-07-15',
      arrivalTime: '10:30',
      rules: landmannRules,
      userReservations: [{ resource: 'PARKING', dateISO: '2026-07-15' }],
    });
    expect(raw.verdict).toBe('FEASIBLE');
  });

  it('T7 pre_departure regret 未确认 + experienceUnderstanding → gate=true', () => {
    const metadata = {
      experienceUnderstanding: {
        revision: 'v1',
        travelGoals: ['冰川'],
        memberConditions: [],
        coreConstraints: [],
        systemAssumptions: [],
        experienceIntent: { revision: 'v1', experienceIntents: [], negativePreferences: [] },
      },
    };
    const trip = { status: 'PLANNING', startDate: new Date('2026-08-01') };
    expect(shouldRequireRegretConfirmation(metadata, trip)).toBe(true);
    const issue = buildExperienceRegretIssue({
      tripId: 't1',
      planRegretEstimate: estimatePlanRegret(metadata),
    })!;
    expect(issue.issueKind).toBe('experience_regret_unconfirmed');
    expect(computeGateExecute([issue]).blocked).toBe(true);
  });

  it('T8 regret 确认后 → gate=false', () => {
    const metadata = {
      experienceUnderstanding: { revision: 'v1', experienceIntent: { revision: 'v1', experienceIntents: [], negativePreferences: [] } },
      experienceRegretBound: {
        revision: 1,
        confirmedUpperBound: 0.3,
        confirmedAt: '2026-06-26',
        confirmedBy: 'u1',
      },
    };
    expect(isRegretBoundConfirmed(metadata)).toBe(true);
    const issue = buildExperienceRegretIssue({
      tripId: 't1',
      planRegretEstimate: 0.2,
      confirmedUpperBound: 0.3,
    });
    expect(issue).toBeUndefined();
    expect(computeGateExecute([]).blocked).toBe(false);
  });

  it('T9 planRegret > confirmed → warning only · gate=false', () => {
    const issue = buildExperienceRegretIssue({
      tripId: 't1',
      planRegretEstimate: 0.4,
      confirmedUpperBound: 0.15,
    })!;
    expect(issue.issueKind).toBe('experience_regret_warning');
    expect(issue.priority).toBe('suggest_adjust');
    expect(computeGateExecute([issue]).blocked).toBe(false);
  });
});
