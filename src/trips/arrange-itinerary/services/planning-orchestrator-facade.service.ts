import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ArrangeItineraryGapDto,
  ArrangeItineraryItemDto,
  AttractionExploreAiActionDto,
  PlaceAttractionExploreCandidateDto,
} from '../dto/arrange-itinerary.dto';
import type {
  OrchestrationStateView,
  PlanProposal,
  PlanProposalApplyResult,
  PlanProposalCommitMode,
  PlanProposalMutationResponse,
  PlanningIntent,
} from '../types/plan-proposal.types';
import { PlanProposalStoreService } from './plan-proposal-store.service';
import { PlanProposalContextService } from './plan-proposal-context.service';
import { PlanProposalBuilderService } from './plan-proposal-builder.service';
import { PlanProposalApplyService } from './plan-proposal-apply.service';
import { ArrangeItineraryItemsService } from './arrange-itinerary-items.service';
import { AttractionExploreAiConsultService } from '../../attraction-explore/services/attraction-explore-ai-consult.service';
import { resolveProposalCandidateIds } from '../utils/resolve-proposal-candidate-ids.util';

@Injectable()
export class PlanningOrchestratorFacadeService {
  private readonly orchestrationState = new Map<string, OrchestrationStateView>();

  constructor(
    private readonly store: PlanProposalStoreService,
    private readonly context: PlanProposalContextService,
    private readonly builder: PlanProposalBuilderService,
    private readonly applyService: PlanProposalApplyService,
    private readonly items: ArrangeItineraryItemsService,
    private readonly aiConsult: AttractionExploreAiConsultService,
  ) {}

