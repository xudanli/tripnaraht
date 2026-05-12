/**
 * SafeTravel RSS 第二层：LLM 输出解析 + 与规则层 {@link SafetravelRSSRefined} 合并（永不降级 severity / 不覆盖已解析 published_at）。
 */

import { AlertSeverity } from '../dto/safetravel.dto';
import type { SafetravelRSSRefined } from '../interfaces/safetravel-rss-refined.interface';
import type { SafetravelRssItemRow } from './safetravel-rss-parse.util';
import { stripHtmlLite } from './safetravel-rss-parse.util';
import { isAllowedAffectedRegion } from './safetravel-rss-refine.util';
import {
  SAFETRAVEL_RSS_REFINED_LLM_RUNTIME_NOTES,
  SAFETRAVEL_RSS_REFINED_SYSTEM_PROMPT,
} from '../prompts/safetravel-rss-refined-llm.prompt';

/** 与 `LlmService.getMockResponse` 识别用（勿改文案） */
export const SAFETRAVEL_RSS_LLM_SCHEMA_DESCRIPTION = 'safetravel_rss_refined_v2';

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  [AlertSeverity.LOW]: 1,
  [AlertSeverity.MEDIUM]: 2,
  [AlertSeverity.HIGH]: 3,
  [AlertSeverity.CRITICAL]: 4,
};

function rankOf(s: AlertSeverity): number {
  return SEVERITY_RANK[s] ?? 0;
}

function parseSeverityLoose(v: unknown): AlertSeverity | undefined {
  if (typeof v !== 'string') return undefined;
  const x = v.toLowerCase().trim();
  if (x === AlertSeverity.LOW) return AlertSeverity.LOW;
  if (x === AlertSeverity.MEDIUM) return AlertSeverity.MEDIUM;
  if (x === AlertSeverity.HIGH) return AlertSeverity.HIGH;
  if (x === AlertSeverity.CRITICAL) return AlertSeverity.CRITICAL;
  return undefined;
}

function maxSeverity(a: AlertSeverity, b: AlertSeverity): AlertSeverity {
  return rankOf(a) >= rankOf(b) ? a : b;
}

function parseIsoOrUndefined(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s || s === 'null') return undefined;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

function parseCoordinates(v: unknown): [number, number] | undefined {
  if (v === null || v === undefined) return undefined;
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const lat = Number(v[0]);
  const lon = Number(v[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat < 61 || lat > 69 || lon < -26 || lon > -12) return undefined;
  return [lat, lon];
}

function parseAffectedRegions(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const t = x.trim();
    if (isAllowedAffectedRegion(t)) out.push(t);
  }
  return [...new Set(out)];
}

/** 供 `callLlmWithSchema` 的结构提示（description 供 Mock 分支识别） */
export const SAFETRAVEL_RSS_LLM_JSON_SCHEMA = {
  type: 'object',
  description: SAFETRAVEL_RSS_LLM_SCHEMA_DESCRIPTION,
  properties: {
    severity: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'critical'],
      description: 'Mapped severity (lowercase)',
    },
    title: { type: 'string' },
    body: { type: 'string' },
    published_at: { description: 'ISO-8601 or null' },
    valid_until: { description: 'ISO-8601, relative phrase string, or null' },
    coordinates: { description: '[lat,lon] or null' },
    affected_regions: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['severity', 'title', 'body', 'affected_regions'],
};

