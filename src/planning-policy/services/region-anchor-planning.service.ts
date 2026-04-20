import { Injectable } from '@nestjs/common';
import type { PaceType, RegionIntent, UserRouteIntent } from '../interfaces/region-intent.types';
import type {
  PoiPlanningDecisionSlice,
  PoiPlanningResolutionMeta,
} from '../../decision/kernel/decision-state.types';
import { buildPoiPlanningNarrationHint } from '../utils/poi-planning-narration.util';
import {
  GOLDEN_CIRCLE_DEFAULT_DRIVE_MINUTES,
  ICELAND_ANCHOR_DWELL_DEFAULTS_MIN,
} from '../regions/iceland-region-intents';
import { RegionIntentResolverService } from './region-intent-resolver.service';

/** 与 pace 对应的「整日 buffer」比例（取下限–上限的中间值） */
export function paceBufferFraction(pace: PaceType | undefined): number {
  switch (pace) {
    case 'relaxed':
      return 0.175;
    case 'dense':
      return 0.075;
    case 'normal':
    default:
      return 0.125;
  }
}

/**
 * 超预算时的回退优先级（规范）；具体裁撤由排程/REPAIR 消费。
 */
export const POI_PLAN_BACKOFF_STEPS = [
  'DROP_PASSBY_POIS',
  'DROP_OPTIONAL_POIS_LOW_SCORE_HIGH_DETOUR',
  'COMPRESS_OPTIONAL_DWELL',
  'COMPRESS_ANCHOR_DWELL_TO_MIN',
  'KEEP_CORE_ANCHORS_ONLY_NOTIFY_USER',
] as const;

export type PoiPlanBackoffStep = (typeof POI_PLAN_BACKOFF_STEPS)[number];

export interface AnchorBudgetOptions {
  /** 驾驶总时长估计（分钟）；无路由引擎时由调用方传入占位 */
  estimatedDriveMinutes?: number;
  /** 正餐预留（分钟） */
  mealMinutes?: number;
  /** 认为「紧」的可选空档上限（分钟） */
  tightOptionalCapacityThresholdMinutes?: number;
}

@Injectable()
export class RegionAnchorPlanningService {
  constructor(private readonly regionResolver: RegionIntentResolverService) {}

  /**
   * 从 user.regionId 或原始 query 文本解析区域并生成 poiPlanning 切片（解析失败返回 undefined）
   */
  resolveAndBuildSlice(
    user: Partial<UserRouteIntent>,
    queryText?: string,
    options?: AnchorBudgetOptions,
  ): PoiPlanningDecisionSlice | undefined {
    let regionIntent: RegionIntent | undefined;
    let confidence = 0.9;
    let resolution: PoiPlanningResolutionMeta | undefined;

    if (user.regionId?.trim()) {
      const rid = user.regionId.trim().toLowerCase();
      regionIntent = this.regionResolver.resolveFromRegionId(rid);
      confidence = 0.95;
      resolution = {
        source: 'region_intent_resolver',
        matchedBy: 'region_id',
        matchedRegionKeyword: rid,
      };
    } else if (queryText?.trim()) {
      const hit = this.regionResolver.resolveFromText(queryText);
      regionIntent = hit.regionIntent;
      confidence = hit.confidence;
      if (regionIntent && hit.matchedBy) {
        resolution = {
          source: 'region_intent_resolver',
          matchedBy: 'message_text',
          matchedRegionKeyword: hit.matchedRegionKeyword,
        };
      }
    }

    if (!regionIntent) {
      return undefined;
    }

    return this.buildPoiPlanningSlice(regionIntent, user, confidence, options, resolution);
  }

