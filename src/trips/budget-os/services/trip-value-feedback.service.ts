import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  SubmitValueFeedbackInput,
  TripValueSummary,
  ValueFeedback,
} from '../types/value-feedback.types';
import { buildTripValueSummary } from '../utils/value-score.util';

@Injectable()
export class TripValueFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async submitFeedback(
    tripId: string,
    userId: string,
    input: SubmitValueFeedbackInput,
  ): Promise<ValueFeedback> {
    await this.requireTrip(tripId);
    this.validateSatisfaction(input.satisfaction);

    const { amount, category, currency } = await this.resolveSourceAmount(
      tripId,
      input.sourceType,
      input.sourceId,
    );

    const row = await this.prisma.tripValueFeedback.upsert({
      where: {
        tripId_sourceType_sourceId_createdBy: {
          tripId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          createdBy: userId,
        },
      },
      create: {
        tripId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        amount,
        category,
        currency,
        satisfaction: input.satisfaction,
        note: input.note,
        createdBy: userId,
      },
      update: {
        satisfaction: input.satisfaction,
        note: input.note,
        amount,
        category,
        currency,
      },
    });

    return this.mapRow(row);
  }

  async getValueSummary(tripId: string): Promise<TripValueSummary> {
    await this.requireTrip(tripId);
    const rows = await this.prisma.tripValueFeedback.findMany({
      where: { tripId },
    });

    return buildTripValueSummary(
      rows.map((r) => ({
        tripId: r.tripId,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        amount: r.amount,
        category: r.category,
        satisfaction: r.satisfaction,
        createdBy: r.createdBy,
      })),
    );
  }

  async listFeedbacksForUser(userId: string): Promise<ValueFeedback[]> {
    const rows = await this.prisma.tripValueFeedback.findMany({
      where: { createdBy: userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.mapRow(r));
  }

  async listFeedbackRowsForUser(userId: string) {
    return this.prisma.tripValueFeedback.findMany({
      where: { createdBy: userId },
    });
  }

  async getDistinctTripIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.tripValueFeedback.findMany({
      where: { createdBy: userId },
      select: { tripId: true },
      distinct: ['tripId'],
    });
    return rows.map((r) => r.tripId);
  }

  async getUserIdsWithFeedbackOnTrip(tripId: string): Promise<string[]> {
    const rows = await this.prisma.tripValueFeedback.findMany({
      where: { tripId },
      select: { createdBy: true },
      distinct: ['createdBy'],
    });
    return rows.map((r) => r.createdBy);
  }

  private async resolveSourceAmount(
    tripId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<{ amount: number; category: string; currency: string }> {
    if (sourceType === 'itinerary_item') {
      const item = await this.prisma.itineraryItem.findFirst({
        where: {
          id: sourceId,
          TripDay: { tripId },
        },
      });
      if (!item) {
        throw new NotFoundException(`行程项 ${sourceId} 不存在或不属于该行程`);
      }
      const amount = item.actualCost ?? item.estimatedCost ?? 0;
      if (amount <= 0) {
        throw new BadRequestException('该费用项尚无金额，请先记录 actualCost 或 estimatedCost');
      }
      return {
        amount,
        category: (item.costCategory ?? 'other').toLowerCase(),
        currency: item.currency ?? 'CNY',
      };
    }

    if (sourceType === 'manual') {
      const entry = await this.prisma.tripWalletLedgerEntry.findFirst({
        where: { tripId, sourceType: 'manual', sourceId },
      });
      if (!entry) {
        throw new NotFoundException(`手动账本条目 ${sourceId} 不存在`);
      }
      return {
        amount: entry.amount,
        category: entry.category.toLowerCase(),
        currency: entry.currency,
      };
    }

    throw new BadRequestException(`不支持的 sourceType: ${sourceType}`);
  }

  private validateSatisfaction(satisfaction: number): void {
    if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) {
      throw new BadRequestException('satisfaction 必须为 1–5 的整数');
    }
  }

  private mapRow(row: {
    id: string;
    tripId: string;
    sourceType: string;
    sourceId: string;
    amount: number;
    category: string;
    satisfaction: number;
    note: string | null;
    createdBy: string;
    createdAt: Date;
  }): ValueFeedback {
    return {
      id: row.id,
      tripId: row.tripId,
      sourceType: row.sourceType as ValueFeedback['sourceType'],
      sourceId: row.sourceId,
      amount: row.amount,
      category: row.category,
      satisfaction: row.satisfaction as ValueFeedback['satisfaction'],
      note: row.note ?? undefined,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async requireTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }
    return trip;
  }
}
