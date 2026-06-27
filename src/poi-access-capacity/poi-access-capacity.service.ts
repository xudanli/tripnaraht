/**
 * POI Access & Capacity — 数据访问、评估与同步
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AccessCapacityEvaluationInput,
  AccessCapacityEvaluationResult,
  PoiAccessRule,
  PoiAccessStatusOverride,
  PoiCapacitySnapshot,
  PoiCrowdingSnapshot,
} from './interfaces/poi-access-capacity.interface';
import {
  getBuiltinRulesForPoiSlugs,
  isIcelandCrowdingProfilePoi,
} from './fixtures/iceland-poi-registry';
import { evaluatePoiAccessCapacity } from './utils/evaluate-poi-access.util';
import { inferCrowdingFromCapacitySnapshots } from './utils/infer-crowding-from-capacity.util';
import { ParkaCapacityProvider } from './providers/parka-capacity.provider';
import { UmferdinArrivalRateProvider } from './providers/umferdin-arrival-rate.provider';
import { PoiExecutionFeedbackService } from './services/poi-execution-feedback.service';

function mapDbRule(row: {
  id: string;
  poiId: string;
  placeId: number | null;
  ruleType: string;
  targetResource: string;
  validFrom: Date | null;
  validTo: Date | null;
  dailyStartTime: string | null;
  dailyEndTime: string | null;
  quota: number | null;
  reservationRequired: boolean | null;
  applicableVehicleTypes: unknown;
  status: string;
  sourceAuthority: string;
  sourceUrl: string | null;
  sourceUpdatedAt: Date | null;
  lastVerifiedAt: Date;
  confidence: string;
  enforcement: string;
  notes: string | null;
}): PoiAccessRule {
  return {
    id: row.id,
    poiId: row.poiId,
    placeId: row.placeId ?? undefined,
    ruleType: row.ruleType as PoiAccessRule['ruleType'],
    targetResource: row.targetResource as PoiAccessRule['targetResource'],
    validFrom: row.validFrom?.toISOString().slice(0, 10),
    validTo: row.validTo?.toISOString().slice(0, 10),
    dailyStartTime: row.dailyStartTime ?? undefined,
    dailyEndTime: row.dailyEndTime ?? undefined,
    quota: row.quota ?? undefined,
    reservationRequired: row.reservationRequired ?? undefined,
    applicableVehicleTypes: Array.isArray(row.applicableVehicleTypes)
      ? (row.applicableVehicleTypes as string[])
      : undefined,
    status: row.status as PoiAccessRule['status'],
    enforcement: (row.enforcement as PoiAccessRule['enforcement']) ?? 'HARD',
    sourceAuthority: row.sourceAuthority,
    sourceUrl: row.sourceUrl ?? undefined,
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString(),
    lastVerifiedAt: row.lastVerifiedAt.toISOString(),
    confidence: row.confidence as PoiAccessRule['confidence'],
    notes: row.notes ?? undefined,
  };
}

function mapDbOverride(row: {
  id: string;
  poiId: string;
  placeId: number | null;
  ruleType: string;
  targetResource: string;
  enforcement: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: string;
  sourceAuthority: string;
  sourceUrl: string | null;
  lastVerifiedAt: Date;
  confidence: string;
  notes: string | null;
}): PoiAccessStatusOverride {
  return {
    id: row.id,
    poiId: row.poiId,
    placeId: row.placeId ?? undefined,
    ruleType: row.ruleType as PoiAccessStatusOverride['ruleType'],
    targetResource: row.targetResource as PoiAccessStatusOverride['targetResource'],
    enforcement: row.enforcement as PoiAccessStatusOverride['enforcement'],
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString(),
    status: row.status as PoiAccessStatusOverride['status'],
    sourceAuthority: row.sourceAuthority,
    sourceUrl: row.sourceUrl ?? undefined,
    lastVerifiedAt: row.lastVerifiedAt.toISOString(),
    confidence: row.confidence as PoiAccessStatusOverride['confidence'],
    notes: row.notes ?? undefined,
  };
}

@Injectable()
export class PoiAccessCapacityService {
  private readonly logger = new Logger(PoiAccessCapacityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parkaProvider: ParkaCapacityProvider,
    private readonly umferdinProvider: UmferdinArrivalRateProvider,
    private readonly feedbackService: PoiExecutionFeedbackService,
  ) {}

  /** 获取 POI 准入规则（DB 优先，无数据时回退 A+B 级内置种子） */
  async getRulesForPoiSlugs(poiSlugs: string[]): Promise<PoiAccessRule[]> {
    const unique = [...new Set(poiSlugs.filter(Boolean))];
    if (!unique.length) return [];

    try {
      const rows = await this.prisma.poiAccessRule.findMany({
        where: {
          poiId: { in: unique },
          status: { not: 'INACTIVE' },
        },
      });
      if (rows.length) {
        return rows.map(mapDbRule);
      }
    } catch (err) {
      this.logger.warn(
        `PoiAccessRule 表不可用，回退内置种子: ${(err as Error).message}`,
      );
    }

    return getBuiltinRulesForPoiSlugs(unique);
  }

  async getStatusOverridesForPoiSlugs(
    poiSlugs: string[],
    dateISO: string,
  ): Promise<PoiAccessStatusOverride[]> {
    const unique = [...new Set(poiSlugs.filter(Boolean))];
    if (!unique.length) return [];

    try {
      const rows = await this.prisma.poiAccessStatusOverride.findMany({
        where: { poiId: { in: unique } },
      });
      return rows
        .map(mapDbOverride)
        .filter((o) => {
          const d = dateISO.slice(0, 10);
          const from = o.effectiveFrom.slice(0, 10);
          if (d < from) return false;
          if (o.effectiveTo && d > o.effectiveTo.slice(0, 10)) return false;
          return true;
        });
    } catch {
      return [];
    }
  }

  async getRulesByPlaceIds(placeIds: number[]): Promise<PoiAccessRule[]> {
    const unique = [...new Set(placeIds.filter((id) => Number.isFinite(id)))];
    if (!unique.length) return [];

    try {
      const rows = await this.prisma.poiAccessRule.findMany({
        where: {
          placeId: { in: unique },
          status: { not: 'INACTIVE' },
        },
      });
      if (rows.length) return rows.map(mapDbRule);
    } catch (err) {
      this.logger.warn(
        `按 placeId 查询 PoiAccessRule 失败: ${(err as Error).message}`,
      );
    }
    return [];
  }

  async getLatestCrowdingSnapshot(
    poiId: string,
  ): Promise<PoiCrowdingSnapshot | undefined> {
    try {
      const row = await this.prisma.poiCrowdingSnapshot.findFirst({
        where: { poiId },
        orderBy: { observedAt: 'desc' },
      });
      if (!row) return undefined;
      return {
        poiId: row.poiId,
        placeId: row.placeId ?? undefined,
        observedAt: row.observedAt.toISOString(),
        parkingOccupancyRatio: row.parkingOccupancyRatio ?? undefined,
        bookingRemaining: row.bookingRemaining ?? undefined,
        bookingCapacity: row.bookingCapacity ?? undefined,
        arrivalRatePerHour: row.arrivalRatePerHour ?? undefined,
        predictedWaitP50: row.predictedWaitP50 ?? undefined,
        predictedWaitP90: row.predictedWaitP90 ?? undefined,
        crowdLevel: row.crowdLevel as PoiCrowdingSnapshot['crowdLevel'],
        signalSources: Array.isArray(row.signalSources)
          ? (row.signalSources as PoiCrowdingSnapshot['signalSources'])
          : [],
        confidenceScore: row.confidenceScore,
      };
    } catch {
      return undefined;
    }
  }

  async getCapacitySnapshots(
    poiId: string,
    dateISO: string,
  ): Promise<PoiCapacitySnapshot[]> {
    try {
      const rows = await this.prisma.poiCapacitySnapshot.findMany({
        where: { poiId, dateISO: dateISO.slice(0, 10) },
        orderBy: { observedAt: 'desc' },
      });
      if (rows.length) {
        return rows.map((row) => ({
          id: row.id,
          poiId: row.poiId,
          placeId: row.placeId ?? undefined,
          dateISO: row.dateISO,
          slotStartTime: row.slotStartTime ?? undefined,
          slotEndTime: row.slotEndTime ?? undefined,
          remaining: row.remaining ?? undefined,
          capacity: row.capacity ?? undefined,
          soldOut: row.soldOut,
          signalSource: row.signalSource as PoiCapacitySnapshot['signalSource'],
          observedAt: row.observedAt.toISOString(),
          confidenceScore: row.confidenceScore ?? undefined,
        }));
      }
    } catch {
      // fall through to Parka
    }

    const fromParka = await this.parkaProvider.fetchCapacity({
      poiId,
      dateISO,
    });
    return fromParka ?? [];
  }

  async evaluate(
    input: Omit<AccessCapacityEvaluationInput, 'rules'> & {
      rules?: PoiAccessRule[];
    },
  ): Promise<AccessCapacityEvaluationResult> {
    const rules =
      input.rules ??
      (await this.getRulesForPoiSlugs([input.poiId]));

    const statusOverrides =
      input.statusOverrides ??
      (await this.getStatusOverridesForPoiSlugs([input.poiId], input.dateISO));

    let capacitySnapshots =
      input.capacitySnapshots ??
      (await this.getCapacitySnapshots(input.poiId, input.dateISO));

    let crowdingSnapshot =
      input.crowdingSnapshot ??
      (await this.getLatestCrowdingSnapshot(input.poiId));

    if (!crowdingSnapshot && capacitySnapshots.length) {
      crowdingSnapshot = inferCrowdingFromCapacitySnapshots({
        poiId: input.poiId,
        dateISO: input.dateISO,
        arrivalTime: input.arrivalTime,
        snapshots: capacitySnapshots,
      });
    }

    if (!crowdingSnapshot) {
      try {
        crowdingSnapshot = await this.feedbackService.getAggregatedCrowdingFromFeedback(
          input.poiId,
          14,
        );
      } catch {
        // 无反馈数据时跳过
      }
    }

    let arrivalRateMultiplier = input.arrivalRateMultiplier;
    if (arrivalRateMultiplier == null && isIcelandCrowdingProfilePoi(input.poiId)) {
      const traffic = await this.umferdinProvider.getArrivalRateMultiplier(input.poiId);
      arrivalRateMultiplier = traffic?.multiplier;
    }

    return evaluatePoiAccessCapacity({
      ...input,
      rules,
      statusOverrides,
      capacitySnapshots,
      crowdingSnapshot,
      arrivalRateMultiplier,
    });
  }

  /** 批量评估（行程日用） */
  async evaluateBatch(
    items: Array<Omit<AccessCapacityEvaluationInput, 'rules' | 'statusOverrides'>>,
  ): Promise<AccessCapacityEvaluationResult[]> {
    const poiIds = [...new Set(items.map((i) => i.poiId))];
    const allRules = await this.getRulesForPoiSlugs(poiIds);
    const rulesByPoi = new Map<string, PoiAccessRule[]>();
    for (const rule of allRules) {
      const list = rulesByPoi.get(rule.poiId) ?? [];
      list.push(rule);
      rulesByPoi.set(rule.poiId, list);
    }

    const trafficSignals = await this.umferdinProvider.getMultipliersForPois(poiIds);

    const results: AccessCapacityEvaluationResult[] = [];
    for (const item of items) {
      const dateISO = item.dateISO;
      const overrides = await this.getStatusOverridesForPoiSlugs([item.poiId], dateISO);
      results.push(
        await this.evaluate({
          ...item,
          rules: rulesByPoi.get(item.poiId) ?? [],
          statusOverrides: overrides,
          arrivalRateMultiplier:
            item.arrivalRateMultiplier ??
            trafficSignals.get(item.poiId)?.multiplier,
        }),
      );
    }
    return results;
  }
}
