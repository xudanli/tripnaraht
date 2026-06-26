import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  BudgetDecisionLogItem,
  BudgetEvaluationVerdict,
} from '../../services/budget-evaluation.service';
import { toInputJsonValue } from '../utils/prisma-json.util';

const MAX_LOGS_PER_TRIP = 100;

@Injectable()
export class BudgetDecisionLogService {
  private readonly logger = new Logger(BudgetDecisionLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async appendLog(tripId: string, item: BudgetDecisionLogItem): Promise<void> {
    try {
      await this.prisma.tripBudgetDecisionLog.create({
        data: {
          id: item.id,
          tripId,
          planId: item.planId,
          verdict: item.verdict,
          estimatedCost: item.estimatedCost,
          reason: item.reason,
          budgetConstraint: toInputJsonValue(item.budgetConstraint),
          budgetViolations: item.budgetViolations
            ? toInputJsonValue(item.budgetViolations)
            : undefined,
          evidenceRefs: toInputJsonValue(item.evidenceRefs),
          persona: item.persona,
          createdAt: new Date(item.timestamp),
        },
      });
      await this.pruneOldLogs(tripId);
    } catch (error) {
      this.logger.warn(
        `Budget decision log persist failed for trip ${tripId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async listLogs(
    planId: string,
    tripId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ items: BudgetDecisionLogItem[]; total: number }> {
    const where = { tripId, planId };
    const [rows, total] = await Promise.all([
      this.prisma.tripBudgetDecisionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.tripBudgetDecisionLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toLogItem(row)),
      total,
    };
  }

  async getLatestLog(
    planId: string,
    tripId: string,
  ): Promise<BudgetDecisionLogItem | null> {
    const row = await this.prisma.tripBudgetDecisionLog.findFirst({
      where: { tripId, planId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toLogItem(row) : null;
  }

  private async pruneOldLogs(tripId: string): Promise<void> {
    const rows = await this.prisma.tripBudgetDecisionLog.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
      skip: MAX_LOGS_PER_TRIP,
    });
    if (rows.length === 0) return;
    await this.prisma.tripBudgetDecisionLog.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
  }

  private toLogItem(row: {
    id: string;
    planId: string;
    verdict: string;
    estimatedCost: number;
    reason: string;
    budgetConstraint: unknown;
    budgetViolations: unknown;
    evidenceRefs: unknown;
    persona: string | null;
    createdAt: Date;
  }): BudgetDecisionLogItem {
    return {
      id: row.id,
      timestamp: row.createdAt.toISOString(),
      planId: row.planId,
      verdict: row.verdict as BudgetEvaluationVerdict,
      estimatedCost: row.estimatedCost,
      budgetConstraint: row.budgetConstraint as BudgetDecisionLogItem['budgetConstraint'],
      reason: row.reason,
      evidenceRefs: Array.isArray(row.evidenceRefs)
        ? (row.evidenceRefs as string[])
        : [],
      budgetViolations: row.budgetViolations
        ? (row.budgetViolations as BudgetDecisionLogItem['budgetViolations'])
        : undefined,
      persona: (row.persona as BudgetDecisionLogItem['persona']) ?? undefined,
    };
  }
}
