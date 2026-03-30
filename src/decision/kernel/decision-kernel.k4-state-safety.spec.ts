/**
 * WP-DK-P1-2 / DK-04：异常路径下 DSO 不被部分写入（execute 在 merge 前失败则状态不前进）
 */
import { DecisionKernelService } from './decision-kernel.service';
import type { DecisionState } from './decision-state.types';
import type { PhaseExecutorContext } from './interfaces/phase-executor.interface';

describe('DecisionKernelService K4 state safety (executeGateEval)', () => {
  const makeState = (requestId = 'req-k4'): DecisionState =>
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

  const makeContext = (requestId = 'req-k4'): PhaseExecutorContext =>
    ({
      requestId,
      tripPlanRequest: {
        destination: 'JP-Tokyo',
        date_range: { start_date: '2026-07-01', end_date: '2026-07-05' },
      },
      researchData: {},
    }) as PhaseExecutorContext;

  it('executor 抛错时不调用 merge，DSO 对象不被内核改写', async () => {
    const mergeMock = jest.fn((_current: DecisionState, _patch: unknown) => {
      throw new Error('merge should not run');
    });
    const stateManager = {
      merge: mergeMock,
      commit: jest.fn(),
      appendHistoryDelta: jest.fn(),
      commitWithLock: jest.fn(),
    };
    const gateEvalExecutor = {
      execute: jest.fn().mockRejectedValue(new Error('gate executor failed')),
    };
    const kernel = new DecisionKernelService(
      stateManager as any,
      { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
      { getHints: jest.fn(), getHintsAsync: jest.fn() } as any,
      { buildContextPackage: jest.fn() } as any,
      { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
      undefined,
      gateEvalExecutor as any,
    );

    const dso = makeState();
    const snapshot = JSON.stringify(dso);

    await expect(kernel.executeGateEval(dso, makeContext())).rejects.toThrow('gate executor failed');

    expect(mergeMock).not.toHaveBeenCalled();
    expect(JSON.stringify(dso)).toBe(snapshot);
  });
});
