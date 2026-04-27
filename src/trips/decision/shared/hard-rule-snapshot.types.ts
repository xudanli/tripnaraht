export type HardRuleFact = {
  rule_id: string;
  /** Optional human-friendly name */
  rule_name?: string;
  /** Key metric/value that triggered the rule (number/string/bool) */
  actual_value?: number | string | boolean | null;
  /** Threshold/baseline used at decision time */
  threshold?: number | string | null;
  unit?: string;
  is_violated: boolean;
  severity?: 'HARD' | 'SOFT';
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
      ...(typeof (it as any).rule_name === 'string' ? { rule_name: (it as any).rule_name } : {}),
      ...(typeof (it as any).is_violated === 'boolean' ? { is_violated: (it as any).is_violated } : { is_violated: true }),
      ...((it as any).actual_value !== undefined ? { actual_value: (it as any).actual_value } : {}),
      ...((it as any).threshold !== undefined ? { threshold: (it as any).threshold } : {}),
      ...(typeof (it as any).unit === 'string' ? { unit: (it as any).unit } : {}),
      ...(typeof (it as any).severity === 'string' ? { severity: (it as any).severity } : {}),
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

