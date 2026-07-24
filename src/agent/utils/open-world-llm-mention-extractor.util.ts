/**
 * L1 Discovery：可选 LLM 实体抽取（规则引擎补强，非替代）。
 * 启用：OPEN_WORLD_DISCOVERY_LLM=1
 */

import { resolveDestinationLlmPromptSupplement } from './destination-llm-prompt-supplement.util';
import type { OpenWorldMention } from '../../planning-policy/types/open-world-poi.types';
import type { LlmService } from '../../llm/services/llm.service';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';

const LLM_MENTION_SCHEMA = {
  type: 'object',
  properties: {
    mentions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          displayName: { type: 'string' },
          regionHint: { type: 'string' },
          activityKind: { type: 'string' },
          rawText: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['displayName', 'regionHint', 'activityKind'],
      },
    },
  },
  required: ['mentions'],
} as const;

function isLlmDiscoveryEnabled(): boolean {
  return process.env.OPEN_WORLD_DISCOVERY_LLM === '1' || process.env.OPEN_WORLD_DISCOVERY_LLM === 'true';
}

export function isOpenWorldLlmDiscoveryEnabled(): boolean {
  return isLlmDiscoveryEnabled();
}

export async function extractOpenWorldMentionsViaLlm(
  llmService: LlmService | undefined,
  userMessage: string,
  context?: { countryCode?: string; destinationHint?: string },
): Promise<OpenWorldMention[]> {
  if (!isLlmDiscoveryEnabled() || !llmService) return [];
  const text = String(userMessage ?? '').trim();
  if (text.length < 8) return [];

  const dest = [context?.destinationHint, context?.countryCode].filter(Boolean).join(' / ');
  const destSupplement = resolveDestinationLlmPromptSupplement({
    userMessage: text,
    countryCode: context?.countryCode,
    destinationHint: context?.destinationHint ?? text,
  });
  const supplementBlock = destSupplement ? `\nDestination rules:\n${destSupplement}\n` : '';
  const prompt = `Extract ungrounded travel activities or provisional places from the user message for sparse polar / expedition planning.
Destination context: ${dest || 'unknown'}
${supplementBlock}
User message: ${text}

Return JSON only. For each activity NOT likely to exist as a fixed POI in a database (expeditions, kayak tours, weather windows, bear buffers, temporary camps), output:
- displayName (Chinese preferred if user wrote Chinese)
- regionHint (city/region)
- activityKind (snake_case)
- rawText (substring from user message)
- confidence (0-1)

Max 5 mentions. Skip generic "travel" or "hotel" unless expedition-specific.`;

  try {
    const provider = (process.env.OPEN_WORLD_DISCOVERY_LLM_PROVIDER as LlmProvider | undefined) ?? undefined;
    const raw = await llmService.callLlmWithSchema(
      provider as LlmProvider,
      prompt,
      LLM_MENTION_SCHEMA as unknown as Record<string, unknown>,
    );
    const mentionsRaw = (raw as { mentions?: unknown[] })?.mentions;
    if (!Array.isArray(mentionsRaw)) return [];

    const out: OpenWorldMention[] = [];
    mentionsRaw.forEach((m, idx) => {
      if (!m || typeof m !== 'object') return;
      const o = m as Record<string, unknown>;
      const displayName = String(o.displayName ?? '').trim();
      const regionHint = String(o.regionHint ?? '').trim();
      const activityKind = String(o.activityKind ?? 'generic_activity').trim();
      if (!displayName || !regionHint) return;
      out.push({
        mentionId: `mention_llm_${activityKind}_${idx}`,
        rawText: String(o.rawText ?? displayName).trim(),
        displayName: displayName.includes('待核实') ? displayName : `${displayName}（待核实）`,
        regionHint,
        activityKind,
        confidence: typeof o.confidence === 'number' ? Math.min(1, Math.max(0, o.confidence)) : 0.7,
      });
    });
    return out;
  } catch {
    return [];
  }
}
