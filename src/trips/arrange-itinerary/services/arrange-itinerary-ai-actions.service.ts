import { Injectable } from '@nestjs/common';
import { AttractionExploreAiConsultService } from '../../attraction-explore/services/attraction-explore-ai-consult.service';
import { PlanningOrchestratorFacadeService } from './planning-orchestrator-facade.service';
import type { AttractionExploreAiActionDto } from '../dto/arrange-itinerary.dto';
import type {
  AttractionExploreAiActionResult,
  PlanProposalMutationResponse,
} from '../types/arrange-itinerary.types';

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
};

const INTENT_MAP: Record<
  AttractionExploreAiActionDto['action'],
  'FILL_GAP' | 'OPTIMIZE_ROUTE' | 'ARRANGE_LUNCH' | 'REDUCE_INTENSITY'
> = {
  fill_gaps: 'FILL_GAP',
  optimize_route: 'OPTIMIZE_ROUTE',
  arrange_lunch: 'ARRANGE_LUNCH',
  reduce_intensity: 'REDUCE_INTENSITY',
};

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
