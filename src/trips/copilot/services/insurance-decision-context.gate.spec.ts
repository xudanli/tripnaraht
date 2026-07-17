import {
  buildInsuranceContextMissingSelection,
  isRentalInsuranceProblem,
} from '../contracts/insurance-decision-context.types';
import { selectDecisionSpaceInsight } from './decision-space-insight.selector';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { InsuranceDecisionContext } from '../contracts/insurance-decision-context.types';

function insuranceProblem(): UnifiedDecisionProblemListItem {
  return {
    problemId: 'dc_insurance_t',
    semanticKey: 'REQUIRED_CHOICE.RENTAL_INSURANCE',
    instanceKey: 'dc_insurance_t',
    type: 'PREFERENCE_CONFLICT',
    dimension: 'BOOKING',
    enforcement: 'BLOCK',
    phase: 'PLANNING',
    affectsPlan: true,
    workflowStatus: 'WAITING_DECISION',
    executionStatus: 'NOT_REQUIRED',
    title: '选择哪种租车保险？',
    summary: '风险暴露：SafeTravel 涉水…',
    scope: { tripId: 'trip_t' },
    evidenceSummary: { count: 1, freshness: 'FRESH', confidence: 0.9 },
    actionability: {
      requiresAction: true,
      recommendedAction: 'ALTERNATIVE',
      allowedActions: ['ALTERNATIVE'],
      writeChain: 'CONSTRAINT_WRITEBACK',
    },
    occurrenceCount: 1,
    detectors: [{ detectorId: 'i', sourceRefIds: [] }],
    origin: { authority: 'CANONICAL', primaryDetector: 'i' },
    decisionCase: {
      sourceKind: 'REQUIRED_CHOICE',
      requiredness: 'BLOCKING',
      domain: 'INSURANCE',
      scope: 'TRIP',
      actionKind: 'SELECT',
      materialityScore: 9,
      materialityBreakdown: {
        budget: 2,
        time: 1,
        fitness: 0,
        bookingUrgency: 3,
        safety: 3,
        team: 0,
        irreversibility: 0,
      },
      enrichmentStage: 'ENRICHED',
      writebackTargets: ['INSURANCE'],
      uiGroup: 'MUST_CONFIRM',
      uiGroupLabelZh: '必须确认',
    },
  };
}

function okInsuranceContext(): InsuranceDecisionContext {
  return {
    schema: 'tripnara.insurance_decision_context@v1',
    tripId: 'trip_t',
    gate: { ok: true, missing: [] },
    fields: {
      selfDriveSeason: { status: 'CONFIRMED', factLine: '自驾季节：夏季' },
      routeSummary: {
        status: 'CONFIRMED',
        value: { dayCount: 7, routeReady: true },
        factLine: '行程天数：7 天，路线已就绪',
      },
      roadExposure: {
        status: 'CONFIRMED',
        value: { hasGravel: true, hasFRoad: false, hasMountainHint: false },
        factLine: '含碎石路',
      },
      driveLoad: { status: 'UNKNOWN' },
      weatherRisk: { status: 'UNKNOWN' },
      vehicleBooking: {
        status: 'CONFIRMED',
        value: { vehicleType: 'SUV' },
        factLine: '车型 SUV',
      },
      memberDriverProfile: { status: 'UNKNOWN' },
      teamRiskTolerance: { status: 'UNKNOWN' },
      budget: { status: 'UNKNOWN' },
      existingInsurance: { status: 'UNKNOWN' },
    },
    confirmedFacts: ['行程天数：7 天，路线已就绪', '含碎石路', '车型 SUV'],
    missingFields: [],
  };
}

describe('insurance decision context gate', () => {
  it('detects rental insurance problems', () => {
    expect(
      isRentalInsuranceProblem({
        problemId: 'dc_insurance_x',
        semanticKey: 'REQUIRED_CHOICE.RENTAL_INSURANCE',
        domain: 'INSURANCE',
      }),
    ).toBe(true);
  });

  it('CONTEXT_MISSING when route or vehicle absent', () => {
    const focused = insuranceProblem();
    const missingCtx: InsuranceDecisionContext = {
      ...okInsuranceContext(),
      gate: {
        ok: false,
        code: 'CONTEXT_MISSING',
        missing: ['ROUTE_SUMMARY', 'VEHICLE_BOOKING'],
      },
      fields: {
        ...okInsuranceContext().fields,
        routeSummary: { status: 'MISSING' },
        vehicleBooking: { status: 'MISSING' },
      },
      confirmedFacts: [],
      missingFields: ['routeSummary', 'vehicleBooking'],
    };

    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      explicitAsk: true,
      surface: 'DETAIL',
      insuranceContext: missingCtx,
    });

    expect(insight.mode).toBe('ATTENTION');
    expect(insight.modeReason).toBe('CONTEXT_MISSING');
    expect(insight.title).toBe('还无法判断保险方案');
    expect(insight.observationSummary).toContain('缺少');
  });

  it('does not CONTEXT_MISSING when gate ok — DETAIL still suppresses', () => {
    const focused = insuranceProblem();
    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      surface: 'DETAIL',
      insuranceContext: okInsuranceContext(),
    });
    expect(insight.mode).toBe('SILENT');
    expect(insight.modeReason).not.toBe('CONTEXT_MISSING');
  });

  it('buildInsuranceContextMissingSelection copy matches product', () => {
    const s = buildInsuranceContextMissingSelection({
      focusedProblemId: 'dc_insurance_t',
      missing: ['ROUTE_SUMMARY'],
    });
    expect(s.title).toBe('还无法判断保险方案');
    expect(s.recommendation.summary).toContain('路线');
  });
});