  getOrchestrationState(tripId: string): OrchestrationStateView {
    const existing = this.orchestrationState.get(tripId);
    if (existing) return existing;
    return {
      tripId,
      phase: 'IDLE',
      contextVersion: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  async refreshOrchestrationState(tripId: string): Promise<OrchestrationStateView> {
    const snapshot = await this.context.snapshot(tripId);
    const current = this.getOrchestrationState(tripId);
    const next: OrchestrationStateView = {
      ...current,
      contextVersion: snapshot.contextVersion,
      updatedAt: new Date().toISOString(),
    };
    this.orchestrationState.set(tripId, next);
    return next;
  }

  listProposals(tripId: string): PlanProposal[] {
    return this.store.listByTrip(tripId, ['PREVIEW', 'AWAITING_CONFIRMATION']);
  }

  getProposal(proposalId: string): PlanProposal {
    return this.store.require(proposalId);
  }

  async createProposal(input: {
    tripId: string;
    userId: string;
    intent: PlanningIntent;
    payload: Record<string, unknown>;
    /** AUTO_ARRANGE fallback when FE puts ids next to intent/payload */
    topLevelCandidateIds?: string[];
  }): Promise<PlanProposal> {
    this.setPhase(input.tripId, 'GENERATING');

    const payload = input.payload ?? {};

    let proposal: PlanProposal;
    switch (input.intent) {
      case 'PLACE_CANDIDATE':
        proposal = await this.builder.buildPlaceCandidateProposal({
          tripId: input.tripId,
          userId: input.userId,
          candidateId: String(payload.candidateId),
          body: payload as unknown as PlaceAttractionExploreCandidateDto,
        });
        break;
      case 'ADD_ITEM':
        proposal = await this.builder.buildCreateItemProposal({
          tripId: input.tripId,
          userId: input.userId,
          body: payload as unknown as ArrangeItineraryItemDto,
        });
        break;
      case 'INSERT_REST_GAP':
        proposal = await this.builder.buildCreateGapProposal({
          tripId: input.tripId,
          userId: input.userId,
          body: payload as unknown as ArrangeItineraryGapDto,
        });
        break;
      case 'AUTO_ARRANGE':
        proposal = await this.builder.buildAutoArrangeProposal({
          tripId: input.tripId,
          userId: input.userId,
          candidateIds: resolveProposalCandidateIds(
            payload,
            input.topLevelCandidateIds,
          ),
          dayIndex:
            typeof payload.dayIndex === 'number' ? payload.dayIndex : undefined,
          options:
            payload.options && typeof payload.options === 'object'
              ? (payload.options as {
                  respectNoNightDrive?: boolean;
                  maxDailyDriveMinutes?: number;
                  preferWeekendBuffer?: boolean;
                })
              : undefined,
        });
        break;
      case 'FILL_GAP':
      case 'OPTIMIZE_ROUTE':
      case 'ARRANGE_LUNCH':
      case 'REDUCE_INTENSITY': {
        // createProposal sends intent at top-level; payload often omits `action`.
        const actionByIntent: Record<
          'FILL_GAP' | 'OPTIMIZE_ROUTE' | 'ARRANGE_LUNCH' | 'REDUCE_INTENSITY',
          AttractionExploreAiActionDto['action']
        > = {
          FILL_GAP: 'fill_gaps',
          OPTIMIZE_ROUTE: 'optimize_route',
          ARRANGE_LUNCH: 'arrange_lunch',
          REDUCE_INTENSITY: 'reduce_intensity',
        };
        const actionBody = {
          ...payload,
          action:
            (typeof payload.action === 'string' && payload.action) ||
            actionByIntent[input.intent],
        } as AttractionExploreAiActionDto;
        const answer =
          typeof payload.answer === 'string'
            ? payload.answer
            : (
                await this.aiConsult.consult({
                  tripId: input.tripId,
                  question: String(payload.question ?? ''),
                  candidateIds: actionBody.candidateIds,
                })
              ).answer;
        proposal = await this.builder.buildAiActionProposal({
          tripId: input.tripId,
          userId: input.userId,
          body: actionBody,
          answer,
        });
        break;
      }
      default:
        throw new BadRequestException(`不支持的 intent: ${input.intent}`);
    }

    this.setPhase(input.tripId, 'VALIDATING');
    this.store.save(proposal);
    this.setPhase(input.tripId, 'AWAITING_CONFIRMATION', proposal.proposalId);
    return proposal;
  }

  async mutateWithMode<TDirect>(input: {
    tripId: string;
    userId: string;
    commitMode?: PlanProposalCommitMode;
    buildProposal: () => Promise<PlanProposal>;
    applyDirect: () => Promise<TDirect>;
    mapDirect: (direct: TDirect) => Partial<PlanProposalMutationResponse>;
  }): Promise<PlanProposalMutationResponse> {
    const mode = input.commitMode ?? 'proposal';
    const orchestrationState = await this.refreshOrchestrationState(input.tripId);

    if (mode === 'direct') {
      this.setPhase(input.tripId, 'APPLYING');
      const direct = await input.applyDirect();
      this.setPhase(input.tripId, 'COMPLETED');
      return {
        mode: 'direct',
        orchestrationState: this.getOrchestrationState(input.tripId),
        tripId: input.tripId,
        ...input.mapDirect(direct),
      };
    }

    this.setPhase(input.tripId, 'GENERATING');
    const proposal = await input.buildProposal();
    this.store.save(proposal);
    this.setPhase(input.tripId, 'AWAITING_CONFIRMATION', proposal.proposalId);

    return {
      mode: 'proposal',
      orchestrationState: this.getOrchestrationState(input.tripId),
      tripId: input.tripId,
      proposal,
    };
  }

  async applyProposal(input: {
    proposalId: string;
    userId: string;
    contextVersion?: number;
    force?: boolean;
    enabledItemIds?: string[];
    comment?: string;
  }): Promise<PlanProposalApplyResult> {
    const proposal = this.store.require(input.proposalId);
    const snapshot = await this.context.snapshot(proposal.tripId);

    if (
      input.contextVersion != null &&
      input.contextVersion !== snapshot.contextVersion
    ) {
      this.store.updateStatus(proposal.proposalId, 'STALE');
      this.setPhase(proposal.tripId, 'CONTEXT_STALE', proposal.proposalId);
      throw new ConflictException({
        code: 'CONTEXT_VERSION_CONFLICT',
        errorCode: 'CONTEXT_VERSION_CONFLICT',
        message: '行程上下文已变化，请重新生成草案',
        currentContextVersion: snapshot.contextVersion,
      });
    }

    if (this.context.isStale(proposal.contextVersion, snapshot)) {
      this.store.updateStatus(proposal.proposalId, 'STALE');
      this.setPhase(proposal.tripId, 'CONTEXT_STALE', proposal.proposalId);
      throw new ConflictException({
        code: 'CONTEXT_VERSION_CONFLICT',
        errorCode: 'CONTEXT_VERSION_CONFLICT',
        message: '草案已过期，请重新生成',
        currentContextVersion: snapshot.contextVersion,
      });
    }

    if (proposal.changes.length === 0) {
      throw new BadRequestException('当前草案没有可应用的变更');
    }

    this.setPhase(proposal.tripId, 'APPLYING', proposal.proposalId);
    this.store.updateStatus(proposal.proposalId, 'APPLYING');

    try {
      const result = await this.applyService.apply({
        proposal,
        userId: input.userId,
        force: input.force,
        enabledItemIds: input.enabledItemIds,
        comment: input.comment,
      });
      this.store.updateStatus(proposal.proposalId, 'APPLIED');
      this.setPhase(proposal.tripId, 'COMPLETED');
      const nextSnapshot = await this.context.snapshot(proposal.tripId);
      result.orchestrationState = {
        ...result.orchestrationState,
        phase: 'COMPLETED',
        contextVersion: nextSnapshot.contextVersion,
        activeProposalId: undefined,
      };
      return result;
    } catch (error) {
      this.store.updateStatus(proposal.proposalId, 'FAILED');
      this.setPhase(proposal.tripId, 'FAILED', proposal.proposalId);
      throw error;
    }
  }

  discardProposal(proposalId: string): PlanProposal {
    const proposal = this.store.require(proposalId);
    this.store.updateStatus(proposalId, 'DISCARDED');
    this.setPhase(proposal.tripId, 'IDLE');
    return proposal;
  }

  private setPhase(
    tripId: string,
    phase: OrchestrationStateView['phase'],
    activeProposalId?: string,
  ): void {
    const current = this.getOrchestrationState(tripId);
    this.orchestrationState.set(tripId, {
      ...current,
      tripId,
      phase,
      activeProposalId,
      updatedAt: new Date().toISOString(),
    });
  }
}
