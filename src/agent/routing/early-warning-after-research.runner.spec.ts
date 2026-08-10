import {
  applyIntakePredictiveFailureReportAfterResearch,
  runEarlyWarningClarificationInterceptAfterResearch,
  runShadowConflictEarlyWarningAfterResearch,
} from './early-warning-after-research.runner';
import type { EarlyWarningAfterResearchHost } from './early-warning-after-research.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('early-warning-after-research.runner', () => {
  function makeHost(
    overrides: Partial<EarlyWarningAfterResearchHost> = {},
  ): EarlyWarningAfterResearchHost {
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      djb2Fingerprint: jest.fn(() => 'djb2:deadbeef'),
      maybeSnapshot: jest.fn(),
      buildClarificationResult: jest.fn(() => ({}) as any),
      ...overrides,
    };
  }

  it('runShadowConflictEarlyWarningAfterResearch no-ops without scanner', async () => {
    const host = makeHost();
    const state = {
      request_id: 'r1',
      metadata: {},
      decision_log: [],
    } as unknown as OrchestratorState;
    await runShadowConflictEarlyWarningAfterResearch(
      host,
      undefined,
      state,
      { request_id: 'r1' } as RouteAndRunRequestDto,
    );
    expect(state.metadata.early_warning).toBeUndefined();
    expect(state.decision_log).toHaveLength(0);
  });

  it('applyIntakePredictiveFailureReportAfterResearch no-ops without sim traces', () => {
    const state = {
      request_id: 'r1',
      metadata: {},
      decision_log: [],
    } as unknown as OrchestratorState;
    applyIntakePredictiveFailureReportAfterResearch(undefined, state);
    expect(state.metadata.early_warning).toBeUndefined();
  });

  it('runEarlyWarningClarificationInterceptAfterResearch returns null for low risk', async () => {
    const host = makeHost();
    const state = {
      request_id: 'r1',
      metadata: {
        early_warning: {
          risk_level: 'LOW',
          conflict_type: 'MIXED',
          evidence_summary: 'x',
          suggested_actions: [],
        },
      },
      decision_log: [],
    } as unknown as OrchestratorState;
    const outcome = await runEarlyWarningClarificationInterceptAfterResearch(
      host,
      {
        request: { request_id: 'r1' } as RouteAndRunRequestDto,
        context: {} as any,
        state,
        prePlan: { startTime: Date.now(), prePlanTerminal: jest.fn() },
      } as any,
      undefined,
    );
    expect(outcome).toBeNull();
  });
});
