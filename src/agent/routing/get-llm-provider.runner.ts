/**
 * 解析 RouteAndRun 请求使用的 LLM Provider（从 ClaudeOrchestrator 迁出）。
 */

import type { GetLlmProviderHost } from './get-llm-provider.host';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

export function getLlmProvider(
  host: GetLlmProviderHost,
  request: RouteAndRunRequestDto,
): LlmProvider {
  const requestProvider = request.options?.llm_provider;
  if (requestProvider && requestProvider !== 'auto') {
    switch (requestProvider) {
      case 'openai':
        return LlmProvider.OPENAI;
      case 'deepseek':
        return LlmProvider.DEEPSEEK;
      case 'gemini':
        return LlmProvider.GEMINI;
      case 'anthropic':
        return LlmProvider.ANTHROPIC;
      case 'vllm':
        return LlmProvider.VLLM;
      default:
        break;
    }
  }
  return host.llmService.getDefaultProvider();
}
