import {
  ConflictException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';
import { LlmService } from '../../../llm/services/llm.service';
import { EXPLORATION_DESTINATION_PRESETS, EXPLORATION_VEHICLE_TYPES } from '../config/exploration-conditions.config';
import {
  isLlmPrincipleSummaryLive,
  isPrincipleSummaryEnabled,
} from '../config/exploration-principle-summary.config';
import { EXPLORATION_SCENARIO_STATUS } from '../constants/exploration-status.constants';
import type { ConsumerPrincipleSelectionDto } from '../dto/exploration.dto';
import type { ExplorationInput } from '../types/exploration.types';
import { countTripDays } from '../utils/exploration-input.util';
import {
  validateConsumerPrincipleSelections,
  type ConsumerPrincipleSelection,
} from '../utils/validate-consumer-principles.util';
import {
  CONSUMER_PRINCIPLE_LABELS,
} from './travel-decision-contract-principle-mapping.service';
import { ExplorationScenarioService } from './exploration-scenario.service';

export interface PrinciplesSummaryView {
  summary: string | null;
  placeholder?: string | null;
  highlights?: string[];
  source?: 'LLM' | 'RULES';
  generatedAt?: string;
}

const SUMMARY_PLACEHOLDER = '请选择最多 3 项原则，我们将据此推荐路线。';

const PRINCIPLE_SUMMARY_HINTS: Record<
  ConsumerPrincipleSelection['principleId'],
  { emphasis: string; highlight: string }
> = {
  LOW_DRIVING: {
    emphasis: '控制每日驾驶强度，把更多时间留给停留',
    highlight: '每日驾驶时长倾向控制在舒适范围',
  },
  NO_NIGHT_DRIVING: {
    emphasis: '避免夜间赶路，优先在白天完成路段移动',
    highlight: '不安排夜间驾驶路段',
  },
  CORE_EXPERIENCE_FIRST: {
    emphasis: '优先保证核心体验与关键景点',
    highlight: '核心体验优先（最高优先级）',
  },
  REMOTE_EXPLORATION: {
    emphasis: '愿意接受更高不确定性，换取更小众的区域探索',
    highlight: '倾向推荐含偏远探索的走法',
  },
  BUDGET_FLEXIBLE: {
    emphasis: '在关键体验或必要升级上可适度提高预算',
    highlight: '预算可适度向核心体验倾斜',
  },
  STAY_STABILITY: {
    emphasis: '尽量减少换宿，在同一区域深度停留',
    highlight: '尽量减少换宿次数',
  },
};

const PRINCIPLE_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    highlights: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary'],
};

@Injectable()
export class ExplorationPrincipleSummaryService {
  private readonly logger = new Logger(ExplorationPrincipleSummaryService.name);

  constructor(
    private readonly scenarios: ExplorationScenarioService,
    @Optional() private readonly llm?: LlmService,
  ) {}

