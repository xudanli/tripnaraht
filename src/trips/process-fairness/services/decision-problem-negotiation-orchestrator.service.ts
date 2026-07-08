import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { WishCategory } from '../../wishlist/types/trip-wish.types';
import type {
  DecisionOption,
  DecisionProblemDetail,
  DecisionProblemStatus,
  DecisionProblemSummary,
  DecisionProblemType,
} from '../../decision-semantics/types/decision-semantics.types';
import { DecisionSemanticsService } from '../../decision-semantics/services/decision-semantics.service';
import { TripDomainInfluenceService } from '../../domain-influence/services/trip-domain-influence.service';
import { getDomainDecisionRule } from '../../domain-influence/utils/domain-cross-level.util';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { DecisionEngineGatewayService } from '../../../decision-runtime/gateway/services/decision-engine-gateway.service';
import { readDecisionProblemResolutionsFromMetadata } from '../../../decision-runtime/gateway/persistence/decision-problem-resolution.store';
import { readCollaborativeSubTasksFromMetadata } from '../../../decision-runtime/gateway/utils/decision-collaborative-subtask-metadata.util';
import {
  mapCollaborativeSubTaskItem,
  mapSuggestedCollaborativeSubTaskItem,
} from '../../../decision-runtime/gateway/utils/decision-collaborative-subtask-projection.util';
import { buildSuggestedSubTasks } from '../../../decision-runtime/gateway/utils/decision-collaborative-subtask-suggestions.util';
import type { Rfc001DecisionCenterProblemView } from '../../guardian-decision-core/adapters/decision-center-bridge.adapter';
import type { CollaborativeTaskItem } from '../../domain-influence/types/trip-domain.types';
import { PreferenceRoundService } from './preference-round.service';
import { TripPreferenceRoundAccessService } from './trip-preference-round-access.service';
import {
  type DecisionProblemNegotiationContext,
  isDecisionProblemNegotiationEligible,
  isDecisionProblemNegotiationOpen,
  resolveNegotiationDecisionNode,
  resolveNegotiationWishDomain,
} from '../utils/decision-problem-negotiation.util';
import {
  findProblemIdForRound,
  getBindingForProblem,
  isActiveRoundBinding,
  negotiationTaskIdForProblem,
  readNegotiationMetadata,
  writeNegotiationBinding,
  writeNegotiationOutcome,
} from '../utils/decision-problem-negotiation.store';
import type {
  DecisionProblemNegotiationBinding,
  DecisionProblemNegotiationHints,
  DomainRoundConflictDetails,
  NegotiationPrefill,
  NegotiationPreflightResult,
  StartDecisionProblemNegotiationBody,
  StartDecisionProblemNegotiationResult,
} from '../types/decision-problem-negotiation.types';
import type {
  DecisionProblemNegotiationStatus,
  DecisionProblemNegotiationView,
} from '../../decision-semantics/types/decision-semantics.types';

