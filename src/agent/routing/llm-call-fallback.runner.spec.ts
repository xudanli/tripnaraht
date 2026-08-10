import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { getFallbackProviders, callLlmWithFallback } from './llm-call-fallback.runner';
import type { LlmCallFallbackHost } from './llm-call-fallback.host';

describe('llm-call-fallback.runner', () => {
  it('excludes primary from fallback list', () => {
    const list = getFallbackProviders(LlmProvider.OPENAI);
    expect(list).not.toContain(LlmProvider.OPENAI);
    expect(list).toContain(LlmProvider.VLLM);
  });

  it('falls back when primary fails', async () => {
    const host: LlmCallFallbackHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      llmService: {
        callLlmWithSchema: jest
          .fn()
          .mockRejectedValueOnce(new Error('primary'))
          .mockResolvedValueOnce('ok'),
      },
      getFallbackProviders: (p) => getFallbackProviders(p),
    };
    await expect(
      callLlmWithFallback(host, LlmProvider.OPENAI, 'p', {}, 'op'),
    ).resolves.toBe('ok');
  });
});
