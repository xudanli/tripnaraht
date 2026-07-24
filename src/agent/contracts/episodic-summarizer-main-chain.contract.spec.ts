/**
 * State P3：Episodic summarizer 主链契约。
 */
import {
  applyEpisodicCompactionToConversationContext,
  readEpisodicSummaryFromTripTask,
} from '../memory/utils/episodic-memory-summarizer.util';

describe('episodic summarizer main chain contract', () => {
  it('reads episodic summary from trip task constraints', () => {
    const summary = readEpisodicSummaryFromTripTask({
      tripId: 't1',
      currentPhase: 'planning',
      decisionLogSummary: '',
      artifactsRefs: [],
      lastUpdated: new Date().toISOString(),
      constraints: {
        episodic_summary_v1: {
          schemaId: 'tripnara.episodic_summary@v1',
          version: 1,
          summary: 'User prefers ring road',
          source_message_count: 10,
          tokens_before: 500,
          tokens_after: 80,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      },
    });
    expect(summary?.summary).toContain('ring road');
  });

  it('compacts conversation_context with summary prefix', () => {
    const request = {
      request_id: 'r1',
      conversation_context: {
        recent_messages: Array.from({ length: 20 }, (_, i) => `msg ${i} with extra context about Iceland day ${i}`),
      },
    };
    const result = applyEpisodicCompactionToConversationContext(
      request as never,
      {
        schemaId: 'tripnara.episodic_summary@v1',
        version: 1,
        summary: 'Earlier: Iceland ring road and weather concerns discussed across many turns.',
        source_message_count: 10,
        tokens_before: 200,
        tokens_after: 40,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      4,
    );
    expect(result.applied).toBe(true);
    expect(result.tokensAfter).toBeLessThan(result.tokensBefore);
    expect(request.conversation_context?.recent_messages?.[0]).toContain('Earlier: Iceland');
    expect(request.conversation_context?.recent_messages).toHaveLength(5);
  });
});
