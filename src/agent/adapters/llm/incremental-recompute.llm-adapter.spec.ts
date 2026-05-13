import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';
import {
  createIncrementalRecomputeLlmAdapter,
  LlmServiceIncrementalRecomputeAdapter,
} from './incremental-recompute.llm-adapter';
import type { LlmService } from '../../../llm/services/llm.service';

describe('LlmServiceIncrementalRecomputeAdapter', () => {
  it('chat 走 OpenAI 兼容路径并返回 assistant 文本', async () => {
    const llm = {
      callChatWithTools: jest.fn(async () => ({
        message: { role: 'assistant' as const, content: '[{"nodeId":"a","output":{}}]' },
        finishReason: 'stop',
        rawResponse: {},
      })),
    } as unknown as LlmService;
    const config = {
      get: (k: string) => (k === 'INCREMENTAL_RECOMPUTE_LLM_PROVIDER' ? 'openai' : undefined),
    } as unknown as ConfigService;
    const adapter = new LlmServiceIncrementalRecomputeAdapter(llm, config);
    const text = await adapter.chat([
      { role: 'system', content: 'JSON array only.' },
      { role: 'user', content: 'Return decisions as json array.' },
    ]);
    expect(text).toContain('nodeId');
    expect(llm.callChatWithTools).toHaveBeenCalledWith(
      LlmProvider.OPENAI,
      expect.any(Array),
      [],
      expect.objectContaining({ response_format: { type: 'json_object' } }),
    );
  });

  it('createIncrementalRecomputeLlmAdapter 工厂返回可 chat 实例', () => {
    const adapter = createIncrementalRecomputeLlmAdapter(
      {
        callChatWithTools: jest.fn(async () => ({
          message: { role: 'assistant' as const, content: '[]' },
          finishReason: 'stop',
          rawResponse: {},
        })),
      } as any,
      { get: () => 'vllm' } as any,
    );
    expect(adapter).toBeDefined();
  });
});
