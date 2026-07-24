/**
 * 将 VERIFY 合成门控 violations / safety_surface issues 与「当前出站 itinerary」对齐，
 * 避免 CGUS/改排后左侧时间轴已换 POI，右侧仍展示旧槽位的开放时间提示。
 */

import { shouldSuppressOpeningHoursVerifyIssue } from './opening-hours-verify-reconcile.util';
import type { SafetySurfaceVerifyIssue } from './safety-surface-payload.util';
import { VERIFY_SYNTHETIC_VIOLATION_PREFIX } from './merge-verify-issues-into-gate.util';
import type { GateResult, GateViolation, Itinerary } from '../interfaces/trip-plan.interface';

type IndexedItem = {
  itemId: string;
  date: string;
  name: string;
  startWindow: string;
};

export function buildItineraryItemIndex(itinerary: Itinerary): Map<string, IndexedItem> {
  const map = new Map<string, IndexedItem>();
  for (const day of itinerary.days ?? []) {
    const date = String(day.date ?? '').slice(0, 10);
    for (const item of day.items ?? []) {
      map.set(String(item.id), {
        itemId: String(item.id),
        date,
        name: String(item.location_ref?.name ?? '').trim(),
        startWindow: String(item.start_window ?? '').trim(),
      });
    }
  }
  return map;
}

function isOpeningHoursRelatedViolation(detail: string): boolean {
  const d = detail.toLowerCase();
  return (
    d.includes('opening_hours') ||
    d.includes('poi_closed') ||
    d.includes('开放时间') ||
    d.includes('可能未开放') ||
    d.includes('缺少开放时间')
  );
}

export function parsePoiNameFromVerifyDetail(detail: string): string | undefined {
  const m = detail.match(/POI\s+"([^"]+)"/);
  return m?.[1]?.trim() || undefined;
}

function parseDateFromVerifyDetail(detail: string): string | undefined {
  const m = detail.match(/在\s+(\d{4}-\d{2}-\d{2})/);
  return m?.[1];
}

/** VERIFY 文案中的计划时刻，如「在 2026-06-02 11:00」或「在 11:00」 */
export function parseScheduledTimeFromVerifyDetail(detail: string): string | undefined {
  const withDate = detail.match(/在\s+\d{4}-\d{2}-\d{2}\s+(\d{1,2}:\d{2})/);
  if (withDate?.[1]) return withDate[1];
  const hmOnly = detail.match(/在\s+(\d{1,2}:\d{2})(?:\s|，|,|$)/);
  return hmOnly?.[1];
}

/**
 * 可执行性提示语义键：同 POI + 同日 + 同时刻 + 同码只保留一条（忽略 entity id 差异导致的重复卡片）。
 */
export function feasibilityIssueSemanticKey(parts: {
  message?: string;
  type?: string;
}): string {
  const msg = String(parts.message ?? '');
  const code =
    msg.match(/\[VERIFY\]\s+([A-Z0-9_]+)/i)?.[1]?.toUpperCase() ??
    String(parts.type ?? '')
      .trim()
      .toUpperCase();
  const name = parsePoiNameFromVerifyDetail(msg);
  const date = parseDateFromVerifyDetail(msg);
  const time = parseScheduledTimeFromVerifyDetail(msg);
  return [code, date ?? '', time ?? '', name ?? ''].join('|');
}

function parseEntityItemId(detail: string): string | undefined {
  const m = detail.match(/\[entity:POI:([^\]]+)\]/i);
  return m?.[1]?.trim();
}

/**
 * 若 violation 指向的 item 已不存在，或同日同槽 POI 名称已变更，则视为陈旧提示并剔除。
 */
export function isStaleVerifyViolationForItinerary(
  detail: string,
  itinerary: Itinerary | null | undefined,
  researchData?: Record<string, unknown>,
): boolean {
  if (!itinerary?.days?.length) return false;
  const raw = String(detail ?? '');
  if (!raw.includes(VERIFY_SYNTHETIC_VIOLATION_PREFIX) && !isOpeningHoursRelatedViolation(raw)) {
    return false;
  }
  if (!isOpeningHoursRelatedViolation(raw)) return false;

  if (shouldSuppressOpeningHoursVerifyIssue(raw, itinerary, researchData)) {
    return true;
  }

  const index = buildItineraryItemIndex(itinerary);
  const itemId = parseEntityItemId(raw);
  const poiName = parsePoiNameFromVerifyDetail(raw);
  const date = parseDateFromVerifyDetail(raw);

  if (itemId) {
    const current = index.get(itemId);
    if (!current) return true;
    if (poiName && current.name && poiName !== current.name) return true;
    if (date && current.date && date !== current.date) return true;
    return false;
  }

  if (poiName && date) {
    const matches = [...index.values()].filter((x) => x.date === date && x.name === poiName);
    return matches.length === 0;
  }

  if (poiName) {
    return ![...index.values()].some((x) => x.name === poiName);
  }

  return false;
}

function violationDedupeKey(detail: string): string {
  return feasibilityIssueSemanticKey({ message: detail });
}

