import {
  buildVehicleAdvisorFromContext,
  buildVehicleContextMissingSelection,
  isVehicleRoadFitProblem,
  type VehicleDecisionContext,
} from '../contracts/vehicle-decision-context.types';
import { selectDecisionSpaceInsight } from './decision-space-insight.selector';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import { VehicleDecisionContextAssembler } from './vehicle-decision-context.assembler';
import { buildRuleAdvisorCopy } from './page-insight-narrative.service';

function vehicleProblem(): UnifiedDecisionProblemListItem {
  return {
    problemId: 'dc_vehicle_t',
    semanticKey: 'REQUIRED_CHOICE.VEHICLE_ROAD_FIT',
    instanceKey: 'dc_vehicle_t',
    type: 'PREFERENCE_CONFLICT',
    dimension: 'TRANSPORT',
    enforcement: 'BLOCK',
    phase: 'PLANNING',
    affectsPlan: true,
    workflowStatus: 'WAITING_DECISION',
    executionStatus: 'NOT_REQUIRED',
    title: '这趟行程需要什么车型？',
    summary: '路线已就绪。请确认车型边界，系统将按车型重新验证路线。',
    scope: { tripId: 'trip_t' },
    evidenceSummary: { count: 1, freshness: 'FRESH', confidence: 0.9 },
    actionability: {
      requiresAction: true,
      recommendedAction: 'ALTERNATIVE',
      allowedActions: ['ALTERNATIVE'],
      writeChain: 'CONSTRAINT_WRITEBACK',
    },
    occurrenceCount: 1,
    detectors: [{ detectorId: 'v', sourceRefIds: [] }],
    origin: { authority: 'CANONICAL', primaryDetector: 'v' },
    decisionCase: {
      sourceKind: 'REQUIRED_CHOICE',
      requiredness: 'BLOCKING',
      domain: 'TRANSPORT',
      scope: 'TRIP',
      actionKind: 'SELECT',
      materialityScore: 9,
      materialityBreakdown: {
        budget: 2,
        time: 1,
        fitness: 0,
        bookingUrgency: 2,
        safety: 3,
        team: 1,
        irreversibility: 2,
      },
      enrichmentStage: 'ENRICHED',
      writebackTargets: ['VEHICLE', 'ROUTE'],
      uiGroup: 'MUST_CONFIRM',
      uiGroupLabelZh: '必须确认',
    },
  };
}

function okVehicleContext(overrides?: Partial<VehicleDecisionContext>): VehicleDecisionContext {
  const base: VehicleDecisionContext = {
    schema: 'tripnara.vehicle_decision_context@v1',
    tripId: 'trip_t',
    gate: { ok: true, missing: [] },
    routeFacts: {
      containsFRoad: false,
      highlandRoute: false,
      roadTypes: ['环岛主路', '南岸常规道路'],
    },
    teamFacts: { passengerCount: 2, luggageLevel: 'NORMAL' },
    recommendation: {
      vehicleType: '两驱小型车',
      optionId: 'vehicle_2wd',
      reasons: ['满足道路准入', '租金较低', '油耗较低'],
    },
    invalidatedWhen: ['加入F-road', '增加高地路线', '人数或行李增加'],
    fields: {
      routeSummary: {
        status: 'CONFIRMED',
        value: { dayCount: 7, routeReady: true },
        factLine: '行程天数：7 天，路线已就绪',
      },
      roadExposure: {
        status: 'CONFIRMED',
        value: { containsFRoad: false, highlandRoute: false, hasGravel: false },
        factLine: '当前路线不含 F-road',
      },
      season: { status: 'CONFIRMED', factLine: '出行季节：夏季' },
      roadOpenStatus: { status: 'UNKNOWN' },
      teamCapacity: { status: 'CONFIRMED', factLine: '人数 2' },
      budget: { status: 'UNKNOWN' },
      driverExperience: { status: 'UNKNOWN' },
      vehicleAvailability: { status: 'UNKNOWN' },
    },
    confirmedFacts: ['行程天数：7 天，路线已就绪', '当前路线不含 F-road'],
    missingFields: [],
    advisorInput: {
      routeFacts: {
        containsFRoad: false,
        highlandRoute: false,
        roadTypes: ['环岛主路', '南岸常规道路'],
      },
      teamFacts: { passengerCount: 2, luggageLevel: 'NORMAL' },
      recommendation: {
        vehicleType: '两驱小型车',
        optionId: 'vehicle_2wd',
        reasons: ['满足道路准入', '租金较低', '油耗较低'],
      },
      invalidatedWhen: ['加入F-road', '增加高地路线', '人数或行李增加'],
    },
  };
  return { ...base, ...overrides };
}

