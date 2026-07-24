/**
 * 冰岛 F-road / 高地 + 2WD：INTAKE 结构化澄清与确定性三人格投影（6 月中下旬融雪洪峰等）。
 */

import type { GateResult, TripPlanRequest } from '../interfaces/trip-plan.interface';
import {
  extractVehicleTypeFromCurrentUserMessage,
  stripSystemMessageBlocksForIntakeNl,
} from './trip-plan-intake-vehicle.util';

export interface FroadHighlandIntentSignals {
  f_road_highland_crossing: true;
  primary_froad?: string;
  destination_highland_zh?: string;
  interpretation_zh: string;
  melt_season_risk_zh?: string;
}

export function detectFroadHighlandIntent(text: string): boolean {
  const t = String(text ?? '');
  return (
    /\bF\s*\d{2,3}\b|f-road|F路|高地|内陆|中央高地/i.test(t) ||
    /Landmannalaugar|兰德曼纳|兰曼纳|Landmannalaugar/i.test(t) ||
    /Þórsmörk|Thorsmork|Askja|Kerlingarfjöll/i.test(t)
  );
}

/** 用户话术倾向两驱（含 Yaris / 普通轿车），且未明示四驱 */
export function detectUser2wdVehicleLean(text: string): boolean {
  const t = String(text ?? '');
  if (/4wd|4x4|四驱|全地形/i.test(t)) return false;
  return (
    /2\s*wd|两驱|二驱|前驱/i.test(t) ||
    /雅力士|yaris|经济型|小型车|普通.*(?:车|轿车)|丰田.*(?:轿车|小车)/i.test(t)
  );
}

export function extractPrimaryFroadId(text: string): string | undefined {
  const m = String(text ?? '').match(/\bF\s*(\d{2,3})\b/i);
  return m ? `F${m[1]}` : undefined;
}

export function buildFroadHighlandIntentSignals(intakeNl: string): FroadHighlandIntentSignals | undefined {
  const nl = stripSystemMessageBlocksForIntakeNl(intakeNl);
  if (!detectFroadHighlandIntent(nl)) return undefined;

  const froad = extractPrimaryFroadId(nl);
  const dest = /兰曼纳|兰德曼纳|Landmannalaugar/i.test(nl) ? '兰德曼纳劳卡（Landmannalaugar）' : '内陆高地';

  const melt =
    /6\s*月|六月|融雪|雪水|涉水|河渡|暴涨|初解封|开了/i.test(nl)
      ? '6 月中下旬内陆 F 路初开放期，融雪可导致涉水点水位暴涨，须按实时水位与 road.is 状态评估。'
      : undefined;

  return {
    f_road_highland_crossing: true,
    primary_froad: froad,
    destination_highland_zh: dest,
    interpretation_zh:
      `计划驾驶非四驱车辆经${froad ? ` ${froad} ` : ' F 路 '}穿越内陆高地前往${dest}（冰岛 F 路依法须合规四驱，且须避开不可通行的涉水段）。`,
    melt_season_risk_zh: melt,
  };
}

export function isFroad2wdComplianceScenario(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): boolean {
  const nl = stripSystemMessageBlocksForIntakeNl(
    intakeUserMessage ?? String(trip?.message ?? ''),
  );
  if (!detectFroadHighlandIntent(nl)) return false;
  const vt = extractVehicleTypeFromCurrentUserMessage(nl);
  if (vt === '2WD') return true;
  if (vt === '4WD') return false;
  return detectUser2wdVehicleLean(nl);
}

export function applyFroadHighlandSignalsToTripPlan(
  trip: TripPlanRequest,
  signals: FroadHighlandIntentSignals,
  intakeUserMessage?: string | null,
): TripPlanRequest {
  const nl = intakeUserMessage ?? trip.message;
  const vt = extractVehicleTypeFromCurrentUserMessage(nl ?? '') ?? (detectUser2wdVehicleLean(nl ?? '') ? '2WD' : undefined);
  return {
    ...trip,
    ...(nl ? { message: nl } : {}),
    ...(vt ? { constraints: { ...(trip.constraints ?? {}), vehicle_type: vt } } : {}),
    guardian_debate_trip_context: {
      ...(trip.guardian_debate_trip_context ?? {}),
      user_intent_anchors: {
        ...(trip.guardian_debate_trip_context?.user_intent_anchors ?? {}),
        ...signals,
        ring_road_full_scope: false,
        midnight_sun_continuous_drive: false,
      },
      environment: {
        ...(trip.guardian_debate_trip_context?.environment ?? {}),
        froad_crossing: true,
        primary_froad: signals.primary_froad,
        season_note_zh: signals.melt_season_risk_zh,
      },
    },
  };
}

/** 三人格确定性投影：Abu REJECT + Neptune 26→208 北段替补 + Dr.Dre 绕行耗时 */
export function buildDeterministicFroad2wdGuardianResults(
  gate: GateResult,
  signals: FroadHighlandIntentSignals,
  trip: TripPlanRequest | undefined,
): NonNullable<GateResult['guardian_results']> {
  const froad = signals.primary_froad ?? 'F208';
  const dest = signals.destination_highland_zh ?? '兰德曼纳劳卡';

  return {
    source: 'llm_debate',
    is_simulated: true,
    abu: {
      verdict: 'REJECT',
      evidence: [
        `冰岛 F 路（含 ${froad}）依法要求合规四驱；当前为 2WD，不得进入涉水/碎石高地走廊。`,
        signals.melt_season_risk_zh ??
          '融雪期涉水点水位可能暴涨，无四驱与涉水能力时须物理熔断原路线。',
        '租车保险与车行条款通常对非合规驶入 F 路免责。',
      ],
      evidence_atoms: [
        {
          text: '2WD 与 F-road 准入 HARD 冲突',
          violation_code: 'DEBATE:ABU_FROAD_2WD',
          tag: 'safety',
        },
      ],
    },
    drdre: {
      verdict: 'ADJUST',
      evidence: [
        `改走 26 号公路接 ${froad} 北段（非典型涉水段）将增加行驶时间，须重算当日总驾驶时长与住宿接驳。`,
        '建议在 Hella / Hvolsvöllur 一带拆分休息，避免单日驾驶过载。',
      ],
      evidence_atoms: [
        {
          text: '绕行安全廊道的时间开销',
          violation_code: 'DEBATE:DRE_FROAD_DETOUR',
          tag: 'fatigue',
        },
      ],
    },
    neptune: {
      verdict: 'REPLACE',
      evidence: [
        `替补路线：经 26 号公路转 ${froad} 北段（避开需涉水的南段/河渡），抵达 ${dest} 观景停车场一带，2WD 可安全抵达。`,
        '出发前用 road.is 核对当日开放与水情；核心高地景观可保留，不降级为南岸短途。',
      ],
      evidence_atoms: [
        {
          text: 'Neptune 高地替补：26→208 北段非涉水',
          violation_code: 'DEBATE:NEP_FROAD_REPLACE',
          tag: 'replace_segment',
        },
      ],
    },
    debate_summary_zh:
      `${signals.interpretation_zh} ` +
      `安全与合规结论：2WD 不可执行原 ${froad} 涉水穿越；建议升级四驱或采用 26→${froad} 北段替补并在出发前核对水位。`,
  };
}
