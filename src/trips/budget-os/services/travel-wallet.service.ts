import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  assertRosterForWalletRule,
  resolveTripWalletRoster,
} from './trip-wallet-roster.service';
import type {
  CreateManualLedgerInput,
  ItineraryCostLedgerInput,
  LedgerEntry,
  LedgerListResult,
  PatchLedgerEntryInput,
  PaymentRule,
  PutWalletRuleInput,
  TravelWallet,
  WalletBalances,
} from '../types/travel-wallet.types';
import {
  buildWalletBalances,
  computeSharePerPerson,
  roundMoney,
} from '../utils/wallet-balances.util';
import { parseBudgetConfig } from '../utils/budget-config.util';
import { toInputJsonValue } from '../utils/prisma-json.util';

type LedgerRow = {
  id: string;
  tripId: string;
  sourceType: string;
  sourceId: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  paidByUserId: string;
  splitAmongUserIds: unknown;
  sharePerPerson: number;
  settled: boolean;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class TravelWalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getWallet(tripId: string): Promise<TravelWallet> {
    await this.requireTrip(tripId);
    const members = await resolveTripWalletRoster(this.prisma, tripId);
    const rule = await this.prisma.tripWalletRule.findUnique({ where: { tripId } });
    const entries = await this.prisma.tripWalletLedgerEntry.findMany({
      where: { tripId },
    });

    const unsettled = entries.filter((e) => !e.settled);
    const totalPaid = roundMoney(
      entries.reduce((sum, e) => sum + e.amount, 0),
    );
    const totalShared = roundMoney(
      unsettled.reduce(
        (sum, e) => sum + e.sharePerPerson * this.parseSplitIds(e.splitAmongUserIds).length,
        0,
      ),
    );

    return {
      tripId,
      paymentRule: rule
        ? { ...this.mapRule(rule), members }
        : null,
      members,
      ledgerSummary: {
        totalPaid,
        totalShared,
        unsettledCount: unsettled.length,
      },
      updatedAt: rule?.updatedAt.toISOString() ?? new Date().toISOString(),
    };
  }

  async putPaymentRule(
    tripId: string,
    input: PutWalletRuleInput,
    options?: { fromConsensusLock?: boolean },
  ): Promise<PaymentRule> {
    await this.requireTrip(tripId);

    if (!options?.fromConsensusLock) {
      const consensus = await this.prisma.tripSplitMechanismConsensus.findUnique({
        where: { tripId },
      });
      if (consensus?.lockedAt) {
        throw new BadRequestException({
          code: 'SPLIT_CONSENSUS_LOCKED',
          message: '分摊机制已锁定，无法修改付款规则',
        });
      }
    }

    const roster = await resolveTripWalletRoster(this.prisma, tripId);
    assertRosterForWalletRule(roster, input.splitBase);

    if (input.splitBase !== roster.length) {
      throw new BadRequestException(
        `splitBase (${input.splitBase}) 须与行程成员数 (${roster.length}) 一致`,
      );
    }

    if (input.mode === 'one_pays' && !input.defaultPayerId) {
      throw new BadRequestException('one_pays 模式需要 defaultPayerId');
    }

    const row = await this.prisma.tripWalletRule.upsert({
      where: { tripId },
      create: {
        tripId,
        mode: input.mode,
        defaultPayerId: input.defaultPayerId ?? null,
        splitBase: input.splitBase,
        categoryRules: input.categoryRules
          ? toInputJsonValue(input.categoryRules)
          : undefined,
      },
      update: {
        mode: input.mode,
        defaultPayerId: input.defaultPayerId ?? null,
        splitBase: input.splitBase,
        categoryRules: input.categoryRules
          ? toInputJsonValue(input.categoryRules)
          : undefined,
      },
    });

    return this.mapRule(row);
  }

  /** Apply wallet rule when split-consensus locks (bypasses SPLIT_CONSENSUS_LOCKED guard). */
  async applyConsensusLockedRule(
    tripId: string,
    input: PutWalletRuleInput,
  ): Promise<PaymentRule> {
    return this.putPaymentRule(tripId, input, { fromConsensusLock: true });
  }

  async listLedger(
    tripId: string,
    options: { settled?: boolean; limit?: number; offset?: number },
  ): Promise<LedgerListResult> {
    await this.requireTrip(tripId);
    const where: { tripId: string; settled?: boolean } = { tripId };
    if (options.settled !== undefined) {
      where.settled = options.settled;
    }

    const [items, total] = await Promise.all([
      this.prisma.tripWalletLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit ?? 50,
        skip: options.offset ?? 0,
      }),
      this.prisma.tripWalletLedgerEntry.count({ where }),
    ]);

    return {
      items: items.map((r) => this.mapEntry(r)),
      total,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    };
  }

  async createManualLedger(
    tripId: string,
    input: CreateManualLedgerInput,
  ): Promise<LedgerEntry> {
    await this.requireTrip(tripId);
    await this.validateSplitMembers(tripId, input.splitAmongUserIds, input.paidByUserId);

    const sharePerPerson = computeSharePerPerson(
      input.amount,
      input.splitAmongUserIds.length,
    );

    const row = await this.prisma.tripWalletLedgerEntry.create({
      data: {
        tripId,
        sourceType: 'manual',
        sourceId: randomUUID(),
        title: input.title,
        category: input.category,
        amount: input.amount,
        currency: input.currency ?? 'CNY',
        paidByUserId: input.paidByUserId,
        splitAmongUserIds: input.splitAmongUserIds,
        sharePerPerson,
      },
    });

    return this.mapEntry(row);
  }

  async patchLedgerEntry(
    tripId: string,
    entryId: string,
    input: PatchLedgerEntryInput,
  ): Promise<LedgerEntry> {
    const existing = await this.prisma.tripWalletLedgerEntry.findFirst({
      where: { id: entryId, tripId },
    });
    if (!existing) {
      throw new NotFoundException(`账本条目 ${entryId} 不存在`);
    }

    const splitAmongUserIds = input.splitAmongUserIds
      ? input.splitAmongUserIds
      : this.parseSplitIds(existing.splitAmongUserIds);

    if (input.splitAmongUserIds) {
      await this.validateSplitMembers(tripId, splitAmongUserIds, existing.paidByUserId);
    }

    const sharePerPerson = input.splitAmongUserIds
      ? computeSharePerPerson(existing.amount, splitAmongUserIds.length)
      : existing.sharePerPerson;

    const row = await this.prisma.tripWalletLedgerEntry.update({
      where: { id: entryId },
      data: {
        splitAmongUserIds: input.splitAmongUserIds ?? undefined,
        sharePerPerson,
        settled: input.settled ?? undefined,
        settledAt: input.settled === true ? new Date() : input.settled === false ? null : undefined,
        version: { increment: 1 },
      },
    });

    return this.mapEntry(row);
  }

  async getBalances(tripId: string): Promise<WalletBalances> {
    await this.requireTrip(tripId);
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    const config = parseBudgetConfig(trip?.budgetConfig);
    const currency = config.currency ?? 'CNY';

    const entries = await this.prisma.tripWalletLedgerEntry.findMany({
      where: { tripId },
    });

    return buildWalletBalances(entries.map((r) => this.mapEntry(r)), currency);
  }

  /**
   * Upsert ledger from itinerary item cost update (autoLedger).
   */
  async syncItineraryItemLedger(input: ItineraryCostLedgerInput): Promise<LedgerEntry | null> {
    const autoLedger = input.autoLedger !== false;
    if (!autoLedger) return null;
    if (!input.isPaid || !input.paidByUserId) return null;
    if (input.amount <= 0) return null;

    const splitAmongUserIds = await this.resolveSplitForExpense(
      input.tripId,
      input.category,
      input.paidByUserId,
      input.splitAmongUserIds,
    );

    const sharePerPerson = computeSharePerPerson(
      input.amount,
      splitAmongUserIds.length,
    );

    const row = await this.prisma.tripWalletLedgerEntry.upsert({
      where: {
        tripId_sourceType_sourceId: {
          tripId: input.tripId,
          sourceType: 'itinerary_item',
          sourceId: input.itemId,
        },
      },
      create: {
        tripId: input.tripId,
        sourceType: 'itinerary_item',
        sourceId: input.itemId,
        title: input.title,
        category: input.category,
        amount: input.amount,
        currency: input.currency,
        paidByUserId: input.paidByUserId,
        splitAmongUserIds,
        sharePerPerson,
      },
      update: {
        title: input.title,
        category: input.category,
        amount: input.amount,
        currency: input.currency,
        paidByUserId: input.paidByUserId,
        splitAmongUserIds,
        sharePerPerson,
        version: { increment: 1 },
      },
    });

    return this.mapEntry(row);
  }

  async hasPaymentRule(tripId: string): Promise<boolean> {
    const rule = await this.prisma.tripWalletRule.findUnique({ where: { tripId } });
    return rule != null;
  }

  async resolveSplitForExpense(
    tripId: string,
    category: string,
    paidByUserId: string,
    explicitSplit?: string[],
  ): Promise<string[]> {
    if (explicitSplit && explicitSplit.length > 0) {
      return explicitSplit;
    }

    const rule = await this.prisma.tripWalletRule.findUnique({ where: { tripId } });
    const roster = await resolveTripWalletRoster(this.prisma, tripId);
    const memberIds = roster.map((m) => m.userId);

    if (!rule) {
      return memberIds.length > 0 ? memberIds : [paidByUserId];
    }

    if (rule.mode === 'one_pays') {
      return [rule.defaultPayerId ?? paidByUserId];
    }

    if (rule.mode === 'by_category' && rule.categoryRules) {
      const catRule = (rule.categoryRules as Record<string, { type?: string; userId?: string }>)[
        category
      ] ?? (rule.categoryRules as Record<string, { type?: string; userId?: string }>)[
        category.toLowerCase()
      ];
      if (catRule?.type === 'one_pays' && catRule.userId) {
        return [catRule.userId];
      }
    }

    if (rule.mode === 'custom') {
      return explicitSplit?.length ? explicitSplit : [paidByUserId];
    }

    const splitCount = Math.min(rule.splitBase, memberIds.length || rule.splitBase);
    return memberIds.length > 0 ? memberIds.slice(0, splitCount) : [paidByUserId];
  }

  private async validateSplitMembers(
    tripId: string,
    splitAmongUserIds: string[],
    paidByUserId: string,
  ): Promise<void> {
    if (splitAmongUserIds.length === 0) {
      throw new BadRequestException('splitAmongUserIds 不能为空');
    }
    const roster = await resolveTripWalletRoster(this.prisma, tripId);
    if (roster.length === 0) return;

    const rosterSet = new Set(roster.map((m) => m.userId));
    for (const uid of [...splitAmongUserIds, paidByUserId]) {
      if (!rosterSet.has(uid)) {
        throw new BadRequestException(`用户 ${uid} 不在行程 roster 中`);
      }
    }
  }

  private mapRule(row: {
    mode: string;
    defaultPayerId: string | null;
    splitBase: number;
    categoryRules: unknown;
  }): PaymentRule {
    return {
      mode: row.mode as PaymentRule['mode'],
      defaultPayerId: row.defaultPayerId,
      splitBase: row.splitBase,
      categoryRules: (row.categoryRules as PaymentRule['categoryRules']) ?? null,
    };
  }

  private mapEntry(row: LedgerRow): LedgerEntry {
    return {
      id: row.id,
      tripId: row.tripId,
      sourceType: row.sourceType as LedgerEntry['sourceType'],
      sourceId: row.sourceId,
      title: row.title,
      category: row.category,
      amount: row.amount,
      currency: row.currency,
      paidByUserId: row.paidByUserId,
      splitAmongUserIds: this.parseSplitIds(row.splitAmongUserIds),
      sharePerPerson: row.sharePerPerson,
      settled: row.settled,
      settledAt: row.settledAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private parseSplitIds(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return raw.filter((x): x is string => typeof x === 'string');
    }
    return [];
  }

  private async requireTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }
    return trip;
  }
}