  async previewSummary(
    userId: string,
    scenarioId: string,
    principles: ConsumerPrincipleSelectionDto[],
  ): Promise<PrinciplesSummaryView> {
    if (!isPrincipleSummaryEnabled()) {
      throw new ServiceUnavailableException({
        code: 'SUMMARY_UNAVAILABLE',
        message: 'Principle summary is not enabled',
      });
    }

    const scenario = await this.scenarios.requireOwnedScenario(userId, scenarioId);
    this.assertScenarioPreviewAllowed(scenario.status);

    if (principles.length === 0) {
      return {
        summary: null,
        placeholder: SUMMARY_PLACEHOLDER,
      };
    }

    validateConsumerPrincipleSelections(principles);

    const initialInput = this.scenarios.parseInitialInput(scenario.initialInput);
    const sorted = [...principles].sort((a, b) => a.rank - b.rank) as ConsumerPrincipleSelection[];
    const generatedAt = new Date().toISOString();

    if (isLlmPrincipleSummaryLive() && this.llm) {
      try {
        const llmResult = await this.generateViaLlm(initialInput, sorted);
        return { ...llmResult, source: 'LLM', generatedAt };
      } catch (err) {
        this.logger.warn(
          `LLM principle summary failed, using rules fallback: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      ...this.generateViaRules(initialInput, sorted),
      source: 'RULES',
      generatedAt,
    };
  }

  private assertScenarioPreviewAllowed(status: string) {
    if (
      status === EXPLORATION_SCENARIO_STATUS.COMPLETED ||
      status === EXPLORATION_SCENARIO_STATUS.ABANDONED
    ) {
      throw new ConflictException({
        code: 'SCENARIO_LOCKED',
        message: 'Scenario is locked and cannot preview principle summary',
      });
    }
  }

  private generateViaRules(
    input: ExplorationInput,
    principles: ConsumerPrincipleSelection[],
  ): Omit<PrinciplesSummaryView, 'source' | 'generatedAt'> {
    const top = principles[0]!;
    const topMeta = CONSUMER_PRINCIPLE_LABELS[top.principleId];
    const topHint = PRINCIPLE_SUMMARY_HINTS[top.principleId];
    const days = countTripDays(input);
    const destination = this.destinationLabel(input.destinationCodes[0]);
    const vehicle = this.vehicleLabel(input.mobilityContext?.vehicleType);
    const secondary = principles.slice(1);

    let summary =
      `你更看重${topMeta.label}，${topHint.emphasis}。` +
      `基于 ${days} 天${destination}行程与${vehicle}配置，后续路线推荐会优先匹配这一取向。`;

    if (secondary.length > 0) {
      const secondaryLabels = secondary
        .map((p) => CONSUMER_PRINCIPLE_LABELS[p.principleId].label)
        .join('、');
      summary = summary.replace(
        '后续路线推荐会优先匹配这一取向。',
        `同时兼顾${secondaryLabels}；后续路线推荐会据此调整取舍。`,
      );
    }

    const highlights = principles.map((p) => {
      const hint = PRINCIPLE_SUMMARY_HINTS[p.principleId];
      if (p.rank === 1) {
        return `${CONSUMER_PRINCIPLE_LABELS[p.principleId].label}（最高优先级）`;
      }
      return hint.highlight;
    });

    return { summary, highlights };
  }

  private async generateViaLlm(
    input: ExplorationInput,
    principles: ConsumerPrincipleSelection[],
  ): Promise<Omit<PrinciplesSummaryView, 'source' | 'generatedAt'>> {
    const prompt = this.buildLlmPrompt(input, principles);
    const response = await this.llm!.callLlmWithSchema(
      LlmProvider.DEEPSEEK,
      prompt,
      PRINCIPLE_SUMMARY_SCHEMA,
    );
    const parsed = JSON.parse(response) as { summary: string; highlights?: string[] };
    const summary = parsed.summary?.trim();
    if (!summary) {
      throw new Error('Empty LLM summary');
    }
    return {
      summary,
      highlights: parsed.highlights?.length ? parsed.highlights : undefined,
    };
  }

  private buildLlmPrompt(
    input: ExplorationInput,
    principles: ConsumerPrincipleSelection[],
  ): string {
    const days = countTripDays(input);
    const destination = input.destinationCodes.join(', ') || '未指定';
    const vehicle = input.mobilityContext?.vehicleType ?? '未指定';
    const travelers = input.travelers?.length ?? 0;
    const budget = input.budget
      ? `${input.budget.currency} ${input.budget.min ?? '?'}-${input.budget.max ?? '?'}`
      : '未指定';

    const ranked = principles.map((p) => ({
      rank: p.rank,
      principleId: p.principleId,
      label: CONSUMER_PRINCIPLE_LABELS[p.principleId].label,
      description: CONSUMER_PRINCIPLE_LABELS[p.principleId].description,
    }));

    return `你是 TripNARA 旅行规划助手。请根据用户 Scenario 与旅行原则排序，生成一段中文智能总结。

Scenario：
- 目的地：${destination}
- 天数：${days}
- 出行人数：${travelers}
- 车辆：${vehicle}
- 预算：${budget}

旅行原则（rank 1 权重最高）：
${JSON.stringify(ranked, null, 2)}

要求：
- 语气：第二人称、克制、可执行，非营销腔
- summary：1–3 句，40–120 字，必须体现 rank 1 原则权重最高
- 不要编造具体路线名称；可泛化「后续路线推荐会…」
- highlights：2–4 条要点，可选

返回 JSON：{ "summary": "...", "highlights": ["..."] }`;
  }

  private destinationLabel(code?: string): string {
    if (!code) return '';
    const preset = EXPLORATION_DESTINATION_PRESETS[code];
    return preset ? preset.label : code;
  }

  private vehicleLabel(code?: string): string {
    if (!code) return '默认车辆';
    return EXPLORATION_VEHICLE_TYPES.find((v) => v.code === code)?.label ?? code;
  }
}
