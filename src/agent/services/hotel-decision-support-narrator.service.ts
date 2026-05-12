import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type {
  HotelDecisionConflict,
  HotelDecisionFactBase,
  HotelDecisionSignals,
} from '../utils/hotel-decision-support.signals';

export type StewardBatchItem = {
  listing_id: string;
  facts: HotelDecisionFactBase;
  signals: HotelDecisionSignals;
  conflicts: HotelDecisionConflict[];
};

/**
 * 兼容 DeepSeek 等返回「前言 + ```json ... ```」或直接裸 JSON。
 * 不能用单一非贪婪正则：前言会导致匹配失败；多行 JSON 内需按围栏边界截取。
 */
export function extractJsonObjectForParse(raw: string): string {
  let s = raw.trim();
  const openRe = /```(?:json)?\s*\r?\n?/i;
  const m = openRe.exec(s);
  if (m) {
    const body = s.slice(m.index + m[0].length);
    const closeMatch = /\r?\n```/.exec(body);
    if (closeMatch) s = body.slice(0, closeMatch.index);
    else {
      const fallbackClose = body.lastIndexOf('```');
      s = fallbackClose > 0 ? body.slice(0, fallbackClose) : body;
    }
    s = s.trim();
  }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s.trim();
}

/**
 * L2：批量「私人管家」叙事 — Fact Base + Heuristic 信号驱动，禁止凭空捏造设施/天气。
 */
@Injectable()
export class HotelDecisionSupportNarratorService {
  private readonly logger = new Logger(HotelDecisionSupportNarratorService.name);

  constructor(private readonly llmService: LlmService) {}

  /**
   * 一次调用为多套房源生成 steward_zh（每条 ≤50 字），节省 Token 并保持口吻一致。
   */
  async narrateBatch(params: {
    request_id?: string;
    items: StewardBatchItem[];
    persona_dna_zh: string;
    optional_world_hint_zh?: string;
    llmProvider?: LlmProvider;
  }): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!params.items.length) return out;

    const payload = params.items.map((it) => ({
      listing_id: it.listing_id,
      facts: it.facts,
      heuristic_signals: it.signals,
      conflict_codes: it.conflicts,
    }));

    const prompt = [
      '你是 TripNARA 的住宿决策管家（私人管家口吻）。下面每条房源都附有「事实底座 facts」与规则引擎输出的「heuristic_signals」「conflict_codes」。',
      '要求：',
      '1) 只基于给定字段做权衡与建议，禁止编造天气、设施、政策。',
      '2) 每条 steward_zh 不超过 50 个汉字，1 句话；语气推理、劝荐，不要复述数字清单。',
      '3) 若有 conflict_codes，必须点出权衡重点（如高分但远、便宜但挤）。',
      '4) 同一批多条 listing：每条切入点、动词、句式必须与其他条明显不同，禁止几条共用同一句套话。',
      '',
      `用户语境：${params.persona_dna_zh}`,
      ...(params.optional_world_hint_zh
        ? [
            `行程地理语境（库内事实，可用来组织口吻；禁止据此编造实时天气/路况/政策）：${params.optional_world_hint_zh}`,
          ]
        : []),
      '',
      `候选 JSON：${JSON.stringify(payload)}`,
      '',
      '输出 JSON：{"lines":[{"listing_id":"...","steward_zh":"..."}]} ，lines 条数必须与候选一致且 listing_id 对齐。',
      '只输出上述 JSON 文本一行，禁止 markdown 代码块、禁止前言后语。',
    ].join('\n');

    const schema = {
      type: 'object',
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              listing_id: { type: 'string' },
              steward_zh: { type: 'string' },
            },
            required: ['listing_id', 'steward_zh'],
          },
        },
      },
      required: ['lines'],
    };

    try {
      const provider = params.llmProvider ?? this.llmService.getDefaultProvider();
      const raw = await this.llmService.callLlmWithSchema(provider, prompt, schema, {
        request_id: params.request_id ?? 'hotel-decision-steward',
        state_machine_step: 'NARRATE',
        sub_agent: 'Narrator',
      });
      const parsed = JSON.parse(extractJsonObjectForParse(raw)) as {
        lines?: Array<{ listing_id: string; steward_zh: string }>;
      };
      if (!Array.isArray(parsed.lines)) return out;
      for (const row of parsed.lines) {
        const id = row.listing_id?.trim();
        const zh = row.steward_zh?.trim();
        if (id && zh) out.set(id, zh.slice(0, 80));
      }
    } catch (e: any) {
      this.logger.warn(`[HotelSteward] batch narrate failed: ${e?.message ?? e}`);
    }
    return out;
  }
}
