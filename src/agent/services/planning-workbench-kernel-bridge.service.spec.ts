import { PlanningWorkbenchKernelBridgeService } from './planning-workbench-kernel-bridge.service';
import type { PlanContext, PlanState, PlanSkeleton, OptionComparison } from '../../skills/plan/shared/plan-state.types';
import type { PlanningWorkbenchRequest } from './planning-workbench-agent.service';

describe('PlanningWorkbenchKernelBridgeService', () => {
  let bridge: PlanningWorkbenchKernelBridgeService;

  const mockContext = (): PlanContext => ({
    destination: { country: 'IS', city: 'Reykjavik' },
    days: 5,
    travelMode: 'self_drive',
    mustDo: ['Golden Circle'],
  });

  const mockPlanState = (): PlanState => ({
    plan_id: 'plan_test',
    plan_version: 1,
    constraints: {
      time: { days: 5 },
      budget: { total: 3000, currency: 'USD' },
      fitness: { level: 'medium' },
    },
    itinerary: {
      tripId: 'trip-1',
      routeDirectionId: 'rd-1',
      segments: [],
    },
    mobility: { transferSegments: [] },
    budget: {},
    pace: {},
    gate: { status: 'ALLOW', reasons: [], missingEvidence: [] },
    evidence_refs: [],
    decision_log_refs: [],
    status: 'DRAFT',
  });

  const mockRequest = (): PlanningWorkbenchRequest => ({
    context: mockContext(),
    tripId: 'trip-1',
    userAction: 'generate',
  });

  beforeEach(() => {
    bridge = new PlanningWorkbenchKernelBridgeService();
  });

  describe('resolveMode', () => {
    it('defaults to legacy', () => {
      delete process.env.PLANNING_WORKBENCH_KERNEL_MODE;
      expect(bridge.resolveMode()).toBe('legacy');
    });
  });

  describe('buildInitialDso', () => {
    it('maps PlanContext and PlanState into DecisionState', () => {
      const dso = bridge.buildInitialDso(mockRequest(), mockPlanState(), 'req-1');
      expect(dso.requestId).toBe('req-1');
      expect(dso.userIntent.destination).toBe('Reykjavik, IS');
      expect(dso.userIntent.days).toBe(5);
      expect(dso.userIntent.mode).toBe('drive');
      expect(dso.travelOntologyState?.tripId).toBe('trip-1');
      expect(dso.systemState.currentPhase).toBe('GATE_EVAL');
    });
  });

  describe('gateResultToGateStatus', () => {
    it('maps BLOCK to REJECT', () => {
      const gate = bridge.gateResultToGateStatus({
        gate_result: 'BLOCK',
        violations: [{ type: 'HARD', severity: 'HARD', detail: '不可达' }],
        required_adjustments: [],
        confidence: 0.2,
      });
      expect(gate.status).toBe('REJECT');
      expect(gate.reasons).toContain('HARD: 不可达');
    });

    it('maps ADJUST_REQUIRED to NEED_CONFIRM', () => {
      const gate = bridge.gateResultToGateStatus({
        gate_result: 'ADJUST_REQUIRED',
        violations: [],
        required_adjustments: [{ action: 'REDUCE_PACE', why: '疲劳过高' }],
        confidence: 0.6,
      });
      expect(gate.status).toBe('NEED_CONFIRM');
      expect(gate.reasons.some((r) => r.includes('REDUCE_PACE'))).toBe(true);
    });
  });

  describe('mergeGateStatuses', () => {
    it('picks the stricter status', () => {
      const merged = bridge.mergeGateStatuses(
        { status: 'ALLOW', reasons: [], missingEvidence: [] },
        {
          status: 'NEED_CONFIRM',
          reasons: ['Dr.Dre 建议调整'],
          missingEvidence: [],
          guardianResults: {
            abu: { verdict: 'ALLOW', evidence: [] },
            drdre: { verdict: 'ADJUST', evidence: ['节奏偏紧'] },
            neptune: { verdict: 'ALLOW', evidence: [] },
          },
        },
      );
      expect(merged.status).toBe('NEED_CONFIRM');
      expect(merged.guardianResults?.drdre.verdict).toBe('ADJUST');
    });
  });

  describe('skeletonToRoutePlanDraft', () => {
    it('converts dayThemes into route segments', () => {
      const skeleton: PlanSkeleton = {
        id: 'opt_compact',
        name: '紧凑型',
        dayThemes: [
          { day: 1, theme: '抵达', description: '市区休整' },
          { day: 2, theme: '南岸', description: '瀑布与黑沙滩' },
        ],
        anchors: [],
        transferDays: [],
        rationale: { philosophy: '密度优先', tradeoffs: [], strengths: [], weaknesses: [] },
      };

      const draft = bridge.skeletonToRoutePlanDraft(skeleton, {
        tripId: 'trip-1',
        routeDirectionId: 'rd-1',
        segments: [],
      });

      expect(draft.segments).toHaveLength(2);
      expect(draft.segments[0].metadata?.skeletonId).toBe('opt_compact');
      expect(draft.segments[1].dayIndex).toBe(1);
    });
  });

  describe('enrichComparisonWithGateDeltas', () => {
    it('overrides recommendation in native mode when kernel diverges', () => {
      const comparison: OptionComparison = {
        options: [
          {
            optionId: 'opt_a',
            scores: {
              executability: 80,
              cost: 40,
              fatigue: 50,
              experienceDensity: 70,
              risk: 30,
              freedom: 60,
            },
            summary: '均衡方案',
          },
          {
            optionId: 'opt_b',
            scores: {
              executability: 75,
              cost: 35,
              fatigue: 45,
              experienceDensity: 80,
              risk: 35,
              freedom: 55,
            },
            summary: '紧凑方案',
          },
        ],
        recommendation: { optionId: 'opt_b', reason: 'LLM 推荐紧凑' },
      };

      const kernelCompare = {
        optionDeltas: [
          {
            optionId: 'opt_a',
            gateStatus: 'ALLOW' as const,
            kernelGateResult: 'ALLOW' as const,
            violationCount: 0,
            violationTypes: [],
            topReasons: [],
            guardiansAllowed: true,
          },
          {
            optionId: 'opt_b',
            gateStatus: 'NEED_CONFIRM' as const,
            kernelGateResult: 'ADJUST_REQUIRED' as const,
            violationCount: 2,
            violationTypes: ['FATIGUE', 'SCOPE'],
            topReasons: ['节奏过紧'],
            dominantCid: 'FATIGUE',
            guardiansAllowed: false,
          },
        ],
        recommendedByGate: 'opt_a',
        recommendedDominantCid: undefined,
        divergesFromLlmRecommendation: true,
        llmRecommendedOptionId: 'opt_b',
        appliedAt: new Date().toISOString(),
      };

      const enriched = bridge.enrichComparisonWithGateDeltas(comparison, kernelCompare, {
        overrideRecommendation: true,
      });

      expect(enriched.recommendation?.optionId).toBe('opt_a');
      expect(enriched.recommendation?.reason).toContain('dominant_cid=');
      expect(enriched.kernelGateEval?.recommendedByGate).toBe('opt_a');
      expect(enriched.options[1].scores.executability).toBe(75);
      expect(enriched.options[1].summary).toContain('dominant_cid=FATIGUE');
    });
  });
});
