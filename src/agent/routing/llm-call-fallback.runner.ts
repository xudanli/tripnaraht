/**
 * LLM 调用降级 + Token 打点（从 ClaudeOrchestrator 迁出）。
 */

import type { LlmCallFallbackHost, LlmTokenContext } from './llm-call-fallback.host';
import { LlmProvider } from '../../llm/dto/llm-request.dto';

/** 获取降级提供商列表（当主提供商失败时使用） */
export function getFallbackProviders(primaryProvider: LlmProvider): LlmProvider[] {
  const fallbackOrder: LlmProvider[] = [
    LlmProvider.VLLM,
    LlmProvider.DEEPSEEK,
    LlmProvider.OPENAI,
    LlmProvider.GEMINI,
  ];
  return fallbackOrder.filter((p) => p !== primaryProvider);
}

export async function callLlmWithFallback(
  host: LlmCallFallbackHost,
  primaryProvider: LlmProvider,
  prompt: string,
  schema: any,
  operationName: string,
  tokenContext?: LlmTokenContext,
): Promise<string> {
  try {
    return await host.llmService.callLlmWithSchema(
      primaryProvider,
      prompt,
      schema,
      tokenContext,
    );
  } catch (error: any) {
    host.logger.warn(
      `[Claude Orchestrator] ${operationName} 使用 ${primaryProvider} 失败: ${error?.message}`,
    );
    const fallbackProviders = host.getFallbackProviders(primaryProvider);
    for (const fallbackProvider of fallbackProviders) {
      try {
        host.logger.debug(
          `[Claude Orchestrator] ${operationName} 尝试降级到 ${fallbackProvider}...`,
        );
        return await host.llmService.callLlmWithSchema(
          fallbackProvider,
          prompt,
          schema,
          tokenContext,
        );
      } catch (fallbackError: any) {
        host.logger.warn(
          `[Claude Orchestrator] ${operationName} 使用 ${fallbackProvider} 也失败: ${fallbackError?.message}`,
        );
      }
    }
    throw error;
  }
}

/** P0: Token 按阶段打点（估算 tokens） */
export async function recordTokenIfEnabled(
  host: LlmCallFallbackHost,
  prompt: string,
  response: string,
  provider: LlmProvider,
  startTime: number,
  success: boolean,
  ctx?: LlmTokenContext,
): Promise<void> {
  if (!host.tokenStatsService || !ctx) return;
  try {
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(response.length / 4);
    const spanId = `claude-${ctx.state_machine_step}-${Date.now()}`;
    await host.tokenStatsService.recordTokenUsage({
      request_id: ctx.request_id,
      trace_id: ctx.request_id,
      span_id: spanId,
      sub_agent: ctx.sub_agent,
      state_machine_step: ctx.state_machine_step,
      task_type: ctx.state_machine_step,
      provider,
      model: provider,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      duration_ms: Date.now() - startTime,
      success,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    host.logger.debug(`[TokenStats] 记录失败: ${e?.message}`);
  }
}
