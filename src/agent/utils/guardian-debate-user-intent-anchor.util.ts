/**
 * 从用户原话解析辩论 SKU 的 `user_intent_anchors`，避免「24 小时不间断环岛」被误读为「每天只开 2 小时」。
 */

import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

export interface GuardianDebateUserIntentAnchors {
  /** 极昼/长日照下长时段、少休眠的连续自驾（非低强度度假） */
  midnight_sun_continuous_drive?: boolean;
  /** 环岛 / 绕岛 / Ring Road 完整或近完整线路 */
  ring_road_full_scope?: boolean;
  /** 供 LLM 合议直接引用的中文释义 */
  interpretation_zh?: string;
  /** 若必须降强度时的披露义务 */
  disambiguation_zh?: string;
}

export function extractGuardianDebateUserIntentAnchors(
  message: string | undefined,
): GuardianDebateUserIntentAnchors | undefined {
  const m = String(message ?? '').trim();
  if (!m) return undefined;

  const midnightSun = /极昼|midnight\s*sun|白夜|长日照/i.test(m);
  const continuousDrive =
    /24\s*小时|24\s*h|不间断|连续.{0,8}(?:开|驾|行驶|跑|环)|少休|不睡|日夜不停|通宵/i.test(m);
  const ringRoad = /环岛|環島|ring\s*road|绕岛|繞島|绕\s*岛|绕一圈|環島公路/i.test(m);
  const selfDrive = /自驾|开车|self[\s-]?drive|drive/i.test(m);

  const marathon =
    continuousDrive && (midnightSun || ringRoad || selfDrive || /极昼/.test(m));
  if (!marathon && !ringRoad) return undefined;

  const parts: string[] = [];
  if (marathon) {
    parts.push(
      '用户希望利用极昼或长日照窗口进行长时段、少休眠的连续自驾（不是「每天仅开 1–2 小时的慢节奏度假」）',
    );
  }
  if (ringRoad) {
    parts.push(
      '用户明确提到环岛/绕岛，默认指环冰岛一号公路的完整或近完整线路，而非仅南岸精华短途',
    );
  }

  return {
    ...(marathon ? { midnight_sun_continuous_drive: true } : {}),
    ...(ringRoad ? { ring_road_full_scope: true } : {}),
    interpretation_zh: parts.join('；'),
    disambiguation_zh: marathon
      ? '若因安全/合规必须显著降强度或缩线，须在 debate_summary 中写明「与用户连续自驾/环岛诉求的取舍」并建议用户确认；不得静默改为低强度南岸方案。'
      : ringRoad
        ? '若 REPLACE 缩至非环岛段落，须说明与用户环岛诉求的冲突并给出确认路径。'
        : undefined,
  };
}

/** 高强度/连续自驾诉求 → 辩论 persona：Dr.Dre 对紧凑日程更宽容 */
export function inferPersonaHintFromUserIntentAnchors(
  anchors: GuardianDebateUserIntentAnchors | undefined,
): TripPlanRequest['persona_hint'] | undefined {
  if (!anchors?.midnight_sun_continuous_drive) return undefined;
  return {
    drdre_tolerance: 'HIGH',
    neptune_creativity: 'BALANCED',
    abu_strictness: 'NORMAL',
  };
}

const LOW_INTENSITY_REPLACE =
  /(?:1[\.．·\-–—~～]|2[\.．·\-–—~～])\s*[-~～至到]\s*(?:1[\.．·\-–—~～]?|2[\.．·\-–—~～]?)\s*小时|单日.{0,12}(?:≤|不超过|降至|压至|仅|约)\s*[12](?:[\.．]5)?\s*小时|南岸精华|缩至.{0,8}南岸|改为南岸|放弃.{0,6}环岛|不再.{0,4}环岛|仅保留南岸/i;

const KEEPS_MARATHON_NARRATIVE =
  /24\s*小时|不间断|连续.{0,6}(?:开|驾)|完整环岛|全程环岛|ring\s*road|绕岛|環島/i;

/**
 * Neptune REPLACE / Dr.Dre ADJUST 是否与用户「连续自驾/环岛」锚点明显冲突（用于丢弃 LLM 合议）。
 */
export function debateOutputContradictsUserIntentAnchors(
  anchors: GuardianDebateUserIntentAnchors | undefined,
  summary: {
    debate_summary_zh?: string;
    neptune_verdict?: string;
    drdre_verdict?: string;
    neptune_evidence?: string[];
    drdre_evidence?: string[];
  },
): boolean {
  if (!anchors?.midnight_sun_continuous_drive && !anchors?.ring_road_full_scope) return false;

  const neptuneActive = summary.neptune_verdict === 'REPLACE';
  const drdreTightens = summary.drdre_verdict === 'ADJUST' || summary.drdre_verdict === 'REJECT';
  if (!neptuneActive && !drdreTightens) return false;

  const blob = [
    summary.debate_summary_zh ?? '',
    ...(summary.neptune_evidence ?? []),
    ...(summary.drdre_evidence ?? []),
  ].join('\n');

  const lowIntensity = LOW_INTENSITY_REPLACE.test(blob);
  const keepsUserFrame = KEEPS_MARATHON_NARRATIVE.test(blob);
  const intentTradeoffAck =
    /诉求.{0,8}(?:冲突|取舍|不符)|与用户.{0,16}(?:原话|诉求|要求)|需.{0,6}确认|intent/i.test(blob);

  if (anchors.midnight_sun_continuous_drive && lowIntensity && !keepsUserFrame && !intentTradeoffAck) {
    return true;
  }

  if (
    anchors.ring_road_full_scope &&
    neptuneActive &&
    /南岸精华|仅.{0,6}南岸|放弃.{0,6}环岛|缩至.{0,8}南岸/i.test(blob) &&
    !intentTradeoffAck
  ) {
    return true;
  }

  return false;
}
