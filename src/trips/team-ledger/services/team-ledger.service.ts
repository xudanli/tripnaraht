import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type {
  CreateLedgerExpenseDto,
  NotifyLedgerSettlementDto,
  UpdateLedgerExpenseDto,
} from '../dto/team-ledger.dto';
import type {
  LedgerExpenseStatus,
  TeamLedgerExpense,
  TeamLedgerMember,
  TeamLedgerNotifyResult,
  TeamLedgerOverview,
  TeamLedgerSettlement,
  TeamLedgerTransferConfirmResult,
} from '../types/team-ledger.types';
import {
  buildSettlementTransfers,
  confirmKey,
} from '../utils/settlement.util';
import { TeamLedgerAccessService } from './team-ledger-access.service';
import { TeamLedgerMembersService } from './team-ledger-members.service';

const RECENT_LIMIT = 20;
const TIP_MESSAGE = '系统已合并重复往来，按最少转账次数结算';

type ExpenseRow = {
  id: string;
  tripId: string;
  title: string;
  payerMemberId: string;
  amountCents: number;
  currency: string;
  occurredAt: Date;
  status: string;
  splitMemberIds: Prisma.JsonValue;
  itineraryItemId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

@Injectable()
export class TeamLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TeamLedgerAccessService,
    private readonly members: TeamLedgerMembersService,
  ) {}

  async getOverview(tripId: string, userId: string): Promise<TeamLedgerOverview> {
    await this.access.assertTripMember(tripId, userId);
    const memberList = await this.members.listMembers(tripId);
    const memberById = new Map(memberList.map((m) => [m.id, m]));

    const [recordCount, allActive, recent] = await Promise.all([
      this.prisma.tripLedgerExpense.count({
        where: { tripId, deletedAt: null },
      }),
      this.prisma.tripLedgerExpense.findMany({
        where: { tripId, deletedAt: null },
        select: { amountCents: true, status: true, currency: true },
      }),
      this.prisma.tripLedgerExpense.findMany({
        where: { tripId, deletedAt: null },
        orderBy: { occurredAt: 'desc' },
        take: RECENT_LIMIT,
      }),
    ]);

    const currency = allActive[0]?.currency ?? 'CNY';
    const totalSpentCents = allActive.reduce((s, e) => s + e.amountCents, 0);
    const pendingSettlementCents = allActive
      .filter((e) => e.status === 'pending')
      .reduce((s, e) => s + e.amountCents, 0);

    const splitAdultCount = Math.max(
      1,
      memberList.filter((m) => m.participatesInSplit).length,
    );

    return {
      summary: {
        totalSpentCents,
        averagePerPersonCents: Math.round(totalSpentCents / splitAdultCount),
        pendingSettlementCents,
        recordCount,
        currency,
      },
      members: memberList,
      recentExpenses: recent.map((row) => this.mapExpense(row, memberById)),
    };
  }

  async getExpense(
    tripId: string,
    expenseId: string,
    userId: string,
  ): Promise<TeamLedgerExpense> {
    await this.access.assertTripMember(tripId, userId);
    const row = await this.requireExpense(tripId, expenseId);
    const memberById = await this.members.getMemberMap(tripId);
    return this.mapExpense(row, memberById);
  }

  async createExpense(
    tripId: string,
    userId: string,
    dto: CreateLedgerExpenseDto,
  ): Promise<TeamLedgerExpense> {
    await this.access.assertTripMember(tripId, userId);
    const memberList = await this.members.listMembers(tripId);
    this.validateMembers(memberList, dto.payerMemberId, dto.splitMemberIds);
    const itineraryItemId = await this.resolveItineraryItemId(
      tripId,
      dto.itineraryItemId,
    );

    const row = await this.prisma.tripLedgerExpense.create({
      data: {
        tripId,
        title: dto.title.trim(),
        payerMemberId: dto.payerMemberId,
        amountCents: dto.amountCents,
        currency: dto.currency?.trim() || 'CNY',
        occurredAt: new Date(dto.occurredAt),
        status: 'pending',
        splitMemberIds: toInputJsonValue([...new Set(dto.splitMemberIds)]),
        itineraryItemId,
        createdByUserId: userId,
      },
    });

    const memberById = new Map(memberList.map((m) => [m.id, m]));
    return this.mapExpense(row, memberById);
  }

  async updateExpense(
    tripId: string,
    expenseId: string,
    userId: string,
    dto: UpdateLedgerExpenseDto,
  ): Promise<TeamLedgerExpense> {
    await this.access.assertTripMember(tripId, userId);
    const existing = await this.requireExpense(tripId, expenseId);

    if (existing.status === 'settled') {
      const touchesMoney =
        dto.amountCents !== undefined ||
        dto.splitMemberIds !== undefined ||
        dto.payerMemberId !== undefined;
      if (touchesMoney) {
        throw new ConflictException('已结清记录不可修改金额或分摊');
      }
    }

    const memberList = await this.members.listMembers(tripId);
    const payerMemberId = dto.payerMemberId ?? existing.payerMemberId;
    const splitMemberIds =
      dto.splitMemberIds ?? this.parseSplitIds(existing.splitMemberIds);
    this.validateMembers(memberList, payerMemberId, splitMemberIds);

    if (dto.title !== undefined && !dto.title.trim()) {
      throw new BadRequestException('请填写事项');
    }

    const itineraryItemId =
      dto.itineraryItemId !== undefined
        ? await this.resolveItineraryItemId(tripId, dto.itineraryItemId)
        : undefined;

    const row = await this.prisma.tripLedgerExpense.update({
      where: { id: expenseId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.payerMemberId !== undefined
          ? { payerMemberId: dto.payerMemberId }
          : {}),
        ...(dto.amountCents !== undefined ? { amountCents: dto.amountCents } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency.trim() } : {}),
        ...(dto.occurredAt !== undefined
          ? { occurredAt: new Date(dto.occurredAt) }
          : {}),
        ...(dto.splitMemberIds !== undefined
          ? {
              splitMemberIds: toInputJsonValue([
                ...new Set(dto.splitMemberIds),
              ]),
            }
          : {}),
        ...(itineraryItemId !== undefined ? { itineraryItemId } : {}),
      },
    });

    const memberById = new Map(memberList.map((m) => [m.id, m]));
    return this.mapExpense(row, memberById);
  }

  async deleteExpense(
    tripId: string,
    expenseId: string,
    userId: string,
  ): Promise<{ deleted: true; expenseId: string }> {
    await this.access.assertTripMember(tripId, userId);
    const existing = await this.requireExpense(tripId, expenseId);
    if (existing.status === 'settled') {
      throw new ConflictException('已结清记录不可删除');
    }

    await this.prisma.tripLedgerExpense.update({
      where: { id: expenseId },
      data: { deletedAt: new Date() },
    });

    return { deleted: true, expenseId };
  }

  async getSettlement(
    tripId: string,
    userId: string,
  ): Promise<TeamLedgerSettlement> {
    await this.access.assertTripMember(tripId, userId);
    const memberList = await this.members.listMembers(tripId);
    const memberById = new Map(memberList.map((m) => [m.id, m]));

    const pending = await this.prisma.tripLedgerExpense.findMany({
      where: { tripId, deletedAt: null, status: 'pending' },
      orderBy: { occurredAt: 'asc' },
    });

    const currency = pending[0]?.currency ?? 'CNY';
    const expenses = pending.map((row) => ({
      amountCents: row.amountCents,
      payerMemberId: row.payerMemberId,
      splitMemberIds: this.parseSplitIds(row.splitMemberIds),
    }));

    const confirms = await this.prisma.tripLedgerTransferConfirm.findMany({
      where: { tripId, status: 'settled' },
    });
    const confirmKeys = new Set(
      confirms.map((c) =>
        confirmKey(c.fromMemberId, c.toMemberId, c.amountCents),
      ),
    );

    const built = buildSettlementTransfers({
      tripId,
      expenses,
      memberById,
      confirmKeys,
    });

    const settledCount = built.transfers.filter((t) => t.status === 'settled').length;
    const pendingCount = built.transfers.filter((t) => t.status === 'pending').length;

    return {
      pendingTotalCents: built.pendingTotalCents,
      involvedCount: built.involvedCount,
      autoOffsetLabel: built.autoOffsetLabel,
      tipMessage: TIP_MESSAGE,
      currency,
      transfers: built.transfers,
      settledCount,
      pendingCount,
    };
  }

  async notifySettlement(
    tripId: string,
    userId: string,
    _dto?: NotifyLedgerSettlementDto,
  ): Promise<TeamLedgerNotifyResult> {
    await this.access.assertTripMember(tripId, userId);
    const settlement = await this.getSettlement(tripId, userId);
    const notified = new Set<string>();
    for (const t of settlement.transfers) {
      notified.add(t.from.id);
      notified.add(t.to.id);
    }
    // Push/in-app delivery is optional P0; ids are returned for client confirmation.
    return {
      notifiedMemberIds: [...notified],
      sentAt: new Date().toISOString(),
    };
  }

  /**
   * Confirm one settlement transfer edge → writes trip_ledger_transfer_confirms.
   * Idempotent when already confirmed.
   */
  async confirmTransfer(
    tripId: string,
    transferId: string,
    userId: string,
  ): Promise<TeamLedgerTransferConfirmResult> {
    await this.access.assertTripMember(tripId, userId);
    const settlement = await this.getSettlement(tripId, userId);
    const target = settlement.transfers.find((t) => t.id === transferId);
    if (!target) {
      throw new NotFoundException(`转账 ${transferId} 不存在或已不在当前结算图中`);
    }

    const confirmedAt = new Date();
    await this.prisma.tripLedgerTransferConfirm.upsert({
      where: {
        tripId_fromMemberId_toMemberId_amountCents: {
          tripId,
          fromMemberId: target.from.id,
          toMemberId: target.to.id,
          amountCents: target.amountCents,
        },
      },
      create: {
        tripId,
        fromMemberId: target.from.id,
        toMemberId: target.to.id,
        amountCents: target.amountCents,
        status: 'settled',
        confirmedAt,
      },
      update: {
        status: 'settled',
        confirmedAt,
      },
    });

    return {
      transfer: {
        ...target,
        status: 'settled',
      },
      confirmedAt: confirmedAt.toISOString(),
    };
  }

  private async requireExpense(
    tripId: string,
    expenseId: string,
  ): Promise<ExpenseRow> {
    const row = await this.prisma.tripLedgerExpense.findFirst({
      where: { id: expenseId, tripId, deletedAt: null },
    });
    if (!row) {
      throw new NotFoundException(`记账 ${expenseId} 不存在`);
    }
    return row;
  }

  private validateMembers(
    members: TeamLedgerMember[],
    payerMemberId: string,
    splitMemberIds: string[],
  ): void {
    const ids = new Set(members.map((m) => m.id));
    // Dev/anonymous trips may have empty roster — still require consistent ids
    if (ids.size > 0) {
      if (!ids.has(payerMemberId)) {
        throw new BadRequestException('付款人不存在');
      }
      for (const mid of splitMemberIds) {
        if (!ids.has(mid)) {
          throw new BadRequestException('分摊成员无效');
        }
      }
    }
    if (!payerMemberId?.trim()) {
      throw new BadRequestException('付款人不存在');
    }
    if (!splitMemberIds?.length) {
      throw new BadRequestException('请选择分摊成员');
    }
  }

  private async resolveItineraryItemId(
    tripId: string,
    raw: string | null | undefined,
  ): Promise<string | null> {
    if (raw === undefined || raw === null) return null;
    const itemId = raw.trim();
    if (!itemId) return null;

    const item = await this.prisma.itineraryItem.findFirst({
      where: { id: itemId, TripDay: { tripId } },
      select: { id: true },
    });
    if (!item) {
      throw new BadRequestException('关联行程活动不存在');
    }
    return item.id;
  }

  private parseSplitIds(raw: Prisma.JsonValue): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is string => typeof id === 'string');
  }

  private mapExpense(
    row: ExpenseRow,
    memberById: Map<string, TeamLedgerMember>,
  ): TeamLedgerExpense {
    const splitMemberIds = this.parseSplitIds(row.splitMemberIds);
    const fallback = (id: string): TeamLedgerMember => ({
      id,
      name: id.slice(0, 8),
      avatarUrl: null,
      participatesInSplit: true,
    });

    return {
      id: row.id,
      tripId: row.tripId,
      title: row.title,
      payer: memberById.get(row.payerMemberId) ?? fallback(row.payerMemberId),
      amountCents: row.amountCents,
      currency: row.currency,
      occurredAt: row.occurredAt.toISOString(),
      status: (row.status === 'settled' ? 'settled' : 'pending') as LedgerExpenseStatus,
      splitMemberIds,
      splitMembers: splitMemberIds.map(
        (id) => memberById.get(id) ?? fallback(id),
      ),
      itineraryItemId: row.itineraryItemId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
