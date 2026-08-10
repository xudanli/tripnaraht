import { applyReturnToResearchInvalidation } from './return-to-research-invalidation.runner';
import type { ReturnToResearchInvalidationHost } from './return-to-research-invalidation.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('return-to-research-invalidation.runner', () => {
  it('marks empty prior and allows forced full', async () => {
    const host: ReturnToResearchInvalidationHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    };
    const state = {
      request_id: 'r1',
      metadata: {},
      decision_log: [],
    } as unknown as OrchestratorState;
    const ds = await applyReturnToResearchInvalidation(
      host,
      state,
      undefined,
      { request_id: 'r1' } as RouteAndRunRequestDto,
    );
    expect(ds).toBeUndefined();
    expect((state.metadata as any).r2r_allow_forced_full_empty_prior).toBe(true);
    expect(host.logger.warn).toHaveBeenCalled();
    expect(state.decision_log[0]?.metadata?.system_action).toBe('RETURN_TO_RESEARCH');
  });
});
