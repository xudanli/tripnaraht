/**
 * 行中晨间包 — 当日 POI 准入/容量预警
 */

import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PoiAccessCapacityService } from '../poi-access-capacity.service';
import { resolvePoiAccessSlug } from '../utils/resolve-poi-slug.util';
import type { AccessCapacityEvaluationResult } from '../interfaces/poi-access-capacity.interface';
import type { AnchorItineraryItem } from '../../trips/in-trip-execution/types/anchor-handoff.types';

export type PoiAccessMorningAlert = {
  itemId: string;
  poiId: string;
  poiName: string;
  arrivalTime: string;
  verdict: AccessCapacityEvaluationResult['verdict'];
  reason: string;
  planB: AccessCapacityEvaluationResult['planB'];
  crowdLevel?: AccessCapacityEvaluationResult['crowdLevel'];
  predictedWaitP50?: number;
  /** 模型/USER 推断等待时间时的披露文案 */
  disclosureLabel?: string;
};

@Injectable()
export class InTripPoiAccessMorningService {
  private readonly logger = new Logger(InTripPoiAccessMorningService.name);

  constructor(private readonly poiAccess: PoiAccessCapacityService) {}

  async buildAlertsForDay(input: {
    dateISO: string;
    timezone?: string;
    items: AnchorItineraryItem[];
  }): Promise<PoiAccessMorningAlert[]> {
    const tz = input.timezone ?? 'Atlantic/Reykjavik';
    const evalInputs: Array<{
      item: AnchorItineraryItem;
      poiId: string;
      arrivalTime: string;
    }> = [];

    for (const item of input.items) {
      if (item.type !== 'POI' && item.type !== 'ACTIVITY' && item.type !== 'ATTRACTION') {
        continue;
      }
      const poiId =
        item.poiAccessSlug ?? resolvePoiAccessSlug({ name: item.title });
      if (!poiId) continue;

      const arrivalTime = this.resolveArrivalTime(item.startTime, tz);
      evalInputs.push({ item, poiId, arrivalTime });
    }

    if (!evalInputs.length) return [];

    const evaluations = await this.poiAccess.evaluateBatch(
      evalInputs.map((e) => ({
        poiId: e.poiId,
        poiName: e.item.title,
        dateISO: input.dateISO,
        arrivalTime: e.arrivalTime,
        timezone: tz,
      })),
    );

    const alerts: PoiAccessMorningAlert[] = [];
    for (let i = 0; i < evalInputs.length; i += 1) {
      const ev = evaluations[i];
      if (!ev || ev.verdict === 'FEASIBLE') continue;

      alerts.push({
        itemId: evalInputs[i].item.id,
        poiId: ev.poiId,
        poiName: evalInputs[i].item.title,
        arrivalTime: evalInputs[i].arrivalTime,
        verdict: ev.verdict,
        reason: ev.reason,
        planB: ev.planB,
        crowdLevel: ev.crowdLevel,
        predictedWaitP50: ev.predictedWaitP50,
        ...(ev.predictedWaitP50 != null
          ? {
              disclosureLabel:
                ev.signalSources?.includes('USER') || ev.signalSources?.includes('MODEL')
                  ? '（基于用户反馈与模型推断）'
                  : '（基于模型推断）',
            }
          : {}),
      });
    }

    if (alerts.length) {
      this.logger.debug(`晨间 POI 预警 ${alerts.length} 条 (${input.dateISO})`);
    }
    return alerts;
  }

  private resolveArrivalTime(startTime: string | undefined, tz: string): string {
    if (startTime) {
      const dt = DateTime.fromISO(startTime, { zone: tz });
      if (dt.isValid) return dt.toFormat('HH:mm');
    }
    return '10:00';
  }
}
