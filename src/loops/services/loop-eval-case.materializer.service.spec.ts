import { LoopEvalCaseMaterializerService } from './loop-eval-case.materializer.service';
import type { LoopRunDetail } from '../types/loop-run.types';

describe('LoopEvalCaseMaterializerService', () => {
  const svc = new LoopEvalCaseMaterializerService();

  const baseRun = (overrides: Partial<LoopRunDetail>): LoopRunDetail => ({
    id: 'loop_abc123',
    tripId: 'trip-1',
    loopType: 'READINESS_REPAIR',
    status: 'WAITING_FOR_HUMAN',
    currentIteration: 1,
    startedAt: new Date().toISOString(),
    iterations: [
      {
        id: 'iter-1',
        loopRunId: 'loop_abc123',
        sequence: 1,
        observedState: {},
        diagnosis: { issueTitle: '时间冲突' },
        proposedAction: { optionId: 'opt-a', title: '调整时间' },
        validationResult: { passed: true },
        decision: 'CONTINUE',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'iter-2',
        loopRunId: 'loop_abc123',
        sequence: 2,
        observedState: {},
        diagnosis: { issueTitle: '时间冲突' },
        proposedAction: { optionId: 'opt-b', title: '换餐厅' },
        validationResult: { passed: false },
        decision: 'WAIT_FOR_HUMAN',
        createdAt: new Date().toISOString(),
      },
    ],
    finalOutcome: {
      before: { readinessScore: 62, hardBlockers: 2 },
      after: { readinessScore: 70, hardBlockers: 1 },
      stopReason: 'patches_ready_for_approval',
      requiresApproval: true,
    },
    ...overrides,
  });

  it('materializes REGRESSION case with six-tuple and counterfactual', () => {
    const evalCase = svc.materialize(baseRun({}));
    expect(evalCase?.kind).toBe('REGRESSION');
    expect(evalCase?.approval?.status).toBe('PENDING');
    expect(evalCase?.sixTuple.options).toHaveLength(2);
    expect(evalCase?.sixTuple.counterfactual?.rejectedOptionId).toBe('opt-b');
    expect(evalCase?.sixTuple.decision.chosenOptionId).toBe('opt-a');
  });

  it('materializes GOLDEN on success', () => {
    const evalCase = svc.materialize(
      baseRun({
        status: 'COMPLETED',
        finalOutcome: {
          before: { readinessScore: 90, hardBlockers: 0, canStartExecute: true },
          after: { readinessScore: 92, hardBlockers: 0, canStartExecute: true },
          stopReason: 'success_criteria_met',
        },
      }),
    );
    expect(evalCase?.kind).toBe('GOLDEN');
  });

  it('materializes FAILURE on no progress', () => {
    const evalCase = svc.materialize(
      baseRun({
        status: 'FAILED',
        finalOutcome: {
          before: { readinessScore: 50, hardBlockers: 3 },
          after: { readinessScore: 50, hardBlockers: 3 },
          stopReason: 'no_progress_detected',
        },
      }),
    );
    expect(evalCase?.kind).toBe('FAILURE');
    expect(evalCase?.metadata?.priority).toBe('P0');
  });
});
