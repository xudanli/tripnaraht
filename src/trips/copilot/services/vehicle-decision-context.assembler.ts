/**
 * Assemble vehicle Decision Context from trip metadata + plan signals.
 * Deterministic — explains route fit; no LLM / no RAG as SSOT.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  VehicleContextField,
  VehicleContextFieldStatus,
  VehicleDecisionContext,
} from '../contracts/vehicle-decision-context.types';

function field<T>(
  status: VehicleContextFieldStatus,
  value?: T,
  factLine?: string,
): VehicleContextField<T> {
  return { status, ...(value !== undefined ? { value } : {}), ...(factLine ? { factLine } : {}) };
}

function seasonHint(start?: Date | null): string | undefined {
  if (!start) return undefined;
  const m = start.getUTCMonth() + 1;
  if (m >= 6 && m <= 8) return '夏季';
  if (m >= 11 || m <= 2) return '冬季';
  if (m >= 3 && m <= 5) return '春季';
  return '秋季';
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

@Injectable()
export class VehicleDecisionContextAssembler {
  constructor(private readonly prisma: PrismaService) {}

  async assemble(tripId: string): Promise<VehicleDecisionContext> {
    const [trip, dayCount] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          startDate: true,
          endDate: true,
          metadata: true,
          budgetConfig: true,
        },
      }),
      this.prisma.tripDay.count({ where: { tripId } }),
    ]);

    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const constraints = (meta.constraints as Record<string, unknown> | undefined) ?? {};
    const routeFlags = (meta.routeDecisionFlags as Record<string, unknown> | undefined) ?? {};
    const budgetConfig = (trip?.budgetConfig ?? {}) as Record<string, unknown>;
    const party = (meta.party as Record<string, unknown> | undefined) ?? {};

    const routeReady =
      dayCount > 0 || meta.routeDraftReady === true || meta.itineraryGenerated === true;

    const containsFRoad =
      routeFlags.hasFRoad === true ||
      meta.hasFRoad === true ||
      (Array.isArray(meta.fRoadIds) && (meta.fRoadIds as unknown[]).length > 0);

    const highlandRoute =
      containsFRoad ||
      routeFlags.highlandRoute === true ||
      meta.highlandRoute === true;

    const hasGravel = routeFlags.hasGravel === true || meta.hasGravel === true;
    const gravelShareHint =
      typeof routeFlags.gravelShareHint === 'string'
        ? routeFlags.gravelShareHint
        : hasGravel
          ? '路线含碎石路段'
          : undefined;

    const roadTypes: string[] = [];
    if (!containsFRoad && !highlandRoute) {
      roadTypes.push('环岛主路', '南岸常规道路');
    } else {
      if (containsFRoad) roadTypes.push('F-road');
      if (highlandRoute) roadTypes.push('高地路线');
      if (hasGravel) roadTypes.push('碎石路');
    }

    const passengerCount = num(
      party.passengerCount ?? party.travelerCount ?? meta.passengerCount ?? meta.partySize,
      0,
    );
    const luggageRaw = String(party.luggageLevel ?? meta.luggageLevel ?? '').toUpperCase();
    const luggageLevel =
      luggageRaw === 'LIGHT' || luggageRaw === 'HEAVY' || luggageRaw === 'NORMAL'
        ? (luggageRaw as 'LIGHT' | 'NORMAL' | 'HEAVY')
        : passengerCount > 0
          ? 'NORMAL'
          : undefined;
    const hasChildrenOrElderly =
      party.hasChildren === true ||
      party.hasElderly === true ||
      meta.hasChildren === true ||
      meta.hasElderly === true;

    const season = seasonHint(trip?.startDate ?? null);
    const roadOpen =
      typeof routeFlags.roadOpenStatus === 'string'
        ? routeFlags.roadOpenStatus
        : typeof meta.roadOpenStatus === 'string'
          ? meta.roadOpenStatus
          : undefined;

    const budgetTotal = num(budgetConfig.total ?? budgetConfig.amount ?? meta.budgetTotal, 0);
    const budgetStyle = String(budgetConfig.style ?? meta.budgetStyle ?? '').trim();
    const driverExperience = String(
      meta.driverExperience ?? constraints.driverExperience ?? '',
    ).trim();
    const availabilityNote = String(
      meta.vehicleAvailabilityNote ?? constraints.vehicleAvailability ?? '',
    ).trim();

    const routeSummary: VehicleContextField<{
      dayCount: number;
      routeReady: boolean;
    }> = routeReady
      ? field(
          'CONFIRMED',
          { dayCount, routeReady: true },
          dayCount > 0 ? `行程天数：${dayCount} 天，路线已就绪` : '路线草案已就绪',
        )
      : field<{ dayCount: number; routeReady: boolean }>('MISSING');

    const roadExposure: VehicleContextField<{
      containsFRoad: boolean;
      highlandRoute: boolean;
      hasGravel: boolean;
    }> = routeReady
      ? field(
          'CONFIRMED',
          { containsFRoad, highlandRoute, hasGravel },
          containsFRoad || highlandRoute
            ? [
                containsFRoad ? '含 F-road' : null,
                highlandRoute ? '含高地路线' : null,
                hasGravel ? '含碎石路' : null,
              ]
                .filter(Boolean)
                .join('；')
            : '当前路线不含 F-road',
        )
      : field<{
          containsFRoad: boolean;
          highlandRoute: boolean;
          hasGravel: boolean;
        }>('MISSING');

    const seasonField = season
      ? field('CONFIRMED', { seasonHint: season }, `出行季节：${season}`)
      : field('UNKNOWN');

    const roadOpenStatus = roadOpen
      ? field('CONFIRMED', { statusHint: roadOpen }, `道路开放：${roadOpen}`)
      : field('UNKNOWN');

    const teamCapacity =
      passengerCount > 0 || luggageLevel || hasChildrenOrElderly
        ? field(
            'CONFIRMED',
            {
              passengerCount: passengerCount || undefined,
              luggageLevel,
              hasChildrenOrElderly: hasChildrenOrElderly || undefined,
            },
            [
              passengerCount > 0 ? `人数 ${passengerCount}` : null,
              luggageLevel ? `行李 ${luggageLevel}` : null,
              hasChildrenOrElderly ? '含儿童或老人' : null,
            ]
              .filter(Boolean)
              .join('；'),
          )
        : field('UNKNOWN');

    const budget =
      budgetTotal > 0 || budgetStyle
        ? field(
            'CONFIRMED',
            { style: budgetStyle || undefined, total: budgetTotal || undefined },
            [
              budgetStyle ? `预算风格 ${budgetStyle}` : null,
              budgetTotal > 0 ? `预算 ${budgetTotal}` : null,
            ]
              .filter(Boolean)
              .join('；'),
          )
        : field('UNKNOWN');

    const driverExperienceField = driverExperience
      ? field('CONFIRMED', { hint: driverExperience }, `驾驶经验：${driverExperience}`)
      : field('UNKNOWN');

    const vehicleAvailability = availabilityNote
      ? field('CONFIRMED', { note: availabilityNote }, availabilityNote)
      : field('UNKNOWN');

    const fields: VehicleDecisionContext['fields'] = {
      routeSummary,
      roadExposure,
      season: seasonField,
      roadOpenStatus,
      teamCapacity,
      budget,
      driverExperience: driverExperienceField,
      vehicleAvailability,
    };

    const missingGate: Array<'ROUTE_SUMMARY' | 'ROAD_EXPOSURE'> = [];
    if (routeSummary.status !== 'CONFIRMED') missingGate.push('ROUTE_SUMMARY');
    if (roadExposure.status !== 'CONFIRMED') missingGate.push('ROAD_EXPOSURE');

    // Deterministic recommendation from route facts (not RAG)
    let vehicleType = '两驱小型车';
    let optionId = 'vehicle_2wd';
    const reasons: string[] = [];
    if (containsFRoad || highlandRoute) {
      vehicleType = hasGravel || highlandRoute ? '大型四驱' : '普通四驱 SUV';
      optionId = hasGravel || highlandRoute ? 'vehicle_4wd_large' : 'vehicle_4wd_suv';
      reasons.push('满足道路准入', '适配 F-road / 高地');
    } else {
      reasons.push('满足道路准入', '租金较低', '油耗较低');
      if (passengerCount >= 5 || luggageLevel === 'HEAVY') {
        vehicleType = '普通四驱 SUV';
        optionId = 'vehicle_4wd_suv';
        reasons.length = 0;
        reasons.push('人数或行李偏多', '空间更合适');
      }
    }

    const invalidatedWhen = ['加入F-road', '增加高地路线', '人数或行李增加'];

    const routeFacts = {
      containsFRoad,
      highlandRoute,
      roadTypes,
      gravelShareHint,
    };
    const teamFacts = {
      passengerCount: passengerCount || undefined,
      luggageLevel,
      hasChildrenOrElderly: hasChildrenOrElderly || undefined,
    };
    const recommendation = { vehicleType, optionId, reasons };

    const confirmedFacts = Object.values(fields)
      .map((f) => f.factLine)
      .filter((s): s is string => !!s && s.trim().length > 0);

    const missingFields = Object.entries(fields)
      .filter(([, f]) => f.status === 'MISSING')
      .map(([k]) => k);

    return {
      schema: 'tripnara.vehicle_decision_context@v1',
      tripId,
      gate: {
        ok: missingGate.length === 0,
        ...(missingGate.length ? { code: 'CONTEXT_MISSING' as const } : {}),
        missing: missingGate,
      },
      routeFacts,
      teamFacts,
      recommendation,
      invalidatedWhen,
      fields,
      confirmedFacts,
      missingFields,
      advisorInput: {
        routeFacts,
        teamFacts,
        recommendation,
        invalidatedWhen,
      },
    };
  }
}
