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
import { placeOntologyToAccessRules } from './utils/place-ontology-to-access-rules.util';

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

  /** 获取 POI 准入规则：DB → Place.ontologyRules → 内置种子 */
  async getRulesForPoiSlugs(poiSlugs: string[]): Promise<PoiAccessRule[]> {
    const unique = [...new Set(poiSlugs.filter(Boolean))];
    const merged: PoiAccessRule[] = [];
    for (const poiId of unique) {
      merged.push(...(await this.getRulesForPoi({ poiId })));
    }
    return merged;
  }

  /**
   * 单 POI 规则链：PoiAccessRule 表 → Place.ontologyRules → fixture。
   * 行程评估时应传入 itinerary 上的 `placeId` 以启用本体 fallback。
   */
  async getRulesForPoi(input: {
    poiId: string;
    placeId?: number;
    ontologyRules?: unknown;
  }): Promise<PoiAccessRule[]> {
    const poiId = input.poiId?.trim();
    if (!poiId) return [];

    try {
      const rows = await this.prisma.poiAccessRule.findMany({
        where: {
          poiId,
          status: { not: 'INACTIVE' },
          ...(input.placeId != null ? { placeId: input.placeId } : {}),
        },
      });
      if (rows.length) return rows.map(mapDbRule);

      if (input.placeId == null) {
        const anyRows = await this.prisma.poiAccessRule.findMany({
          where: { poiId, status: { not: 'INACTIVE' } },
        });
        if (anyRows.length) return anyRows.map(mapDbRule);
      }
    } catch (err) {
      this.logger.warn(`PoiAccessRule 表不可用: ${(err as Error).message}`);
    }

    const ontologyRules = await this.resolveOntologyRulesForPoi(input);
    const fromOntology = placeOntologyToAccessRules(
      poiId,
      input.placeId ?? (await this.resolveRegistryPlaceId(poiId)) ?? 0,
      ontologyRules,
    ).filter((r) => r.placeId != null && r.placeId > 0);
    if (fromOntology.length) return fromOntology;

    return getBuiltinRulesForPoiSlugs([poiId]);
  }

  private async resolveRegistryPlaceId(poiId: string): Promise<number | undefined> {
    try {
      const row = await this.prisma.poiAccessRule.findFirst({
        where: { poiId, placeId: { not: null } },
        select: { placeId: true },
        orderBy: { updatedAt: 'desc' },
      });
      return row?.placeId ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async resolveOntologyRulesForPoi(input: {
    poiId: string;
    placeId?: number;
    ontologyRules?: unknown;
  }): Promise<unknown> {
    if (input.ontologyRules != null) return input.ontologyRules;

    const placeId = input.placeId ?? (await this.resolveRegistryPlaceId(input.poiId));
    if (placeId == null) return null;

    try {
      const place = await this.prisma.place.findUnique({
        where: { id: placeId },
        select: { ontologyRules: true },
      });
      return place?.ontologyRules ?? null;
    } catch {
      return null;
    }
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

    const out: PoiAccessRule[] = [];
    for (const placeId of unique) {
      try {
        const rows = await this.prisma.poiAccessRule.findMany({
          where: {
            placeId,
            status: { not: 'INACTIVE' },
          },
        });
        if (rows.length) {
          out.push(...rows.map(mapDbRule));
          continue;
        }

        const place = await this.prisma.place.findUnique({
          where: { id: placeId },
          select: { ontologyRules: true },
        });
        if (place?.ontologyRules) {
          out.push(
            ...placeOntologyToAccessRules(`place:${placeId}`, placeId, place.ontologyRules),
          );
        }
      } catch (err) {
        this.logger.warn(
          `按 placeId 查询规则失败 (${placeId}): ${(err as Error).message}`,
        );
      }
    }
    return out;
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
      (await this.getRulesForPoi({
        poiId: input.poiId,
        placeId: input.placeId,
        ontologyRules: input.placeOntologyRules,
      }));

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
