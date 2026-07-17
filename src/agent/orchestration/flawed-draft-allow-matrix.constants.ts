/**
 * allow_flawed_draft_narrate 允许矩阵：安全 / 法规道路 / 核心交通 / 硬时间窗 禁止瑕疵交付。
 */

import type { GateResult, GateViolation } from '../interfaces/trip-plan.interface';

export const FLAWED_DRAFT_ALLOW_MATRIX_VERSION = '1.0.0' as const;

export type FlawedDraftForbidCategory =
  | 'safety'
  | 'road_legality'
  | 'core_transport'
  | 'hard_time_window'
  | 'access_blocked';

export type FlawedDraftForbidHit = {
  category: FlawedDraftForbidCategory;
  signal: string;
};

const HARD_TYPES = new Set(['SAFETY', 'REACHABILITY', 'DEM', 'TIME_CONFLICT']);

const TRANSPORT_DETAIL_RE =
  /(f-?road|2wd|4wd|vehicle|transport|commute|无法通行|租车|核心交通)/i;
const ROAD_DETAIL_RE = /(road|terrain|dem|高地|封闭|禁行|通行性)/i;
const TIME_DETAIL_RE = /(time.?window|opening|营业|时间窗|日照|日落)/i;
const ACCESS_DETAIL_RE = /(access.?blocked|sold.?out|售罄|不可进入|关门)/i;

export function classifyHardGateViolation(v: GateViolation): FlawedDraftForbidCategory | null {
  if (v.severity !== 'HARD') return null;
  if (v.type === 'SAFETY') return 'safety';
  if (v.type === 'REACHABILITY' || v.type === 'DEM') return 'road_legality';
  if (v.type === 'TIME_CONFLICT') return 'hard_time_window';

  const detail = `${v.detail ?? ''} ${v.display_headline_zh ?? ''}`;
  if (ACCESS_DETAIL_RE.test(detail)) return 'access_blocked';
  if (TRANSPORT_DETAIL_RE.test(detail)) return 'core_transport';
  if (ROAD_DETAIL_RE.test(detail)) return 'road_legality';
  if (TIME_DETAIL_RE.test(detail)) return 'hard_time_window';
  return null;
}

export function findFlawedDraftForbidHits(input: {
  gateResult?: GateResult | null;
  verifyIssueCodes?: string[];
}): FlawedDraftForbidHit[] {
  const hits: FlawedDraftForbidHit[] = [];
  const violations = input.gateResult?.violations ?? [];
  for (const v of violations) {
    const cat = classifyHardGateViolation(v);
    if (cat) {
      hits.push({ category: cat, signal: `gate:${v.type}:${v.detail?.slice(0, 80) ?? ''}` });
    }
  }

  for (const code of input.verifyIssueCodes ?? []) {
    const c = String(code || '').toUpperCase();
    if (!c) continue;
    if (/(SAFETY|FATAL_SAFETY)/.test(c)) {
      hits.push({ category: 'safety', signal: `verify:${c}` });
    } else if (/(F_?ROAD|VEHICLE|TRANSPORT|REACHABILITY)/.test(c)) {
      hits.push({
        category: /(F_?ROAD|VEHICLE|TRANSPORT)/.test(c) ? 'core_transport' : 'road_legality',
        signal: `verify:${c}`,
      });
    } else if (/(TIME_WINDOW|OPENING_HOURS|TIME_CONFLICT)/.test(c)) {
      hits.push({ category: 'hard_time_window', signal: `verify:${c}` });
    } else if (/(ACCESS_BLOCKED|INVENTORY_SOLD_OUT)/.test(c)) {
      hits.push({ category: 'access_blocked', signal: `verify:${c}` });
    }
  }

  return hits;
}

/** 即使 allow_flawed_draft_narrate=true，命中禁令则不得瑕疵 SUCCESS */
export function isFlawedDraftForbidden(input: {
  gateResult?: GateResult | null;
  verifyIssueCodes?: string[];
}): { forbidden: boolean; hits: FlawedDraftForbidHit[] } {
  const hits = findFlawedDraftForbidHits(input);
  return { forbidden: hits.length > 0, hits };
}

export function extractVerifyIssueCodesFromState(meta: Record<string, unknown> | undefined): string[] {
  const raw =
    meta?.verify_issue_codes ??
    meta?.last_verify_issue_codes ??
    (meta?.verification as { issue_codes?: string[] } | undefined)?.issue_codes;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x)).filter(Boolean);
}

/** 避免未使用 HARD_TYPES lint；暴露给契约测试 */
export const FLAWED_DRAFT_HARD_GATE_TYPES = HARD_TYPES;