  /**
   * 合并区域锚点与用户必含/排除，计算日程预算切片，供写入 DSO.poiPlanning
   */
  buildPoiPlanningSlice(
    regionIntent: RegionIntent,
    user: Partial<UserRouteIntent>,
    confidence: number,
    options?: AnchorBudgetOptions,
    resolution?: PoiPlanningResolutionMeta,
  ): PoiPlanningDecisionSlice {
    const estimatedDrive =
      options?.estimatedDriveMinutes ??
      (regionIntent.regionId === 'golden_circle'
        ? GOLDEN_CIRCLE_DEFAULT_DRIVE_MINUTES
        : 120);
    const meal = options?.mealMinutes ?? 60;
    const tightThreshold =
      options?.tightOptionalCapacityThresholdMinutes ?? 45;

    const must = new Set(user.mustIncludePoiIds ?? []);
    const exclude = new Set([
      ...(regionIntent.excludedPoiIds ?? []),
      ...(user.excludePoiIds ?? []),
    ]);

    const requiredAnchorPoiIds = this.mergeRequiredAnchors(
      regionIntent.requiredAnchorPoiIds,
      must,
    );

    const optionalCandidatePoiIds = regionIntent.optionalPoiIds.filter(
      (id) =>
        !requiredAnchorPoiIds.includes(id) &&
        !exclude.has(id),
    );

    const excludedPoiIds = Array.from(exclude);

    const pace = user.pace ?? 'normal';
    const totalBudgetMinutes =
      user.totalBudgetMinutes ?? Math.round(regionIntent.recommendedIdealHours * 60);

    const anchorDwellSum = this.sumRecommendedDwell(requiredAnchorPoiIds);
    const bufferMinutes = Math.round(totalBudgetMinutes * paceBufferFraction(pace));
    const requiredCostMinutes =
      anchorDwellSum + estimatedDrive + meal + bufferMinutes;
    const optionalCapacityMinutes = Math.round(
      totalBudgetMinutes - requiredCostMinutes,
    );

    let feasibility: 'ok' | 'tight' | 'failed' = 'ok';
    if (requiredCostMinutes > totalBudgetMinutes) {
      feasibility = 'failed';
    } else if (optionalCapacityMinutes < tightThreshold) {
      feasibility = 'tight';
    }

    const raw: PoiPlanningDecisionSlice = {
      routeIntent: {
        regionId: regionIntent.regionId,
        regionName: regionIntent.regionName,
        confidence,
        mustCoverAnchors: true,
      },
      poiPlan: {
        requiredAnchorPoiIds,
        optionalCandidatePoiIds,
        excludedPoiIds,
        selectedOptionalPoiIds: [],
      },
      schedulePlan: {
        totalBudgetMinutes,
        requiredCostMinutes,
        optionalCapacityMinutes,
        bufferMinutes,
        feasibility,
      },
      resolution,
    };
    return this.applyMinimalBudgetGate(raw, {
      regionName: regionIntent.regionName,
    });
  }

  /**
   * 轻量预算门控：紧/失败或无 optional 余量时不带 optional 候选（只保留骨架锚点）。
   */
  applyMinimalBudgetGate(
    slice: PoiPlanningDecisionSlice,
    ctx?: { regionName?: string },
  ): PoiPlanningDecisionSlice {
    const feas = slice.schedulePlan?.feasibility;
    const cap = slice.schedulePlan?.optionalCapacityMinutes ?? 0;
    const optionalBefore = slice.poiPlan?.optionalCandidatePoiIds?.length ?? 0;
    const shouldClearOptional = feas === 'failed' || feas === 'tight' || cap <= 0;

    const narrationHint =
      feas === 'tight' || feas === 'failed'
        ? buildPoiPlanningNarrationHint(
            feas,
            ctx?.regionName ?? slice.routeIntent?.regionName,
            slice.schedulePlan?.totalBudgetMinutes,
          )
        : undefined;

    const budgetGateApplied =
      feas === 'tight' || feas === 'failed' || cap <= 0;

    const appliedBackoffSteps = [...(slice.appliedBackoffSteps ?? [])];
    if (shouldClearOptional && optionalBefore > 0) {
      appliedBackoffSteps.push('MINIMAL_BUDGET_DROP_OPTIONAL_CANDIDATES');
    }

    if (!shouldClearOptional) {
      return {
        ...slice,
        budgetGateApplied: false,
        narrationHint: narrationHint ?? slice.narrationHint,
      };
    }

    return {
      ...slice,
      poiPlan: slice.poiPlan
        ? {
            ...slice.poiPlan,
            optionalCandidatePoiIds: [],
            selectedOptionalPoiIds: [],
          }
        : slice.poiPlan,
      appliedBackoffSteps,
      budgetGateApplied,
      narrationHint: narrationHint ?? slice.narrationHint,
    };
  }

  private mergeRequiredAnchors(
    anchors: string[],
    must: Set<string>,
  ): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of anchors) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    for (const id of must) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }

  private sumRecommendedDwell(anchorIds: string[]): number {
    let sum = 0;
    for (const id of anchorIds) {
      const row = ICELAND_ANCHOR_DWELL_DEFAULTS_MIN[id];
      if (row) {
        sum += row.recommended;
      } else {
        sum += 45;
      }
    }
    return sum;
  }
}