/** 全周 VERIFY 常产生重复卡片；按 POI+日期+码去重 */
export function dedupeGateViolations(violations: GateViolation[]): GateViolation[] {
  const seen = new Set<string>();
  const out: GateViolation[] = [];
  for (const v of violations) {
    const key = violationDedupeKey(String(v.detail ?? ''));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** 改排草案待确认：只保留「写入草案内 POI」的可执行性提示，忽略未入选候选（如斯卡夫塔 vs 斯科加二选一误解） */
export function poiNameMatchesDraftSchedule(poiName: string, draftNames: string[]): boolean {
  const n = poiName.trim();
  if (!n || !draftNames.length) return false;
  return draftNames.some((d) => {
    const draft = d.trim();
    if (!draft) return false;
    return draft === n || draft.includes(n) || n.includes(draft);
  });
}

export function filterGateViolationsToDraftScheduleOnly(
  violations: GateViolation[],
  draftPoiNames: string[],
): GateViolation[] {
  if (!draftPoiNames.length) return violations;
  return violations.filter((v) => {
    const name = parsePoiNameFromVerifyDetail(String(v.detail ?? ''));
    if (!name) return true;
    return poiNameMatchesDraftSchedule(name, draftPoiNames);
  });
}

export function filterSafetyIssuesToDraftScheduleOnly(
  issues: SafetySurfaceVerifyIssue[],
  draftPoiNames: string[],
): SafetySurfaceVerifyIssue[] {
  if (!draftPoiNames.length) return issues;
  return issues.filter((issue) => {
    const name = parsePoiNameFromVerifyDetail(issue.message ?? '');
    if (!name) return true;
    return poiNameMatchesDraftSchedule(name, draftPoiNames);
  });
}

export function filterGateViolationsAgainstItinerary(
  gate: GateResult,
  itinerary: Itinerary | null | undefined,
  researchData?: Record<string, unknown>,
): GateResult {
  let violations = gate.violations ?? [];
  if (itinerary?.days?.length) {
    violations = violations.filter(
      (v) => !isStaleVerifyViolationForItinerary(String(v.detail ?? ''), itinerary, researchData),
    );
  }
  violations = dedupeGateViolations(violations);
  if (
    violations.length === (gate.violations ?? []).length &&
    violations.every((v, i) => v === (gate.violations ?? [])[i])
  ) {
    return gate;
  }
  return { ...gate, violations };
}

export function filterSafetyVerifyIssuesAgainstItinerary(
  issues: SafetySurfaceVerifyIssue[],
  itinerary: Itinerary | null | undefined,
  researchData?: Record<string, unknown>,
): SafetySurfaceVerifyIssue[] {
  if (!itinerary?.days?.length || !issues.length) return issues;
  const index = buildItineraryItemIndex(itinerary);

  const filtered = issues.filter((issue) => {
    const msg = issue.message ?? '';
    if (
      !msg.includes('开放时间') &&
      !msg.includes('可能未开放') &&
      !msg.includes('缺少开放时间') &&
      issue.type !== 'OPENING_HOURS_CONFLICT' &&
      issue.type !== 'POI_CLOSED'
    ) {
      return true;
    }

    const syntheticDetail = `[VERIFY] ${issue.type ?? 'POI_CLOSED'}: ${msg}`;
    if (shouldSuppressOpeningHoursVerifyIssue(syntheticDetail, itinerary, researchData)) {
      return false;
    }

    if (issue.item_id) {
      const current = index.get(issue.item_id);
      if (!current) return false;
      const nameInMsg = parsePoiNameFromVerifyDetail(msg);
      if (nameInMsg && current.name && nameInMsg !== current.name) return false;
      if (issue.day && current.date && String(issue.day).slice(0, 10) !== current.date) return false;
      return true;
    }

    const name = parsePoiNameFromVerifyDetail(msg);
    const date = issue.day ? String(issue.day).slice(0, 10) : parseDateFromVerifyDetail(msg);
    if (name && date) {
      return [...index.values()].some((x) => x.name === name && x.date === date);
    }
    if (name) {
      return [...index.values()].some((x) => x.name === name);
    }
    return true;
  });

  const seen = new Set<string>();
  return filtered.filter((issue) => {
    const key = feasibilityIssueSemanticKey({
      message: issue.message,
      type: issue.type,
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 当 gate 已含同语义 VERIFY 项时，不再在 safety_surface 重复展示 */
export function filterSafetyIssuesDuplicatingGateViolations(
  issues: SafetySurfaceVerifyIssue[],
  gate: GateResult | null | undefined,
): SafetySurfaceVerifyIssue[] {
  if (!gate?.violations?.length || !issues.length) return issues;
  const gateKeys = new Set(
    (gate.violations ?? []).map((v) => feasibilityIssueSemanticKey({ message: String(v.detail ?? '') })),
  );
  return issues.filter(
    (issue) => !gateKeys.has(feasibilityIssueSemanticKey({ message: issue.message, type: issue.type })),
  );
}
