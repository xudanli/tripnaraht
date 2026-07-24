/**
 * RETURN_TO_RESEARCH 定向上下文：缺失证据 + 失败原因码 → 定向 research scopes。
 * 禁止默认全量清空资产域 / 无目标泛搜索。
 */

import type { ResearchAssetScope } from '../utils/research-asset-scope.util';
import { dedupeResearchScopes } from '../utils/research-asset-scope.util';

export const RETURN_TO_RESEARCH_CONTEXT_SCHEMA_ID = 'tripnara.return_to_research_context@v1' as const;

export type ReturnToResearchFailureEventLike = {
  code?: string;
  message?: string;
  suggestedAction?: string;
  step?: string;
  severity?: string;
};

export interface ReturnToResearchContextV1 {
  schemaId: typeof RETURN_TO_RESEARCH_CONTEXT_SCHEMA_ID;
  version: 1;
  reason: 'RETURN_TO_RESEARCH';
  failure_codes: string[];
  missing_evidence: string[];
  scopes: ResearchAssetScope[];
  /** true：后续 RESEARCH 禁止无标注降级到 full */
  forbid_full_research: boolean;
  at: string;
}

const EVIDENCE_CODES = new Set([
  'EVIDENCE_SNAPSHOT_UNBOUND',
  'EVIDENCE_VERSION_MISMATCH',
]);

/** 最小安全定向集（证据绑定问题）：非全量 6 域 */
const EVIDENCE_SCOPES: ResearchAssetScope[] = ['destination', 'common'];

/** REQUIRED_INPUT_MISSING 默认定向（可被 message 启发式收窄/加宽） */
const REQUIRED_INPUT_DEFAULT_SCOPES: ResearchAssetScope[] = ['destination', 'transport'];

export function mapFailureCodeToResearchScopes(code: string): ResearchAssetScope[] {
  const c = String(code || '').toUpperCase();
  if (EVIDENCE_CODES.has(c)) {
    return [...EVIDENCE_SCOPES];
  }
  if (c === 'REQUIRED_INPUT_MISSING') {
    return [...REQUIRED_INPUT_DEFAULT_SCOPES];
  }
  if (c.includes('TRANSPORT') || c.includes('COMMUTE')) {
    return ['transport'];
  }
  if (c.includes('HOTEL') || c.includes('ACCOMMODATION')) {
    return ['hotel'];
  }
  if (c.includes('FLIGHT') || c.includes('AIR')) {
    return ['flight'];
  }
  if (c.includes('COMPLIANCE') || c.includes('VISA') || c.includes('SAFETRAVEL')) {
    return ['compliance'];
  }
  // 未知码：仍定向 destination，禁止默认 6 域全清
  return ['destination'];
}

export function inferScopesFromFailureMessage(message: string | undefined): ResearchAssetScope[] {
  if (!message || typeof message !== 'string') return [];
  const m = message.toLowerCase();
  const out: ResearchAssetScope[] = [];
  if (/(hotel|accommodation|lodging)/.test(m)) out.push('hotel');
  if (/(flight|airfare|airport)/.test(m)) out.push('flight');
  if (/(transport|commute|drive|road|f-?road)/.test(m)) out.push('transport');
  if (/(visa|compliance|safetravel)/.test(m)) out.push('compliance');
  if (/(poi|destination|opening|weather|evidence|snapshot)/.test(m)) out.push('destination');
  return out;
}

export function deriveReturnToResearchScopes(
  events: ReturnToResearchFailureEventLike[] | undefined,
): {
  scopes: ResearchAssetScope[];
  failure_codes: string[];
  missing_evidence: string[];
} {
  const list = Array.isArray(events) ? events : [];
  const codes: string[] = [];
  const missing: string[] = [];
  let scopes: ResearchAssetScope[] = [];

  for (const ev of list) {
    const code = String(ev.code || '').trim();
    if (code) {
      codes.push(code);
      scopes = scopes.concat(mapFailureCodeToResearchScopes(code));
    }
    const msg = typeof ev.message === 'string' ? ev.message.trim() : '';
    if (msg) {
      missing.push(msg.slice(0, 240));
      scopes = scopes.concat(inferScopesFromFailureMessage(msg));
    } else if (code) {
      missing.push(code);
    }
  }

  const deduped = dedupeResearchScopes(scopes);
  // 无事件时仍给最小定向，避免 apply 层退回全量 6 域
  const finalScopes =
    deduped.length > 0 ? deduped : (['destination', 'transport'] as ResearchAssetScope[]);

  return {
    scopes: finalScopes,
    failure_codes: [...new Set(codes)],
    missing_evidence: [...new Set(missing)].slice(0, 16),
  };
}

export function buildReturnToResearchContextV1(input: {
  events?: ReturnToResearchFailureEventLike[];
  at?: string;
}): ReturnToResearchContextV1 {
  const derived = deriveReturnToResearchScopes(input.events);
  return {
    schemaId: RETURN_TO_RESEARCH_CONTEXT_SCHEMA_ID,
    version: 1,
    reason: 'RETURN_TO_RESEARCH',
    failure_codes: derived.failure_codes,
    missing_evidence: derived.missing_evidence,
    scopes: derived.scopes,
    forbid_full_research: true,
    at: input.at ?? new Date().toISOString(),
  };
}

/** RESEARCH：是否处于「禁止无标注 full」的 R2R 会话 */
export function isReturnToResearchForbidFull(meta: Record<string, unknown> | undefined): boolean {
  const ctx = meta?.return_to_research_context_v1 as ReturnToResearchContextV1 | undefined;
  return ctx?.schemaId === RETURN_TO_RESEARCH_CONTEXT_SCHEMA_ID && ctx.forbid_full_research === true;
}
