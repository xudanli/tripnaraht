/**
 * 轻量路径：SafeTravel / RSS 路段警报中的「红警级」实时风险 → CRITICAL 极速闸（生命红线）。
 * 与 `iceland.lightweight_fast_fail`（依法裁决·F-road+2WD）语义隔离；不写 WDMA。
 */
import type { SafetravelRouteAlertEvidence } from '../../skills/itinerary/safetravel-verify-evidence.util';
import {
  REGIONS_TO_SEGMENTS,
  matchSafetravelRegionKeys,
} from '../../skills/world/safetravel-rss-to-route-verify-alerts.util';
import { CONSTRAINT_IDS } from '../services/constraint-registry';
import type { ItineraryVerifyOutput } from '../../skills/itinerary/itinerary-verify.skill';

const STRAT_RED = 'STRAT_ICE_000';

export type IcelandLightweightRedAlertFastFailInput = {
  message: string;
  tripContextJoined: string;
  safetravel_alerts: unknown[];
  gate_recommendation?: string;
  /** 摘要已锚冰岛（目的地/国家代码 IS） */
  anchoredIcelandTrip: boolean;
};

export type IcelandLightweightRedAlertFastFailResult = {
  hit: boolean;
  promptLines: string[];
  stratIds: string[];
  refIds: string[];
  rawIssues: ItineraryVerifyOutput['issues'];
  durationMs: number;
};

function asEvidenceList(raw: unknown[]): SafetravelRouteAlertEvidence[] {
  const out: SafetravelRouteAlertEvidence[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const summary = typeof o.summary === 'string' ? o.summary : '';
    const title = typeof o.title === 'string' ? o.title : '';
    const refs = o.affected_route_segment_refs;
    const refList = Array.isArray(refs) ? refs.filter((r): r is string => typeof r === 'string' && r.length > 0) : [];
    if (!summary && !title && refList.length === 0) continue;
    out.push({
      ...(typeof o.id === 'string' ? { id: o.id } : {}),
      ...(typeof o.source === 'string' ? { source: o.source } : {}),
      ...(title ? { title } : {}),
      summary: summary || title || 'SafeTravel alert',
      affected_route_segment_refs: refList,
      ...(typeof o.severity === 'string' ? { severity: o.severity } : {}),
    });
  }
  return out;
}

function isRedTierEvidence(a: SafetravelRouteAlertEvidence): boolean {
  const sev = String(a.severity ?? '')
    .trim()
    .toLowerCase();
  if (sev === 'critical') return true;
  const blob = `${a.title ?? ''} ${a.summary}`.toLowerCase();
  return /\bred\s*alert|severity:\s*red|\bcode\s*red\b|national\s+warning|do\s+not\s+travel|unsafe\s+to\s+travel/i.test(
    blob,
  );
}

function collectIntentSegmentRefs(blob: string): string[] {
  const keys = matchSafetravelRegionKeys(blob);
  const refs = new Set<string>();
  for (const k of keys) {
    const segs = REGIONS_TO_SEGMENTS[k];
    if (segs) for (const s of segs) refs.add(s);
  }
  return [...refs];
}

function segmentOverlap(a: readonly string[], b: readonly string[]): boolean {
  const bs = new Set(b);
  for (const x of a) if (bs.has(x)) return true;
  return false;
}

function regionTextOverlap(userBlob: string, alert: SafetravelRouteAlertEvidence): boolean {
  const uk = new Set(matchSafetravelRegionKeys(userBlob));
  if (uk.size === 0) return false;
  const ak = new Set(matchSafetravelRegionKeys(`${alert.title ?? ''} ${alert.summary}`));
  for (const k of ak) if (uk.has(k)) return true;
  return false;
}

function alertMatchesUserIntent(
  alert: SafetravelRouteAlertEvidence,
  userBlob: string,
  anchoredIcelandTrip: boolean,
  gateBlock: boolean,
): boolean {
  const intentRefs = collectIntentSegmentRefs(userBlob);
  const alertRefs = alert.affected_route_segment_refs ?? [];

  if (anchoredIcelandTrip && gateBlock && isRedTierEvidence(alert) && alertRefs.length === 0) {
    return true;
  }
  if (intentRefs.length > 0 && alertRefs.length > 0) {
    return segmentOverlap(alertRefs, intentRefs);
  }
  if (alertRefs.length > 0 && intentRefs.length === 0) {
    return regionTextOverlap(userBlob, alert);
  }
  if (alertRefs.length === 0 && intentRefs.length === 0) {
    return anchoredIcelandTrip && gateBlock && isRedTierEvidence(alert);
  }
  return false;
}

