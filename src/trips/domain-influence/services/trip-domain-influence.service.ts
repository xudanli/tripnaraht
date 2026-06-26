import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  WISH_CATEGORIES,
  type WishCategory,
} from '../../wishlist/types/trip-wish.types';
import { wishCategoryLabel } from '../../wishlist/utils/wish-category.util';
import {
  ClaimDomainDto,
  EndorseDomainClaimDto,
  SetDomainWeightsDto,
} from '../dto/trip-domain.dto';
import type {
  DomainDecisionBrief,
  DomainInfluenceAgentContextPayload,
  DomainLeaderPrivateConstraintBundle,
  DomainPrivateWishConstraint,
  DomainRecommendation,
  TripDomainBreakdownItem,
  TripDomainClaimRecord,
  TripDomainInfluenceSnapshot,
  CollaborativeTaskItem,
  CollaborativeTaskStatus,
} from '../types/trip-domain.types';
import { getDomainDecisionRule } from '../utils/domain-cross-level.util';
import {
  computeDomainWeights,
  findGlobalLowInfluenceMembers,
  normalizeOverrideWeights,
  toWeightPercent,
} from '../utils/domain-weight.util';
import { TripDomainAccessService } from './trip-domain-access.service';
import { PreferenceRoundService } from '../../process-fairness/services/preference-round.service';

type ClaimRow = {
  id: string;
  tripId: string;
  domain: string;
  userId: string;
  claimSource: string;
  selfScore: number;
  note: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  endorsements: Array<{ endorserId: string }>;
};

