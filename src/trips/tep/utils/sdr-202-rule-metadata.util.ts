import type { PlanningRuleResult } from '../contracts/tep-self-drive.types';
import type { DailyDrivePlan } from '../contracts/tep-self-drive.types';

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function clockToMinutes(clock: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(clock.trim());
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToClock(total: number): string {
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function addMinutesToClock(clock: string, minutes: number): string | undefined {
  const base = clockToMinutes(clock);
  if (base == null) return undefined;
  return minutesToClock(base + minutes);
}

/** arrive 晚于 cutoff 的分钟数；跨午夜时 arrive 为次日凌晨（<06:00） */
export function computeMinutesOverCutoff(arriveLocal: string, cutoffLocal: string): number | undefined {
  const arrive = clockToMinutes(arriveLocal);
  const cutoff = clockToMinutes(cutoffLocal);
  if (arrive == null || cutoff == null) return undefined;

  if (arrive > cutoff) {
    return arrive - cutoff;
  }

  // arrive 在当日傍晚 cutoff 之前结束（如 09:00 vs 23:34）
  if (arrive >= 6 * 60) {
    return 0;
  }

  // 次日凌晨（<06:00）仍可能超出前一日 cutoff
  return arrive + (24 * 60 - cutoff);
}

export function formatNoNightDriveDetail(input: {
  arriveLocal: string;
  sunsetLocal: string;
  cutoffLocal: string;
  maxMinutesAfterSunset: number;
  overMinutes: number;
}): string {
  return `预计 ${input.arriveLocal} 结束，超出安全截止 ${input.cutoffLocal}（日落 ${input.sunsetLocal} + ${input.maxMinutesAfterSunset} 分钟，+${input.overMinutes}min）`;
}

export function reprojectSdr202ForDraftBuffer(
  meta: Sdr202RuleMetadata,
  draftMaxMinutesAfterSunset: number,
): Sdr202RuleMetadata {
  if (!meta.sunsetLocal || !meta.finishLocal) {
    return { ...meta, maxMinutesAfterSunset: draftMaxMinutesAfterSunset };
  }

  const cutoffLocal = addMinutesToClock(meta.sunsetLocal, draftMaxMinutesAfterSunset);
  if (!cutoffLocal) {
    return { ...meta, maxMinutesAfterSunset: draftMaxMinutesAfterSunset };
  }

  const overMinutes = computeMinutesOverCutoff(meta.finishLocal, cutoffLocal);
  return {
    ...meta,
    maxMinutesAfterSunset: draftMaxMinutesAfterSunset,
    cutoffLocal,
    overMinutes,
  };
}

function safeExplanation(rule: PlanningRuleResult): string {
  return typeof rule.explanation === 'string' ? rule.explanation : '';
}

export interface Sdr202DaylightEvidence {
  sunsetLocal?: string;
  civilDuskLocal?: string;
  lat?: number;
  lng?: number;
}

export interface Sdr202RuleMetadata {
  dayIndex?: number;
  legId?: string;
  finishLocal?: string;
  cutoffLocal?: string;
  overMinutes?: number;
  sunsetLocal?: string;
  civilDuskLocal?: string;
  maxMinutesAfterSunset?: number;
  segmentLabel?: string;
  degradationReason?: string;
}

export function parseDaylightEvidenceRefs(
  evidenceRefs: PlanningRuleResult['evidenceRefs'] | null | undefined,
): Sdr202DaylightEvidence {
  const evidence: Sdr202DaylightEvidence = {};
  for (const ref of asArray(evidenceRefs)) {
    const predicate = ref.predicate ?? '';
    const sunsetMatch = /^daylight\.sunset:(\d{2}:\d{2})$/.exec(predicate);
    if (sunsetMatch) {
      evidence.sunsetLocal = sunsetMatch[1];
      continue;
    }
    const duskMatch = /^daylight\.civilDusk:(\d{2}:\d{2})$/.exec(predicate);
    if (duskMatch) {
      evidence.civilDuskLocal = duskMatch[1];
      continue;
    }
    const geoMatch = /^daylight\.geo:([-\d.]+),([-\d.]+)$/.exec(predicate);
    if (geoMatch) {
      evidence.lat = Number(geoMatch[1]);
      evidence.lng = Number(geoMatch[2]);
    }
  }
  return evidence;
}

export function parseSdr202RuleMetadata(result: PlanningRuleResult): Sdr202RuleMetadata {
  const daylight = parseDaylightEvidenceRefs(result.evidenceRefs);
  const affectedRefs = asArray(result.affectedRefs);
  const explanation = safeExplanation(result);
  const dayRef = affectedRefs.find((ref) => /^day_(\d+)$/.test(ref));
  const dayIndex = dayRef ? Number(dayRef.replace('day_', '')) : undefined;
  const legId = affectedRefs.find((ref) => ref.startsWith('drive_leg_'));

  const finishMatch = /预计\s*(\d{2}:\d{2})\s*结束/.exec(explanation);
  const cutoffMatch = /截止\s*(\d{2}:\d{2})/.exec(explanation);
  const sunsetMatch = /日落\s*(\d{2}:\d{2})/.exec(explanation);
  const bufferMatch = /\+\s*(\d+)\s*分钟/.exec(explanation);
  const overMatch = /\+(\d+)min/.exec(explanation);

  return {
    dayIndex,
    legId,
    finishLocal: finishMatch?.[1],
    cutoffLocal: cutoffMatch?.[1],
    overMinutes: overMatch ? Number(overMatch[1]) : undefined,
    sunsetLocal: sunsetMatch?.[1] ?? daylight.sunsetLocal,
    civilDuskLocal: daylight.civilDuskLocal,
    maxMinutesAfterSunset: bufferMatch ? Number(bufferMatch[1]) : undefined,
    degradationReason: result.degradationReason,
  };
}

export function resolveSdr202SegmentLabel(input: {
  rule: PlanningRuleResult;
  plan?: DailyDrivePlan;
  itemLabelsById?: Map<string, string>;
}): string | undefined {
  const legId = asArray(input.rule.affectedRefs).find((ref) => ref.startsWith('drive_leg_'));
  if (!input.plan || !legId) return undefined;
  const legs = asArray(input.plan.legs);
  const leg = legs.find((row) => row.legId === legId);
  if (!leg) return undefined;
  const labels = input.itemLabelsById ?? new Map<string, string>();
  const from = labels.get(leg.fromRef) ?? input.plan.origin.label;
  const to = labels.get(leg.toRef) ?? input.plan.destination.label;
  if (from && to) return `${from} → ${to}`;
  return from ?? to;
}

export function buildNoNightDetailFromSdr202Rule(input: {
  rule: PlanningRuleResult;
  plan?: DailyDrivePlan;
  itemLabelsById?: Map<string, string>;
  /** preview what-if：用 draft buffer 重算 cutoff / 超时 */
  maxMinutesAfterSunset?: number;
}): {
  dayNumber: number;
  label: string;
  startTimeLabel?: string;
  detail: string;
  itemId?: string;
} | undefined {
  if (input.rule.degraded) return undefined;
  const baseMeta = parseSdr202RuleMetadata(input.rule);
  if (baseMeta.dayIndex == null) return undefined;

  const buffer =
    input.maxMinutesAfterSunset ??
    baseMeta.maxMinutesAfterSunset ??
    30;
  const meta = reprojectSdr202ForDraftBuffer(baseMeta, buffer);

  const routeLabel =
    resolveSdr202SegmentLabel(input) ??
    (input.plan && input.plan.origin.label !== input.plan.destination.label
      ? `${input.plan.origin.label} → ${input.plan.destination.label}`
      : input.plan?.destination.label ?? '驾驶路段');

  const finish = meta.finishLocal ?? '待确认';
  const sunset = meta.sunsetLocal;
  const cutoff = meta.cutoffLocal;

  const detail =
    sunset && cutoff && meta.overMinutes != null && meta.overMinutes > 0
      ? formatNoNightDriveDetail({
          arriveLocal: finish,
          sunsetLocal: sunset,
          cutoffLocal: cutoff,
          maxMinutesAfterSunset: buffer,
          overMinutes: meta.overMinutes,
        })
      : sunset && cutoff
        ? `预计 ${finish} 结束，安全截止 ${cutoff}（日落 ${sunset} + ${buffer} 分钟）`
        : sunset
          ? `预计 ${finish} 结束，日落 ${sunset} 后 ${buffer} 分钟内应停止驾驶`
          : `预计 ${finish} 结束，超出安全驾驶时间窗`;

  return {
    dayNumber: meta.dayIndex,
    label: routeLabel,
    detail,
    itemId: asArray(input.plan?.legs).find((leg) => leg.legId === meta.legId)?.toRef,
  };
}
