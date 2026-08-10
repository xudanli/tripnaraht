import {
  enrichGuardianDebateTripContextAfterGateEval,
  maybeAwaitGuardiansDebateFuseAndShortCircuit,
  maybeStartGuardiansDebateShadowAfterGate,
} from './guardians-debate-gate.runner';
import type { GuardiansDebateGateHost } from './guardians-debate-gate.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('guardians-debate-gate.runner', () => {
  function makeHost(
    overrides: Partial<GuardiansDebateGateHost> = {},
  ): GuardiansDebateGateHost {
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      buildClarificationResult: jest.fn(() => ({}) as any),
      ...overrides,
    };
  }

  it('maybeStartGuardiansDebateShadowAfterGate no-ops without service', () => {
    const host = makeHost();
    const state = { metadata: {}, gate_result: { gate_result: 'PASS' } } as unknown as OrchestratorState;
    maybeStartGuardiansDebateShadowAfterGate(
      host,
      { request_id: 'r1', options: { enable_guardians_debate_llm: true } } as RouteAndRunRequestDto,
      state,
    );
    expect((state.metadata as any).debate_shadow_started).toBeUndefined();
  });

  it('maybeAwaitGuardiansDebateFuseAndShortCircuit returns undefined when disabled', async () => {
    const host = makeHost();
    const result = await maybeAwaitGuardiansDebateFuseAndShortCircuit(
      host,
      { request_id: 'r1', options: {} } as RouteAndRunRequestDto,
      { request_id: 'r1', decision_log: [], metadata: {} } as unknown as OrchestratorState,
      undefined,
      {} as any,
      Date.now(),
    );
    expect(result).toBeUndefined();
  });

  it('enrichGuardianDebateTripContextAfterGateEval swallows enricher errors', () => {
    const host = makeHost();
    expect(() =>
      enrichGuardianDebateTripContextAfterGateEval(
        host,
        { metadata: {} } as unknown as OrchestratorState,
      ),
    ).not.toThrow();
  });
});
