import { Injectable } from '@nestjs/common';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { IntakeGap } from '../utils/clarification-question-generator.util';
import { CONSTRAINT_IDS } from '../services/constraint-registry';
import type { RepairTrace, SimulatedRepairTrace } from '../services/route-feasibility.types';
import { buildHistoricalBoundarySimulations } from '../utils/intake-predictive-simulator.util';

export type IntakeCompileStatus = 'SUCCESS' | 'SPEC_TYPE_ERROR' | 'INTENT_COMPILE_ERROR';

export interface IntakeCompileDiagnostic {
  status: IntakeCompileStatus;
  message: string; // human-facing, may include [L3-PROOF|...] prefix
  gap?: IntakeGap;
}

/** Strongly-typed INTAKE simulation payload (zero-string core; narrative is derived). */
export interface IntakeCompilerSimulationResult {
  simulatedRepairTraces: SimulatedRepairTrace[];
}

@Injectable()
export class IntakeCompilerService {
  compile(input: { tripPlanRequest: TripPlanRequest; sessionRepairTraces?: RepairTrace[] }): {
    status: IntakeCompileStatus;
    diagnostics: IntakeCompileDiagnostic[];
    simulation?: IntakeCompilerSimulationResult;
  } {
    const t = input.tripPlanRequest;
    const diagnostics: IntakeCompileDiagnostic[] = [];

    // L4: minimal syntax/type checks (beyond existing gap detector)
    const days = typeof (t as any).days === 'number' ? (t as any).days : undefined;
    if (days !== undefined && (!Number.isFinite(days) || days <= 0)) {
      diagnostics.push({
        status: 'SPEC_TYPE_ERROR',
        message: 'days 必须为正数',
        gap: { type: 'SPEC_TYPE_ERROR', severity: 'HARD', detail: 'days 必须为正数' },
      });
    }

    // L3: pre-flight lower-bound check (Ring Road baseline)
    const ring = this.detectRingRoadIntent(t);
    const maxDrivingHoursLimit = this.defaultMaxDrivingHoursLimit(t);
    if (ring && typeof days === 'number' && Number.isFinite(days) && days > 0) {
      const ringRoadKm = 1332; // baseline physical lower bound (Iceland Ring Road)
      const avgSpeedKmh = 70; // conservative lower bound for multi-day driving
      const requiredHoursPerDay = ringRoadKm / days / avgSpeedKmh;
      // LEQ: requiredHoursPerDay <= limit
      const slack = maxDrivingHoursLimit - requiredHoursPerDay;
      if (slack < 0) {
        const proof = `[L3-PROOF|${CONSTRAINT_IDS.TIME_SPACE_MAX_DRIVING_HOURS}|DAY:baseline|cmp:LEQ|actual:${round(
          requiredHoursPerDay,
          2,
        )}|limit:${round(maxDrivingHoursLimit, 2)}|unit:h|slack:${round(slack, 2)}|evidence:LOWER_BOUND]`;
        const human =
          `物理下界校验不通过：环岛距离约 ${ringRoadKm}km，在 ${days} 天内日均需驾驶约 ${round(
            requiredHoursPerDay,
            1,
          )} 小时，已超过安全上限 ${round(maxDrivingHoursLimit, 1)} 小时。建议增加天数或缩小范围。`;
        const detail = `${proof} ${human}`;
        diagnostics.push({
          status: 'INTENT_COMPILE_ERROR',
          message: detail,
          gap: { type: 'INTENT_COMPILE_ERROR', severity: 'HARD', detail },
        });
      }
    }

    const simulatedRepairTraces = buildHistoricalBoundarySimulations({
      tripPlanRequest: t as any,
      detectRingRoadIntent: (x) => this.detectRingRoadIntent(x as TripPlanRequest),
      sessionRepairTraces: input.sessionRepairTraces,
    });
    const simulation: IntakeCompilerSimulationResult | undefined =
      simulatedRepairTraces.length > 0 ? { simulatedRepairTraces } : undefined;

    const status: IntakeCompileStatus =
      diagnostics.find((d) => d.status === 'INTENT_COMPILE_ERROR')?.status ??
      diagnostics.find((d) => d.status === 'SPEC_TYPE_ERROR')?.status ??
      'SUCCESS';

    return { status, diagnostics, ...(simulation ? { simulation } : {}) };
  }

  private detectRingRoadIntent(t: TripPlanRequest): boolean {
    const msg = String((t as any)?.message ?? '').toLowerCase();
    const dest = String((t as any)?.destination ?? '').toLowerCase();
    const mentionsRing =
      /ring\s*road|环岛|環島|绕岛|繞島|一圈|一周|绕一圈|繞一圈/.test(msg) ||
      /环岛|環島|ring\s*road/.test(dest);
    const mentionsIceland = /iceland|冰岛|冰島|reykjavik|雷克雅未克/.test(msg + ' ' + dest);
    return mentionsRing && mentionsIceland;
  }

  private defaultMaxDrivingHoursLimit(t: TripPlanRequest): number {
    const party = (t as any)?.party;
    // conservative defaults: elderly/kids => lower hard threshold
    const hasElderly = Boolean(party?.has_elderly);
    const hasKids = Boolean(party?.has_kids);
    if (hasElderly || hasKids) return 8;
    return 10;
  }
}

function round(n: number, digits: number): number {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}
