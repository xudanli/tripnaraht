/**
 * 因果叙事 LLM 润色 — 仅改写措辞，数值 SSOT 来自 structuredContext。
 */

import type { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';
import type { CausalNarrativeCompileResult } from './causal-chain.types';

const POLISH_SCHEMA = {
  type: 'object',
  properties: {
    protection_paragraph_zh: {
      type: 'string',
      description: '2-4 句中文，克制且有人文关怀',
    },
  },
  required: ['protection_paragraph_zh'],
};

function isLlmPolishEnabled(): boolean {
  const v = (process.env.CAUSAL_NARRATIVE_LLM_POLISH ?? '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no';
}

export async function polishCausalNarrativeWithLlm(
  llm: LlmService,
  compiled: CausalNarrativeCompileResult,
): Promise<string> {
  if (!isLlmPolishEnabled()) {
    return compiled.deterministicSummaryZh;
  }

  const prompt = `你是 TripNARA 决策系统的叙事编译器（非规划者）。
将下方 JSON 中的因果保护事实翻译为 2-4 句中文。

规则：
1. 只能使用 causalNodes.facts 与 monteCarloSampleCount 中已出现的数值。
2. 不得改变因果顺序，不得编造路况或时间。
3. 语气克制、高级、有人文关怀。

结构化事实：
${compiled.structuredContextJson}

参考草稿：
${compiled.deterministicSummaryZh}

输出 JSON：{ "protection_paragraph_zh": "..." }`;

  try {
    const raw = await llm.callLlmWithSchema(LlmProvider.DEEPSEEK, prompt, POLISH_SCHEMA, {
      request_id: 'causal-narrative-polish',
      state_machine_step: 'NARRATE',
      sub_agent: 'Narrator',
    });
    const parsed = JSON.parse(raw) as { protection_paragraph_zh?: string };
    const text = parsed.protection_paragraph_zh?.trim();
    if (text && text.length >= 20) return text;
  } catch {
    // fallback
  }
  return compiled.deterministicSummaryZh;
}
