import {
  buildDeterministicEpisodicSummary,
  buildEpisodicSummarizerObservability,
  estimateConversationTokens,
  parseEpisodicSummarizerEnabled,
  shouldScheduleEpisodicSummarize,
} from './episodic-memory-summarizer.util';

describe('episodic-memory-summarizer.util', () => {
  it('parses HARNESS_EPISODIC_SUMMARIZER', () => {
    expect(parseEpisodicSummarizerEnabled({ HARNESS_EPISODIC_SUMMARIZER: '1' })).toBe(true);
  });

  it('builds deterministic summary with fewer tokens than source', () => {
    const messages = Array.from({ length: 12 }, (_, i) => `User: message number ${i} about Iceland trip`);
    const before = estimateConversationTokens(messages);
    const { summary, tokensAfter } = buildDeterministicEpisodicSummary(messages);
    expect(summary).toContain('[EpisodicSummary]');
    expect(tokensAfter).toBeLessThan(before);
  });

  it('schedules when message count exceeds threshold', () => {
    expect(shouldScheduleEpisodicSummarize(['a', 'b', 'c'], 8)).toBe(false);
    expect(shouldScheduleEpisodicSummarize(Array.from({ length: 8 }, (_, i) => `m${i}`), 8)).toBe(true);
  });

  it('builds observability slice', () => {
    const obs = buildEpisodicSummarizerObservability({
      enabled: true,
      scheduled: true,
      compactionApplied: true,
      conversationTokensBefore: 100,
      conversationTokensAfter: 40,
      episodicSummaryPresent: true,
    });
    expect(obs.schemaId).toBe('tripnara.episodic_summarizer@v1');
    expect(obs.conversation_tokens_after).toBe(40);
  });
});
