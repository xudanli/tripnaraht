/**
 * Decision State Projector — Canonical hints → MDS（只读投影）。
 */

import { extractScheduleActivityReferent } from '../chat/build-activity-booking-chat-cards.util';
import { ICELAND_ACTIVITY_BOOKING_CATALOG } from '../../mcp/activity-booking-catalog';
import type {
  BookingChannelMode,
  DayConflictStatus,
  DecisionStateContract,
  DecisionStateProjection,
  KeyPresence,
  ProjectedKeyState,
  StateKey,
} from './decision-state.types';
import { normalizeBookingChannelFromSensor } from './normalize-booking-channel.util';

export type ActivityDecisionProjectionHints = {
  message?: string | null;
  focusDayIndex?: number | null;
  focusDayYmd?: string | null;
  /** TripDayWorldState conflict */
  dayConflict?: {
    status: DayConflictStatus;
    reasons?: string[];
  } | null;
  teamFitness?: {
    floor?: string | null;
    missingCount?: number;
    fit?: string | null;
  } | null;
  activitySearchMeta?: {
    mode?: string | null;
    probed?: number | null;
    browserbase_available?: boolean | null;
    error?: string | null;
  } | null;
  partySize?: number | null;
  highIntensityHint?: boolean | null;
};

function parseDayAnchor(message: string, focusDay?: number | null): {
  dayIndex: number;
  ymd?: string;
} | null {
  const m = String(message ?? '');
  const fromMsg = m.match(/(?:第\s*(\d+)\s*天|Day\s*[-_]?\s*(\d+))/i);
  const n = fromMsg
    ? Number(fromMsg[1] || fromMsg[2])
    : focusDay != null && Number(focusDay) > 0
      ? Number(focusDay)
      : NaN;
  if (!Number.isFinite(n) || n < 1) return null;
  return { dayIndex: n };
}

function resolveActivityRef(message: string): {
  label: string;
  canonicalId?: string;
  confidence: number;
} | null {
  const full = String(message ?? '');
  const utterance = full.replace(/\n*\[日程\][\s\S]*$/u, '').trim();
  const probe = `${utterance}\n${full}`;
  for (const entry of ICELAND_ACTIVITY_BOOKING_CATALOG) {
    if (entry.match.test(probe)) {
      return {
        label: entry.nameZh,
        canonicalId: entry.id,
        confidence: 0.9,
      };
    }
  }
  const scheduleRef = extractScheduleActivityReferent(full);
  if (scheduleRef) {
    return { label: scheduleRef, confidence: 0.7 };
  }
  const lex = utterance.match(
    /(?:冰川徒步|冰洞|蓝湖|蓝潟湖|冰河湖|Zodiac|超级吉普|helicopter|直升机)/i,
  );
  if (lex) return { label: lex[0], confidence: 0.65 };
  if (/(?:活动|景点|体验|徒步)/i.test(utterance)) {
    return { label: utterance.slice(0, 40), confidence: 0.4 };
  }
  return null;
}

function isHighIntensity(message: string, hint?: boolean | null): boolean {
  if (hint === true) return true;
  return /冰川徒步|冰洞|glacier\s*hike|ice\s*cave|高地|超级吉普/i.test(
    String(message ?? ''),
  );
}

function channelFromMeta(
  meta: ActivityDecisionProjectionHints['activitySearchMeta'],
): { mode: BookingChannelMode; noteZh: string } {
  if (!meta) return { mode: 'UNKNOWN', noteZh: '未跑 activity sensor' };
  const norm = normalizeBookingChannelFromSensor({
    ok: Number(meta.probed ?? 0) > 0,
    errorMessage: meta.error ?? null,
    hasLiveInventoryEvidence: Number(meta.probed ?? 0) > 0 && meta.mode === 'browserbase',
    catalogHit:
      meta.mode === 'catalog_only' ||
      meta.mode === 'mixed' ||
      meta.mode === 'browserbase',
  });
  return { mode: norm.bookingChannel, noteZh: norm.reasonCode };
}

function presenceOf(value: unknown, partial = false): KeyPresence {
  if (value == null) return 'MISSING';
  if (partial) return 'PARTIAL';
  return 'PRESENT';
}

