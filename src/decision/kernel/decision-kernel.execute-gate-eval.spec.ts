/**
 * DecisionKernelService.executeGateEval 单元测试
 * 覆盖 KERNEL_NATIVE_EXECUTION 路径下 Gate 结果透传与状态步进
 */

import { DecisionKernelService } from './decision-kernel.service';
import type { DecisionState, ConstraintReport } from './decision-state.types';
import type { GateResultLike, OrchestratorAlternativesLike, PhaseExecutorContext } from './interfaces/phase-executor.interface';

describe('DecisionKernelService.executeGateEval', () => {
  const makeState = (requestId = 'req-kernel-gate'): DecisionState =>
    ({
      requestId,
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
    }) as DecisionState;

  const makeContext = (requestId = 'req-kernel-gate'): PhaseExecutorContext =>
    ({
      requestId,
      tripPlanRequest: {
        destination: 'JP-Tokyo',
        date_range: { start_date: '2026-07-01', end_date: '2026-07-05' },
      },
      researchData: {},
    }) as PhaseExecutorContext;

  const mergeMock = jest.fn((current: DecisionState, patch: Partial<DecisionState>) => ({
    ...current,
    ...patch,
    systemState: {
      ...(current.systemState ?? {}),
      ...(patch.systemState ?? {}),
    },
  }));

  const makeKernel = (gateEvalExecutor?: { execute: jest.Mock }) => {
    const stateManager = {
      merge: mergeMock,
      commit: jest.fn(),
      appendHistoryDelta: jest.fn(),
      commitWithLock: jest.fn(),
    };
    const constraintAdapter = { getReport: jest.fn(), getReportAsync: jest.fn() };
    const optimizationAdapter = { getHints: jest.fn(), getHintsAsync: jest.fn() };
    const contextAdapter = { buildContextPackage: jest.fn() };
    const feedbackAdapter = { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() };
    return new DecisionKernelService(
      stateManager as any,
      constraintAdapter as any,
      optimizationAdapter as any,
      contextAdapter as any,
      feedbackAdapter as any,
      undefined, // researchPipeline
      gateEvalExecutor as any,
    );
  };

  beforeEach(() => {
    mergeMock.mockClear();
  });

  it('未注入 gateEvalExecutor 时应降级返回 ALLOW 且不变更状态', async () => {
    const kernel = makeKernel(undefined);
    const dso = makeState('req-fallback');
    const ctx = makeContext('req-fallback');

    const result = await kernel.executeGateEval(dso, ctx);

    expect(result.gateResult.gate_result).toBe('ALLOW');
    expect(result.constraints.feasible).toBe(true);
    expect(result.newState).toBe(dso);
    expect(mergeMock).not.toHaveBeenCalled();
  });

  it('执行器返回 BLOCK 时应透传 gateResult 并写入 GATE_EVAL 阶段状态', async () => {
    const constraints: ConstraintReport = {
      feasible: false,
      violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'unreachable' }],
    };
    const gateResult: GateResultLike = {
      gate_result: 'BLOCK',
      violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'unreachable' }],
      required_adjustments: [],
      confidence: 0.91,
    };
    const gateEvalExecutor = {
      execute: jest.fn().mockResolvedValue({ constraints, gateResult }),
    };
    const kernel = makeKernel(gateEvalExecutor);
    const dso = makeState('req-block');
    const ctx = makeContext('req-block');

    const result = await kernel.executeGateEval(dso, ctx);

    expect(gateEvalExecutor.execute).toHaveBeenCalledWith(dso, ctx);
    expect(result.gateResult.gate_result).toBe('BLOCK');
    expect(result.constraints.feasible).toBe(false);
    expect(result.newState.constraints).toEqual(constraints);
    expect(result.newState.systemState?.currentPhase).toBe('GATE_EVAL');
    const alts = result.newState.tripState?.orchestratorAlternatives;
    expect(alts?.alternative_pois?.length).toBeGreaterThanOrEqual(1);
    expect((alts?.alternative_pois?.[0] as { reason?: string })?.reason).toContain('unreachable');
  });

  it('执行器返回 BLOCK 且自带 alternatives 时应写入 DSO tripState（优先于 fallback）', async () => {
    const constraints: ConstraintReport = {
      feasible: false,
      violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'blocked' }],
    };
    const gateResult: GateResultLike = {
      gate_result: 'BLOCK',
      violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'blocked' }],
      required_adjustments: [],
      confidence: 0.9,
    };
    const alternatives: OrchestratorAlternativesLike = {
      alternative_pois: [
        {
          poi_id: 'custom-alt',
          name: '备选景点',
          reason: '主路径不可达时的可执行替代',
          evidence_status: 'UNVERIFIED',
        },
      ],
      alternative_routes: [],
    };
    const gateEvalExecutor = {
      execute: jest.fn().mockResolvedValue({ constraints, gateResult, alternatives }),
    };
    const kernel = makeKernel(gateEvalExecutor);
    const dso = makeState('req-block-alts');
    const ctx = makeContext('req-block-alts');

    const result = await kernel.executeGateEval(dso, ctx);

    expect(result.newState.tripState?.orchestratorAlternatives?.alternative_pois).toHaveLength(1);
    expect(
      (result.newState.tripState?.orchestratorAlternatives?.alternative_pois?.[0] as { poi_id?: string })?.poi_id,
    ).toBe('custom-alt');
  });

  it('执行器返回 NEED_USER_CONFIRM 时应保持不可行并透传结果', async () => {
    const constraints: ConstraintReport = { feasible: false, violations: [] };
    const gateResult: GateResultLike = {
      gate_result: 'NEED_USER_CONFIRM',
      violations: [],
      required_adjustments: [],
      confidence: 0.8,
    };
    const gateEvalExecutor = {
      execute: jest.fn().mockResolvedValue({ constraints, gateResult }),
    };
    const kernel = makeKernel(gateEvalExecutor);
    const dso = makeState('req-nuc');
    const ctx = makeContext('req-nuc');

    const result = await kernel.executeGateEval(dso, ctx);

    expect(result.gateResult.gate_result).toBe('NEED_USER_CONFIRM');
    expect(result.constraints.feasible).toBe(false);
    expect(result.newState.systemState?.currentPhase).toBe('GATE_EVAL');
    expect(result.newState.tripState?.orchestratorAlternatives).toBeUndefined();
  });

  it('执行器返回 ADJUST_REQUIRED 时应透传 gateResult 与 required_adjustments', async () => {
    const constraints: ConstraintReport = {
      feasible: false,
      violations: [{ type: 'TIME_CONFLICT', severity: 'SOFT', detail: 'day2 tight' }],
    };
    const gateResult: GateResultLike = {
      gate_result: 'ADJUST_REQUIRED',
      violations: [{ type: 'TIME_CONFLICT', severity: 'SOFT', detail: 'day2 tight' }],
      required_adjustments: [{ action: 'ADD_BUFFER', why: '增加 30 分钟缓冲' }],
      confidence: 0.55,
    };
    const gateEvalExecutor = {
      execute: jest.fn().mockResolvedValue({ constraints, gateResult }),
    };
    const kernel = makeKernel(gateEvalExecutor);
    const dso = makeState('req-adjust');
    const ctx = makeContext('req-adjust');

    const result = await kernel.executeGateEval(dso, ctx);

    expect(result.gateResult.gate_result).toBe('ADJUST_REQUIRED');
    expect(result.gateResult.required_adjustments?.[0]?.action).toBe('ADD_BUFFER');
    expect(result.constraints.feasible).toBe(false);
    expect(result.newState.systemState?.currentPhase).toBe('GATE_EVAL');
    expect(result.newState.tripState?.orchestratorAlternatives).toBeUndefined();
  });

  it('当执行器返回 ALLOW 但 DSO.optimizationHints 指示 fail-safe BLOCK 时应降级 gateResult', async () => {
    const constraints: ConstraintReport = { feasible: true, violations: [] };
    const gateResult: GateResultLike = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 0.92,
    };
    const gateEvalExecutor = {
      execute: jest.fn().mockResolvedValue({ constraints, gateResult }),
    };
    const kernel = makeKernel(gateEvalExecutor);
    const dso = {
      ...makeState('req-fs-block'),
      optimizationHints: { failSafeAction: 'BLOCK', failSafeReason: 'META_BUDGET_EXHAUSTED' } as any,
    } as DecisionState;
    const ctx = makeContext('req-fs-block');

    const result = await kernel.executeGateEval(dso, ctx);

    expect(result.gateResult.gate_result).toBe('BLOCK');
    expect(result.constraints.feasible).toBe(false);
    expect(result.constraints.gateOutcome).toBe('BLOCK');
    expect(result.gateResult.violations.some((v) => v.type === 'META_BUDGET')).toBe(true);
  });

  it('当执行器返回 ALLOW 但 DSO.optimizationHints 指示 fail-safe ADJUST_REQUIRED 时应降级并追加 required_adjustments', async () => {
    const constraints: ConstraintReport = { feasible: true, violations: [] };
    const gateResult: GateResultLike = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 0.92,
    };
    const gateEvalExecutor = {
      execute: jest.fn().mockResolvedValue({ constraints, gateResult }),
    };
    const kernel = makeKernel(gateEvalExecutor);
    const dso = {
      ...makeState('req-fs-adjust'),
      optimizationHints: { failSafeAction: 'ADJUST_REQUIRED', failSafeReason: 'META_BUDGET_BELOW_MIN(sample<=40)' } as any,
    } as DecisionState;
    const ctx = makeContext('req-fs-adjust');

    const result = await kernel.executeGateEval(dso, ctx);

    expect(result.gateResult.gate_result).toBe('ADJUST_REQUIRED');
    expect(result.constraints.feasible).toBe(false);
    expect(result.constraints.gateOutcome).toBe('ADJUST_REQUIRED');
    expect(result.gateResult.required_adjustments.some((a) => a.action === 'REDUCE_SCOPE_OR_ADD_EVIDENCE')).toBe(true);
  });
});

