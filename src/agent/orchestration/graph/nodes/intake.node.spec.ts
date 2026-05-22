import { IntakeOrchestratorNode } from './intake.node';
import type { IntakeNodeHost } from './intake-node.host';
import type { IntakePrePlanSegmentInput } from './base.node';

describe('IntakeOrchestratorNode', () => {
  it('delegates pre_plan segment to host executeIntakeStep', async () => {
    const host: IntakeNodeHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any,
      executeIntakeStep: jest.fn().mockResolvedValue(undefined),
      maybeSnapshot: jest.fn(),
    };
    const node = new IntakeOrchestratorNode(host);
    const input = {
      request: {} as any,
      context: {} as any,
      state: { request_id: 'r1', metadata: {}, decision_log: [] } as any,
      decisionState: undefined,
      llmProvider: 'anthropic' as any,
      startTime: Date.now(),
      resumeSkipIntake: false,
      systemRequestId: 'r1',
      logger: host.logger,
      prePlan: {
        startTime: Date.now(),
        maybeStopAfter: () => ({ kind: 'completed' as const, lastNode: 'intake' as const, decisionState: undefined }),
        prePlanTerminal: () => ({
          kind: 'terminal' as const,
          terminal: 'terminal_done' as const,
          result: {} as any,
          decisionState: undefined,
        }),
      },
    } satisfies IntakePrePlanSegmentInput;

    const segment = await node.runPrePlanSegment(input);
    expect(segment.kind).toBe('completed');
    expect(host.executeIntakeStep).toHaveBeenCalled();
    expect(host.maybeSnapshot).toHaveBeenCalled();
  });

  it('skips executeIntakeStep when resumeSkipIntake', async () => {
    const host: IntakeNodeHost = {
      logger: { log: jest.fn() } as any,
      executeIntakeStep: jest.fn(),
      maybeSnapshot: jest.fn(),
    };
    const node = new IntakeOrchestratorNode(host);
    const state = { request_id: 'r1', metadata: {}, decision_log: [], current_step: 'INTAKE' } as any;
    const input = {
      request: {} as any,
      context: {} as any,
      state,
      decisionState: undefined,
      llmProvider: 'anthropic' as any,
      startTime: Date.now(),
      resumeSkipIntake: true,
      systemRequestId: 'r1',
      logger: host.logger,
      prePlan: {
        startTime: Date.now(),
        maybeStopAfter: () => null,
        prePlanTerminal: () => ({ kind: 'terminal' as const, terminal: 'x' as const, result: {} as any, decisionState: undefined }),
      },
    } satisfies IntakePrePlanSegmentInput;

    await node.runPrePlanSegment(input);
    expect(host.executeIntakeStep).not.toHaveBeenCalled();
    expect(state.current_step).toBe('STATE_UPDATE');
  });
});
