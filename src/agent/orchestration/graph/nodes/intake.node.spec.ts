import { IntakeOrchestratorNode, runIntakePrePlanSegment } from './intake.node';
import type { IntakeNodeHost } from './intake-node.host';
import type { IntakePrePlanSegmentInput } from './base.node';

describe('IntakeOrchestratorNode', () => {
  it('delegates pre_plan segment to host executeIntakeStep', async () => {
    const host: IntakeNodeHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any,
      executeIntakeStep: jest.fn().mockResolvedValue(undefined),
      maybeSnapshot: jest.fn(),
      buildPrePlanSuccessResult: jest.fn(),
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

  it('short-circuits to terminal_done when itinerary delete applied in intake', async () => {
    const host: IntakeNodeHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any,
      executeIntakeStep: jest.fn().mockImplementation(async (_req, _ctx, state) => {
        state.metadata = {
          ...(state.metadata ?? {}),
          itinerary_item_delete_short_circuit: { applied: true, deletedCount: 1 },
        };
      }),
      maybeSnapshot: jest.fn(),
      buildPrePlanSuccessResult: jest.fn().mockReturnValue({ success: true, answerText: 'deleted' }),
    };
    const node = new IntakeOrchestratorNode(host);
    const prePlanTerminal = jest.fn().mockReturnValue({
      kind: 'terminal' as const,
      terminal: 'terminal_done' as const,
      result: { success: true },
      decisionState: undefined,
    });
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
        maybeStopAfter: () => null,
        prePlanTerminal,
      },
    } satisfies IntakePrePlanSegmentInput;

    const segment = await node.runPrePlanSegment(input);
    expect(segment.kind).toBe('terminal');
    expect(prePlanTerminal).toHaveBeenCalledWith('terminal_done', expect.objectContaining({ success: true }));
  });

  it('skips executeIntakeStep when resumeSkipIntake', async () => {
    const host: IntakeNodeHost = {
      logger: { log: jest.fn() } as any,
      executeIntakeStep: jest.fn(),
      maybeSnapshot: jest.fn(),
      buildPrePlanSuccessResult: jest.fn(),
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

  it('on resumeSkipIntake still applies delete intent and terminals', async () => {
    const tryApply = jest.fn().mockResolvedValue({
      applied: true,
      deletedCount: 1,
      answerText: '已从第1天删除 1 个相关行程项',
    });
    const host: IntakeNodeHost = {
      logger: { log: jest.fn() } as any,
      executeIntakeStep: jest.fn(),
      maybeSnapshot: jest.fn(),
      buildPrePlanSuccessResult: jest.fn().mockReturnValue({ success: true, answerText: 'deleted' }),
      tryApplyBoundTripItineraryItemDelete: tryApply,
    };
    const prePlanTerminal = jest.fn().mockReturnValue({
      kind: 'terminal' as const,
      terminal: 'terminal_done' as const,
      result: { success: true },
      decisionState: undefined,
    });
    const state = { request_id: 'r1', metadata: {}, decision_log: [], current_step: 'INTAKE' } as any;
    const input = {
      request: { message: '删除第3天的斯科加瀑布poi', trip_id: 'trip-1', user_id: 'u1' } as any,
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
        prePlanTerminal,
      },
    } satisfies IntakePrePlanSegmentInput;

    const segment = await runIntakePrePlanSegment(host, input);
    expect(host.executeIntakeStep).not.toHaveBeenCalled();
    expect(tryApply).toHaveBeenCalledWith('trip-1', 'u1', '删除第3天的斯科加瀑布poi');
    expect(segment.kind).toBe('terminal');
    expect(prePlanTerminal).toHaveBeenCalledWith('terminal_done', expect.objectContaining({ success: true }));
  });
});