describe('vehicle decision Contextual Copilot', () => {
  it('detects vehicle road-fit problems', () => {
    expect(
      isVehicleRoadFitProblem({
        problemId: 'dc_vehicle_x',
        semanticKey: 'REQUIRED_CHOICE.VEHICLE_ROAD_FIT',
      }),
    ).toBe(true);
  });

  it('advisor copy explains route fit — not task echo', () => {
    const copy = buildVehicleAdvisorFromContext(okVehicleContext());
    expect(copy.title).toContain('两驱');
    expect(copy.body).toContain('不含 F-road');
    expect(copy.body).not.toMatch(/请确认车型/);
    expect(copy.advice).toContain('高地');
  });

  it('rule narrative uses vehicle context on explicit ask', () => {
    const focused = vehicleProblem();
    const selection = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      explicitAsk: true,
      surface: 'DETAIL',
      vehicleContext: okVehicleContext(),
    });
    expect(['ATTENTION', 'INTERVENTION']).toContain(selection.mode);
    expect(selection.observationSummary).toContain('不含 F-road');
    expect(selection.observationSummary).not.toMatch(/请确认车型/);
    expect(selection.title).toContain('两驱');

    const advisor = buildRuleAdvisorCopy(
      selection,
      focused.summary,
      undefined,
      okVehicleContext(),
    );
    expect(advisor.body).toContain('不含 F-road');
    expect(advisor.advice).toContain('重新选车');
  });

  it('CONTEXT_MISSING when route absent', () => {
    const focused = vehicleProblem();
    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      surface: 'DETAIL',
      vehicleContext: {
        ...okVehicleContext(),
        gate: {
          ok: false,
          code: 'CONTEXT_MISSING',
          missing: ['ROUTE_SUMMARY', 'ROAD_EXPOSURE'],
        },
      },
    });
    expect(insight.modeReason).toBe('CONTEXT_MISSING');
    expect(insight.title).toBe('还无法判断车型');
  });

  it('assembler: no F-road → recommend 2WD', async () => {
    const prisma = {
      trip: {
        findUnique: async () => ({
          startDate: new Date('2026-07-01'),
          endDate: new Date('2026-07-10'),
          metadata: { party: { passengerCount: 2 } },
          budgetConfig: {},
        }),
      },
      tripDay: { count: async () => 7 },
    };
    const ctx = await new VehicleDecisionContextAssembler(prisma as never).assemble('trip_t');
    expect(ctx.gate.ok).toBe(true);
    expect(ctx.routeFacts.containsFRoad).toBe(false);
    expect(ctx.recommendation.vehicleType).toBe('两驱小型车');
    expect(ctx.recommendation.reasons).toEqual(
      expect.arrayContaining(['满足道路准入', '租金较低']),
    );
  });

  it('buildVehicleContextMissingSelection copy', () => {
    const s = buildVehicleContextMissingSelection({
      focusedProblemId: 'dc_vehicle_t',
      missing: ['ROUTE_SUMMARY'],
    });
    expect(s.recommendation.summary).toContain('路线');
  });
});
