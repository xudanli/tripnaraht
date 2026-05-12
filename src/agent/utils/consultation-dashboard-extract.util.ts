/**
 * 从轻量咨询 LLM 正文中抽取 <<<CONSULTATION_UI_JSON>>>…<<<END_CONSULTATION_UI_JSON>>>，
 * 供前端渲染 Dashboard（与 suggested_operations 块独立）。
 */

import type {
  ConsultationBookingDeadline,
  ConsultationDashboardBudget,
  ConsultationDashboardDayPlan,
  ConsultationDashboardMapHint,
  ConsultationDashboardRiskItem,
  ConsultationDashboardScoreDimension,
  ConsultationDashboardSegment,
  ConsultationDashboardSummaryCard,
  ConsultationDashboardV1,
  ConsultationRiskLevel,
  ConsultationScoreLevel,
  ConsultationTone,
} from '../types/consultation-dashboard.types';

const MARK_START = '<<<CONSULTATION_UI_JSON>>>';
const MARK_END = '<<<END_CONSULTATION_UI_JSON>>>';

const MAX_HEADLINE = 280;
const MAX_SHORT = 120;
const MAX_DETAIL = 800;
const MAX_SEGMENTS_PER_DAY = 28;
const MAX_DAYS = 21;
const MAX_COORDS = 400;

function clampStr(s: unknown, max: number): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

function isRiskLevel(x: unknown): x is ConsultationRiskLevel {
  return x === 'low' || x === 'medium' || x === 'high';
}

function isScoreLevel(x: unknown): x is ConsultationScoreLevel {
  return x === 'low' || x === 'medium' || x === 'high' || x === 'extreme' || x === 'unknown';
}

function isTone(x: unknown): x is ConsultationTone {
  return x === 'neutral' || x === 'positive' || x === 'warning' || x === 'danger';
}

function sanitizeScoreDimensions(raw: unknown): ConsultationDashboardScoreDimension[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ConsultationDashboardScoreDimension[] = [];
  for (const row of raw.slice(0, 14)) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = clampStr(o.id, 64);
    const label = clampStr(o.label, 80);
    const level = isScoreLevel(o.level) ? o.level : 'unknown';
    if (!id || !label) continue;
    const short_note = clampStr(o.short_note, MAX_SHORT);
    out.push({ id, label, level, ...(short_note ? { short_note } : {}) });
  }
  return out.length ? out : undefined;
}

function sanitizeSummaryCards(raw: unknown): ConsultationDashboardSummaryCard[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ConsultationDashboardSummaryCard[] = [];
  for (const row of raw.slice(0, 6)) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = clampStr(o.id, 64);
    const title = clampStr(o.title, 48);
    const value = clampStr(o.value, 160);
    if (!id || !title || !value) continue;
    const hint = clampStr(o.hint, MAX_SHORT);
    const tone = isTone(o.tone) ? o.tone : undefined;
    out.push({
      id,
      title,
      value,
      ...(hint ? { hint } : {}),
      ...(tone ? { tone } : {}),
    });
  }
  return out.length ? out : undefined;
}

function sanitizeRisks(raw: unknown): ConsultationDashboardRiskItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ConsultationDashboardRiskItem[] = [];
  for (const row of raw.slice(0, 14)) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = clampStr(o.id, 64);
    const title = clampStr(o.title, 120);
    const level = isRiskLevel(o.level) ? o.level : 'medium';
    if (!id || !title) continue;
    const detail = clampStr(o.detail, MAX_DETAIL);
    let suggestions: string[] | undefined;
    if (Array.isArray(o.suggestions)) {
      suggestions = o.suggestions
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim().slice(0, 200))
        .slice(0, 8);
      if (suggestions.length === 0) suggestions = undefined;
    }
    out.push({
      id,
      level,
      title,
      ...(detail ? { detail } : {}),
      ...(suggestions?.length ? { suggestions } : {}),
    });
  }
  return out.length ? out : undefined;
}

function sanitizeSegments(raw: unknown): ConsultationDashboardSegment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ConsultationDashboardSegment[] = [];
  for (const row of raw.slice(0, MAX_SEGMENTS_PER_DAY)) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const label = clampStr(o.label, 160);
    if (!label) continue;
    const time = clampStr(o.time, 24);
    const detail = clampStr(o.detail, 400);
    const risk_badge = isRiskLevel(o.risk_badge) ? o.risk_badge : undefined;
    out.push({
      label,
      ...(time ? { time } : {}),
      ...(detail ? { detail } : {}),
      ...(risk_badge ? { risk_badge } : {}),
    });
  }
  return out.length ? out : undefined;
}

function sanitizeDailyPlan(raw: unknown): ConsultationDashboardDayPlan[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ConsultationDashboardDayPlan[] = [];
  for (const row of raw.slice(0, MAX_DAYS)) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const di = o.day_index;
    const day_index = typeof di === 'number' && Number.isFinite(di) ? Math.floor(di) : NaN;
    const title = clampStr(o.title, 160);
    if (!Number.isFinite(day_index) || day_index < 1 || !title) continue;
    const segments = sanitizeSegments(o.segments);
    out.push({
      day_index,
      title,
      ...(segments?.length ? { segments } : {}),
    });
  }
  return out.length ? out : undefined;
}

