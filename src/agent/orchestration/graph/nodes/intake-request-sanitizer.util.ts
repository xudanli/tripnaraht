import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { TripPlanRequest } from '../../../interfaces/trip-plan.interface';
import {
  buildFitnessProfileLinesZhFromTravelPreference,
  buildPhysicalCapabilityConstraintBlockEnFromTravelPreference,
  PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY,
  REQUEST_FITNESS_PROFILE_LINES_KEY,
} from '../../../memory/utils/fitness-travel-preference-prompt.util';
import {
  buildIcelandMarketPriorBlockFromTravelPreference,
  ICELAND_MARKET_PRIOR_SYSTEM_HINT_KEY,
} from '../../../memory/utils/iceland-market-preference-prompt.util';

/** AgentService / Hydrator 注入；INTAKE 漏斗消费后从 request.options 剥离 */
export const INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION = 'intake_travel_preference_snapshot' as const;

export type IntakeFitnessMaterial = {
  fitnessLinesZh: string[];
  physicalCapabilityHintEn: string;
  icelandMarketPriorZh: string;
};

function linesFromUnknown(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function travelPreferenceSnapshot(
  request: RouteAndRunRequestDto,
): Record<string, unknown> | null | undefined {
  const opts = request.options as Record<string, unknown> | undefined;
  const snap = opts?.[INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION];
  return snap && typeof snap === 'object' ? (snap as Record<string, unknown>) : undefined;
}

/** 只读窥视（轻量咨询等不经 INTAKE 的路径） */
export function peekIntakeFitnessMaterial(request: RouteAndRunRequestDto): IntakeFitnessMaterial {
  const reqAny = request as unknown as Record<string, unknown>;
  const snapshot = travelPreferenceSnapshot(request);
  const fromSnapshotLines = buildFitnessProfileLinesZhFromTravelPreference(snapshot);
  const fromSnapshotPhys = buildPhysicalCapabilityConstraintBlockEnFromTravelPreference(snapshot);
  const legacyLines = linesFromUnknown(reqAny[REQUEST_FITNESS_PROFILE_LINES_KEY]);
  const legacyPhys =
    typeof reqAny[PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY] === 'string'
      ? String(reqAny[PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY]).trim()
      : '';
  const fromSnapshotMarket = buildIcelandMarketPriorBlockFromTravelPreference(snapshot);
  const legacyMarket =
    typeof reqAny[ICELAND_MARKET_PRIOR_SYSTEM_HINT_KEY] === 'string'
      ? String(reqAny[ICELAND_MARKET_PRIOR_SYSTEM_HINT_KEY]).trim()
      : '';
  return {
    fitnessLinesZh: legacyLines.length > 0 ? legacyLines : (fromSnapshotLines ?? []),
    physicalCapabilityHintEn: legacyPhys || fromSnapshotPhys,
    icelandMarketPriorZh: legacyMarket || fromSnapshotMarket,
  };
}

/**
 * INTAKE 漏斗：消费 request 旁路键与 options 快照，物理删除后不再向下游 Phase 流转。
 */
export function consumeIntakeFitnessMaterial(request: RouteAndRunRequestDto): IntakeFitnessMaterial {
  const material = peekIntakeFitnessMaterial(request);
  const reqAny = request as unknown as Record<string, unknown>;
  delete reqAny[REQUEST_FITNESS_PROFILE_LINES_KEY];
  delete reqAny[PHYSICAL_CAPABILITY_SYSTEM_HINT_KEY];
  delete reqAny[ICELAND_MARKET_PRIOR_SYSTEM_HINT_KEY];
  if (request.options) {
    const opts = { ...(request.options as Record<string, unknown>) };
    delete opts[INTAKE_TRAVEL_PREFERENCE_SNAPSHOT_OPTION];
    request.options = opts as typeof request.options;
  }
  return material;
}

export function applyIntakeFitnessMaterialToTripPlanMessage(
  tripPlanRequest: TripPlanRequest,
  request: RouteAndRunRequestDto,
  material: IntakeFitnessMaterial,
): TripPlanRequest {
  let message = tripPlanRequest.message ?? request.message ?? '';

  if (material.fitnessLinesZh.length > 0) {
    const block = material.fitnessLinesZh.join('\n');
    const sysHint = `[SYSTEM_MESSAGE][FITNESS_PROFILE]\n${block}\n`;
    message = `${sysHint}\n${message}`.trim();
  }

  if (material.physicalCapabilityHintEn) {
    const sysHint =
      `[SYSTEM_MESSAGE][PHYSICAL_CAPABILITY]\n` +
      `${material.physicalCapabilityHintEn}\n` +
      '规划与风险评估时须将上述单日爬升/距离作为**规划强度软上限**参考；若与用户显式 fitness_level 冲突，以显式档位为执行准绳，画像数字仅作解释与风险提示。\n';
    message = `${sysHint}\n${message}`.trim();
  }

  if (material.icelandMarketPriorZh) {
    const sysHint =
      `[SYSTEM_MESSAGE][ICELAND_MARKET_PRIOR]\n` +
      `${material.icelandMarketPriorZh}\n` +
      '以上为客源市场隐式先验（非用户自述国籍）；规划时优先匹配对应路线壳与季节节奏，勿向用户追问「你是哪国人」。\n';
    message = `${sysHint}\n${message}`.trim();
  }

  return { ...tripPlanRequest, message };
}

/** 轻量咨询：读取冰岛市场先验块（不经 INTAKE 亦可） */
export function readIcelandMarketPriorForLightweightQa(request: RouteAndRunRequestDto): string | null {
  const block = peekIntakeFitnessMaterial(request).icelandMarketPriorZh;
  return block.length > 0 ? block : null;
}

/** 轻量咨询路径：与 INTAKE 同源事实源，不剥离 request（可能尚未进入 INTAKE） */
export function readFitnessProfileLinesForLightweightQa(request: RouteAndRunRequestDto): string[] | null {
  const lines = peekIntakeFitnessMaterial(request).fitnessLinesZh;
  return lines.length > 0 ? lines : null;
}
