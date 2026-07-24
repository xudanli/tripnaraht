/**
 * User-facing narrative from Attention Primary SSO — strip internal taxonomy.
 */

import type { UnifiedDecisionItemProjection } from '../contracts/attention-orchestration.types';

const INTERNAL_COPY_PATTERNS = [
  /^道路\s*\/\s*可行性/i,
  /^执行偏差：\d+\s*个行程项受影响/,
  /^执行偏差$/,
  /^当前行程无法按原计划执行$/,
  /RFC-001/i,
  /FEASIBILITY_FAILURE/i,
  /EXECUTION_SCHEDULE/i,
  /urgency\s*HIGH/i,
  /urgency\s*MEDIUM/i,
  /·\s*urgency/i,
];

function isWeakAttentionExplanation(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 10) return true;
  return isInternalAttentionCopy(t);
}

export function isInternalAttentionCopy(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return INTERNAL_COPY_PATTERNS.some((p) => p.test(t));
}

export function sanitizeAttentionCopy(text: string): string {
  return text
    .replace(/RFC-001\s*/gi, '')
    .replace(/FEASIBILITY_FAILURE\s*/gi, '')
    .replace(/EXECUTION_SCHEDULE_INFEASIBLE\s*/gi, '')
    .replace(/·\s*urgency\s*(HIGH|MEDIUM|LOW)\s*/gi, '')
    .replace(/urgency\s*(HIGH|MEDIUM|LOW)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/。+/g, '。')
    .trim();
}

export function buildAttentionPrimaryUserNarrative(
  primary: Pick<
    UnifiedDecisionItemProjection,
    'headline' | 'explanation' | 'primarySemanticCapability'
  >,
  ctx?: { place?: string },
): { whatHappened: string; impactOnTrip: string } {
  const place = ctx?.place?.trim();
  const semantic = primary.primarySemanticCapability;

  const headline = sanitizeAttentionCopy(primary.headline);
  const explanation = sanitizeAttentionCopy(primary.explanation);

  if (semantic === 'EXECUTION_SCHEDULE_INFEASIBLE' || semantic === 'EXECUTION_SLIP') {
    return {
      whatHappened:
        !isInternalAttentionCopy(headline) && headline
          ? headline
          : place
            ? `${place}：强风等原因导致今天的原计划无法按时完成`
            : '强风等原因导致今天的原计划无法按时完成',
      impactOnTrip:
        !isWeakAttentionExplanation(explanation) && explanation
          ? explanation
          : '预计到达下一活动时间可能已超过最晚入场时间，今日部分安排需要调整',
    };
  }

  if (
    semantic === 'WEATHER_ACTIVITY_PROHIBITED' ||
    semantic === 'WEATHER_STRONG_WIND' ||
    semantic === 'WEATHER_SEVERE'
  ) {
    return {
      whatHappened:
        !isInternalAttentionCopy(headline) && headline
          ? headline
          : place
            ? `${place}预计受强风影响，部分活动可能无法按原计划进行`
            : '当前路段预计受强风影响，部分活动可能无法按原计划进行',
      impactOnTrip:
        !isWeakAttentionExplanation(explanation) && explanation
          ? explanation
          : '今日部分安排可能受到影响',
    };
  }

  return {
    whatHappened:
      !isInternalAttentionCopy(headline) && headline
        ? headline
        : place
          ? `${place}需要调整安排`
          : '今日部分行程需要调整',
    impactOnTrip:
      !isWeakAttentionExplanation(explanation) && explanation
        ? explanation
        : '今日部分安排可能受到影响',
  };
}
