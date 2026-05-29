import { Injectable, Logger } from '@nestjs/common';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { IntakeGap } from '../utils/clarification-question-generator.util';
import { CONSTRAINT_IDS } from '../services/constraint-registry';
import type { RepairTrace, SimulatedRepairTrace } from '../services/route-feasibility.types';
import { buildHistoricalBoundarySimulations } from '../utils/intake-predictive-simulator.util';
import {
  extractGuardianDebateUserIntentAnchors,
  type GuardianDebateUserIntentAnchors,
} from '../utils/guardian-debate-user-intent-anchor.util';
import { resolvePlanningDaysForUserClarification } from '../utils/structured-intake-clarification.util';

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

export interface IntakeCompileResult {
  status: IntakeCompileStatus;
  diagnostics: IntakeCompileDiagnostic[];
  simulation?: IntakeCompilerSimulationResult;
  /** 极昼马拉松：物理下界超标但已豁免 HARD 拦截，下放至三人格门禁 */
  marathon_lower_bound_deferred?: boolean;
  user_intent_anchors?: GuardianDebateUserIntentAnchors;
  /** 环岛物理下界建议天数（供 INTAKE candidate_structure 与澄清参考） */
  suggested_days_for_deferred_lower_bound?: number;
}

const RING_ROAD_KM = 1332;
const RING_ROAD_AVG_SPEED_KMH = 70;

@Injectable()
export class IntakeCompilerService {
  private readonly logger = new Logger(IntakeCompilerService.name);

  compile(input: { tripPlanRequest: TripPlanRequest; sessionRepairTraces?: RepairTrace[] }): IntakeCompileResult {
    const t = input.tripPlanRequest;
    const diagnostics: IntakeCompileDiagnostic[] = [];

    // L4: minimal syntax/type checks (beyond existing gap detector)
    const userMessage = resolveTripPlanUserMessage(t);
    const tripCalendarDays = typeof (t as any).days === 'number' ? (t as any).days : undefined;
    if (tripCalendarDays !== undefined && (!Number.isFinite(tripCalendarDays) || tripCalendarDays <= 0)) {
      diagnostics.push({
        status: 'SPEC_TYPE_ERROR',
        message: 'days 必须为正数',
        gap: { type: 'SPEC_TYPE_ERROR', severity: 'HARD', detail: 'days 必须为正数' },
      });
    }

    // L3: pre-flight lower-bound check (Ring Road baseline)
    const ring = this.detectRingRoadIntent(t);
    const maxDrivingHoursLimit = this.defaultMaxDrivingHoursLimit(t);
    let marathon_lower_bound_deferred = false;
    let user_intent_anchors: GuardianDebateUserIntentAnchors | undefined;
    let suggested_days_for_deferred_lower_bound: number | undefined;

    // 绑定 Trip 的 days=7 与用户本轮「24h 环岛」NL 解耦，避免误判为可执行强度
    const planningDays =
      ring && (tripCalendarDays != null || userMessage)
        ? resolvePlanningDaysForUserClarification(t, userMessage)
        : undefined;

    if (ring && typeof planningDays === 'number' && Number.isFinite(planningDays) && planningDays > 0) {
      const requiredHoursPerDay = RING_ROAD_KM / planningDays / RING_ROAD_AVG_SPEED_KMH;
      const slack = maxDrivingHoursLimit - requiredHoursPerDay;
      if (slack < 0) {
        user_intent_anchors = extractGuardianDebateUserIntentAnchors(userMessage);
        const isMidnightSunMarathon = Boolean(user_intent_anchors?.midnight_sun_continuous_drive);

        if (isMidnightSunMarathon) {
          marathon_lower_bound_deferred = true;
          const minPhysicsDays = Math.ceil(
            RING_ROAD_KM / (RING_ROAD_AVG_SPEED_KMH * maxDrivingHoursLimit),
          );
          suggested_days_for_deferred_lower_bound = Math.max(minPhysicsDays, 7);

          const detail =
            `[L3-DEFER|midnight_sun_continuous_drive] 检测到极昼/连续自驾马拉松意图：` +
            `环岛约 ${RING_ROAD_KM}km、${planningDays} 天日历下日均驾驶约 ${round(requiredHoursPerDay, 1)} 小时，` +
            `已超过 ${round(maxDrivingHoursLimit, 1)} 小时硬上限；` +
            `豁免 INTAKE 硬拦截，转交三人格门禁进行生物钟/错峰/强制休息博弈。`;
          this.logger.log(`[IntakeCompiler] ${detail}`);
          diagnostics.push({
            status: 'SUCCESS',
            message: detail,
            gap: { type: 'INTENT_COMPILE_ERROR', severity: 'SOFT', detail },
          });
        } else {
          const proof = `[L3-PROOF|${CONSTRAINT_IDS.TIME_SPACE_MAX_DRIVING_HOURS}|DAY:baseline|cmp:LEQ|actual:${round(
            requiredHoursPerDay,
            2,
          )}|limit:${round(maxDrivingHoursLimit, 2)}|unit:h|slack:${round(slack, 2)}|evidence:LOWER_BOUND]`;
          const human =
            `物理下界校验不通过：环岛距离约 ${RING_ROAD_KM}km，在 ${planningDays} 天内日均需驾驶约 ${round(
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

    return {
      status,
      diagnostics,
      ...(simulation ? { simulation } : {}),
      ...(marathon_lower_bound_deferred
        ? {
            marathon_lower_bound_deferred: true,
            user_intent_anchors,
            suggested_days_for_deferred_lower_bound,
          }
        : {}),
    };
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

function resolveTripPlanUserMessage(t: TripPlanRequest): string {
  const raw =
    (t as { message?: string }).message ?? (t as { intake_user_message?: string }).intake_user_message ?? '';
  return String(raw).trim();
}
