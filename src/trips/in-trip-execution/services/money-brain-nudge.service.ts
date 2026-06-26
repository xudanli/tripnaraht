import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { MoneyDnaQuizService } from '../../decision-profiling/services/money-dna-quiz.service';
import type { InTripAnchorSnapshot } from '../types/anchor-handoff.types';
import type { MoneyNudge, RecordTransactionInput } from '../types/money-brain.types';
import { assignBucket } from '../utils/bucket-assignment.util';
import { mapMoneyDnaToCoolingOffMultiplier } from '../utils/money-dna-threshold.util';

export interface NudgeEvaluationContext {
  tripId: string;
  userId: string;
  input: RecordTransactionInput;
  amountCny: number;
  dailyBudget: number | null;
  recentSpendCny2h: number;
  anchor: InTripAnchorSnapshot | null;
}

@Injectable()
export class MoneyBrainNudgeService {
  constructor(private readonly moneyDna: MoneyDnaQuizService) {}

  async evaluate(ctx: NudgeEvaluationContext): Promise<MoneyNudge[]> {
    const nudges: MoneyNudge[] = [];
    const card = await this.moneyDna.getMyCard(ctx.userId);

    nudges.push(this.maybeProgressBar(ctx));

    const ref = this.maybeReferencePoint(ctx);
    if (ref) nudges.push(ref);

    const cool = await this.maybeCoolingOff(ctx, card);
    if (cool) nudges.push(cool);

    const fomo = this.maybeFomoHedge(ctx);
    if (fomo) nudges.push(fomo);

    return nudges;
  }

  maybeProgressBar(ctx: NudgeEvaluationContext): MoneyNudge {
    const bucket = assignBucket(ctx.input.category);
    return {
      type: 'progress_bar',
      message: `已记入${bucket}账户，继续留意今日节奏`,
      metadata: { bucket, amountCny: ctx.amountCny },
    };
  }

  maybeReferencePoint(ctx: NudgeEvaluationContext): MoneyNudge | null {
    if (!ctx.dailyBudget || ctx.dailyBudget <= 0) return null;
    if (ctx.input.currencyLocal.toUpperCase() === 'CNY') return null;
    const ratio = ctx.amountCny / ctx.dailyBudget;
    if (ratio < 0.2) return null;
    return {
      type: 'reference_point',
      message: `这笔约合 ¥${ctx.amountCny.toFixed(0)}，约为日均预算的 ${Math.round(ratio * 100)}%`,
      metadata: {
        amountCny: ctx.amountCny,
        dailyBudget: ctx.dailyBudget,
        ratio,
        currencyLocal: ctx.input.currencyLocal,
      },
    };
  }

  async maybeCoolingOff(
    ctx: NudgeEvaluationContext,
    card: Awaited<ReturnType<MoneyDnaQuizService['getMyCard']>>,
  ): Promise<MoneyNudge | null> {
    if (!ctx.dailyBudget || ctx.dailyBudget <= 0) return null;
    const multiplier = mapMoneyDnaToCoolingOffMultiplier(card);
    const threshold = ctx.dailyBudget * multiplier;
    const total2h = ctx.recentSpendCny2h + ctx.amountCny;
    if (total2h <= threshold) return null;
    return {
      type: 'cooling_off',
      message: `近 2 小时消费偏高，建议稍作停顿再决定下一笔`,
      metadata: {
        recentSpendCny2h: total2h,
        threshold,
        multiplier,
      },
    };
  }

  maybeFomoHedge(ctx: NudgeEvaluationContext): MoneyNudge | null {
    const bucket = assignBucket(ctx.input.category);
    if (bucket !== 'experience') return null;
    if (!ctx.dailyBudget || ctx.amountCny < ctx.dailyBudget * 0.35) return null;
    if (this.isPlannedExperience(ctx)) return null;
    return {
      type: 'fomo_hedge',
      message: '这项不在原计划内，确认是否值得为体验买单',
      metadata: { merchant: ctx.input.merchant, amountCny: ctx.amountCny },
    };
  }

  private isPlannedExperience(ctx: NudgeEvaluationContext): boolean {
    const anchor = ctx.anchor;
    if (!anchor) return false;
    const needle = (ctx.input.merchant ?? ctx.input.description ?? '').toLowerCase();
    if (!needle) return false;
    for (const day of anchor.itinerary.days) {
      for (const item of day.items) {
        if (item.title.toLowerCase().includes(needle) || needle.includes(item.title.toLowerCase())) {
          return true;
        }
      }
    }
    return false;
  }

  filterTodayNudges(
    transactions: Array<{ nudgesTriggered: unknown; recordedAt: Date }>,
    timezone: string,
  ): MoneyNudge[] {
    const start = DateTime.now().setZone(timezone).startOf('day');
    const out: MoneyNudge[] = [];
    for (const tx of transactions) {
      const at = DateTime.fromJSDate(tx.recordedAt).setZone(timezone);
      if (at < start) continue;
      const nudges = Array.isArray(tx.nudgesTriggered)
        ? (tx.nudgesTriggered as MoneyNudge[])
        : [];
      out.push(...nudges);
    }
    return out;
  }
}