export function parseLlmRefinementJson(raw: string): Record<string, unknown> | null {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  cleaned = cleaned.trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];
  try {
    const o = JSON.parse(cleaned) as unknown;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    return o as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function mergeSafetravelRssRefinedWithLlm(
  rule: SafetravelRSSRefined,
  llm: Record<string, unknown>,
): SafetravelRSSRefined {
  const llmSev = parseSeverityLoose(llm.severity);
  const mergedSeverity = llmSev ? maxSeverity(rule.severity, llmSev) : rule.severity;

  const llmBody = typeof llm.body === 'string' ? llm.body.trim() : '';
  const body = llmBody.length > 0 ? llmBody : rule.body;

  const llmRegions = parseAffectedRegions(llm.affected_regions);
  const baseRegions = rule.affected_regions ?? [];
  const affected_regions = [...new Set([...baseRegions, ...llmRegions])];

  const published_at = rule.published_at ?? parseIsoOrUndefined(llm.published_at);

  let valid_until = rule.valid_until;
  if (valid_until === undefined && llm.valid_until != null && llm.valid_until !== 'null') {
    if (typeof llm.valid_until === 'string') {
      const s = llm.valid_until.trim();
      if (s) valid_until = parseIsoOrUndefined(s) ?? s;
    }
  }

  let coordinates = rule.coordinates;
  if (!coordinates) {
    coordinates = parseCoordinates(llm.coordinates);
  }

  const out: SafetravelRSSRefined = {
    severity: mergedSeverity,
    title: rule.title,
    body,
  };
  if (published_at) out.published_at = published_at;
  if (valid_until !== undefined && valid_until !== '') out.valid_until = valid_until;
  if (coordinates) out.coordinates = coordinates;
  if (affected_regions.length) out.affected_regions = affected_regions;
  return out;
}

export function shouldRunSafetravelRssLlmRefine(
  mode: 'auto' | 'always',
  rule: SafetravelRSSRefined,
  row: SafetravelRssItemRow,
): boolean {
  if (mode === 'always') return true;
  const raw = `${row.title || ''} ${stripHtmlLite(row.description || '')}`;
  const blob = `${rule.title} ${rule.body}`.toLowerCase();
  const rawLower = raw.toLowerCase();
  if (/\b(yellow|orange|red)\s+alert\b|\balert:/i.test(rawLower)) return true;
  if (rule.severity === AlertSeverity.LOW && /\b(yellow|orange|red)\b|closure|closed|impassable|eruption|\bstorm\b/i.test(blob)) {
    return true;
  }
  if ((!rule.affected_regions || rule.affected_regions.length === 0) && /\biceland|\bhighland|f-road|\bf\d{2,3}\b|suðurland|reykjav/i.test(blob)) {
    return true;
  }
  if (/\buntil\s+(tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(blob)) return true;
  if (/\bpossible\b.*\b(closure|closed|close)\b/i.test(blob)) return true;
  return false;
}

export function buildSafetravelRssLlmUserPrompt(rule: SafetravelRSSRefined, row: SafetravelRssItemRow): string {
  const ruleJson = JSON.stringify({
    severity: rule.severity,
    title: rule.title,
    body: rule.body,
    published_at: rule.published_at ?? null,
    valid_until: rule.valid_until ?? null,
    coordinates: rule.coordinates ?? null,
    affected_regions: rule.affected_regions ?? [],
  });
  return `${SAFETRAVEL_RSS_REFINED_SYSTEM_PROMPT}

${SAFETRAVEL_RSS_REFINED_LLM_RUNTIME_NOTES}

---
Current time (UTC): ${new Date().toISOString()}

Rule-JSON: ${ruleJson}

RSS_pubDate_raw: ${row.pubDate || ''}
RSS_title: ${row.title || ''}
RSS_description_html (excerpt, max 4000 chars):
${(row.description || '').slice(0, 4000)}

Return only one JSON object as specified in the system block. No markdown fences and no prose before or after the JSON.`;
}

export function resolveSafetravelRssLlmMode(raw: string | undefined): 'auto' | 'always' {
  const m = (raw || 'auto').toLowerCase().trim();
  if (m === 'always' || m === 'all' || m === '1' || m === 'true') return 'always';
  return 'auto';
}

export function isSafetravelRssLlmRefineEnabled(raw: string | undefined): boolean {
  const m = (raw || 'auto').toLowerCase().trim();
  return m !== '0' && m !== 'off' && m !== 'false' && m !== 'no';
}
