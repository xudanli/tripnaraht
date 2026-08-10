import { maybeStateUpdateTerminalNoSolution } from './state-update-halts.runner';
import type { StateUpdateHaltsHost } from './state-update-halts.host';

describe('state-update-halts.runner', () => {
  it('returns null when terminal_intent is absent', async () => {
    const host: StateUpdateHaltsHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      maybeSnapshot: jest.fn(),
      shouldReturnClarificationForMarathonIntake: () => false,
      shouldReturnClarificationForFroad2wdIntake: () => false,
      shouldReturnClarificationForPeakSeasonTimeShiftIntake: () => false,
      shouldReturnClarificationForItinerarySlotPlacementIntake: () => false,
      shouldReturnClarificationForHardGaps: () => false,
      buildClarificationResult: jest.fn(),
      buildTerminalNoSolutionResult: jest.fn(),
    };
    const out = await maybeStateUpdateTerminalNoSolution(
      host,
      {
        state: { metadata: {} },
        prePlan: { startTime: Date.now(), prePlanTerminal: jest.fn() },
        context: {},
        request: {},
      } as any,
      undefined,
    );
    expect(out).toBeNull();
  });
});
