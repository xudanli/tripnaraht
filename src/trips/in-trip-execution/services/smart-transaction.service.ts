import {
  BadRequestException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { TravelWalletService } from '../../budget-os/services/travel-wallet.service';
import { TripBudgetProfileService } from '../../budget-os/services/trip-budget-profile.service';
import type { CategoryAllocations } from '../../budget-os/types/trip-budget-os.types';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { TravelEventPersistenceService } from '../../event-store/travel-event-persistence.service';
import {
  TrajectorySegment,
  TravelEventSource,
  TravelEventType,
} from '../../event-store/types/travel-event.types';
import { buildTravelEventEnvelope } from '../../event-store/travel-event-envelope.builder';
import type {
  MoneyDashboard,
  MoneyNudge,
  RecordTransactionInput,
  RecordTransactionResult,
  SmartTransactionSummary,
} from '../types/money-brain.types';
import {
  PSYCHOLOGICAL_BUCKETS,
  assignBucket,
  bucketLabel,
  toLedgerCategory,
} from '../utils/bucket-assignment.util';
import { convertToCny } from '../utils/exchange-rate.util';
import { defaultTripTimezone } from '../utils/in-trip-config.util';
import { SplitOrchestratorService } from './split-orchestrator.service';
import { AnchorHandoffService } from './anchor-handoff.service';
import { BudgetRebalanceService } from './budget-rebalance.service';
import { InTripAccessService } from './in-trip-access.service';
import { MoneyBrainNudgeService } from './money-brain-nudge.service';

type TxRow = {
  id: string;
  tripId: string;
  memberId: string;
  ledgerEntryId: string | null;
  amountLocal: number;
  currencyLocal: string;
  amountCny: number;
  exchangeRate: number;
  category: string;
  merchant: string | null;
  description: string | null;
  captureMethod: string;
  bucketAssignment: string;
  spendRationality: string | null;
  nudgesTriggered: unknown;
  recordedAt: Date;
};

@Injectable()
export class SmartTransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly wallet: TravelWalletService,
    private readonly budgetProfile: TripBudgetProfileService,
    private readonly anchorHandoff: AnchorHandoffService,
    private readonly nudgeService: MoneyBrainNudgeService,
    private readonly rebalance: BudgetRebalanceService,
    private readonly splitOrchestrator: SplitOrchestratorService,
    @Optional() private readonly travelEventPersistence?: TravelEventPersistenceService,
  ) {}

  async getDashboard(tripId: string, userId: string): Promise<MoneyDashboard> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const profile = await this.budgetProfile.getProfile(tripId, ['actuals']);
    const currency = profile.intent?.currency ?? 'CNY';
    const dailyBudget = profile.intent?.dailyBudget ?? null;
    const intentTotal = profile.intent?.total;

    const bucketActuals = await this.sumBucketActuals(tripId);
    const buckets = PSYCHOLOGICAL_BUCKETS.map((bucket) => {
      const planned = this.plannedAmount(bucket, profile.structure?.allocations, intentTotal);
      const actual = bucketActuals[bucket] ?? 0;
      const usagePercent = planned > 0 ? Math.round((actual / planned) * 100) : 0;
      return {
        bucket,
        label: bucketLabel(bucket),
        planned,
        actual: Math.round(actual * 100) / 100,
        usagePercent,
        currency,
      };
    });

    const tz = defaultTripTimezone(profile.intent ? undefined : undefined);
    const startOfDay = DateTime.now().setZone(tz).startOf('day').toJSDate();
    const todayRows = await this.prisma.tripSmartTransaction.findMany({
      where: { tripId, recordedAt: { gte: startOfDay } },
      orderBy: { recordedAt: 'desc' },
      take: 20,
    });

    const todaySpendCny = todayRows.reduce((sum, r) => sum + r.amountCny, 0);
    const pendingRebalanceCount = await this.rebalance.countPending(tripId);

    return {
      tripId,
      currency,
      dailyBudget,
      buckets,
      todaySpendCny: Math.round(todaySpendCny * 100) / 100,
      todayTransactions: todayRows.map((r) => this.toSummary(r)),
      pendingRebalanceCount,
    };
  }

  async record(
    tripId: string,
    userId: string,
    input: RecordTransactionInput,
  ): Promise<RecordTransactionResult> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);
    this.validateInput(input);

    const profile = await this.budgetProfile.getProfile(tripId, ['actuals']);
    const anchor = await this.anchorHandoff.getSnapshot(tripId);
    const { amountCny, exchangeRate } = convertToCny(input.amountLocal, input.currencyLocal);
    const bucket = assignBucket(input.category);
    const recentSpendCny2h = await this.sumRecentSpend(tripId, userId, 2);

    const nudges = await this.nudgeService.evaluate({
      tripId,
      userId,
      input,
      amountCny,
      dailyBudget: profile.intent?.dailyBudget ?? null,
      recentSpendCny2h,
      anchor,
    });

    const splitRule = await this.resolveSplitRule(tripId);
    const spendRationality = this.inferSpendRationality(nudges);

    const splitContext = await this.splitOrchestrator.getActiveContext(tripId);
    const allMemberIds =
      anchor?.team.members.map((m) => m.userId) ?? input.splitAmongUserIds;
    const routed = this.splitOrchestrator.resolveSplitAmong(
      splitContext,
      input.paidByUserId,
      allMemberIds,
      input.merchant,
    );
    const splitAmongUserIds = routed.splitAmongUserIds;
    const splitGroupId = routed.splitGroupId;

    const txRow = await this.prisma.tripSmartTransaction.create({
      data: {
        tripId,
        memberId: userId,
        amountLocal: input.amountLocal,
        currencyLocal: input.currencyLocal.toUpperCase(),
        amountCny,
        exchangeRate,
        category: input.category,
        merchant: input.merchant ?? null,
        description: input.description ?? null,
        captureMethod: input.captureMethod,
        splitGroupId,
        splitRule,
        splitDetails: toInputJsonValue(splitAmongUserIds),
        bucketAssignment: bucket,
        spendRationality,
        nudgesTriggered: toInputJsonValue(nudges),
        recordedAt: new Date(),
      },
    });

    const ledger = await this.wallet.createManualLedger(tripId, {
      title: input.merchant ?? input.description ?? `${input.category} 消费`,
      category: toLedgerCategory(input.category),
      amount: amountCny,
      currency: 'CNY',
      paidByUserId: input.paidByUserId,
      splitAmongUserIds,
    });

    const updated = await this.prisma.tripSmartTransaction.update({
      where: { id: txRow.id },
      data: { ledgerEntryId: ledger.id },
    });

    await this.persistTransactionEvents(tripId, userId, updated.id, nudges, amountCny);

    const rebalanceSuggestionsCreated = await this.rebalance.scan(tripId);

    return {
      transaction: this.toSummary({ ...updated, nudgesTriggered: nudges }),
      ledgerEntryId: ledger.id,
      nudgesTriggered: nudges,
      rebalanceSuggestionsCreated,
    };
  }

  async listTransactions(
    tripId: string,
    userId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ items: SmartTransactionSummary[]; total: number; limit: number; offset: number }> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const limit = options.limit ?? 30;
    const offset = options.offset ?? 0;
    const where = { tripId };

    const [rows, total] = await Promise.all([
      this.prisma.tripSmartTransaction.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.tripSmartTransaction.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toSummary(r)),
      total,
      limit,
      offset,
    };
  }

  async getTodayNudges(tripId: string, userId: string): Promise<MoneyNudge[]> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const tz = defaultTripTimezone();
    const startOfDay = DateTime.now().setZone(tz).startOf('day').toJSDate();
    const rows = await this.prisma.tripSmartTransaction.findMany({
      where: { tripId, recordedAt: { gte: startOfDay } },
      orderBy: { recordedAt: 'desc' },
    });
    return this.nudgeService.filterTodayNudges(rows, tz);
  }

  private validateInput(input: RecordTransactionInput): void {
    if (!input.amountLocal || input.amountLocal <= 0) {
      throw new BadRequestException('amountLocal 必须大于 0');
    }
    if (!input.currencyLocal?.trim()) {
      throw new BadRequestException('currencyLocal 必填');
    }
    if (!input.paidByUserId || !input.splitAmongUserIds?.length) {
      throw new BadRequestException('paidByUserId 与 splitAmongUserIds 必填');
    }
    const allowed: RecordTransactionInput['captureMethod'][] = ['manual', 'photo', 'voice'];
    if (!allowed.includes(input.captureMethod)) {
      throw new BadRequestException(`captureMethod 无效: ${input.captureMethod}`);
    }
  }

  private async resolveSplitRule(tripId: string): Promise<string> {
    const rule = await this.prisma.tripWalletRule.findUnique({ where: { tripId } });
    return rule?.mode ?? 'split_aa';
  }

  private inferSpendRationality(nudges: MoneyNudge[]): string | null {
    if (nudges.some((n) => n.type === 'fomo_hedge')) return 'impulse';
    if (nudges.some((n) => n.type === 'cooling_off')) return 'rapid';
    return 'planned';
  }

  private async sumRecentSpend(tripId: string, userId: string, hours: number): Promise<number> {
    const since = DateTime.now().minus({ hours }).toJSDate();
    const rows = await this.prisma.tripSmartTransaction.findMany({
      where: { tripId, memberId: userId, recordedAt: { gte: since } },
      select: { amountCny: true },
    });
    return rows.reduce((sum, r) => sum + r.amountCny, 0);
  }

  private async sumBucketActuals(tripId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.tripSmartTransaction.findMany({
      where: { tripId },
      select: { bucketAssignment: true, amountCny: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) {
      out[r.bucketAssignment] = (out[r.bucketAssignment] ?? 0) + r.amountCny;
    }
    return out;
  }

  private plannedAmount(
    bucket: string,
    allocations?: CategoryAllocations,
    intentTotal?: number,
  ): number {
    if (bucket === 'contingency') {
      return intentTotal ? Math.round(intentTotal * 0.1) : 0;
    }
    if (!allocations) return 0;
    const key = (bucket === 'experience' ? 'experience' : bucket) as keyof CategoryAllocations;
    return allocations[key] ?? 0;
  }

  private toSummary(row: TxRow): SmartTransactionSummary {
    return {
      id: row.id,
      tripId: row.tripId,
      memberId: row.memberId,
      ledgerEntryId: row.ledgerEntryId,
      amountLocal: row.amountLocal,
      currencyLocal: row.currencyLocal,
      amountCny: row.amountCny,
      exchangeRate: row.exchangeRate,
      category: row.category,
      merchant: row.merchant,
      description: row.description,
      captureMethod: row.captureMethod as SmartTransactionSummary['captureMethod'],
      bucketAssignment: row.bucketAssignment as SmartTransactionSummary['bucketAssignment'],
      spendRationality: row.spendRationality,
      nudgesTriggered: Array.isArray(row.nudgesTriggered)
        ? (row.nudgesTriggered as MoneyNudge[])
        : [],
      recordedAt: row.recordedAt.toISOString(),
    };
  }

  private async persistTransactionEvents(
    tripId: string,
    userId: string,
    transactionId: string,
    nudges: MoneyNudge[],
    amountCny: number,
  ): Promise<void> {
    if (!this.travelEventPersistence) return;

    const base = {
      tripId,
      segment: TrajectorySegment.ACTION,
      source: TravelEventSource.IN_TRIP_EXECUTION,
      userId,
      schemaVersion: 1,
    };

    await this.travelEventPersistence.persist(
      buildTravelEventEnvelope({
        ...base,
        eventType: TravelEventType.TRIP_IN_TRIP_TRANSACTION_RECORDED,
        payload: { transactionId, amountCny, nudgeCount: nudges.length },
        idempotencyKey: `txn:${transactionId}`,
      }),
    );

    for (const nudge of nudges) {
      await this.travelEventPersistence.persist(
        buildTravelEventEnvelope({
          ...base,
          segment: TrajectorySegment.RESULT,
          eventType: TravelEventType.TRIP_IN_TRIP_NUDGE_SHOWN,
          payload: { transactionId, nudgeType: nudge.type, message: nudge.message },
          idempotencyKey: `nudge:${transactionId}:${nudge.type}`,
        }),
      );
    }
  }
}
