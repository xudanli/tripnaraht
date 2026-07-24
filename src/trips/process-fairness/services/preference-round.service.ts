import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { WishCategory } from '../../wishlist/types/trip-wish.types';
import {
  CreatePreferenceRoundDto,
  SubmitHeardVotesDto,
  SubmitUtteranceDto,
} from '../dto/preference-round.dto';
import {
  DECISION_NODE_TO_DOMAIN,
  DOMAIN_TO_DECISION_NODE,
  type DecisionNode,
  type PreferenceRoundDetail,
  type PreferenceRoundStatus,
  type PreferenceRoundSummary,
} from '../types/preference-round.types';
import { TripPreferenceRoundAccessService } from './trip-preference-round-access.service';
import {
  allHeardVotesComplete,
  buildHeardInterventions,
  computeHeardRates,
} from '../utils/heard-rate.util';
import {
  allMembersSpoken,
  currentSpeakerUserId,
  parseTurnOrder,
  shuffleTurnOrder,
} from '../utils/turn-order.util';

const STATUS_LABELS: Record<PreferenceRoundStatus, string> = {
  collecting: '收集团队意见…',
  synthesizing: '「你被听见了吗？」反馈中',
  closed: '本轮已结束',
};

const DEFAULT_ROUND_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class PreferenceRoundService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
    private readonly access: TripPreferenceRoundAccessService,
  ) {}

  async listRounds(tripId: string, userId: string): Promise<PreferenceRoundSummary[]> {
    await this.access.assertTripMember(tripId, userId);
    const rows = await this.prisma.tripPreferenceRound.findMany({
      where: { tripId },
      include: { _count: { select: { utterances: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => {
      const turnOrder = parseTurnOrder(row.turnOrder);
      return {
        id: row.id,
        tripId: row.tripId,
        domain: row.domain as WishCategory,
        decisionNode: row.decisionNode as DecisionNode,
        status: row.status as PreferenceRoundStatus,
        statusLabel: STATUS_LABELS[row.status as PreferenceRoundStatus] ?? row.status,
        closesAt: row.closesAt?.toISOString() ?? null,
        utteranceCount: row._count.utterances,
        memberCount: turnOrder.length,
      };
    });
  }

  async getActiveRoundForDomain(
    tripId: string,
    domain: WishCategory,
  ): Promise<string | null> {
    const row = await this.prisma.tripPreferenceRound.findFirst({
      where: {
        tripId,
        domain,
        status: { in: ['collecting', 'synthesizing'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** One query for all in-flight rounds — avoids N+1 in collaborative task lists. */
  async listActiveRoundsForTrip(
    tripId: string,
  ): Promise<Map<string, { id: string; closesAt: Date | null }>> {
    const rows = await this.prisma.tripPreferenceRound.findMany({
      where: {
        tripId,
        status: { in: ['collecting', 'synthesizing'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, domain: true, closesAt: true },
    });
    const map = new Map<string, { id: string; closesAt: Date | null }>();
    for (const row of rows) {
      if (!map.has(row.domain)) {
        map.set(row.domain, { id: row.id, closesAt: row.closesAt });
      }
    }
    return map;
  }

  /**
   * 解析领域应展示的轮次 ID：优先进行中轮次，其次最近历史轮次，最后才懒创建。
   * 避免刷新页面时因旧轮次已 closed 而新建空轮次、导致发言记录「消失」。
   */
  async resolveRoundIdForDomain(
    tripId: string,
    userId: string,
    domain: WishCategory,
  ): Promise<string | null> {
    const active = await this.getActiveRoundForDomain(tripId, domain);
    if (active) return active;

    const latest = await this.prisma.tripPreferenceRound.findFirst({
      where: { tripId, domain },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (latest) return latest.id;

    return this.ensureActiveRoundForDomain(tripId, userId, domain);
  }

  /**
   * 为「讨论中」协作任务保证存在活跃轮次（成员≥2 时懒创建）。
   * 返回 roundId；无法创建时返回 null（不抛错，避免任务列表 500）。
   */
  async ensureActiveRoundForDomain(
    tripId: string,
    userId: string,
    domain: WishCategory,
  ): Promise<string | null> {
    const existing = await this.getActiveRoundForDomain(tripId, domain);
    if (existing) return existing;

    const decisionNode = DOMAIN_TO_DECISION_NODE[domain];
    if (!decisionNode) return null;

    const memberIds = await this.access.listMemberIds(tripId);
    if (memberIds.length < 2) return null;

    try {
      const round = await this.createRound(tripId, userId, {
        decisionNode,
        domain,
      });
      return round.id;
    } catch (e) {
      if (e instanceof ConflictException) {
        return this.getActiveRoundForDomain(tripId, domain);
      }
      return null;
    }
  }

  async getRound(
    tripId: string,
    roundId: string,
    userId: string,
  ): Promise<PreferenceRoundDetail> {
    await this.access.assertTripMember(tripId, userId);
    const row = await this.requireRound(tripId, roundId);
    return this.toDetail(row, userId);
  }

  async createRound(
    tripId: string,
    userId: string,
    dto: CreatePreferenceRoundDto,
  ): Promise<PreferenceRoundDetail> {
    await this.access.assertTripMember(tripId, userId);
    const domain = dto.domain ?? DECISION_NODE_TO_DOMAIN[dto.decisionNode];

    const existing = await this.prisma.tripPreferenceRound.findFirst({
      where: {
        tripId,
        domain,
        status: { in: ['collecting', 'synthesizing'] },
      },
    });
    if (existing) {
      throw new ConflictException(
        `该领域已有进行中的偏好分享轮次（${existing.id}）`,
      );
    }

    const memberIds = await this.access.listMemberIds(tripId);
    if (memberIds.length === 0) {
      throw new BadRequestException('行程暂无成员，无法发起偏好分享轮次');
    }

    const turnOrder =
      dto.turnOrder && dto.turnOrder.length > 0
        ? dto.turnOrder.filter((id) => memberIds.includes(id))
        : shuffleTurnOrder(memberIds);

    if (turnOrder.length === 0) {
      throw new BadRequestException('发言顺序无效');
    }

    const closesAt = dto.closesAt
      ? new Date(dto.closesAt)
      : new Date(Date.now() + DEFAULT_ROUND_MS);

    const row = await this.prisma.tripPreferenceRound.create({
      data: {
        tripId,
        domain,
        decisionNode: dto.decisionNode,
        status: 'collecting',
        turnOrder,
        currentTurn: 0,
        closesAt,
        createdBy: userId,
      },
      include: roundIncludes,
    });

    return this.toDetail(row, userId);
  }

  async submitUtterance(
    tripId: string,
    roundId: string,
    userId: string,
    dto: SubmitUtteranceDto,
  ): Promise<PreferenceRoundDetail> {
    await this.access.assertTripMember(tripId, userId);
    const row = await this.requireRound(tripId, roundId);

    if (row.status !== 'collecting') {
      throw new BadRequestException('当前阶段不允许发言');
    }

    const turnOrder = parseTurnOrder(row.turnOrder);
    const speaker = currentSpeakerUserId(turnOrder, row.currentTurn, row.status);
    if (speaker !== userId) {
      throw new ForbiddenUtteranceError(
        '尚未轮到你发言。本轮为结构化偏好分享，请倾听其他成员的观点。',
      );
    }

    const existing = row.utterances.find((u) => u.userId === userId);
    if (existing) {
      throw new ConflictException('你已在本轮发表过偏好');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tripPreferenceUtterance.create({
        data: {
          roundId,
          userId,
          turnIndex: row.currentTurn,
          modality: dto.modality,
          content: dto.content.trim(),
          reason: dto.reason?.trim() ?? null,
          viaProxy: dto.viaProxy ?? false,
        },
      });

      const nextTurn = row.currentTurn + 1;
      const nextStatus = allMembersSpoken(turnOrder, nextTurn) ? 'synthesizing' : 'collecting';

      await tx.tripPreferenceRound.update({
        where: { id: roundId },
        data: {
          currentTurn: nextTurn,
          status: nextStatus,
        },
      });

      if (nextStatus === 'synthesizing') {
        await this.markSilentMembers(
          tx,
          tripId,
          turnOrder,
          [...row.utterances.map((u) => u.userId), userId],
        );
      }

      await this.bumpParticipation(tx, tripId, userId, { spoke: true });
    });

    const updated = await this.requireRound(tripId, roundId);
    return this.toDetail(updated, userId);
  }

  async submitHeardVotes(
    tripId: string,
    roundId: string,
    userId: string,
    dto: SubmitHeardVotesDto,
  ): Promise<PreferenceRoundDetail> {
    await this.access.assertTripMember(tripId, userId);
    const row = await this.requireRound(tripId, roundId);

    if (row.status !== 'synthesizing') {
      throw new BadRequestException('当前阶段不允许提交「被听见」反馈');
    }

    const turnOrder = parseTurnOrder(row.turnOrder);
    const targets = dto.votes.map((v) => v.targetUserId);
    for (const targetId of targets) {
      if (!turnOrder.includes(targetId)) {
        throw new BadRequestException(`无效的目标成员: ${targetId}`);
      }
      if (targetId === userId) {
        throw new BadRequestException('不能对自己投票');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const vote of dto.votes) {
        await tx.tripPreferenceHeardVote.upsert({
          where: {
            roundId_voterId_targetUserId: {
              roundId,
              voterId: userId,
              targetUserId: vote.targetUserId,
            },
          },
          create: {
            roundId,
            voterId: userId,
            targetUserId: vote.targetUserId,
            heard: vote.heard,
          },
          update: { heard: vote.heard },
        });
      }

      await this.bumpParticipation(tx, tripId, userId, { voted: true });

      const heardRows = await tx.tripPreferenceHeardVote.findMany({ where: { roundId } });
      const voterIds = new Set(heardRows.map((r) => r.voterId));
      const complete = allHeardVotesComplete(
        voterIds.size,
        turnOrder.length,
        heardRows.length,
      );

      if (complete || this.allVotersSubmitted(turnOrder, heardRows)) {
        await tx.tripPreferenceRound.update({
          where: { id: roundId },
          data: { status: 'closed', closedAt: new Date() },
        });
        await this.markSilentMembers(tx, tripId, turnOrder, row.utterances.map((u) => u.userId));
      }
    });

    const updated = await this.requireRound(tripId, roundId);
    if (updated.status === 'closed') {
      await this.notifyNegotiationClosed(tripId, roundId);
    }
    return this.toDetail(updated, userId);
  }

  async closeRound(
    tripId: string,
    roundId: string,
    userId: string,
  ): Promise<PreferenceRoundDetail> {
    await this.access.assertTripMember(tripId, userId);
    const row = await this.requireRound(tripId, roundId);
    if (row.status === 'closed') {
      return this.toDetail(row, userId);
    }

    await this.prisma.tripPreferenceRound.update({
      where: { id: roundId },
      data: { status: 'closed', closedAt: new Date() },
    });

    const turnOrder = parseTurnOrder(row.turnOrder);
    await this.markSilentMembers(
      this.prisma,
      tripId,
      turnOrder,
      row.utterances.map((u) => u.userId),
    );

    const updated = await this.requireRound(tripId, roundId);
    await this.notifyNegotiationClosed(tripId, roundId);
    return this.toDetail(updated, userId);
  }

  private async notifyNegotiationClosed(tripId: string, roundId: string): Promise<void> {
    try {
      const { DecisionProblemNegotiationOrchestratorService } = await import(
        './decision-problem-negotiation-orchestrator.service'
      );
      const orchestrator = this.moduleRef.get(DecisionProblemNegotiationOrchestratorService, {
        strict: false,
      });
      await orchestrator?.onRoundClosed(tripId, roundId);
    } catch {
      // negotiation binding optional
    }
  }

  private allVotersSubmitted(
    turnOrder: string[],
    heardRows: Array<{ voterId: string; targetUserId: string }>,
  ): boolean {
    for (const voterId of turnOrder) {
      const targetsVoted = new Set(
        heardRows.filter((r) => r.voterId === voterId).map((r) => r.targetUserId),
      );
      const expectedTargets = turnOrder.filter((id) => id !== voterId);
      if (expectedTargets.some((t) => !targetsVoted.has(t))) {
        return false;
      }
    }
    return turnOrder.length > 0;
  }

  private async bumpParticipation(
    tx: Prisma.TransactionClient | PrismaService,
    tripId: string,
    userId: string,
    delta: { spoke?: boolean; voted?: boolean },
  ): Promise<void> {
    const existing = await tx.tripMemberParticipation.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });

    if (existing) {
      await tx.tripMemberParticipation.update({
        where: { tripId_userId: { tripId, userId } },
        data: {
          preferenceSubmits: delta.spoke
            ? existing.preferenceSubmits + 1
            : existing.preferenceSubmits,
          voteParticipations: delta.voted
            ? existing.voteParticipations + 1
            : existing.voteParticipations,
          discussionUtterances: delta.spoke
            ? existing.discussionUtterances + 1
            : existing.discussionUtterances,
          consecutiveSilentRounds: delta.spoke ? 0 : existing.consecutiveSilentRounds,
          lastSpokeAt: delta.spoke ? new Date() : existing.lastSpokeAt,
        },
      });
      return;
    }

    await tx.tripMemberParticipation.create({
      data: {
        tripId,
        userId,
        preferenceSubmits: delta.spoke ? 1 : 0,
        voteParticipations: delta.voted ? 1 : 0,
        discussionUtterances: delta.spoke ? 1 : 0,
        consecutiveSilentRounds: 0,
        lastSpokeAt: delta.spoke ? new Date() : null,
      },
    });
  }

  private async markSilentMembers(
    tx: Prisma.TransactionClient | PrismaService,
    tripId: string,
    turnOrder: string[],
    spokeUserIds: string[],
  ): Promise<void> {
    const spoke = new Set(spokeUserIds);
    for (const memberId of turnOrder) {
      if (spoke.has(memberId)) continue;

      const existing = await tx.tripMemberParticipation.findUnique({
        where: { tripId_userId: { tripId, userId: memberId } },
      });

      if (existing) {
        await tx.tripMemberParticipation.update({
          where: { tripId_userId: { tripId, userId: memberId } },
          data: {
            consecutiveSilentRounds: existing.consecutiveSilentRounds + 1,
          },
        });
      } else {
        await tx.tripMemberParticipation.create({
          data: {
            tripId,
            userId: memberId,
            consecutiveSilentRounds: 1,
          },
        });
      }
    }
  }

  private async requireRound(tripId: string, roundId: string) {
    const row = await this.prisma.tripPreferenceRound.findFirst({
      where: { id: roundId, tripId },
      include: roundIncludes,
    });
    if (!row) {
      throw new NotFoundException(`偏好轮次 ${roundId} 不存在`);
    }
    return row;
  }

  private async toDetail(
    row: Awaited<ReturnType<typeof this.requireRound>>,
    viewerUserId: string,
  ): Promise<PreferenceRoundDetail> {
    const turnOrder = parseTurnOrder(row.turnOrder);
    const status = row.status as PreferenceRoundStatus;
    const speakerId = currentSpeakerUserId(turnOrder, row.currentTurn, status);
    const allUserIds = [...new Set([...turnOrder, ...row.utterances.map((u) => u.userId)])];
    const displayNames = await this.access.resolveDisplayNames(allUserIds);

    const utterances = row.utterances
      .sort((a, b) => a.turnIndex - b.turnIndex)
      .map((u) => ({
        id: u.id,
        userId: u.userId,
        displayName: displayNames.get(u.userId) ?? '同行者',
        turnIndex: u.turnIndex,
        modality: u.modality as PreferenceRoundDetail['utterances'][0]['modality'],
        content: u.content,
        reason: u.reason,
        viaProxy: u.viaProxy,
        createdAt: u.createdAt.toISOString(),
      }));

    let heardRates: PreferenceRoundDetail['heardRates'] = null;
    let interventions: PreferenceRoundDetail['interventions'] = [];

    if (status === 'synthesizing' || status === 'closed') {
      const rates = computeHeardRates(
        row.heardVotes.map((v) => ({
          targetUserId: v.targetUserId,
          heard: v.heard,
        })),
        turnOrder.length,
      );
      heardRates = rates.map((r) => ({
        targetUserId: r.targetUserId,
        displayName: displayNames.get(r.targetUserId) ?? '同行者',
        heardRate: r.heardRate,
        voteCount: r.voteCount,
        belowThreshold: r.belowThreshold,
      }));
      interventions = buildHeardInterventions(rates, displayNames);
    }

    const myHeardVoteCount = row.heardVotes.filter((v) => v.voterId === viewerUserId).length;
    const expectedHeardVotes = Math.max(turnOrder.length - 1, 0);

    return {
      id: row.id,
      tripId: row.tripId,
      domain: row.domain as WishCategory,
      decisionNode: row.decisionNode as DecisionNode,
      status,
      statusLabel: STATUS_LABELS[status] ?? status,
      turnOrder,
      currentTurn: row.currentTurn,
      currentSpeakerUserId: speakerId,
      currentSpeakerDisplayName: speakerId
        ? displayNames.get(speakerId) ?? '同行者'
        : null,
      closesAt: row.closesAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      utterances,
      heardRates,
      interventions,
      canSpeak:
        status === 'collecting' &&
        speakerId === viewerUserId &&
        !row.utterances.some((u) => u.userId === viewerUserId),
      canSubmitHeardVotes:
        status === 'synthesizing' && myHeardVoteCount < expectedHeardVotes,
      myHeardVotesSubmitted: myHeardVoteCount >= expectedHeardVotes,
    };
  }
}

const roundIncludes = {
  utterances: true,
  heardVotes: true,
} as const;

class ForbiddenUtteranceError extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}
