import type { ConstraintDeltaV1, ConstraintSinkProvenance } from './constraint-sink.types';

export type ExtractedConstraintCandidate = {
  delta: ConstraintDeltaV1;
  confidence: number;
  provenance: ConstraintSinkProvenance;
  applied_keys: string[];
};

const COASTAL_AVOID_PATTERNS = [
  /不去(?:了|啦)?.*(?:海边|沿海|南岸|ring\s*road\s*南|south\s*coast)/i,
  /不要.*(?:海边|沿海|南岸)/,
  /避开.*(?:海边|沿海|南岸|南部海岸)/,
  /skip.*(?:coast|beach|south\s*coast)/i,
  /avoid.*(?:coast|beach|south\s*coast)/i,
];

const INLAND_PIVOT_PATTERNS: Array<{ re: RegExp; to: string }> = [
  { re: /改去(?:了|啦)?\s*(内陆|高地|山区|中央高地|highlands?|interior)/i, to: 'highlands' },
  { re: /换成(?:了|啦)?\s*(内陆|高地|山区|中央高地)/, to: 'highlands' },
  { re: /改为(?:了|啦)?\s*(内陆|高地|山区)/, to: 'highlands' },
  { re: /switch(?:ing)?\s+to\s+(highlands?|interior|inland)/i, to: 'highlands' },
];

const PACE_PATTERNS: Array<{ re: RegExp; pace: ConstraintDeltaV1['pace']; confidence: number }> = [
  { re: /慢节奏|悠闲|不要太赶|宽松/, pace: 'relaxed', confidence: 0.82 },
  { re: /特种兵|赶行程|紧凑|多跑/, pace: 'tight', confidence: 0.8 },
  { re: /relaxed\s+pace|slow\s+pace/i, pace: 'relaxed', confidence: 0.85 },
  { re: /packed\s+schedule|tight\s+pace/i, pace: 'tight', confidence: 0.85 },
];

/**
 * Rule-first extractor for P0; LLM fallback can be added behind FEATURE flag later.
 */
export function extractConstraintDeltasFromMessage(message: string): ExtractedConstraintCandidate | null {
  const text = String(message ?? '').trim();
  if (!text) return null;

  const delta: ConstraintDeltaV1 = {};
  const applied_keys: string[] = [];
  let confidence = 0.72;

  for (const re of COASTAL_AVOID_PATTERNS) {
    if (re.test(text)) {
      delta.negative = {
        ...(delta.negative ?? {}),
        avoid_regions: [...new Set([...(delta.negative?.avoid_regions ?? []), 'south_coast'])],
        notes_zh: delta.negative?.notes_zh ?? '用户表示避免沿海/南岸区域',
      };
      applied_keys.push('negative.avoid_regions');
      confidence = Math.max(confidence, 0.88);
      break;
    }
  }

  for (const { re, to } of INLAND_PIVOT_PATTERNS) {
    const m = text.match(re);
    if (m) {
      delta.destination_pivot = { to, from: m[1] };
      applied_keys.push('destination_pivot');
      confidence = Math.max(confidence, 0.9);
      break;
    }
  }

  for (const { re, pace, confidence: pc } of PACE_PATTERNS) {
    if (re.test(text)) {
      delta.pace = pace;
      applied_keys.push('pace');
      confidence = Math.max(confidence, pc);
      break;
    }
  }

  if (applied_keys.length === 0) return null;

  return {
    delta,
    confidence,
    provenance: 'rule',
    applied_keys,
  };
}
