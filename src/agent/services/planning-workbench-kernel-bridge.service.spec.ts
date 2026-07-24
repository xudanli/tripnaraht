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

  describe('runNativeVerifyPipeline', () => {
    it('skips when verify SSOT not applied', async () => {
      const kernel = {
        executeVerify: jest.fn(),
        updateState: jest.fn((s: unknown, patch: unknown) => ({ ...(s as object), ...(patch as object) })),
      };
      const bridgeWithKernel = new PlanningWorkbenchKernelBridgeService(kernel as never);
      const planState = mockPlanState();

      const out = await bridgeWithKernel.runNativeVerifyPipeline({
        request: mockRequest(),
        planState,
      });

      expect(out.skipped).toBe(true);
      expect(out.reason).toBe('verify_ssot_not_applied');
      expect(kernel.executeVerify).not.toHaveBeenCalled();
    });

    it('runs executeVerify with graph projected itinerary', async () => {
      const kernel = {
        executeVerify: jest.fn().mockResolvedValue({
          issues: [{ code: 'TIME_WINDOW_OVERLAP', class: 'CONFLICT', message: 'overlap' }],
          confidenceDelta: -0.1,
          newState: {},
        }),
        updateState: jest.fn((current: Record<string, unknown>, patch: Record<string, unknown>) => ({
          ...current,
          ...patch,
          systemState: { ...(current.systemState as object), ...(patch.systemState as object) },
        })),
      };
      const bridgeWithKernel = new PlanningWorkbenchKernelBridgeService(kernel as never);
      const planState = mockPlanState();
      planState.metadata = {
        verify_ssot_applied: true,
        verify_itinerary_source: 'canonical_travel_graph@v0',
        graph_projected_itinerary: {
          request_id: 'plan_test',
          days: [{ date: '2026-08-01', items: [{ id: 'p1', type: 'POI', location_ref: { name: 'Gullfoss' } }] }],
        },
        canonical_travel_graph: { graphId: 'g1', compileId: 'c1' },
      };

      const out = await bridgeWithKernel.runNativeVerifyPipeline({
        request: mockRequest(),
        planState,
      });

      expect(out.skipped).toBe(false);
      expect(out.metadata.issueCount).toBe(1);
      expect(out.gateStatus.status).toBe('NEED_CONFIRM');
      expect(kernel.executeVerify).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          verifyItinerarySource: 'canonical_travel_graph@v0',
          itinerary: planState.metadata?.graph_projected_itinerary,
        }),
      );
      expect(planState.metadata?.kernelVerify?.issueCount).toBe(1);
    });

    it('runs executeRepair when verify finds repairable conflicts', async () => {
      const repairedItinerary = {
        request_id: 'plan_test',
        days: [{ date: '2026-08-03', items: [{ id: 'p1', type: 'POI', location_ref: { name: 'Geysir' } }] }],
      };
      const kernel = {
        executeVerify: jest.fn().mockResolvedValue({
          issues: [{ code: 'TIME_WINDOW_OVERLAP', class: 'CONFLICT', message: 'overlap' }],
          confidenceDelta: -0.1,
          newState: { requestId: 'plan_test' },
        }),
        executeRepair: jest.fn().mockResolvedValue({
          repairApplied: true,
          itinerary: repairedItinerary,
          newState: {},
        }),
        updateState: jest.fn((current: Record<string, unknown>, patch: Record<string, unknown>) => ({
          ...current,
          ...patch,
          systemState: { ...(current.systemState as object), ...(patch.systemState as object) },
        })),
      };
      const bridgeWithKernel = new PlanningWorkbenchKernelBridgeService(kernel as never);
      const planState = mockPlanState();
      planState.constraints.time = { days: 1, startDate: '2026-08-03' };
      planState.itinerary.segments = [
        {
          segmentId: 's0',
          dayIndex: 0,
          distanceKm: 0,
          ascentM: 0,
          slopePct: 0,
          metadata: { attractions: [{ name: 'Gullfoss' }] },
        },
      ];
      planState.metadata = {
        verify_ssot_applied: true,
        verify_itinerary_source: 'canonical_travel_graph@v0',
        graph_projected_itinerary: {
          request_id: 'plan_test',
          days: [{ date: '2026-08-03', items: [{ id: 'p1', type: 'POI', location_ref: { name: 'Gullfoss' } }] }],
        },
      };

      const out = await bridgeWithKernel.runNativeVerifyRepairPipeline({
        request: mockRequest(),
        planState,
        enableRepair: true,
      });

      expect(out.repair?.applied).toBe(true);
      expect(out.repair?.segmentsUpdated).toBe(1);
      expect(kernel.executeRepair).toHaveBeenCalled();
      const attractions = planState.itinerary.segments[0]?.metadata?.attractions as Array<
        Record<string, unknown>
      >;
      expect(attractions?.[0]?.name).toBe('Geysir');
    });
  });
});
