import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { getLlmProvider } from './get-llm-provider.runner';

describe('get-llm-provider.runner', () => {
  it('maps request provider and falls back to default', () => {
    const host = { llmService: { getDefaultProvider: () => LlmProvider.DEEPSEEK } };
    expect(
      getLlmProvider(host, { options: { llm_provider: 'openai' } } as any),
    ).toBe(LlmProvider.OPENAI);
    expect(getLlmProvider(host, { options: { llm_provider: 'auto' } } as any)).toBe(
      LlmProvider.DEEPSEEK,
    );
  });
});
