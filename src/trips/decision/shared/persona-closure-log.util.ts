/**
 * 从 decision logs 提取 persona closure 审计块（replay / stats 共用）。
 */
import type { DecisionLogEntry } from '../shared/decision-result.types';
import type { PersonaClosureAudit, PersonaClosureStopReason } from '../shared/persona-closure.types';

export function countAbuPostNeptuneRechecks(logs: DecisionLogEntry[]): number {
  return logs.filter(
    (l) =>
      l.persona === 'ABU' &&
      l.decisionStage === 'ABU_GATE' &&
      (l.metadata as Record<string, unknown> | undefined)?.persona_closure &&
      typeof (l.metadata as Record<string, unknown>).persona_closure === 'object' &&
      ((l.metadata as Record<string, unknown>).persona_closure as Record<string, unknown>).phase ===
        'post_neptune_recheck',
  ).length;
}

export function extractPersonaClosureAuditFromLogs(logs: DecisionLogEntry[]): PersonaClosureAudit | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const meta = logs[i].metadata;
    if (!meta || typeof meta !== 'object') continue;
    const audit = (meta as Record<string, unknown>).personaClosureAudit;
    if (audit && typeof audit === 'object' && typeof (audit as PersonaClosureAudit).stopReason === 'string') {
      return audit as PersonaClosureAudit;
    }
  }
  return null;
}

export function inferPersonaClosureStopReason(logs: DecisionLogEntry[]): PersonaClosureStopReason | null {
  const audit = extractPersonaClosureAuditFromLogs(logs);
  if (audit?.stopReason) return audit.stopReason;
  const rechecks = countAbuPostNeptuneRechecks(logs);
  if (rechecks === 0) {
    const hasReplace = logs.some(
      (l) => l.persona === 'NEPTUNE' && l.decisionStage === 'SPATIAL_REPAIR' && l.action === 'REPLACE',
    );
    return hasReplace ? null : 'NO_REPLACE';
  }
  const lastRecheck = [...logs]
    .reverse()
    .find(
      (l) =>
        l.persona === 'ABU' &&
        (l.metadata as Record<string, unknown> | undefined)?.persona_closure &&
        ((l.metadata as Record<string, unknown>).persona_closure as Record<string, unknown>).phase ===
          'post_neptune_recheck',
    );
  if (lastRecheck?.action === 'REJECT') return 'NEPTUNE_SHRINK_EXHAUSTED';
  return 'ABU_RECHECK_PASS';
}