@Injectable()
export class TripDomainInfluenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripDomainAccessService,
    private readonly preferenceRoundService: PreferenceRoundService,
  ) {}

  async getSnapshot(tripId: string, userId: string): Promise<TripDomainInfluenceSnapshot> {
    await this.access.assertTripMember(tripId, userId);
    const memberIds = await this.access.listMemberIds(tripId);
    const eligibleCount = Math.max(memberIds.length, 1);
    const displayNames = await this.resolveDisplayNames(memberIds);

    const [claims, overrides, trip, wishRows] = await Promise.all([
      this.prisma.tripDomainClaim.findMany({
        where: { tripId, status: 'active' },
        include: { endorsements: true },
      }),
      this.prisma.tripDomainWeightOverride.findMany({ where: { tripId } }),
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      }),
      this.prisma.tripWishItem.findMany({
        where: { tripId, status: 'active' },
        select: { category: true, text: true, structuredHints: true },
      }),
    ]);

    const meta = (trip?.metadata ?? {}) as {
      domainInfluence?: {
        rulesConfirmed?: boolean;
        rulesConfirmedAt?: string;
      };
    };

    const overridesByDomain = groupOverrides(overrides);
    const claimsByDomain = groupClaims(claims as ClaimRow[]);
    const impactHintsByDomain = buildImpactHints(wishRows);

    const domainWeightsByMember = new Map<string, Map<string, number>>();
    const domains: TripDomainBreakdownItem[] = WISH_CATEGORIES.map((domain) => {
      const domainClaims = claimsByDomain.get(domain) ?? [];
      const domainOverrides = overridesByDomain?.get(domain);
      const { weights, source } = computeDomainWeights(
        domainClaims.map((c) => ({
          userId: c.userId,
          selfScore: c.selfScore,
          endorsementCount: c.endorsements.length,
        })),
        domainOverrides,
        eligibleCount,
      );

      const weightMap = new Map(weights.map((w) => [w.userId, w.weight]));
      domainWeightsByMember.set(domain, weightMap);

      const leader = weights.length === 1 ? weights[0] : weights.find((w) => w.isLeader);
      const leaderUserId = leader?.userId ?? (weights.length === 1 ? weights[0]?.userId : null);

      return {
        domain,
        domainLabel: wishCategoryLabel(domain),
        decisionRule: getDomainDecisionRule(domain),
        claims: domainClaims.map((c) => ({
          id: c.id,
          userId: c.userId,
          displayName: displayNames.get(c.userId) ?? '同行者',
          claimSource: c.claimSource as TripDomainClaimRecord['claimSource'],
          selfScore: c.selfScore,
          note: c.note,
          endorsementCount: c.endorsements.length,
          endorsementTotal: eligibleCount,
          endorsedByCurrentUser: c.endorsements.some((e) => e.endorserId === userId),
        })),
        weights: weights.map((w) => ({
          userId: w.userId,
          displayName: displayNames.get(w.userId) ?? '同行者',
          weight: w.weight,
          weightPercent: toWeightPercent(w.weight),
          isLeader: w.isLeader,
          selfScore: w.selfScore,
          peerTrustScore: w.peerTrustScore,
          stakeScore: w.stakeScore,
          payerScore: w.payerScore,
          endorsementCount:
            domainClaims.find((c) => c.userId === w.userId)?.endorsements.length ?? 0,
          claimSource:
            (domainClaims.find((c) => c.userId === w.userId)?.claimSource as TripDomainClaimRecord['claimSource']) ??
            'explicit',
        })),
        leaderUserId,
        leaderDisplayName: leaderUserId
          ? displayNames.get(leaderUserId) ?? '同行者'
          : null,
        weightSource: source,
        unclaimed: domainClaims.length === 0,
        impactHints: impactHintsByDomain.get(domain),
      };
    });

    const claimedMemberIds = new Set(claims.map((c) => c.userId));
    const allMembersClaimed =
      memberIds.length > 0 && memberIds.every((id) => claimedMemberIds.has(id));
    const claimedDomains = domains.filter((d) => !d.unclaimed).length;
    const completionRate = Math.round((claimedDomains / WISH_CATEGORIES.length) * 100) / 100;

    const lowInfluenceIds = findGlobalLowInfluenceMembers(memberIds, domainWeightsByMember);

    return {
      tripId,
      memberCount: eligibleCount,
      domains,
      completionRate,
      allMembersClaimed,
      balanceWarnings: lowInfluenceIds.map((id) => ({
        userId: id,
        displayName: displayNames.get(id) ?? '同行者',
        message: '该成员在各参与领域的影响力均为最低，建议邀请认领至少一个专长领域',
      })),
      rulesConfirmed: meta.domainInfluence?.rulesConfirmed ?? false,
      rulesConfirmedAt: meta.domainInfluence?.rulesConfirmedAt ?? null,
    };
  }

  async claimDomain(
    tripId: string,
    userId: string,
    dto: ClaimDomainDto,
  ): Promise<TripDomainBreakdownItem> {
    await this.access.assertTripMember(tripId, userId);
    await this.prisma.tripDomainClaim.upsert({
      where: {
        tripId_domain_userId: {
          tripId,
          domain: dto.domain,
          userId,
        },
      },
      create: {
        tripId,
        domain: dto.domain,
        userId,
        claimSource: dto.claimSource ?? 'explicit',
        selfScore: dto.selfScore ?? 50,
        note: dto.note,
        status: 'active',
      },
      update: {
        claimSource: dto.claimSource ?? 'explicit',
        selfScore: dto.selfScore ?? 50,
        note: dto.note,
        status: 'active',
      },
    });

    const snapshot = await this.getSnapshot(tripId, userId);
    const item = snapshot.domains.find((d) => d.domain === dto.domain);
    if (!item) {
      throw new NotFoundException(`领域 ${dto.domain} 不存在`);
    }
    return item;
  }

  async withdrawClaim(tripId: string, claimId: string, userId: string): Promise<void> {
    const row = await this.prisma.tripDomainClaim.findFirst({
      where: { id: claimId, tripId },
    });
    if (!row) {
      throw new NotFoundException('认领记录不存在');
    }
    if (row.userId !== userId) {
      throw new BadRequestException('仅可撤回自己的认领');
    }
    await this.prisma.tripDomainClaim.update({
      where: { id: claimId },
      data: { status: 'withdrawn' },
    });
    await this.prisma.tripDomainWeightOverride.deleteMany({
      where: { tripId, domain: row.domain, userId },
    });
  }

  async endorseClaim(
    tripId: string,
    userId: string,
    dto: EndorseDomainClaimDto,
  ): Promise<{ endorsementCount: number }> {
    await this.access.assertTripMember(tripId, userId);
    if (userId === dto.claimUserId) {
      throw new BadRequestException('不能认可自己的认领');
    }

    const claim = await this.prisma.tripDomainClaim.findFirst({
      where: {
        tripId,
        domain: dto.domain,
        userId: dto.claimUserId,
        status: 'active',
      },
    });
    if (!claim) {
      throw new NotFoundException('该成员尚未认领此领域');
    }

    await this.prisma.tripDomainEndorsement.upsert({
      where: {
        tripId_domain_claimUserId_endorserId: {
          tripId,
          domain: dto.domain,
          claimUserId: dto.claimUserId,
          endorserId: userId,
        },
      },
      create: {
        tripId,
        domain: dto.domain,
        claimUserId: dto.claimUserId,
        endorserId: userId,
        claimId: claim.id,
      },
      update: {},
    });

    const count = await this.prisma.tripDomainEndorsement.count({
      where: { tripId, domain: dto.domain, claimUserId: dto.claimUserId },
    });
    return { endorsementCount: count };
  }

  async setDomainWeights(
    tripId: string,
    userId: string,
    dto: SetDomainWeightsDto,
  ): Promise<TripDomainBreakdownItem> {
    await this.access.assertTripMember(tripId, userId);
    const activeClaims = await this.prisma.tripDomainClaim.findMany({
      where: { tripId, domain: dto.domain, status: 'active' },
    });
    if (activeClaims.length === 0) {
      throw new BadRequestException('该领域尚无认领，无法调整权重');
    }

    const claimUserIds = new Set(activeClaims.map((c) => c.userId));
    for (const w of dto.weights) {
      if (!claimUserIds.has(w.userId)) {
        throw new BadRequestException(`用户 ${w.userId} 未认领该领域`);
      }
    }

    const normalized = normalizeOverrideWeights(dto.weights);
    const source = dto.source ?? 'negotiation';

    await this.prisma.$transaction([
      this.prisma.tripDomainWeightOverride.deleteMany({
        where: { tripId, domain: dto.domain },
      }),
      ...normalized.map((w) =>
        this.prisma.tripDomainWeightOverride.create({
          data: {
            tripId,
            domain: dto.domain,
            userId: w.userId,
            weight: w.weight,
            source,
            setBy: userId,
          },
        }),
      ),
    ]);

    const snapshot = await this.getSnapshot(tripId, userId);
    const item = snapshot.domains.find((d) => d.domain === dto.domain);
    if (!item) {
      throw new NotFoundException(`领域 ${dto.domain} 不存在`);
    }
    return item;
  }

  async confirmRules(tripId: string, userId: string): Promise<{ confirmedAt: string }> {
    await this.access.assertTripMember(tripId, userId);
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const confirmedAt = new Date().toISOString();
    const metadata = { ...((trip.metadata as object) ?? {}) } as Record<string, unknown>;
    metadata.domainInfluence = {
      ...(metadata.domainInfluence as object),
      rulesConfirmed: true,
      rulesConfirmedAt: confirmedAt,
      confirmedBy: userId,
    };

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: metadata as object },
    });

    return { confirmedAt };
  }

  async getRecommendations(
    tripId: string,
    userId: string,
  ): Promise<DomainRecommendation[]> {
    await this.access.assertTripMember(tripId, userId);

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const [existingClaims, profile, wishes] = await Promise.all([
      this.prisma.tripDomainClaim.findMany({
        where: { tripId, userId, status: 'active' },
        select: { domain: true },
      }),
      uuidPattern.test(userId)
        ? this.prisma.userTravelProfile.findFirst({
            where: { userId },
            select: { extendedProfile: true, travelPhilosophy: true },
          })
        : Promise.resolve(null),
      this.prisma.tripWishItem.findMany({
        where: { tripId, userId, status: 'active' },
        select: { category: true, importance: true },
      }),
    ]);

    const claimed = new Set(existingClaims.map((c) => c.domain));
    const prefs = (profile?.extendedProfile ?? {}) as Record<string, unknown>;
    const scores = new Map<WishCategory, { score: number; reason: string }>();

    for (const wish of wishes) {
      const domain = wish.category as WishCategory;
      if (!WISH_CATEGORIES.includes(domain)) continue;
      const prev = scores.get(domain)?.score ?? 0;
      scores.set(domain, {
        score: prev + wish.importance * 10,
        reason: '基于你在心愿单中表达的关注度',
      });
    }

    const drivingExp = String(prefs.drivingExperience ?? prefs.rentalExperience ?? '');
    if (/high|expert|熟练|自驾/.test(drivingExp)) {
      bump(scores, 'local_transport', 40, '历史画像显示你有租车/自驾经验');
    }

    const foodFocus = String(prefs.diningStyle ?? prefs.foodFocus ?? '');
    if (/food|美食|吃/.test(foodFocus)) {
      bump(scores, 'dining', 35, '消费人格显示你更关注餐饮体验');
    }

    if (profile?.travelPhilosophy === 'adventure') {
      bump(scores, 'activities', 25, '旅行哲学偏探索/冒险');
    }

    return WISH_CATEGORIES.filter((d) => !claimed.has(d))
      .map((domain) => {
        const entry = scores.get(domain);
        return {
          domain,
          domainLabel: wishCategoryLabel(domain),
          score: entry?.score ?? 10,
          reason: entry?.reason ?? '团队尚未有人主导，欢迎认领',
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }

  /**
   * Decision brief for domain leaders — includes private wish constraints (F2 + 私密心愿单).
   */
  async getDecisionBrief(
    tripId: string,
    domain: WishCategory,
    userId: string,
  ): Promise<DomainDecisionBrief> {
    await this.access.assertDomainLeader(tripId, domain, userId);
    const snapshot = await this.getSnapshot(tripId, userId);
    const domainItem = snapshot.domains.find((d) => d.domain === domain);
    if (!domainItem) {
      throw new NotFoundException(`领域 ${domain} 不存在`);
    }

    const memberIds = await this.access.listMemberIds(tripId);
    const privateWishes = await this.prisma.tripWishItem.findMany({
      where: {
        tripId,
        category: domain,
        visibility: 'private',
        status: 'active',
        agentEligible: true,
      },
      orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
    });

    const slotByUser = new Map(memberIds.map((id, index) => [id, index + 1]));
    const constraints: DomainPrivateWishConstraint[] = privateWishes.map((w) => ({
      wishId: w.id,
      importance: w.importance,
      text: w.text,
      structuredHints: (w.structuredHints as Record<string, unknown>) ?? null,
      memberSlot: slotByUser.get(w.userId) ?? 0,
    }));

    return {
      domain,
      domainLabel: domainItem.domainLabel,
      crossLevel: domainItem.decisionRule.crossLevel,
      leaderUserIds: domainItem.weights.filter((w) => w.weight > 0).map((w) => w.userId),
      weights: domainItem.weights,
      privateWishConstraints: constraints,
      privateWishCount: constraints.length,
    };
  }

  /** Compact sidebar payload for planning workbench. */
  async getWorkbenchSidebar(tripId: string, userId: string) {
    const snapshot = await this.getSnapshot(tripId, userId);
    return {
      tripId,
      completionRate: snapshot.completionRate,
      rulesConfirmed: snapshot.rulesConfirmed,
      balanceWarnings: snapshot.balanceWarnings,
      domains: snapshot.domains.map((d) => ({
        domain: d.domain,
        label: d.domainLabel,
        crossLevel: d.decisionRule.crossLevel,
        ruleLabel: d.decisionRule.ruleLabelZh,
        unclaimed: d.unclaimed,
        leader: d.leaderDisplayName,
        leaderUserId: d.leaderUserId,
        weights: d.weights.map((w) => ({
          displayName: w.displayName,
          userId: w.userId,
          percent: w.weightPercent,
        })),
        endorsementSummary: d.claims.length
          ? d.claims.map((c) => ({
              displayName: c.displayName,
              endorsed: `${c.endorsementCount}/${c.endorsementTotal}`,
            }))
          : [],
      })),
    };
  }

  /**
   * Agent / Context Engineer payload — team governance summary + optional leader private constraints.
   * Source of truth remains trip domain tables; not stored in AgentMemoryContext L1–L4.
   */
  async getAgentContextPayload(
    tripId: string,
    userId: string,
    includePrivate: boolean,
  ): Promise<DomainInfluenceAgentContextPayload> {
    const snapshot = await this.getSnapshot(tripId, userId);
    const leaderPrivateBundles: DomainLeaderPrivateConstraintBundle[] = [];

    if (includePrivate) {
      const memberIds = await this.access.listMemberIds(tripId);
      const slotByUser = new Map(memberIds.map((id, index) => [id, index + 1]));
      const claimedDomains = snapshot.domains.filter((d) =>
        d.claims.some((c) => c.userId === userId),
      );

      for (const domainItem of claimedDomains) {
        const privateWishes = await this.prisma.tripWishItem.findMany({
          where: {
            tripId,
            category: domainItem.domain,
            visibility: 'private',
            status: 'active',
            agentEligible: true,
          },
          orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
        });

        if (privateWishes.length === 0) {
          continue;
        }

        const constraints: DomainPrivateWishConstraint[] = privateWishes.map((w) => ({
          wishId: w.id,
          importance: w.importance,
          text: w.text,
          structuredHints: (w.structuredHints as Record<string, unknown>) ?? null,
          memberSlot: slotByUser.get(w.userId) ?? 0,
        }));

        leaderPrivateBundles.push({
          domain: domainItem.domain,
          domainLabel: domainItem.domainLabel,
          constraints,
        });
      }
    }

    return {
      tripId,
      userId,
      snapshot,
      leaderPrivateBundles,
    };
  }

  /** Structured negotiation task list (F2.3 — medium/high cross domains). */
  async listCollaborativeTasks(
    tripId: string,
    userId: string,
  ): Promise<{ tasks: CollaborativeTaskItem[] }> {
    const snapshot = await this.getSnapshot(tripId, userId);
    const tasks: CollaborativeTaskItem[] = [];

    for (const d of snapshot.domains) {
      const crossLevel = d.decisionRule.crossLevel;
      if (crossLevel === 'low') {
        continue;
      }

      let status = this.resolveCollaborativeTaskStatus(d);
      let activeRoundId: string | null = null;
      let closesAt: string | null =
        status === 'in_discussion' ? this.defaultDiscussionDeadline() : null;

      const roundId = await this.preferenceRoundService.getActiveRoundForDomain(
        tripId,
        d.domain,
      );
      if (roundId) {
        activeRoundId = roundId;
        status = 'in_discussion';
        const row = await this.prisma.tripPreferenceRound.findUnique({
          where: { id: roundId },
          select: { closesAt: true },
        });
        closesAt = row?.closesAt?.toISOString() ?? closesAt;
      }

      const endorsementLine =
        d.claims.length > 0
          ? d.claims
              .map((c) => `${c.displayName} ${c.endorsementCount}/${c.endorsementTotal}`)
              .join(' · ')
          : null;

      tasks.push({
        id: `task:${d.domain}`,
        domain: d.domain,
        title: d.domainLabel,
        description: this.buildTaskDescription(d),
        crossLevel,
        status,
        statusLabel: COLLABORATIVE_STATUS_LABELS[status],
        claimCount: d.claims.length,
        leaderDisplayName: d.leaderDisplayName,
        endorsementSummary: endorsementLine,
        weightSource: d.weightSource,
        closesAt,
        activeRoundId,
      });
    }

    return { tasks };
  }

  private resolveCollaborativeTaskStatus(
    domain: TripDomainBreakdownItem,
  ): CollaborativeTaskStatus {
    if (domain.unclaimed || domain.claims.length === 0) {
      return 'pending';
    }
    if (domain.weightSource === 'negotiation' || domain.weightSource === 'manual') {
      return 'consensus_reached';
    }
    const fullyEndorsed = domain.claims.every(
      (c) => c.endorsementCount >= Math.max(c.endorsementTotal - 1, 1),
    );
    if (fullyEndorsed && domain.claims.length === 1) {
      return 'consensus_reached';
    }
    return 'in_discussion';
  }

  private buildTaskDescription(domain: TripDomainBreakdownItem): string {
    if (domain.impactHints?.length) {
      return `影响：${domain.impactHints.join(' / ')}`;
    }
    return domain.decisionRule.ruleLabelZh;
  }

  private defaultDiscussionDeadline(): string {
    const closes = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return closes.toISOString();
  }

  private async resolveDisplayNames(userIds: string[]): Promise<Map<string, string>> {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const unique = [...new Set(userIds.filter((id) => uuidPattern.test(id)))];
    const map = new Map<string, string>();
    for (const id of userIds) {
      if (!uuidPattern.test(id)) {
        map.set(id, id === 'anonymous-dev-user' ? '开发者' : '同行者');
      }
    }
    if (unique.length === 0) return map;

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true, email: true },
    });
    for (const u of users) {
      map.set(u.id, u.displayName ?? u.email ?? '同行者');
    }
    return map;
  }
}