function buildCriticalIssue(alerts: SafetravelRouteAlertEvidence[]): ItineraryVerifyOutput['issues'][0] {
  const lines = alerts.slice(0, 4).map((a) => `- ${(a.title ?? 'SafeTravel').trim()}: ${a.summary.trim().slice(0, 280)}`);
  const msg = `【生命红线】检测到 SafeTravel 官方警报中的红警级条目（${alerts.length} 条），与当前行程/话术区域相关：\n${lines.join('\n')}`;
  return {
    type: 'REACHABILITY_ISSUE',
    severity: 'CRITICAL',
    message: msg,
    suggestion:
      '禁止建议用户「照常出发」「试试看」或淡化风险；须明确建议推迟行程、改线至安全区域，并引导查阅 safetravel.is、road.is、vedur.is 与本地应急号码 112。',
    violation: {
      anchor: {
        constraintId: CONSTRAINT_IDS.ENVIRONMENT_EXTREME_WEATHER_CLOSURE,
        ruleId: 'itinerary.verify:iceland_lightweight:red_alert_life_safety',
      },
      entityRef: { type: 'OTHER', id: 'safetravel_red_alert_fast_fail' },
      evidence: {
        source: 'WEATHER',
        refIds: ['safetravel:rss', `strat:${STRAT_RED}`, ...alerts.slice(0, 3).map((a) => `safetravel:${a.id ?? 'noid'}`)],
      },
      scope: 'GLOBAL',
    },
  };
}

/**
 * 在已有 `safetravel_alerts`（路段级证据）与门控建议下求值；无红警命中则 hit:false。
 */
export function evaluateIcelandLightweightRedAlertFastFail(
  input: IcelandLightweightRedAlertFastFailInput,
): IcelandLightweightRedAlertFastFailResult {
  const empty: IcelandLightweightRedAlertFastFailResult = {
    hit: false,
    promptLines: [],
    stratIds: [],
    refIds: [],
    rawIssues: [],
    durationMs: 0,
  };
  const t0 = Date.now();
  const list = asEvidenceList(input.safetravel_alerts ?? []);
  if (list.length === 0) {
    return { ...empty, durationMs: Date.now() - t0 };
  }
  const gateBlock = String(input.gate_recommendation ?? '').toUpperCase() === 'BLOCK';
  const userBlob = `${input.message ?? ''}\n${input.tripContextJoined ?? ''}`;
  const redTier = list.filter(isRedTierEvidence);
  if (redTier.length === 0) {
    return { ...empty, durationMs: Date.now() - t0 };
  }
  const matched = redTier.filter((a) =>
    alertMatchesUserIntent(a, userBlob, input.anchoredIcelandTrip, gateBlock),
  );
  if (matched.length === 0) {
    return { ...empty, durationMs: Date.now() - t0 };
  }

  const rawIssues: ItineraryVerifyOutput['issues'] = [buildCriticalIssue(matched)];
  const durationMs = Math.max(0, Date.now() - t0);
  const promptLines = [
    '【极速安全闸｜生命红线】检测到与当前意图区域相关的 SafeTravel **红警级**官方警报（非「依法裁决」路况条款，而是实时通行/气象生命线）。',
    `依法须显式引用策略 ID：strat:${STRAT_RED}（TripNARA iceland-v1 · red_alert_life_safety）。`,
    '**禁止**建议用户照常出发、绕开警报「试试看」或仅口头提醒不给出改期/改线；必须在首段给出**硬结论**：推迟出行或撤离至官方声明安全区域，并列出可操作的核验入口（safetravel.is、road.is、vedur.is、112）。',
    '若用户问题与警报区域仅部分重叠，须并列说明「绑定行程区域」与「警报生效区域」的关系，不得用无关地区的平静淡化红警区域风险。',
  ];

  return {
    hit: true,
    promptLines,
    stratIds: [STRAT_RED],
    refIds: [`strat:${STRAT_RED}`, 'safetravel:rss'],
    rawIssues,
    durationMs,
  };
}
