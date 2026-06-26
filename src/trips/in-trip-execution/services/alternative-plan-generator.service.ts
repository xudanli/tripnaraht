import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { RiskImpactAssessment } from '../../../agent/execution/risk-event.types';
import type { InTripAnchorSnapshot } from '../types/anchor-handoff.types';
import type {
  EnvironmentAlternativePlan,
  EnvironmentCascadeImpact,
} from '../types/environment-event.types';

@Injectable()
export class AlternativePlanGeneratorService {
  generate(
    anchor: InTripAnchorSnapshot,
    description: string,
    impact: RiskImpactAssessment,
    affectedItemIds: string[],
  ): {
    plans: EnvironmentAlternativePlan[];
    cascadeImpact: EnvironmentCascadeImpact[];
  } {
    const primaryItem = this.findItem(anchor, affectedItemIds[0]);
    const primaryTitle = primaryItem?.title ?? '受影响活动';
    const costBase = primaryItem?.estimatedCost ?? 0;

    const plans: EnvironmentAlternativePlan[] = [
      {
        planId: randomUUID(),
        name: `顺延：${primaryTitle}`,
        description: `将「${primaryTitle}」延后至下一可用时段，保留原体验强度`,
        timeAdjustment: '延后 4–24 小时',
        costDifference: 0,
        experienceEquivalence: 0.88,
        bookingRequired: !primaryItem?.refundable,
      },
      {
        planId: randomUUID(),
        name: `替代：室内/低强度体验`,
        description: `以博物馆、温泉或市区漫步替代「${primaryTitle}」，降低天气依赖`,
        timeAdjustment: '替换同日时段',
        costDifference: Math.round(costBase * -0.3),
        experienceEquivalence: 0.72,
        bookingRequired: false,
      },
      {
        planId: randomUUID(),
        name: `维持原计划 + 加强缓冲`,
        description: `保留「${primaryTitle}」，前后增加交通/休息缓冲，并接受一定不确定性`,
        timeAdjustment: '前后各 +45 分钟缓冲',
        costDifference: 0,
        experienceEquivalence: 0.65,
        bookingRequired: false,
      },
    ];

    const cascadeImpact: EnvironmentCascadeImpact[] = impact.affectedItems.slice(0, 5).map((itemId) => {
      const item = this.findItem(anchor, itemId);
      const dayIdx = anchor.itinerary.days.findIndex((d) =>
        d.items.some((it) => it.id === itemId),
      );
      return {
        affectedDay: dayIdx >= 0 ? dayIdx + 1 : 1,
        affectedItem: item?.title ?? itemId,
        impactType: 'time',
        impactDescription: impact.summaryZh,
      };
    });

    if (cascadeImpact.length === 0 && description) {
      cascadeImpact.push({
        affectedDay: 1,
        affectedItem: primaryTitle,
        impactType: 'availability',
        impactDescription: description,
      });
    }

    return { plans, cascadeImpact };
  }

  private findItem(anchor: InTripAnchorSnapshot, itemId?: string) {
    if (!itemId) return undefined;
    for (const day of anchor.itinerary.days) {
      const hit = day.items.find((it) => it.id === itemId);
      if (hit) return hit;
    }
    return undefined;
  }
}
