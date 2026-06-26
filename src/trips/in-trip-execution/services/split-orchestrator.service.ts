import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { TravelEventPersistenceService } from '../../event-store/travel-event-persistence.service';
import {
  TrajectorySegment,
  TravelEventSource,
  TravelEventType,
} from '../../event-store/types/travel-event.types';
import { buildTravelEventEnvelope } from '../../event-store/travel-event-envelope.builder';
import type { InTripAnchorSnapshot } from '../types/anchor-handoff.types';
import type {
  ActiveSplitContext,
  LocationHeartbeatInput,
  ProposeSplitInput,
  ReunionUpdateInput,
  ShareExperienceInput,
  SharedNode,
  SplitCostRouting,
  SplitPartyGroup,
  SplitPartySessionDetail,
  SplitPartySessionSummary,
} from '../types/split-orchestrator.types';
import { resolveTripDayNumber } from '../utils/in-trip-day.util';
import { AnchorHandoffService } from './anchor-handoff.service';
import { InTripAccessService } from './in-trip-access.service';

type SessionRow = {
  id: string;
  tripId: string;
  dayNumber: number;
  triggerReason: string;
  status: string;
  groups: unknown;
  sharedNodes: unknown;
  costRouting: unknown;
  experienceSharing: unknown;
  reunion: unknown;
  satisfaction: unknown;
  proposedAt: Date;
  executedAt: Date | null;
};

