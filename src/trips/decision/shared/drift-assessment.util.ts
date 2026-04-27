import type { HardRuleFact } from './hard-rule-snapshot.types';

export type DriftSignal = { kind: string; rule_id?: string; detail: string };

export type DriftAssessment = {
  drift_score: number; // [0,1]
  drift_label: 'OK' | 'DRIFT_SUSPECT' | 'CRITICAL_DRIFT';
  drift_signals: DriftSignal[];
};

/**
 * Heuristic drift scorer for auto-sampling (DPO mining).
 * Keeps logic shared between API + background scraper.
 */
export function assessDrift(params: {
  fact: HardRuleFact[];
  explanation: string;
}): DriftAssessment {
  const explanation = String(params.explanation ?? '');
  const fact = Array.isArray(params.fact) ? params.fact : [];

  const lower = explanation.toLowerCase();
  const signals: DriftSignal[] = [];
  let score = 0;

  // Heuristic 1: wind-related claims contradict non-violation / below-threshold facts.
  const windyIntent = /wind|windy|gale|gust|大风|风太大|风很大|风速/.test(explanation);
  if (windyIntent) {
    const windFacts = fact.filter((f) => {
      const unit = String((f as any)?.unit ?? '').toLowerCase();
      const rid = String((f as any)?.rule_id ?? '');
      return unit.includes('m/s') || rid.toLowerCase().includes('wind');
    });
    for (const f of windFacts as any[]) {
      const violated = Boolean(f?.is_violated);
      const actual = typeof f?.actual_value === 'number' ? f.actual_value : undefined;
      const thr = typeof f?.threshold === 'number' ? f.threshold : undefined;
      if (violated === false) {
        score += 0.55;
        signals.push({
          kind: 'FACT_SAYS_OK_BUT_REASONING_CLAIMS_WINDY',
          rule_id: String(f?.rule_id ?? '') || undefined,
          detail: `fact.is_violated=false but explanation mentions wind`,
        });
      }
      if (actual !== undefined && thr !== undefined && actual <= thr) {
        score += 0.25;
        signals.push({
          kind: 'FACT_VALUE_BELOW_THRESHOLD_BUT_REASONING_CLAIMS_WINDY',
          rule_id: String(f?.rule_id ?? '') || undefined,
          detail: `actual_value(${actual}) <= threshold(${thr}) while explanation mentions wind`,
        });
      }
    }
  }

  // Heuristic 2: strong block language without any HARD violated facts.
  const strongBlock = /cannot|can\'t|unsafe|not safe|impossible|禁止|不能|不安全|危险|不可行/.test(lower);
  const hasHardViolation = fact.some(
    (f: any) => String(f?.severity ?? '').toUpperCase() === 'HARD' && Boolean(f?.is_violated) === true,
  );
  if (strongBlock && !hasHardViolation && fact.length > 0) {
    score += 0.25;
    signals.push({
      kind: 'STRONG_BLOCK_LANGUAGE_WITHOUT_HARD_VIOLATION',
      detail: `strong block phrasing found but no HARD violated facts`,
    });
  }

  score = Math.max(0, Math.min(1, score));
  const drift_label = score >= 0.8 ? 'CRITICAL_DRIFT' : score >= 0.5 ? 'DRIFT_SUSPECT' : 'OK';
  return { drift_score: score, drift_label, drift_signals: signals.slice(0, 12) };
}

