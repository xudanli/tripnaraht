import { Injectable } from '@nestjs/common';
import { AttractionExploreAiConsultService } from '../../attraction-explore/services/attraction-explore-ai-consult.service';
import { PlanningOrchestratorFacadeService } from './planning-orchestrator-facade.service';
import type { AttractionExploreAiActionDto } from '../dto/arrange-itinerary.dto';
import type {
  AttractionExploreAiActionResult,
  PlanProposalMutationResponse,
} from '../types/arrange-itinerary.types';

type CanonicalAiAction =
  | 'fill_gaps'
  | 'optimize_route'
  | 'arrange_lunch'
  | 'reduce_intensity';

const ACTION_PROMPTS: Record<
  AttractionExploreAiActionDto['action'],
  (dayIndex?: number) => string
> = {
  fill_gaps: () => '请检查当前行程中的空档，并建议如何填补（优先室内/雨天友好选项）。',
  optimize_route: () => '请根据已排日程与候选清单，优化路线顺序以减少折返与驾驶时间。',
  arrange_lunch: (dayIndex) =>
    dayIndex != null
      ? `请为第 ${dayIndex} 天建议合适的午餐安排（含地点与时段）。`
      : '请为行程中尚未安排午餐的日子建议午餐方案。',
  reduce_intensity: () =>
    '请降低行程强度：识别高体力活动，建议调整时段、降级候选优先级或增加休息空档。',
  reduce_driving: () =>
    '请压缩当日驾驶负荷：合并同区景点、减少折返，必要时建议改日或降级绕路候选。',
  resolve_conflicts: () =>
    '请消解当日行程冲突：调整重叠时段顺序，优先保留必去项并标注需人工确认的冲突。',
};

const INTENT_MAP: Record<
  AttractionExploreAiActionDto['action'],
  'FILL_GAP' | 'OPTIMIZE_ROUTE' | 'ARRANGE_LUNCH' | 'REDUCE_INTENSITY'
> = {
  fill_gaps: 'FILL_GAP',
  optimize_route: 'OPTIMIZE_ROUTE',
  arrange_lunch: 'ARRANGE_LUNCH',
  reduce_intensity: 'REDUCE_INTENSITY',
  reduce_driving: 'OPTIMIZE_ROUTE',
  resolve_conflicts: 'OPTIMIZE_ROUTE',
};

/** Alias → builder action used inside PlanProposalBuilderService */
export function resolveCanonicalAiAction(
  action: AttractionExploreAiActionDto['action'],
): CanonicalAiAction {
  if (action === 'reduce_driving' || action === 'resolve_conflicts') {
    return 'optimize_route';
  }
  return action;
}

@Injectable()
export class ArrangeItineraryAiActionsService {
  constructor(
    private readonly aiConsult: AttractionExploreAiConsultService,
    private readonly orchestrator: PlanningOrchestratorFacadeService,
  ) {}

  async runAction(input: {
    tripId: string;
    userId: string;
    body: AttractionExploreAiActionDto;
  }): Promise<AttractionExploreAiActionResult | PlanProposalMutationResponse> {
    const question = ACTION_PROMPTS[input.body.action](input.body.dayIndex);
    const consult = await this.aiConsult.consult({
      tripId: input.tripId,
      question,
      candidateIds: input.body.candidateIds,
    });

    const result = await this.orchestrator.mutateWithMode({
      tripId: input.tripId,
      userId: input.userId,
      commitMode: input.body.commitMode,
      buildProposal: () =>
        this.orchestrator.createProposal({
          tripId: input.tripId,
          userId: input.userId,
          intent: INTENT_MAP[input.body.action],
          payload: {
            ...input.body,
            action: input.body.action,
            canonicalAction: resolveCanonicalAiAction(input.body.action),
            question,
            answer: consult.answer,
          },
        }),
      applyDirect: async () => ({
        action: input.body.action,
        answer: consult.answer,
        suggestedActions: consult.suggestedActions,
      }),
      mapDirect: (direct) => ({
        action: direct.action,
        answer: direct.answer,
        suggestedActions: direct.suggestedActions,
      }),
    });

    if (result.mode === 'proposal') {
      return {
        ...result,
        action: input.body.action,
        answer: consult.answer,
        suggestedActions: consult.suggestedActions,
      };
    }

    return result;
  }
}
