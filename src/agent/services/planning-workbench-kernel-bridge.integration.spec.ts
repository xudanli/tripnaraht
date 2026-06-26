/**
 * Planning Workbench Kernel Bridge — 真实 DecisionKernel 注入集成测试
 */
import { DecisionKernelService } from '../../decision/kernel/decision-kernel.service';
import type { ConstraintReport, DecisionState } from '../../decision/kernel/decision-state.types';
import type { GateResultLike } from '../../decision/kernel/interfaces/phase-executor.interface';
import { PlanningWorkbenchKernelBridgeService } from './planning-workbench-kernel-bridge.service';
import type { PlanSkeleton, PlanState } from '../../skills/plan/shared/plan-state.types';
import { normalizeDecisionOsAuditContract } from '../contracts/decision-os-audit.contract';

function makeKernel(
  gateBySkeletonId: Record<string, { gateResult: GateResultLike; constraints: ConstraintReport }>,
): DecisionKernelService {
  const mergeMock = jest.fn((current: DecisionState, patch: Partial<DecisionState>) => ({
    ...current,
    ...patch,
    systemState: { ...(current.systemState ?? {}), ...(patch.systemState ?? {}) },
  }));

  const gateEvalExecutor = {
    execute: jest.fn().mockImplementation(async (dso: DecisionState) => {
      const rid = String(dso.requestId ?? '');
      const skeletonId = Object.keys(gateBySkeletonId).find((k) => rid.endsWith(`:${k}`)) ?? 'opt_a';
      return gateBySkeletonId[skeletonId];
    }),
  };

  return new DecisionKernelService(
    { merge: mergeMock, commit: jest.fn(), appendHistoryDelta: jest.fn(), commitWithLock: jest.fn() } as any,
    { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
    { getHints: jest.fn(), getHintsAsync: jest.fn() } as any,
    { buildContextPackage: jest.fn() } as any,
    { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
    undefined,
    gateEvalExecutor as any,
  );
}

function planState(): PlanState {
  return {
    plan_id: 'plan_int',
    plan_version: 1,
    constraints: { time: { days: 5 }, budget: { total: 3000 }, fitness: { level: 'medium' } },
    itinerary: { tripId: 'trip-int', routeDirectionId: 'rd-1', segments: [] },
    mobility: { transferSegments: [] },
    budget: {},
    pace: {},
    gate: { status: 'ALLOW', reasons: [], missingEvidence: [] },
    evidence_refs: [],
    decision_log_refs: [],
    status: 'DRAFT',
  };
}

function skeleton(id: string, name: string): PlanSkeleton {
  return {
    id,
    name,
    dayThemes: [{ day: 1, theme: 'A', description: 'd1' }],
    anchors: [],
    transferDays: [],
    rationale: { philosophy: 't', tradeoffs: [], strengths: [], weaknesses: [] },
  };
}

describe('PlanningWorkbenchKernelBridgeService (Kernel injection)', () => {
  beforeEach(() => {
    process.env.PLANNING_WORKBENCH_KERNEL_MODE = 'native';
  });

  it('runCompareGateEvalForOptions uses real executeGateEval per skeleton', async () => {
    const kernel = makeKernel({
      opt_safe: {
        constraints: { feasible: true, violations: [] },
        gateResult: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 0.9,
        },
      },
      opt_risky: {
        constraints: {
          feasible: false,
          violations: [
            {
              type: 'TERRAIN_UNFIT',
              severity: 'HARD',
              degree: 0.9,
              detail: 'F-road ascent exceeds envelope',
              constraint: 'terrain.f_road_compatibility',
            },
          ],
        },
        gateResult: {
          gate_result: 'BLOCK',
          violations: [
            {
              type: 'TERRAIN_UNFIT',
              severity: 'HARD',
              degree: 0.9,
              detail: 'F-road ascent exceeds envelope',
              constraint: 'terrain.f_road_compatibility',
            },
          ],
          required_adjustments: [],
          confidence: 0.88,
        },
      },
    });

    const bridge = new PlanningWorkbenchKernelBridgeService(
      kernel,
      undefined,
      undefined,
      undefined,
      { getFlags: () => ({ planningWorkbenchKernelMode: 'native' }) } as any,
    );

    const compare = await bridge.runCompareGateEvalForOptions({
      request: {
        context: { destination: { country: 'IS' }, days: 4, travelMode: 'self_drive' },
        tripId: 'trip-int',
        userAction: 'compare',
      },
      planState: planState(),
      options: [skeleton('opt_safe', '稳妥'), skeleton('opt_risky', '冒险')],
      llmRecommendedOptionId: 'opt_risky',
      requestId: 'int-compare-1',
    });

    expect(compare?.recommendedByGate).toBe('opt_safe');
    expect(compare?.divergesFromLlmRecommendation).toBe(true);

    const risky = compare?.optionDeltas.find((d) => d.optionId === 'opt_risky');
    expect(risky?.gateStatus).toBe('REJECT');
    expect(risky?.dominantCid).toBe('terrain.f_road_compatibility');
    expect(risky?.l3Evidence?.[0]).toMatchObject({
      cid: 'terrain.f_road_compatibility',
      slack: 0.9,
      limit: 0,
    });

    const audit = normalizeDecisionOsAuditContract(compare?.decisionOsAudit);
    expect(audit.violations).toEqual([]);
    expect(audit.dominant_cid).toBe('KERNEL_LLM_COMPARE_MISMATCH');
    expect(audit.session_consistency_score).toBeLessThan(95);
  });

  it('enrichComparisonWithGateDeltas preserves LLM scores and annotates kernel evidence', async () => {
    const kernel = makeKernel({
      opt_a: {
        constraints: { feasible: true, violations: [] },
        gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 },
      },
      opt_b: {
        constraints: {
          feasible: false,
          violations: [{ type: 'SCOPE', severity: 'SOFT', degree: 0.4, detail: 'tight', constraint: 'SCOPE' }],
        },
        gateResult: {
          gate_result: 'ADJUST_REQUIRED',
          violations: [{ type: 'SCOPE', severity: 'SOFT', degree: 0.4, detail: 'tight', constraint: 'SCOPE' }],
          required_adjustments: [{ action: 'REDUCE_PACE', why: 'tight' }],
          confidence: 0.6,
        },
      },
    });

    const bridge = new PlanningWorkbenchKernelBridgeService(
      kernel,
      undefined,
      undefined,
      undefined,
      { getFlags: () => ({ planningWorkbenchKernelMode: 'native' }) } as any,
    );

    const kernelCompare = await bridge.runCompareGateEvalForOptions({
      request: {
        context: { destination: { country: 'IS' }, days: 3 },
        tripId: 'trip-int',
        userAction: 'compare',
      },
      planState: planState(),
      options: [skeleton('opt_a', 'A'), skeleton('opt_b', 'B')],
      llmRecommendedOptionId: 'opt_b',
    });

    const enriched = bridge.enrichComparisonWithGateDeltas(
      {
        options: [
          {
            optionId: 'opt_a',
            scores: { executability: 80, cost: 40, fatigue: 50, experienceDensity: 70, risk: 30, freedom: 60 },
            summary: 'A',
          },
          {
            optionId: 'opt_b',
            scores: { executability: 75, cost: 35, fatigue: 45, experienceDensity: 80, risk: 35, freedom: 55 },
            summary: 'B',
          },
        ],
        recommendation: { optionId: 'opt_b', reason: 'LLM pick B' },
      },
      kernelCompare!,
      { overrideRecommendation: true },
    );

    expect(enriched.options[1].scores.executability).toBe(75);
    expect(enriched.recommendation?.optionId).toBe('opt_a');
    expect(enriched.options[1].summary).toContain('dominant_cid=SCOPE');
  });
});
