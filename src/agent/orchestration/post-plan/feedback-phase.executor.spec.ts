import { runFeedbackPhase } from './feedback-phase.executor';
import type { FeedbackPhaseHost } from './feedback-phase.host';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';

describe('runFeedbackPhase', () => {
  it('returns decisionState unchanged when kernel or dso is missing', async () => {
    const state = { request_id: 'r1', decision_log: [], metadata: {} } as OrchestratorState;
    const dso = { requestId: 'r1' } as any;
    const host: FeedbackPhaseHost = {
      logger: { debug: jest.fn() } as any,
      isDsoAsPrimary: () => false,
    };
    await expect(runFeedbackPhase(host, { state, decisionState: dso })).resolves.toBe(dso);
    expect(state.current_step).toBeUndefined();
  });

  it('runs executeFeedback and appends decision_log', async () => {
    const state = {
      request_id: 'r1',
      decision_log: [],
      metadata: {},
    } as OrchestratorState;
    const dso = { requestId: 'r1', confidence: 0.8, systemState: { version: 2 } } as any;
    const executeFeedback = jest.fn().mockImplementation((_dso, patch) =>
      Promise.resolve({
        newState: {
          ...dso,
          confidence: 0.9,
          systemState: {
            ...(dso.systemState ?? {}),
            ...(patch?.systemState ?? {}),
            version: 3,
          },
        },
      }),
    );
    const host: FeedbackPhaseHost = {
      logger: { debug: jest.fn() } as any,
      decisionKernel: { executeFeedback } as any,
      isDsoAsPrimary: () => true,
    };
    const out = await runFeedbackPhase(host, { state, decisionState: dso });
    expect(state.current_step).toBe('FEEDBACK');
    expect(executeFeedback).toHaveBeenCalled();
    expect(state.decision_log).toHaveLength(1);
    expect(out?.confidence).toBe(0.9);
    expect(out?.cognition?.markers).toContain('OUTCOME_RECONCILED');
    expect((state.metadata as any).cognition_markers).toContain('OUTCOME_RECONCILED');
    expect((state.metadata as any).dso_projection).toMatchObject({
      authority: 'DSO',
      phase: 'FEEDBACK',
      dsoVersion: 3,
    });
  });
});
