export type HardRuleFact = {
  rule_id: string;
  /** Optional decision/action trace references (PRD v1.1). */
  decision_id?: string;
  action_id?: string;
  /** Optional human-friendly name */
  rule_name?: string;
  /** Key metric/value that triggered the rule (number/string/bool) */
  actual_value?: number | string | boolean | null;
  /** Threshold/baseline used at decision time */
  threshold?: number | string | null;
  unit?: string;
  is_violated: boolean;
  severity?: 'HARD' | 'SOFT';
  /** Rich snapshots for auditability (PRD v1.1). */
  fact_snapshot?: Record<string, unknown>;
  threshold_snapshot?: Record<string, unknown>;
  triggered_rules?: string[];
  explanation_text?: string;
  drift_labels?: Array<'CONTEXT_FACT_MISMATCH' | 'MENDACIOUS_AI' | 'STALE_CONTEXT' | 'MISSING_EVIDENCE'>;
  evidence?: Record<string, unknown>;
  at?: string;
};

export type HardRuleSnapshot = {
  assertions_triggered: HardRuleFact[];
};

export function normalizeHardRuleSnapshot(raw: unknown): HardRuleSnapshot {
  const list = (raw as any)?.assertions_triggered;
  if (!Array.isArray(list)) return { assertions_triggered: [] };
  const out: HardRuleFact[] = [];
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const rule_id = String((it as any).rule_id ?? '').trim();
    if (!rule_id) continue;
    out.push({
      rule_id,
      ...(typeof (it as any).decision_id === 'string' ? { decision_id: (it as any).decision_id } : {}),
      ...(typeof (it as any).action_id === 'string' ? { action_id: (it as any).action_id } : {}),
      ...(typeof (it as any).rule_name === 'string' ? { rule_name: (it as any).rule_name } : {}),
      ...(typeof (it as any).is_violated === 'boolean' ? { is_violated: (it as any).is_violated } : { is_violated: true }),
      ...((it as any).actual_value !== undefined ? { actual_value: (it as any).actual_value } : {}),
      ...((it as any).threshold !== undefined ? { threshold: (it as any).threshold } : {}),
      ...(typeof (it as any).unit === 'string' ? { unit: (it as any).unit } : {}),
      ...(typeof (it as any).severity === 'string' ? { severity: (it as any).severity } : {}),
      ...((it as any).fact_snapshot && typeof (it as any).fact_snapshot === 'object'
        ? { fact_snapshot: (it as any).fact_snapshot }
        : {}),
      ...((it as any).threshold_snapshot && typeof (it as any).threshold_snapshot === 'object'
        ? { threshold_snapshot: (it as any).threshold_snapshot }
        : {}),
      ...(Array.isArray((it as any).triggered_rules) ? { triggered_rules: (it as any).triggered_rules } : {}),
      ...(typeof (it as any).explanation_text === 'string' ? { explanation_text: (it as any).explanation_text } : {}),
      ...(Array.isArray((it as any).drift_labels) ? { drift_labels: (it as any).drift_labels } : {}),
      ...((it as any).evidence && typeof (it as any).evidence === 'object' ? { evidence: (it as any).evidence } : {}),
      ...(typeof (it as any).at === 'string' ? { at: (it as any).at } : {}),
    });
  }
  return { assertions_triggered: out };
}

export function mergeTriggeredAssertions(
  existing: unknown,
  append: HardRuleFact[],
): HardRuleSnapshot {
  const cur = normalizeHardRuleSnapshot(existing);
  const key = (x: HardRuleFact) => x.rule_id;
  const by = new Map(cur.assertions_triggered.map((x) => [key(x), x]));
  for (const a of append) {
    if (!a?.rule_id) continue;
    by.set(key(a), { ...by.get(key(a)), ...a });
  }
  return { assertions_triggered: Array.from(by.values()) };
}