function groupClaims(claims: ClaimRow[]): Map<WishCategory, ClaimRow[]> {
  const map = new Map<WishCategory, ClaimRow[]>();
  for (const c of claims) {
    const domain = c.domain as WishCategory;
    const list = map.get(domain) ?? [];
    list.push(c);
    map.set(domain, list);
  }
  return map;
}

function groupOverrides(
  rows: Array<{ domain: string; userId: string; weight: number }>,
): Map<WishCategory, Array<{ userId: string; weight: number }>> {
  const map = new Map<WishCategory, Array<{ userId: string; weight: number }>>();
  for (const r of rows) {
    const domain = r.domain as WishCategory;
    const list = map.get(domain) ?? [];
    list.push({ userId: r.userId, weight: r.weight });
    map.set(domain, list);
  }
  return map;
}

function buildImpactHints(
  wishes: Array<{ category: string; text: string; structuredHints: unknown }>,
): Map<WishCategory, string[]> {
  const map = new Map<WishCategory, string[]>();
  for (const w of wishes) {
    const domain = w.category as WishCategory;
    if (!WISH_CATEGORIES.includes(domain)) continue;
    const hints = map.get(domain) ?? [];
    const snippet = w.text.trim().slice(0, 40);
    if (snippet && hints.length < 3 && !hints.includes(snippet)) {
      hints.push(snippet);
    }
    map.set(domain, hints);
  }
  return map;
}

function bump(
  scores: Map<WishCategory, { score: number; reason: string }>,
  domain: WishCategory,
  delta: number,
  reason: string,
): void {
  const prev = scores.get(domain);
  scores.set(domain, {
    score: (prev?.score ?? 0) + delta,
    reason: prev?.reason ?? reason,
  });
}

const COLLABORATIVE_STATUS_LABELS: Record<CollaborativeTaskStatus, string> = {
  pending: '待定',
  in_discussion: '讨论中',
  consensus_reached: '已达成共识',
};