@Injectable()
export class SplitOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly anchorHandoff: AnchorHandoffService,
    @Optional() private readonly travelEventPersistence?: TravelEventPersistenceService,
  ) {}

  async propose(
    tripId: string,
    userId: string,
    input: ProposeSplitInput = {},
  ): Promise<SplitPartySessionDetail> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const trip = await this.access.requireTrip(tripId);
    const dayNumber = resolveTripDayNumber(trip.startDate, trip.endDate);
    const anchor = await this.anchorHandoff.getSnapshot(tripId);
    if (!anchor) {
      throw new BadRequestException('锚点尚未物化，无法生成分组方案');
    }

    const memberIds = anchor.team.members.map((m) => m.userId);
    if (memberIds.length < 2) {
      throw new BadRequestException('分组活动至少需要 2 名成员');
    }

    const groups = this.buildGroups(anchor, memberIds, input.forceSolo ?? false);
    const sharedNodes = this.buildSharedNodes(anchor, dayNumber);
    const costRouting: SplitCostRouting = {
      defaultRule: 'group_aa',
      sharedNodeRule: 'full_trip_aa',
    };

    const row = await this.prisma.tripSplitPartySession.create({
      data: {
        tripId,
        dayNumber,
        triggerReason: input.triggerReason ?? 'manual_propose',
        status: 'proposed',
        groups: toInputJsonValue(groups),
        sharedNodes: toInputJsonValue(sharedNodes),
        costRouting: toInputJsonValue(costRouting),
        experienceSharing: toInputJsonValue([]),
        proposedAt: new Date(),
      },
    });

    await this.persistEvent(tripId, TravelEventType.TRIP_IN_TRIP_SPLIT_PROPOSED, {
      sessionId: row.id,
      groupCount: groups.length,
    });

    return this.toDetail(row);
  }

  async listSessions(tripId: string, userId: string): Promise<SplitPartySessionSummary[]> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const rows = await this.prisma.tripSplitPartySession.findMany({
      where: { tripId },
      orderBy: { proposedAt: 'desc' },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async getSession(
    tripId: string,
    sessionId: string,
    userId: string,
  ): Promise<SplitPartySessionDetail> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const row = await this.prisma.tripSplitPartySession.findFirst({
      where: { id: sessionId, tripId },
    });
    if (!row) throw new NotFoundException(`分组 session ${sessionId} 不存在`);
    return this.toDetail(row);
  }

  async execute(
    tripId: string,
    sessionId: string,
    userId: string,
  ): Promise<SplitPartySessionDetail> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertOrganizer(tripId, userId);

    const row = await this.prisma.tripSplitPartySession.findFirst({
      where: { id: sessionId, tripId },
    });
    if (!row) throw new NotFoundException(`分组 session ${sessionId} 不存在`);
    if (row.status !== 'proposed') {
      throw new BadRequestException('仅 proposed 状态可执行');
    }

    await this.prisma.tripSplitPartySession.updateMany({
      where: { tripId, status: 'active' },
      data: { status: 'reunited' },
    });

    const updated = await this.prisma.tripSplitPartySession.update({
      where: { id: sessionId },
      data: { status: 'active', executedAt: new Date() },
    });

    await this.persistEvent(tripId, TravelEventType.TRIP_IN_TRIP_SPLIT_EXECUTED, {
      sessionId,
    });

    return this.toDetail(updated);
  }

  async shareExperience(
    tripId: string,
    sessionId: string,
    userId: string,
    input: ShareExperienceInput,
  ): Promise<SplitPartySessionDetail> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const row = await this.prisma.tripSplitPartySession.findFirst({
      where: { id: sessionId, tripId },
    });
    if (!row) throw new NotFoundException(`分组 session ${sessionId} 不存在`);

    const sharing = Array.isArray(row.experienceSharing)
      ? [...(row.experienceSharing as object[])]
      : [];
    sharing.push({
      groupId: input.groupId,
      text: input.text,
      sharedAt: new Date().toISOString(),
      userId,
    });

    const updated = await this.prisma.tripSplitPartySession.update({
      where: { id: sessionId },
      data: { experienceSharing: toInputJsonValue(sharing) },
    });
    return this.toDetail(updated);
  }

  async updateReunion(
    tripId: string,
    sessionId: string,
    userId: string,
    input: ReunionUpdateInput,
  ): Promise<SplitPartySessionDetail> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const row = await this.prisma.tripSplitPartySession.findFirst({
      where: { id: sessionId, tripId },
    });
    if (!row) throw new NotFoundException(`分组 session ${sessionId} 不存在`);

    const reunion = {
      status: input.status,
      meetingPoint: input.meetingPoint,
      updatedAt: new Date().toISOString(),
    };

    const data: { reunion: ReturnType<typeof toInputJsonValue>; status?: string } = {
      reunion: toInputJsonValue(reunion),
    };
    if (input.status === 'completed') {
      data.status = 'reunited';
    }

    const updated = await this.prisma.tripSplitPartySession.update({
      where: { id: sessionId },
      data,
    });
    return this.toDetail(updated);
  }

  async recordLocation(
    tripId: string,
    sessionId: string,
    userId: string,
    input: LocationHeartbeatInput,
  ): Promise<SplitPartySessionDetail> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const row = await this.prisma.tripSplitPartySession.findFirst({
      where: { id: sessionId, tripId, status: 'active' },
    });
    if (!row) throw new NotFoundException(`活跃分组 session ${sessionId} 不存在`);

    const groups = (row.groups as unknown as SplitPartyGroup[]).map((g) => {
      if (g.groupId !== input.groupId) return g;
      if (!g.memberIds.includes(userId)) return g;
      return {
        ...g,
        lastLocation: {
          lat: input.lat,
          lng: input.lng,
          updatedAt: new Date().toISOString(),
        },
      };
    });

    const updated = await this.prisma.tripSplitPartySession.update({
      where: { id: sessionId },
      data: { groups: toInputJsonValue(groups) },
    });
    return this.toDetail(updated);
  }

  async getActiveContext(tripId: string): Promise<ActiveSplitContext | null> {
    const row = await this.prisma.tripSplitPartySession.findFirst({
      where: { tripId, status: 'active' },
      orderBy: { executedAt: 'desc' },
    });
    if (!row) return null;

    const groups = row.groups as unknown as SplitPartyGroup[];
    const sharedNodes = row.sharedNodes as unknown as SharedNode[];
    const allMemberIds = [...new Set(groups.flatMap((g) => g.memberIds))];

    return {
      sessionId: row.id,
      dayNumber: row.dayNumber,
      groups,
      sharedNodes,
      allMemberIds,
    };
  }

  resolveSplitAmong(
    context: ActiveSplitContext | null,
    paidByUserId: string,
    allTripMemberIds: string[],
    merchant?: string,
  ): { splitAmongUserIds: string[]; splitGroupId: string | null } {
    if (!context) {
      return { splitAmongUserIds: allTripMemberIds, splitGroupId: null };
    }

    const payerGroup = context.groups.find((g) => g.memberIds.includes(paidByUserId));
    if (payerGroup) {
      return {
        splitAmongUserIds: payerGroup.memberIds,
        splitGroupId: payerGroup.groupId,
      };
    }

    const isShared = context.sharedNodes.some((n) =>
      (merchant ?? '').toLowerCase().includes(n.title.toLowerCase()),
    );
    if (isShared) {
      return { splitAmongUserIds: allTripMemberIds, splitGroupId: null };
    }

    return {
      splitAmongUserIds: allTripMemberIds,
      splitGroupId: null,
    };
  }

  private buildGroups(
    anchor: InTripAnchorSnapshot,
    memberIds: string[],
    forceSolo: boolean,
  ): SplitPartyGroup[] {
    const redPairs = anchor.team.highRiskAlerts.map(
      (a) => [a.memberAId, a.memberBId] as [string, string],
    );
    const groupA: string[] = [];
    const groupB: string[] = [];

    for (const id of memberIds) {
      const frictionWithA = redPairs.some(
        ([a, b]) =>
          (a === id && groupA.includes(b)) || (b === id && groupA.includes(a)),
      );
      if (frictionWithA) groupB.push(id);
      else if (groupA.length <= groupB.length) groupA.push(id);
      else groupB.push(id);
    }

    if (!forceSolo) {
      if (groupA.length === 1 && memberIds.length > 2) {
        groupB.push(groupA.pop()!);
      }
      if (groupB.length === 1 && memberIds.length > 2) {
        groupA.push(groupB.pop()!);
      }
    }

    const todayItems =
      anchor.itinerary.days[Math.min(anchor.itinerary.days.length - 1, 0)]?.items ?? [];

    return [
      this.makeGroup('group-a', '探索 A 组', groupA, todayItems, 'high'),
      this.makeGroup('group-b', '探索 B 组', groupB, todayItems.slice().reverse(), 'medium'),
    ].filter((g) => g.memberIds.length > 0);
  }

  private makeGroup(
    groupId: string,
    label: string,
    memberIds: string[],
    items: InTripAnchorSnapshot['itinerary']['days'][number]['items'],
    staminaFit: SplitPartyGroup['staminaFit'],
  ): SplitPartyGroup {
    const route = items.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      startTime: item.startTime,
      estimatedDurationMin: 90,
    }));
    return { groupId, label, memberIds, route, staminaFit };
  }

  private buildSharedNodes(anchor: InTripAnchorSnapshot, dayNumber: number): SharedNode[] {
    const day =
      anchor.itinerary.days[dayNumber - 1] ??
      anchor.itinerary.days[anchor.itinerary.days.length - 1];
    const meal = day?.items.find((i) => i.category === 'food' || i.type === 'MEAL');
    const meet = day?.items[0];

    const nodes: SharedNode[] = [];
    if (meal) {
      nodes.push({
        nodeId: randomUUID(),
        type: 'meal',
        title: meal.title,
        time: meal.startTime ?? '18:00',
        participantScope: 'all',
      });
    }
    if (meet) {
      nodes.push({
        nodeId: randomUUID(),
        type: 'meeting_point',
        title: `${meet.title} 汇合点`,
        time: meet.startTime ?? '17:30',
        participantScope: 'all',
      });
    }
    return nodes;
  }

  private toSummary(row: SessionRow): SplitPartySessionSummary {
    const groups = row.groups as unknown as SplitPartyGroup[];
    const sharedNodes = row.sharedNodes as unknown as SharedNode[];
    return {
      id: row.id,
      tripId: row.tripId,
      dayNumber: row.dayNumber,
      triggerReason: row.triggerReason,
      status: row.status as SplitPartySessionSummary['status'],
      groupCount: groups.length,
      sharedNodeCount: sharedNodes.length,
      proposedAt: row.proposedAt.toISOString(),
      executedAt: row.executedAt?.toISOString() ?? null,
    };
  }

  private toDetail(row: SessionRow): SplitPartySessionDetail {
    const summary = this.toSummary(row);
    return {
      ...summary,
      groups: row.groups as unknown as SplitPartyGroup[],
      sharedNodes: row.sharedNodes as unknown as SharedNode[],
      costRouting: row.costRouting as unknown as SplitCostRouting,
      experienceSharing: row.experienceSharing as unknown as SplitPartySessionDetail['experienceSharing'],
      reunion: row.reunion as unknown as SplitPartySessionDetail['reunion'],
      satisfaction: row.satisfaction as unknown as SplitPartySessionDetail['satisfaction'],
    };
  }

  private async persistEvent(
    tripId: string,
    eventType: TravelEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.travelEventPersistence) return;
    await this.travelEventPersistence.persist(
      buildTravelEventEnvelope({
        tripId,
        segment:
          eventType === TravelEventType.TRIP_IN_TRIP_SPLIT_PROPOSED
            ? TrajectorySegment.DECISION
            : TrajectorySegment.ACTION,
        eventType,
        source: TravelEventSource.IN_TRIP_EXECUTION,
        payload,
        idempotencyKey: `${eventType}:${tripId}:${payload.sessionId}`,
        schemaVersion: 1,
      }),
    );
  }
}
