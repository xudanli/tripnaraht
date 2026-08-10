import { mergeCompoundDataLookupFollowup } from './compound-data-lookup-followup.runner';
import type { CompoundDataLookupFollowupHost } from './compound-data-lookup-followup.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('compound-data-lookup-followup.runner', () => {
  it('no-ops without followup metadata', async () => {
    const host: CompoundDataLookupFollowupHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      orchestrateLightweightKnowledgeQuery: jest.fn(),
    };
    const state = {
      metadata: {},
      narration: { user_friendly_summary: 'done' },
    } as unknown as OrchestratorState;
    await mergeCompoundDataLookupFollowup(host, state, {} as any, {} as any, 'openai' as any);
    expect(host.orchestrateLightweightKnowledgeQuery).not.toHaveBeenCalled();
  });
});
