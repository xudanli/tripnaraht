export type ConflictMatrixEffect = 'HARD_BLOCK' | 'WARNING' | 'RE_ROUTE' | 'SPEED_FACTOR_DOWN';

export interface ConflictMatrixRule {
  id: string;
  conditions: string[];
  effect: ConflictMatrixEffect;
  priority: number;
}

export interface ConflictMatrixHit {
  ruleId: string;
  effect: ConflictMatrixEffect;
  priority: number;
  matchedConditions: string[];
}

type FlatFacts = Record<string, unknown>;

function getByPath(obj: FlatFacts, path: string): unknown {
  const keys = path.split('.').map((x) => x.trim()).filter(Boolean);
  let cur: any = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

function asNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function evalCondition(cond: string, facts: FlatFacts): boolean {
  const s = String(cond ?? '').trim();
  if (!s) return false;

  // includes: a.b includes VALUE
  const mIncludes = s.match(/^([a-zA-Z0-9_.-]+)\s+includes\s+(.+)$/);
  if (mIncludes) {
    const left = getByPath(facts, mIncludes[1]);
    const right = String(mIncludes[2]).trim().replace(/^["']|["']$/g, '');
    if (Array.isArray(left)) return left.map((x) => String(x)).includes(right);
    if (typeof left === 'string') return left.includes(right);
    return false;
  }

  // comparison: a.b <op> value
  const mCmp = s.match(/^([a-zA-Z0-9_.-]+)\s*(=|==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!mCmp) return false;
  const left = getByPath(facts, mCmp[1]);
  const op = mCmp[2];
  const rawRight = String(mCmp[3]).trim().replace(/^["']|["']$/g, '');

  // boolean
  if (rawRight === 'true' || rawRight === 'false') {
    const rb = rawRight === 'true';
    if (op === '=' || op === '==') return Boolean(left) === rb;
    if (op === '!=') return Boolean(left) !== rb;
    return false;
  }

  // numeric
  const ln = asNumber(left);
  const rn = asNumber(rawRight);
  if (ln != null && rn != null) {
    if (op === '=' || op === '==') return ln === rn;
    if (op === '!=') return ln !== rn;
    if (op === '>=') return ln >= rn;
    if (op === '<=') return ln <= rn;
    if (op === '>') return ln > rn;
    if (op === '<') return ln < rn;
  }

  // string fallback
  const ls = left == null ? '' : String(left);
  if (op === '=' || op === '==') return ls === rawRight;
  if (op === '!=') return ls !== rawRight;
  return false;
}

/**
 * Evaluate multi-factor conflict matrix rules.
 * Rule matches only when all conditions are satisfied.
 */
export function evaluateConflictMatrix(params: {
  rules: ConflictMatrixRule[];
  facts: FlatFacts;
}): ConflictMatrixHit[] {
  const out: ConflictMatrixHit[] = [];
  const rules = Array.isArray(params.rules) ? params.rules : [];
  for (const r of rules) {
    const conditions = Array.isArray(r.conditions) ? r.conditions : [];
    if (!r?.id || !conditions.length) continue;
    const ok = conditions.every((c) => evalCondition(c, params.facts));
    if (!ok) continue;
    out.push({
      ruleId: r.id,
      effect: r.effect,
      priority: Number.isFinite(r.priority) ? r.priority : 0,
      matchedConditions: conditions,
    });
  }
  return out.sort((a, b) => b.priority - a.priority);
}