function sanitizeBudget(raw: unknown): ConsultationDashboardBudget | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const currency = clampStr(o.currency, 8);
  const total_range_label = clampStr(o.total_range_label, 120);
  let breakdown: ConsultationDashboardBudget['breakdown'];
  if (Array.isArray(o.breakdown)) {
    breakdown = o.breakdown
      .slice(0, 12)
      .map((b) => {
        if (!b || typeof b !== 'object') return null;
        const x = b as Record<string, unknown>;
        const category = clampStr(x.category, 32);
        const label = clampStr(x.label, 80);
        const share = typeof x.share === 'number' && Number.isFinite(x.share) ? x.share : undefined;
        if (!category || !label) return null;
        return { category, label, ...(share !== undefined ? { share } : {}) };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (breakdown.length === 0) breakdown = undefined;
  }
  if (!currency && !total_range_label && !breakdown?.length) return undefined;
  return {
    ...(currency ? { currency } : {}),
    ...(total_range_label ? { total_range_label } : {}),
    ...(breakdown?.length ? { breakdown } : {}),
  };
}

function sanitizeBooking(raw: unknown): ConsultationBookingDeadline[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ConsultationBookingDeadline[] = [];
  for (const row of raw.slice(0, 16)) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = clampStr(o.id, 64);
    const title = clampStr(o.title, 120);
    const urgency =
      o.urgency === 'now' || o.urgency === 'soon' || o.urgency === 'flexible' ? o.urgency : 'flexible';
    if (!id || !title) continue;
    const note = clampStr(o.note, 280);
    out.push({ id, title, urgency, ...(note ? { note } : {}) });
  }
  return out.length ? out : undefined;
}

function sanitizeMap(raw: unknown): ConsultationDashboardMapHint | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  let nodes: ConsultationDashboardMapHint['nodes'];
  if (Array.isArray(o.nodes)) {
    nodes = o.nodes
      .slice(0, 48)
      .map((n) => {
        if (!n || typeof n !== 'object') return null;
        const x = n as Record<string, unknown>;
        const label = clampStr(x.label, 120);
        const kind = clampStr(x.kind, 32);
        if (!label) return null;
        return { label, ...(kind ? { kind } : {}) };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (nodes.length === 0) nodes = undefined;
  }
  let path_coordinates: ConsultationDashboardMapHint['path_coordinates'];
  if (Array.isArray(o.path_coordinates)) {
    const coords: Array<[number, number]> = [];
    for (const pair of o.path_coordinates.slice(0, MAX_COORDS)) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const a = pair[0];
      const b = pair[1];
      if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b))
        continue;
      coords.push([a, b]);
    }
    path_coordinates = coords.length ? coords : undefined;
  }
  if (!nodes?.length && !path_coordinates?.length) return undefined;
  return {
    ...(nodes?.length ? { nodes } : {}),
    ...(path_coordinates?.length ? { path_coordinates } : {}),
  };
}

export function sanitizeConsultationDashboard(raw: unknown): ConsultationDashboardV1 | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const version = o.version === 1 ? 1 : 1;

  const headline = clampStr(o.headline, MAX_HEADLINE);
  const subheadline = clampStr(o.subheadline, MAX_HEADLINE);
  const primary_cta_label = clampStr(o.primary_cta_label, 48);

  const score_dimensions = sanitizeScoreDimensions(o.score_dimensions);
  const summary_cards = sanitizeSummaryCards(o.summary_cards);
  const risks = sanitizeRisks(o.risks);
  const daily_plan = sanitizeDailyPlan(o.daily_plan);
  const budget = sanitizeBudget(o.budget);
  const booking_deadlines = sanitizeBooking(o.booking_deadlines);
  const map = sanitizeMap(o.map);

  const hasAny =
    headline ||
    subheadline ||
    score_dimensions?.length ||
    summary_cards?.length ||
    risks?.length ||
    daily_plan?.length ||
    budget ||
    booking_deadlines?.length ||
    map ||
    primary_cta_label;

  if (!hasAny) return undefined;

  return {
    version,
    ...(headline ? { headline } : {}),
    ...(subheadline ? { subheadline } : {}),
    ...(score_dimensions?.length ? { score_dimensions } : {}),
    ...(summary_cards?.length ? { summary_cards } : {}),
    ...(risks?.length ? { risks } : {}),
    ...(daily_plan?.length ? { daily_plan } : {}),
    ...(budget ? { budget } : {}),
    ...(booking_deadlines?.length ? { booking_deadlines } : {}),
    ...(map ? { map } : {}),
    ...(primary_cta_label ? { primary_cta_label } : {}),
  };
}

export function extractConsultationDashboardFromAnswer(raw: string): {
  cleanText: string;
  dashboard: ConsultationDashboardV1 | undefined;
} {
  const idx = raw.indexOf(MARK_START);
  const idxEnd = raw.indexOf(MARK_END);
  if (idx === -1 || idxEnd === -1 || idxEnd <= idx) {
    return { cleanText: raw.trim(), dashboard: undefined };
  }
  const jsonStr = raw.slice(idx + MARK_START.length, idxEnd).trim();
  const before = raw.slice(0, idx).trim();
  const after = raw.slice(idxEnd + MARK_END.length).trim();
  const cleanText = [before, after].filter(Boolean).join('\n\n').trim();

  try {
    const parsed = JSON.parse(jsonStr);
    const dashboard = sanitizeConsultationDashboard(parsed);
    return { cleanText: cleanText || raw.trim(), dashboard };
  } catch {
    return { cleanText: cleanText || raw.trim(), dashboard: undefined };
  }
}