export function projectActivityDecisionState(
  contract: DecisionStateContract,
  hints: ActivityDecisionProjectionHints,
): DecisionStateProjection {
  const message = String(hints.message ?? '');
  const day = parseDayAnchor(message, hints.focusDayIndex);
  const activity = resolveActivityRef(message);
  const highIntensity = isHighIntensity(message, hints.highIntensityHint);
  const channel = channelFromMeta(hints.activitySearchMeta);
  const fitness = hints.teamFitness;
  const conflict = hints.dayConflict;

  const resolveKey = (key: StateKey): ProjectedKeyState => {
    switch (key) {
      case 'day_anchor': {
        if (!day) return { key, presence: 'MISSING' };
        return {
          key,
          presence: 'PRESENT',
          value: {
            dayIndex: day.dayIndex,
            ymd: hints.focusDayYmd ?? day.ymd ?? null,
          },
        };
      }
      case 'activity_ref': {
        if (!activity) return { key, presence: 'MISSING' };
        return {
          key,
          presence: activity.confidence >= 0.6 ? 'PRESENT' : 'PARTIAL',
          value: activity,
        };
      }
      case 'team_fitness_floor': {
        if (!highIntensity) {
          return {
            key,
            presence: 'IGNORED',
            noteZh: '非高强度活动，合同条件未触发',
          };
        }
        if (!fitness || (fitness.floor == null && (fitness.missingCount ?? 0) === 0)) {
          return { key, presence: 'MISSING', noteZh: '无团队体能聚合' };
        }
        const missing = Number(fitness.missingCount ?? 0);
        return {
          key,
          presence: missing > 0 || !fitness.floor ? 'PARTIAL' : 'PRESENT',
          value: {
            floor: fitness.floor ?? null,
            missingCount: missing,
            fit: fitness.fit ?? null,
          },
          noteZh: missing > 0 ? `${missing} 人未提交体能` : undefined,
        };
      }
      case 'booking_channel': {
        return {
          key,
          presence: channel.mode === 'UNKNOWN' ? 'UNKNOWN' : 'PRESENT',
          value: { mode: channel.mode },
          noteZh: channel.noteZh,
        };
      }
      case 'day_conflict': {
        if (!conflict) {
          return { key, presence: 'UNKNOWN', value: { status: 'UNKNOWN' } };
        }
        return {
          key,
          presence: 'PRESENT',
          value: {
            status: conflict.status,
            reasons: conflict.reasons ?? [],
          },
        };
      }
      case 'party_size': {
        if (hints.partySize != null && hints.partySize > 0) {
          return { key, presence: 'PRESENT', value: { size: hints.partySize } };
        }
        return { key, presence: 'MISSING' };
      }
      case 'booking_policy': {
        return {
          key,
          presence: activity ? 'PRESENT' : 'MISSING',
          value: activity ? { source: 'catalog', activityId: activity.canonicalId } : null,
        };
      }
      case 'activity_requirements': {
        return {
          key,
          presence: highIntensity ? 'PRESENT' : 'UNKNOWN',
          value: {
            needLevel: highIntensity ? 'MEDIUM_HIGH' : null,
          },
        };
      }
      case 'live_availability': {
        const live = channel.mode === 'LIVE';
        return {
          key,
          presence: live ? 'PRESENT' : 'MISSING',
          value: { mode: channel.mode },
          noteZh: live ? undefined : '无 LIVE 库存证据（技术失败不得当 SOLD_OUT）',
        };
      }
      case 'selected_slot':
      case 'member_eligibility':
      case 'contact_info':
      case 'payment_authorization':
        return { key, presence: 'MISSING' };
      default:
        return { key, presence: 'UNKNOWN' };
    }
  };

  const keys = contract.keys.map((k) => resolveKey(k.key));

  return {
    decisionClass: contract.decisionClass,
    contractVersion: contract.version,
    keys,
    ignored: contract.ignoredWorldKeys.map((key) => ({
      key,
      presence: 'IGNORED' as const,
      noteZh: 'undeclared_by_contract',
    })),
  };
}

export function projectedKeyMap(
  projection: DecisionStateProjection,
): Map<StateKey, ProjectedKeyState> {
  return new Map(projection.keys.map((k) => [k.key, k]));
}
