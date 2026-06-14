import { DateTime } from 'luxon';
import type { AssessTripRequestDto, DimensionAssessmentDto } from '../dto/trip-metrics.dto';
import {
  AssessmentDimension,
  AssessmentGrade,
  DayType,
} from '../dto/trip-metrics.dto';

function scoreToGrade(score: number): AssessmentGrade {
  if (score >= 90) return AssessmentGrade.EXCELLENT;
  if (score >= 75) return AssessmentGrade.GOOD;
  if (score >= 60) return AssessmentGrade.FAIR;
  if (score >= 40) return AssessmentGrade.POOR;
  return AssessmentGrade.BAD;
}

/**
 * 评估时间安排（到达/离开日使用宽松阈值）
 */
export function assessTimingForDay(
  items: Array<{ startTime?: Date | null; endTime?: Date | null }>,
  dto: AssessTripRequestDto,
  dayType: DayType,
): DimensionAssessmentDto {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  if (items.length === 0) {
    return {
      dimension: AssessmentDimension.TIMING,
      name: '时间安排',
      score: 100,
      grade: AssessmentGrade.EXCELLENT,
      passed: true,
      description: '当天无活动安排',
    };
  }

  const isTransitDay =
    dayType === DayType.ARRIVAL_DAY || dayType === DayType.DEPARTURE_DAY;

  const firstItem = items.find((item) => item.startTime);
  const lastItem = [...items].reverse().find((item) => item.endTime);

  if (firstItem?.startTime && !isTransitDay) {
    const startHour = DateTime.fromJSDate(firstItem.startTime).hour;
    const earlyThreshold = dto.pacingPreference === 'intensive' ? 6 : 7;

    if (startHour < earlyThreshold) {
      score -= 20;
      issues.push(`第一个活动开始过早 (${startHour}:00)`);
      suggestions.push('建议将第一个活动推迟到 8:00 后');
    } else if (startHour < 8) {
      score -= 10;
      issues.push(`第一个活动开始较早 (${startHour}:00)`);
    }
  }

  if (lastItem?.endTime) {
    const endHour = DateTime.fromJSDate(lastItem.endTime).hour;
    const endMinute = DateTime.fromJSDate(lastItem.endTime).minute;

    if (isTransitDay) {
      if (endHour >= 24 || (endHour === 23 && endMinute > 30)) {
        score -= 15;
        issues.push(`最后活动结束过晚 (${endHour}:${endMinute.toString().padStart(2, '0')})`);
        suggestions.push('建议将最后活动提前，避免深夜仍在户外');
      }
    } else {
      const lateThreshold = dto.pacingPreference === 'relaxed' ? 21 : 22;

      if (endHour >= 23 || (endHour === 22 && endMinute > 30)) {
        score -= 25;
        issues.push(`最后活动结束过晚 (${endHour}:${endMinute.toString().padStart(2, '0')})`);
        suggestions.push('建议将最后活动提前，确保 22:00 前结束');
      } else if (endHour >= lateThreshold) {
        score -= 10;
        issues.push(`最后活动结束较晚 (${endHour}:${endMinute.toString().padStart(2, '0')})`);
      }
    }
  }

  if (firstItem?.startTime && lastItem?.endTime) {
    const start = DateTime.fromJSDate(firstItem.startTime);
    const end = DateTime.fromJSDate(lastItem.endTime);
    const spanHours = end.diff(start, 'hours').hours;

    const maxSpan = isTransitDay
      ? dto.pacingPreference === 'relaxed'
        ? 12
        : dto.pacingPreference === 'intensive'
          ? 16
          : 14
      : dto.pacingPreference === 'relaxed'
        ? 10
        : dto.pacingPreference === 'intensive'
          ? 14
          : 12;

    if (spanHours > maxSpan) {
      score -= 15;
      issues.push(`活动时间跨度过长 (${Math.round(spanHours)} 小时)`);
      suggestions.push(`建议控制每日活动时间跨度在 ${maxSpan} 小时内`);
    }
  }

  const finalScore = Math.max(0, score);
  return {
    dimension: AssessmentDimension.TIMING,
    name: '时间安排',
    score: finalScore,
    grade: scoreToGrade(finalScore),
    passed: finalScore >= 60,
    description: issues.length === 0 ? '时间安排合理' : `发现 ${issues.length} 个时间问题`,
    issues: issues.length > 0 ? issues : undefined,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}
