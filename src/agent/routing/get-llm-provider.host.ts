/**
 * 解析请求 LLM Provider 宿主。
 */

import type { LlmProvider } from '../../llm/dto/llm-request.dto';

export interface GetLlmProviderHost {
  readonly llmService: {
    getDefaultProvider: () => LlmProvider;
  };
}
