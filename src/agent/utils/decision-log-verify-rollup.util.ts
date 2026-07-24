import type { DecisionLogEntry } from '../interfaces/trip-plan.interface';

/** 从决策日志 VERIFY 步骤的 metadata.issues 汇总（门控 ALLOW 后仍可能存在） */
export type VerifyIssuesRollup = {
  hasConflict: boolean;
  hasAdvisory: boolean;
  conflictCodes: string[];
};

export function rollupVerifyIssuesFromDecisionLog(
  decisionLog: DecisionLogEntry[] | undefined | null,
): VerifyIssuesRollup {
  const out: VerifyIssuesRollup = { hasConflict: false, hasAdvisory: false, conflictCodes: [] };
  if (!Array.isArray(decisionLog) || decisionLog.length === 0) return out;
  const codes = new Set<string>();
  for (const entry of decisionLog) {
    if (String((entry as { step?: string }).step) !== 'VERIFY') continue;
    const issues = (entry as { metadata?: { issues?: unknown } }).metadata?.issues;
    if (!Array.isArray(issues)) continue;
    for (const iss of issues) {
      if (!iss || typeof iss !== 'object') continue;
      const rec = iss as { class?: string; code?: string };
      const cls = String(rec.class ?? '');
      const code = typeof rec.code === 'string' ? rec.code : '';
      if (cls === 'CONFLICT') {
        out.hasConflict = true;
        if (code) codes.add(code);
      } else if (cls === 'ADVISORY') {
        out.hasAdvisory = true;
      }
    }
  }
  out.conflictCodes = [...codes];
  return out;
}
