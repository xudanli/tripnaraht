import { Injectable, Logger, Optional } from '@nestjs/common';
import { MultiAgentCollaborationService } from '../../skills/world/services/multi-agent-collaboration.service';
import type {
  ConflictStrategyOptionsResponseDto,
  StrategyOptionCardDto,
} from '../dto/conflict-strategy-options.dto';

/**
 * UI「决策对话」：基于 MAC 桥快照生成 2–3 条可对齐策略（规则模板，可后续接 LLM 润色）
 */
@Injectable()
export class StrategyConflictOptionsService {
  private readonly logger = new Logger(StrategyConflictOptionsService.name);

  constructor(
    @Optional() private readonly multiAgent?: MultiAgentCollaborationService,
  ) {}

  buildOptions(tripId: string): ConflictStrategyOptionsResponseDto {
    if (!this.multiAgent) {
      return {
        explanation_zh: '多智能体协作服务未启用，无法读取冲突快照。',
        options: [],
        consensus_summary: null,
        open_conflict_count: 0,
      };
    }

    const view = this.multiAgent.getCollaborationBridgeView(tripId.trim());
    const open = view.openConflictCount;
    const summary = view.consensusSummary;

    const strategyConflicts = view.conflicts.filter(
      (c) => c.conflictType === 'STRATEGY_CONFLICT' && !c.resolution,
    );

    if (open === 0 && strategyConflicts.length === 0) {
      return {
        explanation_zh: '当前行程上下文没有待解决的策略冲突；可直接继续细化日程或预算。',
        options: [],
        consensus_summary: summary,
        open_conflict_count: 0,
      };
    }

    const explanation_zh =
      summary ||
      '体验侧（高光住宿/特色体验）与预算软顶之间存在张力。下列选项为常见对齐方式，供用户或编排器选择之一继续推演。';

    const options: StrategyOptionCardDto[] = [
      {
        id: 'opt_keep_highlight_shorten_trip',
        title_zh: '保留高光体验，缩短行程',
        summary_zh:
          '保留极光玻璃屋等最高优先级项，减少总天数或砍掉次要目的地，使总支出落入软顶附近。',
        levers: ['缩短天数', '保留核心体验', '削减次要 POI'],
      },
      {
        id: 'opt_downgrade_stay_keep_span',
        title_zh: '维持行程跨度，下调住宿档位',
        summary_zh:
          '保持停留天数与路线结构，将部分晚数从奢华调至中档，以释放预算给必选体验。',
        levers: ['住宿降级', '保持行程长度', '体验不变'],
      },
      {
        id: 'opt_raise_budget_or_buffer',
        title_zh: '上调预算或动用缓冲',
        summary_zh:
          '若用户确认愿意为高光体验付费，则提高总预算或动用 buffer 类别；需显式确认避免隐性超支。',
        levers: ['提高 total', '动用 buffer', '用户确认'],
      },
    ];

    this.logger.debug(
      `[StrategyConflictOptions] tripId=${tripId} open=${open} options=${options.length}`,
    );

    return {
      explanation_zh,
      options,
      consensus_summary: summary,
      open_conflict_count: open,
    };
  }
}
