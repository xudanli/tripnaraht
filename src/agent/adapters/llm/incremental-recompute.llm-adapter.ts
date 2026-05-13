import { ConfigService } from '@nestjs/config';
import type {
  IncrementalRecomputeChatMessageV1,
  IncrementalRecomputeLlmPort,
} from '../../memory/decision-ledger/incremental-recompute-llm.port';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';
import type { ChatCompletionMessage } from '../../../llm/interfaces/chat-completion-tools.interface';
import { LlmService } from '../../../llm/services/llm.service';

function resolveRecomputeProvider(config: ConfigService): LlmProvider {
  const raw =
    config.get<string>('INCREMENTAL_RECOMPUTE_LLM_PROVIDER') ??
    process.env.INCREMENTAL_RECOMPUTE_LLM_PROVIDER ??
    config.get<string>('RECOMPUTE_LLM_ADAPTER_TYPE') ??
    process.env.RECOMPUTE_LLM_ADAPTER_TYPE ??
    'openai';
  const v = String(raw).trim().toLowerCase();
  if (v === 'vllm') return LlmProvider.VLLM;
  if (v === 'deepseek') return LlmProvider.DEEPSEEK;
  if (v === 'anthropic' || v === 'claude') return LlmProvider.ANTHROPIC;
  return LlmProvider.OPENAI;
}

function useJsonObjectMode(config: ConfigService): boolean {
  const v = config.get<string>('INCREMENTAL_RECOMPUTE_JSON_MODE') ?? process.env.INCREMENTAL_RECOMPUTE_JSON_MODE;
  if (v === '0' || v === 'false' || v === 'off') return false;
  return true;
}

function toChatMessages(messages: IncrementalRecomputeChatMessageV1[]): ChatCompletionMessage[] {
  return messages.map(m => ({
    role: m.role,
    content: m.content ?? '',
  }));
}

/** OpenAI json_object 要求 messages 中出现 “json” 字样 */
function ensureJsonKeywordInMessages(msgs: ChatCompletionMessage[]): ChatCompletionMessage[] {
  const hasJson = msgs.some(m => (m.content ?? '').toLowerCase().includes('json'));
  if (hasJson) return msgs;
  const copy = [...msgs];
  const lastUserIdx = [...copy].map((m, i) => ({ m, i })).filter(x => x.m.role === 'user').pop()?.i;
  const idx = lastUserIdx ?? copy.length - 1;
  if (idx >= 0 && copy[idx]) {
    copy[idx] = {
      ...copy[idx],
      content: `${copy[idx].content ?? ''}\n\n(Respond with valid JSON only.)`,
    };
  }
  return copy;
}

function anthropicCombinedPrompt(messages: IncrementalRecomputeChatMessageV1[]): string {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const rest = messages
    .filter(m => m.role !== 'system')
    .map(m => `[${m.role}]\n${m.content}`)
    .join('\n\n');
  return `${system ? `${system}\n\n` : ''}${rest}\n\nReturn ONLY a JSON array of objects with nodeId and output fields. No markdown fences.`;
}

/**
 * 将 {@link LlmService} 接到 {@link IncrementalRecomputeLlmPort}：OpenAI 兼容路径可走 `response_format: json_object`。
 */
export class LlmServiceIncrementalRecomputeAdapter implements IncrementalRecomputeLlmPort {
  constructor(
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {}

  async chat(messages: IncrementalRecomputeChatMessageV1[]): Promise<string> {
    const provider = resolveRecomputeProvider(this.config);
    if (provider === LlmProvider.ANTHROPIC) {
      const prompt = anthropicCombinedPrompt(messages);
      return this.llm.callLlmWithSchema(LlmProvider.ANTHROPIC, prompt);
    }

    const jsonMode = useJsonObjectMode(this.config);
    let chatMsgs = toChatMessages(messages);
    const chatOptions: {
      temperature?: number;
      max_tokens?: number;
      response_format?: { type: 'json_object' };
    } = { temperature: 0.15, max_tokens: 4096 };
    if (jsonMode) {
      chatMsgs = ensureJsonKeywordInMessages(chatMsgs);
      if (provider === LlmProvider.OPENAI) {
        chatOptions.response_format = { type: 'json_object' };
      }
    }

    const result = await this.llm.callChatWithTools(provider, chatMsgs, [], chatOptions);
    const text = result.message.content ?? '';
    if (!text.trim()) {
      throw new Error('IncrementalRecomputeLlm: empty assistant content');
    }
    return text;
  }
}

export function createIncrementalRecomputeLlmAdapter(
  llm: LlmService,
  config: ConfigService,
): IncrementalRecomputeLlmPort {
  return new LlmServiceIncrementalRecomputeAdapter(llm, config);
}
