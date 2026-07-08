import type { GuideTravelContext } from './guide-to-plan.types';
import type { GuideRouteAvailability } from './guide-spatial.types';

/** Pack 提供的出行条件补充提示（并入 pendingConfirmations） */
export interface RouteConstraintPackHint {
  field: string;
  label: string;
  reason: string;
  required: boolean;
}

export interface RouteConstraintHintInput {
  countryCode?: string;
  travelContext?: GuideTravelContext | null;
}

/** 单日路线约束评估输入（国家无关） */
export interface CountryRoadConstraintInput {
  countryCode?: string;
  travelDate?: string;
  placeNames: string[];
  drivingMinutes?: number;
  routeExists?: boolean;
  travelContext?: GuideTravelContext | null;
}

/** Pack 运行时上下文（实时数据源等） */
export interface RouteConstraintContext {
  liveRoadStatuses?: Array<{ roadId: string; status: string }>;
}

/** 国家/目的地道路约束 Pack */
export interface CountryRoadConstraintPack {
  /** ISO 3166-1 alpha-2；`'*'` 表示通用兜底 */
  readonly supportedCountryCodes: readonly string[];
  assessDayRoute(
    input: CountryRoadConstraintInput,
    ctx?: RouteConstraintContext,
  ): Promise<GuideRouteAvailability>;
  /** 该 Pack 建议用户补充的出行字段（可选） */
  getTravelContextHints?(input: RouteConstraintHintInput): RouteConstraintPackHint[];
}
