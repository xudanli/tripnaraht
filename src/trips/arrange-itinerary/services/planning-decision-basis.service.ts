import {
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripConflictsService } from '../../services/trip-conflicts.service';
import type { ConflictDto } from '../../dto/trip-conflicts.dto';
import type {
  PlanningDecisionBasis,
  PlanningWhatHappened,
} from '../types/planning-decision-basis.types';
import { PlanProposalStoreService } from './plan-proposal-store.service';
import {
  buildContextFields,
  buildPlanningDecisionBasis,
  pickPrimaryConflict,
  type ItemContextInput,
} from '../utils/planning-decision-basis.projection.util';
import { resolveDecisionBasisFocus } from '../utils/resolve-conflict-lookup-ids.util';

@Injectable()
export class PlanningDecisionBasisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: PlanProposalStoreService,
    @Optional() private readonly tripConflicts?: TripConflictsService,
  ) {}

  async getBasis(
    tripId: string,
    opts?: { conflictId?: string; proposalId?: string; problemId?: string },
  ): Promise<PlanningDecisionBasis> {
    const focus = resolveDecisionBasisFocus({
      conflictId: opts?.conflictId,
      problemId: opts?.problemId,
    });
    const conflicts = await this.loadConflicts(tripId);
    const conflict =
      focus.lookupIds.length > 0
        ? pickPrimaryConflict(conflicts, undefined, focus.lookupIds)
        : pickPrimaryConflict(conflicts);

    const proposal = opts?.proposalId
      ? this.loadProposal(tripId, opts.proposalId)
      : undefined;

    const dayIndex = conflict?.toDayNumber ?? conflict?.fromDayNumber;
    const [fromItem, toItem, lunchItem] = conflict
      ? await Promise.all([
          this.loadItem(conflict.fromItemId),
          this.loadItem(conflict.toItemId),
          dayIndex != null ? this.findLunchItem(tripId, dayIndex) : undefined,
        ])
      : [undefined, undefined, undefined];

    const updatedAt = new Date().toISOString();
    const dataValidUntil = DateTime.utc().set({ hour: 18, minute: 0, second: 0 }).toISO()!;

    const contextFields = conflict
      ? buildContextFields({
          conflict,
          fromItem,
          toItem,
          lunchItem,
          dataValidUntil,
          updatedAt,
        })
      : [];

    const optionCount = this.countOptions(proposal, conflict);
    const problemWhatHappened =
      !conflict && focus.problemId
        ? await this.loadProblemWhatHappened(tripId, focus.problemId)
        : undefined;

    if (
      (opts?.conflictId || opts?.problemId) &&
      !conflict &&
      !problemWhatHappened &&
      !focus.allowMissingConflict
    ) {
      throw new NotFoundException(
        `冲突 ${opts?.conflictId ?? opts?.problemId} 不存在`,
      );
    }

    return buildPlanningDecisionBasis({
      tripId,
      conflict,
      problemWhatHappened,
      problemId: focus.problemId,
      contextFields,
      proposalId: opts?.proposalId,
      optionCount:
        optionCount ??
        (problemWhatHappened ? await this.countProblemOptions(tripId, focus.problemId) : undefined),
      dataValidUntil,
      updatedAt,
    });
  }

  private async loadConflicts(tripId: string): Promise<ConflictDto[]> {
    if (!this.tripConflicts) return [];
    try {
      const res = await this.tripConflicts.getConflicts(tripId);
      return res.conflicts ?? [];
    } catch {
      return [];
    }
  }

  private loadProposal(tripId: string, proposalId: string) {
    const proposal = this.store.get(proposalId);
    if (!proposal || proposal.tripId !== tripId) {
      throw new NotFoundException(`规划草案 ${proposalId} 不存在或已过期`);
    }
    return proposal;
  }

  private async loadProblemWhatHappened(
    tripId: string,
    problemId: string,
  ): Promise<PlanningWhatHappened | undefined> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const byId =
      ((meta.decisionCases as { byProblemId?: Record<string, unknown> } | undefined)
        ?.byProblemId ?? {}) as Record<
        string,
        { title?: string; summary?: string; options?: unknown[] }
      >;
    const row = byId[problemId];
    if (!row?.title && !row?.summary) {
      return {
        headline: '发生了什么？',
        narrative: '这是一条决策空间问题（非行程时间冲突）；请在决策卡中选择方案。',
        conflictId: problemId,
      };
    }
    return {
      headline: '发生了什么？',
      narrative: [row.title, row.summary].filter(Boolean).join(' — '),
      conflictId: problemId,
    };
  }

  private async countProblemOptions(
    tripId: string,
    problemId?: string,
  ): Promise<number | undefined> {
    if (!problemId) return undefined;
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const byId =
      ((meta.decisionCases as { byProblemId?: Record<string, { options?: unknown[] }> } | undefined)
        ?.byProblemId ?? {}) as Record<string, { options?: unknown[] }>;
    const n = byId[problemId]?.options?.length;
    return typeof n === 'number' && n > 0 ? n : undefined;
  }

  private async loadItem(itemId?: string): Promise<ItemContextInput | undefined> {
    if (!itemId) return undefined;
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: { Place: { select: { nameCN: true, nameEN: true } } },
    });
    if (!item) return undefined;
    return {
      id: item.id,
      placeId: item.placeId,
      type: item.type,
      note: item.note,
      startTime: item.startTime,
      endTime: item.endTime,
      bookingStatus: item.bookingStatus,
      bookingConfirmation: item.bookingConfirmation,
      bookedAt: item.bookedAt,
      isPaid: item.isPaid,
      Place: item.Place,
    };
  }

  private async findLunchItem(
    tripId: string,
    dayIndex: number,
  ): Promise<ItemContextInput | undefined> {
    const days = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      select: { id: true },
    });
    const tripDayId = days[dayIndex - 1]?.id;
    if (!tripDayId) return undefined;

    const items = await this.prisma.itineraryItem.findMany({
      where: { tripDayId },
      include: {
        Place: { select: { nameCN: true, nameEN: true, category: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    const lunch = items.find((item) => {
      if (item.type === 'REST') return false;
      if (item.Place?.category === 'SUPPLY') return false;
      if (item.type === 'MEAL_ANCHOR' || item.type === 'MEAL_FLOATING') return true;
      if (/午餐|午饭|lunch|用餐/i.test(item.note ?? '')) return true;
      return false;
    });

    if (!lunch) return undefined;
    return {
      id: lunch.id,
      placeId: lunch.placeId,
      type: lunch.type,
      note: lunch.note,
      startTime: lunch.startTime,
      endTime: lunch.endTime,
      bookingStatus: lunch.bookingStatus,
      bookingConfirmation: lunch.bookingConfirmation,
      bookedAt: lunch.bookedAt,
      isPaid: lunch.isPaid,
      Place: lunch.Place,
    };
  }

  private countOptions(
    proposal?: NonNullable<ReturnType<PlanProposalStoreService['get']>>,
    conflict?: ConflictDto,
  ): number | undefined {
    if (proposal?.decisionPack?.options?.length) {
      return proposal.decisionPack.options.filter((o) => !o.id.endsWith('_discard')).length;
    }
    const suggestions = conflict?.suggestions?.length ?? 0;
    return suggestions > 0 ? suggestions : undefined;
  }
}
