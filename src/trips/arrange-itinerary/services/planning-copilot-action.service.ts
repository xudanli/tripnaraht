import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ArrangeItineraryAiActionsService } from './arrange-itinerary-ai-actions.service';
import { ArrangeItineraryMapPlacementService } from './arrange-itinerary-map-placement.service';
import { ArrangeItineraryCopilotService } from './arrange-itinerary-copilot.service';
import { PlanningModeService } from './planning-mode.service';
import { PlanProposalStoreService } from './plan-proposal-store.service';
import type { PlanProposalMutationResponse } from '../types/plan-proposal.types';
import type { CopilotSuggestion } from './arrange-itinerary-copilot.service';

export type CopilotActionKind =
  | 'draft_for_candidate'
  | 'draft_all_must_go'
  | 'fill_gaps'
  | 'execute_suggestion';

export interface CopilotActionInput {
  tripId: string;
  userId: string;
  action: CopilotActionKind;
  candidateId?: string;
  suggestionId?: string;
  dayIndex?: number;
}

export interface CopilotActionResult extends PlanProposalMutationResponse {
  action: CopilotActionKind;
  executedSuggestionId?: string;
}

@Injectable()
export class PlanningCopilotActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planningMode: PlanningModeService,
    private readonly proposalStore: PlanProposalStoreService,
    private readonly mapPlacement: ArrangeItineraryMapPlacementService,
    private readonly aiActions: ArrangeItineraryAiActionsService,
    private readonly copilot: ArrangeItineraryCopilotService,
  ) {}

  async execute(input: CopilotActionInput): Promise<CopilotActionResult> {
    const mode = await this.planningMode.getMode(input.tripId);
    if (mode.mode !== 'copilot') {
      throw new BadRequestException('协同动作仅在 copilot 模式下可用');
    }

    const active = this.proposalStore
      .listByTrip(input.tripId, ['AWAITING_CONFIRMATION', 'PREVIEW'])
      .at(0);
    if (active && input.action !== 'execute_suggestion') {
      throw new BadRequestException('已有待确认草案，请先应用或丢弃后再执行协同动作');
    }

    switch (input.action) {
      case 'draft_for_candidate':
        return this.draftForCandidate(input);
      case 'draft_all_must_go':
        return this.draftAllMustGo(input);
      case 'fill_gaps':
        return this.fillGaps(input);
      case 'execute_suggestion':
        return this.executeSuggestion(input);
      default:
        throw new BadRequestException(`不支持的协同动作: ${input.action}`);
    }
  }

  private async draftForCandidate(input: CopilotActionInput): Promise<CopilotActionResult> {
    if (!input.candidateId) {
      throw new BadRequestException('draft_for_candidate 需要 candidateId');
    }

    const row = await this.prisma.tripAttractionExploreCandidate.findFirst({
      where: { id: input.candidateId, tripId: input.tripId },
    });
    if (!row) {
      throw new NotFoundException('候选不存在或不属于该行程');
    }

    const result = await this.mapPlacement.buildPlaceProposal({
      tripId: input.tripId,
      userId: input.userId,
      placeId: row.placeId,
      candidateId: row.id,
      dayIndex: input.dayIndex,
    });

    return { ...result, action: 'draft_for_candidate' as const };
  }

  private async draftAllMustGo(input: CopilotActionInput): Promise<CopilotActionResult> {
    const placed = await this.prisma.itineraryItem.findMany({
      where: { TripDay: { tripId: input.tripId }, placeId: { not: null } },
      select: { placeId: true },
    });
    const placedIds = new Set(placed.map((r) => r.placeId!).filter(Boolean));

    const mustGo = await this.prisma.tripAttractionExploreCandidate.findFirst({
      where: {
        tripId: input.tripId,
        priority: 'must_go',
        placeId: { notIn: [...placedIds] },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (!mustGo) {
      throw new BadRequestException('没有未编排的必去候选');
    }

    return this.draftForCandidate({
      ...input,
      action: 'draft_for_candidate',
      candidateId: mustGo.id,
    });
  }

  private async fillGaps(input: CopilotActionInput): Promise<CopilotActionResult> {
    const result = await this.aiActions.runAction({
      tripId: input.tripId,
      userId: input.userId,
      body: {
        action: 'fill_gaps',
        dayIndex: input.dayIndex,
        commitMode: 'proposal',
      },
    });

    if ('mode' in result) {
      return { ...result, action: 'fill_gaps' as const };
    }

    throw new BadRequestException('填补空档未生成草案');
  }

  private async executeSuggestion(input: CopilotActionInput): Promise<CopilotActionResult> {
    if (!input.suggestionId) {
      throw new BadRequestException('execute_suggestion 需要 suggestionId');
    }

    const view = await this.copilot.getSuggestions(input.tripId);
    const suggestion = view.suggestions.find((s) => s.id === input.suggestionId);
    if (!suggestion?.actionHint) {
      throw new NotFoundException('建议不存在或不可执行');
    }

    const mapped = this.mapSuggestionToAction(suggestion, input);
    const result = await this.execute({ ...mapped, action: mapped.action });
    return { ...result, executedSuggestionId: input.suggestionId };
  }

  private mapSuggestionToAction(
    suggestion: CopilotSuggestion,
    input: CopilotActionInput,
  ): CopilotActionInput {
    if (suggestion.kind === 'unplaced_must_go') {
      const candidateId = suggestion.id.replace(/^must-go-/, '');
      return {
        ...input,
        action: 'draft_for_candidate',
        candidateId,
      };
    }

    if (suggestion.kind === 'time_gap' || suggestion.kind === 'fill_gaps_action') {
      const dayMatch = suggestion.id.match(/^gap-day-(\d+)$/);
      return {
        ...input,
        action: 'fill_gaps',
        dayIndex: dayMatch ? Number(dayMatch[1]) : input.dayIndex,
      };
    }

    throw new BadRequestException(`建议 ${suggestion.id} 暂不支持一键执行`);
  }
}
