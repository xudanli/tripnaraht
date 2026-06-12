/**
 * 住宿健康度 UI（tripnara.accommodation_health@v1）— 用进度条/标签替代冷冰冰的公里数诊断。
 */

import type { TravelDiagnosticReport, StayDistanceIssue } from '../narrator/utils/travel-diagnostic-collector.util';

export const ACCOMMODATION_HEALTH_SCHEMA = 'tripnara.accommodation_health@v1' as const;

export type AccommodationNightStatus = 'booked' | 'missing' | 'warning' | 'critical';

export interface AccommodationNightHealthUi {
  night_index: number;
  status: AccommodationNightStatus;
  label_zh: string;
  /** 替代 raw km：如「约 18 小时车程，疑似定错城市」 */
  warning_badge_zh?: string;
  driving_time_label_zh?: string;
  cta_label_zh?: string;
}

export interface AccommodationHealthUi {
  schema: typeof ACCOMMODATION_HEALTH_SCHEMA;
  total_nights: number;
  nights: AccommodationNightHealthUi[];
  summary_zh: string;
}

function drivingLabel(issue: StayDistanceIssue, critical: boolean): string {
  const hours = issue.drivingMinutesEstimate / 60;
  if (critical || issue.distanceKm > 500) {
    const h = Math.max(1, Math.round(hours));
    return `⚠️ 景点到酒店需开跨国级长途（约 ${h} 小时车程），疑似酒店定错城市`;
  }
  if (hours >= 2) {
    const h = hours.toFixed(1).replace(/\.0$/, '');
    return `⚠️ 收队后还需约 ${h} 小时车程，建议换近一点的住处`;
  }
  const mins = issue.drivingMinutesEstimate;
  return `距锚点驾车约 ${mins} 分钟`;
}

function nightLabel(index: number): string {
  return `第 ${index} 晚`;
}

export function buildAccommodationHealthUi(report: TravelDiagnosticReport): AccommodationHealthUi | undefined {
  if (report.totalDays <= 0) return undefined;

  const geoByNight = new Map(report.geoImpossibleStays.map((s) => [s.nightIndex, s]));
  const paceByNight = new Map(report.pacingRiskStays.map((s) => [s.nightIndex, s]));
  const missingSet = new Set(report.missingAccommodationDays);

  const nights: AccommodationNightHealthUi[] = [];

  for (let i = 1; i <= report.totalDays; i++) {
    const geo = geoByNight.get(i);
    const pace = paceByNight.get(i);

    if (geo) {
      nights.push({
        night_index: i,
        status: 'critical',
        label_zh: nightLabel(i),
        warning_badge_zh: drivingLabel(geo, true),
        driving_time_label_zh: drivingLabel(geo, true),
        cta_label_zh: '换近一点的高分民宿',
      });
    } else if (pace) {
      nights.push({
        night_index: i,
        status: 'warning',
        label_zh: nightLabel(i),
        warning_badge_zh: drivingLabel(pace, false),
        driving_time_label_zh: drivingLabel(pace, false),
        cta_label_zh: '查看更近的备选',
      });
    } else if (missingSet.has(i)) {
      nights.push({
        night_index: i,
        status: 'missing',
        label_zh: nightLabel(i),
        warning_badge_zh: '🛏️ 还没定落脚点',
        cta_label_zh: '点我一键帮填',
      });
    } else {
      nights.push({
        night_index: i,
        status: 'booked',
        label_zh: nightLabel(i),
      });
    }
  }

  const missingCount = report.missingAccommodationDays.length;
  const problemCount =
    report.geoImpossibleStays.length + report.pacingRiskStays.length + missingCount;

  let summary_zh = `共 ${report.totalDays} 晚：${report.totalDays - missingCount} 晚已有着落`;
  if (problemCount === 0) {
    summary_zh += '，动线与住宿衔接顺畅。';
  } else if (missingCount > 0) {
    summary_zh += `，还有 ${missingCount} 晚没地方睡哦。`;
  } else {
    summary_zh += '，有少数几晚需要调整住宿位置。';
  }

  return {
    schema: ACCOMMODATION_HEALTH_SCHEMA,
    total_nights: report.totalDays,
    nights,
    summary_zh,
  };
}
