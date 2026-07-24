import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../llm/services/llm.service';
export interface PolisherContext {
  tripId: string;
  dayNumber: number;
  currentActivities: string[];
  baseReasonZh: string;
}

const POLISH_SCHEMA = {
  type: 'object',
  properties: {
    polished_zh: {
      type: 'string',
      description: '资深向导口吻的紧凑行程提醒，不超过 80 汉字',
    },
  },
  required: ['polished_zh'],
};

/**
 * Layer1 槽位澄清卡挂件：润色 scheduleTight 规则文案（非阻塞，超时/失败回退 baseReasonZh）。
 */
@Injectable()
export class ItinerarySlotPolisherService {
  private readonly logger = new Logger(ItinerarySlotPolisherService.name);
  private readonly timeoutMs: number;
  private readonly disabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly llmService?: LlmService,
  ) {
    this.timeoutMs = this.configService.get<number>('TRIP_POLISHER_TIMEOUT_MS') ?? 300;
    const flag = this.configService.get<string>('DISABLE_ITINERARY_SLOT_POLISHER');
    this.disabled =
      flag === 'true' ||
      flag === '1' ||
      process.env.DISABLE_ITINERARY_SLOT_POLISHER === 'true' ||
      process.env.DISABLE_ITINERARY_SLOT_POLISHER === '1';
  }

  isEnabled(): boolean {
    return !this.disabled && Boolean(this.llmService);
  }

  /**
   * 润色紧凑行程提示（绝不向上抛错；超时则 0ms 感知降级为规则文案）。
   */
  async polishTightScheduleReason(ctx: PolisherContext): Promise<string> {
    const base = String(ctx.baseReasonZh ?? '').trim();
    if (!base) return base;
    if (!this.isEnabled()) {
      return base;
    }

    const timer = new Promise<never>((_, reject) => {
      const handle = setTimeout(
        () => reject(new Error(`Polisher timed out after ${this.timeoutMs}ms`)),
        this.timeoutMs,
      );
      if (typeof handle === 'object' && handle !== null && 'unref' in handle) {
        (handle as NodeJS.Timeout).unref();
      }
    });

    try {
      const polished = await Promise.race([this.executeLlmCall(ctx), timer]);
      const trimmed = polished.trim();
      if (!trimmed || trimmed === base) {
        return base;
      }
      return trimmed.slice(0, 120);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[Polish Skipped] Fallback to base reason. Error: ${msg}`);
      return base;
    }
  }

  private async executeLlmCall(ctx: PolisherContext): Promise<string> {
    const activities =
      ctx.currentActivities.length > 0
        ? ctx.currentActivities.join('、')
        : '多项已排活动';
    const prompt = [
      '你是冰岛自驾行程的资深向导。用户想在已有行程中插入观鲸等活动，但系统检测到某一天地理上顺路、时间上却很紧凑。',
      '请用委婉、专业的中文写一句提醒（不超过 80 字）：',
      '- 点出当天已有安排（勿编造未列出的项目）',
      '- 说明再加观鲸可能较赶',
      '- 可轻量建议微调顺序或换相邻更空的一天',
      '- 禁止 markdown、禁止列表、禁止夸大',
      '',
      `规则兜底参考（可改写语气，勿丢失关键事实）：${ctx.baseReasonZh}`,
      `当日已有安排：${activities}`,
      `行程 ID：${ctx.tripId}，第 ${ctx.dayNumber} 天`,
      '',
      '只输出 JSON：{"polished_zh":"..."}',
    ].join('\n');

    const provider = this.llmService!.getDefaultProvider();
    const raw = await this.llmService!.callLlmWithSchema(provider, prompt, POLISH_SCHEMA, {
      request_id: `slot-polish-${ctx.tripId}-d${ctx.dayNumber}`,
      state_machine_step: 'INTAKE',
      sub_agent: 'Orchestrator',
      http_timeout_ms: Math.max(this.timeoutMs + 200, 500),
    });

    const parsed = this.parsePolishedZh(raw);
    if (!parsed) {
      throw new Error('Polisher returned empty polished_zh');
    }
    return parsed;
  }

  private parsePolishedZh(raw: string): string {
    const t = String(raw ?? '').trim();
    try {
      const j = JSON.parse(t) as { polished_zh?: string };
      if (j.polished_zh?.trim()) return j.polished_zh.trim();
    } catch {
      /* fall through */
    }
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const j = JSON.parse(t.slice(start, end + 1)) as { polished_zh?: string };
        return j.polished_zh?.trim() ?? '';
      } catch {
        return '';
      }
    }
    return t.slice(0, 120);
  }
}
