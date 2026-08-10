/**
 * K1：从已归一的 regulations / roadConditions / environment 投影 DriveAdvisory。
 * 不暴露国家专用类型名。
 */
import type { DriveAdvisory } from '../contracts/drive-advisory.types';
import type {
  EnvironmentSlice,
  RoadConditionSlice,
  RegulationSlice,
  RouteUnderstandingSnapshot,
} from '../contracts/self-drive-context.types';

export function projectPackAdvisories(input: {
  roadConditions: RoadConditionSlice;
  environment: EnvironmentSlice;
  regulations: RegulationSlice;
  route: RouteUnderstandingSnapshot;
  legacyAdvisoryLinesZh?: string[];
}): DriveAdvisory[] {
  const out: DriveAdvisory[] = [];

  if (
    input.roadConditions.status &&
    input.roadConditions.status !== 'OPEN' &&
    input.roadConditions.status !== 'UNKNOWN'
  ) {
    out.push({
      type: 'ROAD_ACCESS',
      severity: input.roadConditions.status === 'CLOSED' ? 'BLOCK' : 'WARNING',
      titleZh:
        input.roadConditions.status === 'CLOSED' ? '路段不可通行' : '路况需留意',
      summaryZh: input.roadConditions.reasonZh || '关键路段存在通行限制',
      sourceCode: 'road_conditions',
    });
  }

  if (input.environment.requiresAltitudeAcclimatization) {
    out.push({
      type: 'ALTITUDE',
      severity: 'WARNING',
      titleZh: '高海拔适应',
      summaryZh: '行程含高原/山地区段，请安排适应并控制急升节奏',
      sourceCode: 'altitude_acclimatization',
    });
  }

  if (input.environment.seasonWindowIds?.length) {
    out.push({
      type: 'SEASONAL',
      severity: 'WARNING',
      titleZh: '季节窗口',
      summaryZh: `命中季节约束：${input.environment.seasonWindowIds.slice(0, 3).join('、')}`,
      sourceCode: 'season_windows',
    });
  }

  if (input.regulations.checkpointLikely) {
    out.push({
      type: 'CHECKPOINT',
      severity: 'WARNING',
      titleZh: '检查站 / 通行核验',
      summaryZh: '行程可能途经检查站或限行区域，请提前核验证件与通行要求',
      sourceCode: 'checkpoint',
    });
  }

  if (input.regulations.cityLimitCities?.length) {
    out.push({
      type: 'RESTRICTION',
      severity: 'WARNING',
      titleZh: '城市限行',
      summaryZh: `涉及限行城市：${input.regulations.cityLimitCities.slice(0, 3).join('、')}`,
      sourceCode: 'city_driving_limits',
    });
  }

  if (input.regulations.rentalRestrictionCodes?.includes('NO_F_ROAD')) {
    out.push({
      type: 'VEHICLE_FIT',
      severity: 'WARNING',
      titleZh: '车辆与路段匹配',
      summaryZh: '当前租车条款限制驶入 F-road / 高地路，请核对路线',
      sourceCode: 'rental_no_f_road',
    });
  }

  for (const seg of input.route.criticalSegments.slice(0, 2)) {
    if (seg.criticalReasons.includes('LONG_DAY')) {
      out.push({
        type: 'FATIGUE',
        severity: 'WARNING',
        titleZh: '长驾驶日',
        summaryZh: `${seg.fromLabel} → ${seg.toLabel}${
          seg.distanceKmHint != null ? ` · 约 ${seg.distanceKmHint}km` : ''
        }`,
        affectedSegmentId: seg.segmentId,
        sourceCode: 'long_day_segment',
      });
    }
  }

  // 兜底：消费 metadata 原文案，但统一 type=OTHER
  for (const line of (input.legacyAdvisoryLinesZh ?? []).slice(0, 2)) {
    if (!line.trim()) continue;
    if (out.some((a) => a.summaryZh === line || a.titleZh === line)) continue;
    out.push({
      type: 'OTHER',
      severity: 'INFO',
      titleZh: '行程提示',
      summaryZh: line,
      sourceCode: 'legacy_advisory',
    });
  }

  return out.slice(0, 6);
}