@Injectable()
export class DecisionProblemNegotiationOrchestratorService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
    private readonly roundService: PreferenceRoundService,
    private readonly access: TripPreferenceRoundAccessService,
  ) {}

  async preflight(
    tripId: string,
    userId: string,
    problemId: string,
    focusConflictId?: string,
  ): Promise<NegotiationPreflightResult> {
    await this.access.assertTripMember(tripId, userId);
    const ctx = await this.resolveProblemContext(tripId, problemId, focusConflictId);
    const domain = resolveNegotiationWishDomain(ctx);
    const decisionNode = resolveNegotiationDecisionNode(ctx);
    const crossLevel = getDomainDecisionRule(domain).crossLevel;
    const memberIds = await this.access.listMemberIds(tripId);
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const metadata = trip?.metadata ?? null;
    const binding = getBindingForProblem(metadata, problemId);
    const activeRoundId = await this.roundService.getActiveRoundForDomain(tripId, domain);
    const negotiationTaskId = negotiationTaskIdForProblem(problemId);
    const domainSnapshot = await this.domainInfluence().getSnapshot(tripId, userId);
    const domainItem = domainSnapshot.domains.find((d) => d.domain === domain);
    const userHasDomainClaim = Boolean(
      domainItem?.claims.some((c) => c.userId === userId),
    );
    const requiresDomainClaim =
      crossLevel !== 'low' && Boolean(domainItem?.unclaimed) && !userHasDomainClaim;
    const existingProblemIdForRound = activeRoundId
      ? findProblemIdForRound(metadata, activeRoundId)
      : null;

    const base = {
      suggestedDomain: domain,
      suggestedDecisionNode: decisionNode,
      crossLevel,
      requiresDomainClaim,
      claimDomain: requiresDomainClaim ? domain : undefined,
      userHasDomainClaim,
      existingRoundId: activeRoundId,
      negotiationTaskId,
      existingProblemIdForRound,
      existingTaskStatus: activeRoundId
        ? ('in_discussion' as const)
        : binding
          ? ('pending' as const)
          : null,
    };

    if (!isDecisionProblemNegotiationOpen(ctx.status)) {
      return {
        ...base,
        canStart: false,
        blockReason: 'PROBLEM_NOT_NEGOTIABLE',
        blockMessageCN: '该决策问题已关闭，无法发起协商',
      };
    }

    if (!isDecisionProblemNegotiationEligible(ctx)) {
      return {
        ...base,
        canStart: false,
        blockReason: 'PROBLEM_NOT_ELIGIBLE',
        blockMessageCN: '该问题为执行型决策，无需团队结构化协商',
      };
    }

    if (memberIds.length < 2) {
      return {
        ...base,
        canStart: false,
        blockReason:
          memberIds.length <= 1 ? 'SOLO_TRIP_NOT_SUPPORTED' : 'INSUFFICIENT_MEMBERS',
        blockMessageCN:
          memberIds.length <= 1
            ? '单人行程暂不支持结构化协商，请先邀请协作者'
            : '请先添加至少 1 名成员后再发起协商',
      };
    }

    if (isActiveRoundBinding(binding, activeRoundId)) {
      return {
        ...base,
        canStart: true,
        blockReason: 'NEGOTIATION_ALREADY_ACTIVE',
        blockMessageCN: '该决策问题已有进行中的协商，可直接进入讨论',
        existingRoundId: binding!.roundId,
        existingTaskStatus: 'in_discussion',
      };
    }

    if (
      activeRoundId &&
      existingProblemIdForRound &&
      existingProblemIdForRound !== problemId
    ) {
      return {
        ...base,
        canStart: false,
        blockReason: 'DOMAIN_ROUND_CONFLICT',
        blockMessageCN:
          '该领域已有其他决策问题的协商进行中，请先结束或进入已有讨论',
        existingRoundId: activeRoundId,
      };
    }

    if (requiresDomainClaim) {
      return {
        ...base,
        canStart: false,
        blockReason: 'CLAIM_REQUIRED',
        blockMessageCN: `请先认领「${domainItem?.domainLabel ?? domain}」领域负责人，或由系统代你认领后再发起`,
      };
    }

    return {
      ...base,
      canStart: true,
      blockReason: null,
      blockMessageCN: null,
    };
  }

  async startNegotiation(
    tripId: string,
    userId: string,
    problemId: string,
    body: StartDecisionProblemNegotiationBody = {},
  ): Promise<StartDecisionProblemNegotiationResult> {
    const focusConflictId = body.focusConflictId;
    const autoClaimDomain = body.autoClaimDomain !== false;
    const pre = await this.preflight(tripId, userId, problemId, focusConflictId);

    if (pre.blockReason === 'PROBLEM_NOT_NEGOTIABLE') {
      throw new BadRequestException(pre.blockMessageCN ?? '该决策问题不可协商');
    }
    if (
      pre.blockReason === 'INSUFFICIENT_MEMBERS' ||
      pre.blockReason === 'SOLO_TRIP_NOT_SUPPORTED'
    ) {
      throw new BadRequestException(pre.blockMessageCN ?? '成员不足，无法发起协商');
    }
    if (pre.blockReason === 'DOMAIN_ROUND_CONFLICT') {
      throw new ConflictException({
        ...this.buildDomainConflictPayload(tripId, pre),
        message: pre.blockMessageCN ?? '领域协商冲突',
      });
    }

    const ctx = await this.resolveProblemContext(tripId, problemId, focusConflictId);
    const domain = pre.suggestedDomain;
    const decisionNode = pre.suggestedDecisionNode;
    const options = await this.loadOptions(tripId, problemId);
    const prefill = this.buildPrefill(ctx, options, body);

    if (pre.blockReason === 'NEGOTIATION_ALREADY_ACTIVE' && pre.existingRoundId) {
      return this.buildStartResult({
        action: 'enter_existing',
        tripId,
        problemId,
        domain,
        decisionNode,
        roundId: pre.existingRoundId,
        prefill,
      });
    }

    if (pre.requiresDomainClaim && !autoClaimDomain) {
      const domainSnapshot = await this.domainInfluence().getSnapshot(tripId, userId);
      const domainItem = domainSnapshot.domains.find((d) => d.domain === domain);
      return {
        action: 'claim_required',
        negotiationTaskId: pre.negotiationTaskId,
        roundId: '',
        roundDomain: domain,
        decisionNode,
        status: 'in_discussion',
        clientNavigation: {
          route: 'structured_negotiation',
          tripId,
          roundId: '',
          roundDomain: domain,
          problemId,
        },
        prefill,
        claimRequired: {
          domain,
          crossLevel: pre.crossLevel,
          unclaimed: Boolean(domainItem?.unclaimed),
          userHasClaim: pre.userHasDomainClaim,
        },
      };
    }

    if (pre.requiresDomainClaim && autoClaimDomain) {
      await this.domainInfluence().claimDomain(tripId, userId, {
        domain,
        claimSource: 'explicit',
        note: `为决策问题「${ctx.title}」发起协商而认领`,
      });
    }

    let roundId = await this.roundService.getActiveRoundForDomain(tripId, domain);
    let action: 'created' | 'enter_existing' = 'enter_existing';

    if (!roundId) {
      try {
        const round = await this.roundService.createRound(tripId, userId, {
          decisionNode,
          domain,
          closesAt: body.closesAt,
        });
        roundId = round.id;
        action = 'created';
      } catch (e) {
        if (e instanceof ConflictException) {
          roundId = await this.roundService.getActiveRoundForDomain(tripId, domain);
          if (!roundId) throw e;
          const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { metadata: true },
          });
          const owner = findProblemIdForRound(trip?.metadata ?? null, roundId);
          if (owner && owner !== problemId) {
            throw new ConflictException({
              ...this.buildDomainConflictPayload(tripId, {
                ...pre,
                existingRoundId: roundId,
                existingProblemIdForRound: owner,
              }),
              message: '该领域已有其他决策问题的协商进行中',
            });
          }
        } else {
          throw e;
        }
      }
    } else {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      const owner = findProblemIdForRound(trip?.metadata ?? null, roundId);
      if (owner && owner !== problemId) {
        throw new ConflictException({
          ...this.buildDomainConflictPayload(tripId, {
            ...pre,
            existingRoundId: roundId,
            existingProblemIdForRound: owner,
          }),
          message: '该领域已有其他决策问题的协商进行中',
        });
      }
    }

    if (!roundId) {
      throw new BadRequestException('无法创建或绑定协商轮次');
    }

    await this.persistBinding(tripId, problemId, userId, {
      roundId,
      domain,
      decisionNode,
      focusConflictId: body.focusConflictId,
      selectedOptionId: body.selectedOptionId,
      note: body.note,
    });

    return this.buildStartResult({
      action,
      tripId,
      problemId,
      domain,
      decisionNode,
      roundId,
      prefill,
    });
  }

  async listDecisionProblemCollaborativeTasks(
    tripId: string,
    userId: string,
    options?: {
      skipAccessCheck?: boolean;
      metadata?: Prisma.JsonValue | null;
      activeRounds?: Map<string, { id: string; closesAt: Date | null }>;
    },
  ): Promise<CollaborativeTaskItem[]> {
    if (!options?.skipAccessCheck) {
      await this.access.assertTripMember(tripId, userId);
    }
    let metadata = options?.metadata;
    if (metadata === undefined) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      metadata = trip?.metadata ?? null;
    }
    const store = readNegotiationMetadata(metadata);
    const seeds = await this.listOpenProblemSeeds(tripId);
    const resolutionsByProblemId = readDecisionProblemResolutionsFromMetadata(metadata);
    const activeRounds =
      options?.activeRounds ?? (await this.roundService.listActiveRoundsForTrip(tripId));
    const tasks: CollaborativeTaskItem[] = [];

    const persistedSubTasks = readCollaborativeSubTasksFromMetadata(metadata).filter(
      (item) => item.tripId === tripId,
    );
    const subTasksByProblemId = new Set(persistedSubTasks.map((item) => item.problemId));
    const seedByProblemId = new Map(seeds.map((seed) => [seed.problemId, seed]));

    const problemTitleById = await this.resolveProblemTitlesForSubTasks(
      tripId,
      [
        ...persistedSubTasks.map((sub) => sub.problemId),
        ...Object.keys(resolutionsByProblemId),
      ],
      seedByProblemId,
    );

    for (const sub of persistedSubTasks) {
      tasks.push(
        mapCollaborativeSubTaskItem(sub, {
          problemTitle:
            sub.problemTitle ?? problemTitleById.get(sub.problemId),
        }),
      );
    }

    const problemIdsToProject = new Set([
      ...seeds.map((seed) => seed.problemId),
      ...Object.keys(resolutionsByProblemId),
    ]);

    for (const problemId of problemIdsToProject) {
      if (subTasksByProblemId.has(problemId)) {
        continue;
      }

      const resolution = resolutionsByProblemId[problemId];
      const seed = seedByProblemId.get(problemId);

      if (resolution) {
        const problemTitle =
          seed?.title ?? problemTitleById.get(problemId) ?? '决策跟进';
        for (const suggestion of buildSuggestedSubTasks(
          resolution.semanticKey ?? seed?.type,
        )) {
          tasks.push(
            mapSuggestedCollaborativeSubTaskItem({
              problemId,
              title: problemTitle,
              description: seed?.description,
              resolution,
              suggestion,
            }),
          );
        }
        continue;
      }

      if (!seed) {
        continue;
      }

      const ctx: DecisionProblemNegotiationContext = {
        problemId: seed.problemId,
        tripId,
        title: seed.title,
        description: seed.description,
        type: seed.type,
        status: seed.status,
        focusConflictId: store.byProblemId[seed.problemId]?.focusConflictId,
      };

      // Lite seeds lack assertions/authority — only preference / multi-party problems qualify.
      if (!isDecisionProblemNegotiationEligible(ctx)) {
        continue;
      }

      const domain = resolveNegotiationWishDomain(ctx);
      const binding = store.byProblemId[seed.problemId] ?? null;
      const activeRoundId =
        activeRounds.get(domain)?.id ?? binding?.roundId ?? null;
      const crossLevel = getDomainDecisionRule(domain).crossLevel;
      const negotiationTaskId = negotiationTaskIdForProblem(seed.problemId);

      tasks.push({
        id: negotiationTaskId,
        negotiationTaskId,
        source: 'decision_problem',
        problemId: seed.problemId,
        decisionProblemId: seed.problemId,
        resolutionId: null,
        actionPlanId: null,
        sourceConflictId: binding?.focusConflictId ?? null,
        domain,
        title: seed.title,
        description: seed.description || '围绕此决策问题发起结构化协商',
        crossLevel,
        status: activeRoundId ? 'in_discussion' : 'pending',
        statusLabel: activeRoundId ? '讨论中' : '待协商',
        claimCount: 0,
        leaderDisplayName: null,
        endorsementSummary: null,
        weightSource: 'negotiation',
        closesAt: null,
        activeRoundId,
      });
    }

    return tasks;
  }

  /** P1 — enrich GET decision-problems/:id with negotiation hints */
  async projectForProblemDetail(
    tripId: string,
    userId: string,
    problemId: string,
    focusConflictId?: string,
  ): Promise<DecisionProblemNegotiationHints | null> {
    try {
      await this.access.assertTripMember(tripId, userId);
    } catch {
      return null;
    }

    const pre = await this.preflight(tripId, userId, problemId, focusConflictId);
    const ctx = await this.resolveProblemContext(tripId, problemId, focusConflictId);
    const eligible = isDecisionProblemNegotiationEligible(ctx);
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const binding = getBindingForProblem(trip?.metadata ?? null, problemId);
    const roundId = pre.existingRoundId ?? binding?.roundId ?? null;
    let roundStatus: 'collecting' | 'synthesizing' | 'closed' | null = null;

    if (roundId) {
      const row = await this.prisma.tripPreferenceRound.findFirst({
        where: { id: roundId, tripId },
        select: { status: true },
      });
      const rawStatus = row?.status;
      roundStatus =
        rawStatus === 'collecting' ||
        rawStatus === 'synthesizing' ||
        rawStatus === 'closed'
          ? rawStatus
          : null;
    }

    const status = this.resolveNegotiationStatus(pre, binding, roundStatus);
    const inDiscussion = status === 'in_discussion';
    const visible = eligible || inDiscussion || (status === 'closed' && Boolean(binding?.outcome));

    const negotiation: DecisionProblemNegotiationView = {
      taskId: pre.negotiationTaskId,
      roundId: inDiscussion ? roundId : status === 'closed' ? binding?.roundId ?? roundId : null,
      roundDomain: pre.suggestedDomain,
      status,
      visible,
      canStart: visible && (pre.canStart || inDiscussion),
      buttonLabel: !visible
        ? null
        : inDiscussion
          ? '进入协商'
          : pre.canStart && !binding?.outcome
            ? '发起协商'
            : null,
      focusConflictId: binding?.focusConflictId ?? focusConflictId,
      closedOutcome: binding?.outcome,
    };

    return {
      suggestedNegotiationDomain: pre.suggestedDomain,
      suggestedDecisionNode: pre.suggestedDecisionNode,
      negotiation,
    };
  }

  /** P1 — preference round closed → write outcome back to decision problem binding */
  async onRoundClosed(tripId: string, roundId: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const metadata = trip?.metadata ?? null;
    const problemId = findProblemIdForRound(metadata, roundId);
    if (!problemId) {
      return;
    }

    const binding = getBindingForProblem(metadata, problemId);
    if (!binding) {
      return;
    }

    const row = await this.prisma.tripPreferenceRound.findFirst({
      where: { id: roundId, tripId },
      include: { utterances: true },
    });
    if (!row) {
      return;
    }

    const utteranceCount = row.utterances.length;
    const recommendedOptionId = binding.selectedOptionId;
    const summaryCN = this.buildClosedSummary(binding, utteranceCount);

    const nextMetadata = writeNegotiationOutcome(metadata, problemId, {
      closedAt: (row.closedAt ?? new Date()).toISOString(),
      recommendedOptionId,
      summaryCN,
      utteranceCount,
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: nextMetadata },
    });
  }

  private resolveNegotiationStatus(
    pre: NegotiationPreflightResult,
    binding: DecisionProblemNegotiationBinding | null,
    roundStatus: 'collecting' | 'synthesizing' | 'closed' | null,
  ): DecisionProblemNegotiationStatus {
    if (binding?.outcome) {
      return 'closed';
    }
    if (
      roundStatus === 'collecting' ||
      roundStatus === 'synthesizing' ||
      pre.blockReason === 'NEGOTIATION_ALREADY_ACTIVE'
    ) {
      return 'in_discussion';
    }
    if (pre.canStart) {
      return 'pending';
    }
    return 'none';
  }

  private buildClosedSummary(
    binding: DecisionProblemNegotiationBinding,
    utteranceCount: number,
  ): string {
    const parts = [`${utteranceCount} 位成员已完成发言`];
    if (binding.selectedOptionId) {
      parts.push(`发起倾向方案：${binding.selectedOptionId}`);
    }
    if (binding.note) {
      parts.push(`说明：${binding.note.slice(0, 80)}`);
    }
    return parts.join('；');
  }

  private buildStartResult(args: {
    action: 'created' | 'enter_existing';
    tripId: string;
    problemId: string;
    domain: WishCategory;
    decisionNode: ReturnType<typeof resolveNegotiationDecisionNode>;
    roundId: string;
    prefill: NegotiationPrefill;
  }): StartDecisionProblemNegotiationResult {
    return {
      action: args.action,
      negotiationTaskId: negotiationTaskIdForProblem(args.problemId),
      roundId: args.roundId,
      roundDomain: args.domain,
      decisionNode: args.decisionNode,
      status: 'in_discussion',
      clientNavigation: {
        route: 'structured_negotiation',
        tripId: args.tripId,
        roundId: args.roundId,
        roundDomain: args.domain,
        problemId: args.problemId,
      },
      prefill: args.prefill,
    };
  }

  private buildDomainConflictPayload(
    tripId: string,
    pre: Pick<
      NegotiationPreflightResult,
      'existingRoundId' | 'existingProblemIdForRound' | 'suggestedDomain'
    >,
  ): DomainRoundConflictDetails {
    return {
      code: 'DOMAIN_ROUND_CONFLICT',
      existingRoundId: pre.existingRoundId ?? '',
      existingProblemId: pre.existingProblemIdForRound,
      roundDomain: pre.suggestedDomain,
      messageCN: '该领域已有其他决策问题的协商进行中',
    };
  }

  private buildPrefill(
    ctx: DecisionProblemNegotiationContext,
    options: DecisionOption[],
    body: StartDecisionProblemNegotiationBody,
  ): NegotiationPrefill {
    return {
      title: ctx.title,
      question: options.length > 0 ? '请在以下方案中表达偏好' : '请围绕此议题表达你的偏好与理由',
      options: options.slice(0, 8).map((o) => ({
        id: o.id,
        label: o.title,
      })),
      selectedOptionId: body.selectedOptionId,
      note: body.note,
      focusConflictId: body.focusConflictId,
    };
  }

  private async persistBinding(
    tripId: string,
    problemId: string,
    userId: string,
    args: Omit<DecisionProblemNegotiationBinding, 'createdAt' | 'createdBy'>,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const nextMetadata = writeNegotiationBinding(trip?.metadata ?? null, problemId, {
      ...args,
      createdAt: new Date().toISOString(),
      createdBy: userId,
    });
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: nextMetadata },
    });
  }

  private async loadOptions(tripId: string, problemId: string): Promise<DecisionOption[]> {
    const gateway = this.tryGateway();
    try {
      if (isDecisionGatewayUnifiedEnabled() && gateway) {
        const resp = await gateway.getOptions(tripId, problemId);
        const data = (resp as { data?: { options?: DecisionOption[] }; options?: DecisionOption[] });
        return data.data?.options ?? data.options ?? [];
      }
      const resp = await this.semantics().getOptions(tripId, problemId);
      return resp.options ?? [];
    } catch {
      return [];
    }
  }

  private async listOpenProblemSeeds(tripId: string) {
    const gateway = this.tryGateway();
    if (isDecisionGatewayUnifiedEnabled() && gateway) {
      const seeds = await gateway.listOpenProblemSeedsLite(tripId);
      return seeds.filter((item) => isDecisionProblemNegotiationOpen(item.status));
    }
    const { items } = await this.semantics().listProblems(tripId);
    return items
      .filter((item) => isDecisionProblemNegotiationOpen(item.status))
      .map((item) => summaryToSeed(item));
  }

  private async resolveProblemTitlesForSubTasks(
    tripId: string,
    problemIds: string[],
    seedByProblemId: Map<string, { title: string }>,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const missing: string[] = [];

    for (const problemId of [...new Set(problemIds.filter(Boolean))]) {
      const seedTitle = seedByProblemId.get(problemId)?.title;
      if (seedTitle) {
        map.set(problemId, seedTitle);
      } else {
        missing.push(problemId);
      }
    }

    if (missing.length === 0) return map;

    const gateway = this.tryGateway();
    if (isDecisionGatewayUnifiedEnabled() && gateway) {
      const titles = await gateway.getProblemTitlesLite(tripId, missing);
      for (const [problemId, title] of Object.entries(titles)) {
        map.set(problemId, title);
      }
      return map;
    }

    await Promise.all(
      missing.map(async (problemId) => {
        try {
          const detail = await this.semantics().getProblem(tripId, problemId);
          if (detail.title) map.set(problemId, detail.title);
        } catch {
          // ignore missing legacy problems
        }
      }),
    );
    return map;
  }

  private async resolveProblemContext(
    tripId: string,
    problemId: string,
    focusConflictId?: string,
  ): Promise<DecisionProblemNegotiationContext> {
    const gateway = this.tryGateway();
    let ctx: DecisionProblemNegotiationContext;

    if (isDecisionGatewayUnifiedEnabled() && gateway) {
      const detail = await gateway.getProblemWithDebug(tripId, problemId);
      if (detail.actionability.writeChain === 'EVALUATE_AUTHORIZE_EXECUTE') {
        ctx = fromCanonicalView(detail.debug?.rawCanonical as Rfc001DecisionCenterProblemView);
      } else {
        ctx = fromLegacyDetail(detail.debug?.rawLegacy as DecisionProblemDetail);
      }
    } else {
      try {
        ctx = fromLegacyDetail(await this.semantics().getProblem(tripId, problemId));
      } catch (e) {
        if (e instanceof NotFoundException) {
          throw new NotFoundException(`DECISION_PROBLEM_NOT_FOUND: ${problemId}`);
        }
        throw e;
      }
    }

    return { ...ctx, focusConflictId };
  }

  private semantics(): DecisionSemanticsService {
    return this.moduleRef.get(DecisionSemanticsService, { strict: false });
  }

  private domainInfluence(): TripDomainInfluenceService {
    return this.moduleRef.get(TripDomainInfluenceService, { strict: false });
  }

  private tryGateway(): DecisionEngineGatewayService | undefined {
    try {
      return this.moduleRef.get(DecisionEngineGatewayService, { strict: false });
    } catch {
      return undefined;
    }
  }
}

function fromLegacyDetail(detail: DecisionProblemDetail): DecisionProblemNegotiationContext {
  return {
    problemId: detail.id,
    tripId: detail.tripId,
    title: detail.title,
    description: detail.description,
    type: detail.type,
    status: detail.status,
    authority: detail.authority,
    assertions: detail.assertions,
  };
}

function fromCanonicalView(
  view: Rfc001DecisionCenterProblemView,
): DecisionProblemNegotiationContext {
  return {
    problemId: view.problemId,
    tripId: view.tripId,
    title: view.problemSummary.title,
    description: view.problemSummary.description,
    type: view.problemSummary.type,
    status: view.problemSummary.status,
    assertions: [],
  };
}

function summaryToSeed(summary: DecisionProblemSummary) {
  return {
    problemId: summary.id,
    title: summary.title,
    description: summary.title,
    type: summary.type,
    status: summary.status,
  };
}
