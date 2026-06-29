import {
  buildEpisodicSummarizerLlmPrompt,
  parseEpisodicSummarizerLlmEnabled,
  parseEpisodicSummaryFromLlmJson,
} from './episodic-memory-summarizer-llm.util';

describe('episodic-memory-summarizer-llm.util', () => {
  it('parses HARNESS_EPISODIC_SUMMARIZER_LLM', () => {
    expect(parseEpisodicSummarizerLlmEnabled({ HARNESS_EPISODIC_SUMMARIZER_LLM: '1' })).toBe(true);
  });

  it('builds prompt with transcript lines', () => {
    const prompt = buildEpisodicSummarizerLlmPrompt(['User: Iceland ring road', 'Assistant: ok']);
    expect(prompt).toContain('Transcript:');
    expect(prompt).toContain('Iceland');
  });

  it('parses summary from LLM JSON', () => {
    expect(parseEpisodicSummaryFromLlmJson('{"summary":"用户偏好环岛"}')).toBe('用户偏好环岛');
  });
});
