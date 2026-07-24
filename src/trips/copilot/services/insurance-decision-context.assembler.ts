/**
 * Assemble insurance Decision Context from trip metadata + plan signals.
 * Deterministic — no LLM, no RAG. Missing fields stay MISSING/UNKNOWN.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  ContextField,
  ContextFieldStatus,
  InsuranceDecisionContext,
} from '../contracts/insurance-decision-context.types';

function field<T>(
  status: ContextFieldStatus,
  value?: T,
  factLine?: string,
): ContextField<T> {
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
export class InsuranceDecisionContextAssembler {
  constructor(private readonly prisma: PrismaService) {}

  async assemble(tripId: string): Promise<InsuranceDecisionContext> {
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

    const routeReady =
      dayCount > 0 || meta.routeDraftReady === true || meta.itineraryGenerated === true;
    const hasFRoad =
      routeFlags.hasFRoad === true ||
      meta.hasFRoad === true ||
      (Array.isArray(meta.fRoadIds) && (meta.fRoadIds as unknown[]).length > 0);
    const hasGravel = routeFlags.hasGravel === true || meta.hasGravel === true;
    const hasMountainHint =
      routeFlags.hasMountain === true ||
      meta.hasMountain === true ||
      hasFRoad;
    const highWind = routeFlags.highWind === true || meta.highWindExposure === true;
    const volcanicAshHint =
      routeFlags.volcanicAsh === true || meta.volcanicAshRisk === true;

    const vehicleType = String(
      constraints.vehicle_type ?? constraints.vehicleType ?? meta.vehicleType ?? '',
    ).trim();
    const rentalCompany = String(
      constraints.rental_company ??
        constraints.rentalCompany ??
        meta.rentalCompany ??
        '',
    ).trim();
    const vehicleConfirmed = vehicleType.length > 0;

    const maxDayDriveHours = num(
      routeFlags.maxDailyDriveHours ?? meta.maxDailyDriveHoursObserved,
      0,
    );
    const avgDailyDriveHours = num(
      routeFlags.avgDailyDriveHours ?? meta.avgDailyDriveHours,
      0,
    );
    const totalDriveKm = num(routeFlags.totalDriveKm ?? meta.totalDriveKm, 0);

    const driverCount = num(
      meta.driverCount ??
        (meta.party as Record<string, unknown> | undefined)?.driverCount ??
        constraints.driverCount,
      0,
    );
    const experienceHint = String(
      meta.driverExperience ?? constraints.driverExperience ?? '',
    ).trim();

    const riskTolerance = String(
      meta.riskTolerance ??
        (meta.preferences as Record<string, unknown> | undefined)?.riskTolerance ??
        '',
    ).trim();

    const budgetTotal = num(
      budgetConfig.total ?? budgetConfig.amount ?? meta.budgetTotal,
      0,
    );
    const budgetCurrency = String(
      budgetConfig.currency ?? meta.budgetCurrency ?? '',
    ).trim();
    const budgetStyle = String(
      budgetConfig.style ?? meta.budgetStyle ?? '',
    ).trim();

    const creditCardCover =
      constraints.creditCardInsurance === true || meta.creditCardInsurance === true;
    const travelInsurance =
      constraints.travelInsurance === true || meta.travelInsurance === true;
    const existingNotes = String(
      constraints.existingInsuranceNotes ?? meta.existingInsuranceNotes ?? '',
    ).trim();
    const hasExistingSignal =
      creditCardCover || travelInsurance || existingNotes.length > 0;

    const start = trip?.startDate ?? null;
    const end = trip?.endDate ?? null;
    const season = seasonHint(start);

    const selfDriveSeason =
      start || end
        ? field(
            'CONFIRMED',
            {
              startDate: start?.toISOString().slice(0, 10),
              endDate: end?.toISOString().slice(0, 10),
              seasonHint: season,
            },
            season
              ? `自驾季节：${season}（${start?.toISOString().slice(0, 10) ?? '?'}–${end?.toISOString().slice(0, 10) ?? '?'}）`
              : `自驾日期：${start?.toISOString().slice(0, 10) ?? '?'}–${end?.toISOString().slice(0, 10) ?? '?'}`,
          )
        : field('MISSING');

    const routeSummary: ContextField<{ dayCount: number; routeReady: boolean }> =
      routeReady
        ? field(
            'CONFIRMED',
            { dayCount, routeReady: true },
            dayCount > 0 ? `行程天数：${dayCount} 天，路线已就绪` : '路线草案已就绪',
          )
        : field<{ dayCount: number; routeReady: boolean }>('MISSING');

    const roadBits = [
      hasGravel ? '含碎石路' : null,
      hasFRoad ? '含 F-road / 高地' : null,
      hasMountainHint && !hasFRoad ? '含山路迹象' : null,
    ].filter(Boolean) as string[];

    const roadExposure: ContextField<{
      hasGravel: boolean;
      hasFRoad: boolean;
      hasMountainHint: boolean;
    }> =
      roadBits.length > 0
        ? field(
            'CONFIRMED',
            { hasGravel, hasFRoad, hasMountainHint },
            roadBits.join('；'),
          )
        : routeReady
          ? field('UNKNOWN', {
              hasGravel: false,
              hasFRoad: false,
              hasMountainHint: false,
            })
          : field('MISSING');

    const driveLoad =
      totalDriveKm > 0 || maxDayDriveHours > 0 || avgDailyDriveHours > 0
        ? field(
            'CONFIRMED',
            {
              totalDriveKm: totalDriveKm || undefined,
              maxDayDriveHours: maxDayDriveHours || undefined,
              avgDailyDriveHours: avgDailyDriveHours || undefined,
            },
            [
              totalDriveKm > 0 ? `总里程约 ${Math.round(totalDriveKm)} km` : null,
              maxDayDriveHours > 0 ? `单日最长驾驶约 ${maxDayDriveHours} h` : null,
              avgDailyDriveHours > 0 ? `日均驾驶约 ${avgDailyDriveHours} h` : null,
            ]
              .filter(Boolean)
              .join('；'),
          )
        : field(routeReady ? 'UNKNOWN' : 'MISSING');

    const weatherRisk: ContextField<{
      highWind: boolean;
      volcanicAshHint?: boolean;
    }> =
      highWind || volcanicAshHint
        ? field(
            'CONFIRMED',
            { highWind, volcanicAshHint },
            [highWind ? '强风风险' : null, volcanicAshHint ? '火山灰风险' : null]
              .filter(Boolean)
              .join('；'),
          )
        : field<{ highWind: boolean; volcanicAshHint?: boolean }>('UNKNOWN');

    const vehicleBooking = vehicleConfirmed
      ? field(
          'CONFIRMED',
          {
            vehicleType,
            rentalCompany: rentalCompany || undefined,
          },
          rentalCompany
            ? `车型 ${vehicleType}；租车公司 ${rentalCompany}`
            : `车型 ${vehicleType}`,
        )
      : field('MISSING');

    const memberDriverProfile =
      driverCount > 0 || experienceHint
        ? field(
            'CONFIRMED',
            {
              driverCount: driverCount || undefined,
              experienceHint: experienceHint || undefined,
            },
            [
              driverCount > 0 ? `驾驶员 ${driverCount} 人` : null,
              experienceHint ? `经验：${experienceHint}` : null,
            ]
              .filter(Boolean)
              .join('；'),
          )
        : field('UNKNOWN');

    const teamRiskTolerance = riskTolerance
      ? field('CONFIRMED', { level: riskTolerance }, `风险承受度：${riskTolerance}`)
      : field('UNKNOWN');

    const budget =
      budgetTotal > 0 || budgetCurrency || budgetStyle
        ? field(
            'CONFIRMED',
            {
              currency: budgetCurrency || undefined,
              total: budgetTotal || undefined,
              style: budgetStyle || undefined,
            },
            [
              budgetStyle ? `预算风格 ${budgetStyle}` : null,
              budgetTotal > 0
                ? `预算 ${budgetCurrency || ''} ${budgetTotal}`.trim()
                : null,
            ]
              .filter(Boolean)
              .join('；'),
          )
        : field('UNKNOWN');

    const existingInsurance = hasExistingSignal
      ? field(
          'CONFIRMED',
          {
            creditCardCover: creditCardCover || undefined,
            travelInsurance: travelInsurance || undefined,
            notes: existingNotes || undefined,
          },
          [
            creditCardCover ? '信用卡已含部分租车保障' : null,
            travelInsurance ? '已有旅行保险' : null,
            existingNotes || null,
          ]
            .filter(Boolean)
            .join('；'),
        )
      : field('UNKNOWN');

    const fields: InsuranceDecisionContext['fields'] = {
      selfDriveSeason,
      routeSummary,
      roadExposure,
      driveLoad,
      weatherRisk,
      vehicleBooking,
      memberDriverProfile,
      teamRiskTolerance,
      budget,
      existingInsurance,
    };

    const missingGate: Array<'ROUTE_SUMMARY' | 'VEHICLE_BOOKING'> = [];
    if (routeSummary.status !== 'CONFIRMED') missingGate.push('ROUTE_SUMMARY');
    if (vehicleBooking.status !== 'CONFIRMED') missingGate.push('VEHICLE_BOOKING');

    const confirmedFacts = Object.values(fields)
      .map((f) => f.factLine)
      .filter((s): s is string => !!s && s.trim().length > 0);

    const missingFields = Object.entries(fields)
      .filter(([, f]) => f.status === 'MISSING')
      .map(([k]) => k);

    return {
      schema: 'tripnara.insurance_decision_context@v1',
      tripId,
      gate: {
        ok: missingGate.length === 0,
        ...(missingGate.length ? { code: 'CONTEXT_MISSING' as const } : {}),
        missing: missingGate,
      },
      fields,
      confirmedFacts,
      missingFields,
    };
  }
}
