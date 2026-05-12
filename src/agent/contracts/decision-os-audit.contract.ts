export interface DecisionOsAuditContractViolation {
  field: string;
  reason: 'missing' | 'invalid';
}

export interface NormalizedDecisionOsAudit {
  audit_report: any;
  dominant_cid: string;
  session_consistency_score: number;
  delta_reason: string;
  delta_utility: number;
  intent_revision_flag: boolean;
  violations: DecisionOsAuditContractViolation[];
}

/**
 * decision_os_audit_report runtime contract:
 * - Must always provide dominant_cid / session_consistency_score
 * - Must always provide predictive_feedback_then_repair.drift_vector.{delta_reason,delta_utility}
 * - Never throws (observability path must not break business flow)
 */
export function normalizeDecisionOsAuditContract(auditReport: any): NormalizedDecisionOsAudit {
  const violations: DecisionOsAuditContractViolation[] = [];
  const report = auditReport && typeof auditReport === 'object' ? auditReport : {};
  if (!auditReport || typeof auditReport !== 'object') {
    violations.push({ field: 'audit_report', reason: 'missing' });
  }

  const rawDominant = String(report.dominant_cid ?? '').trim();
  if (!rawDominant) {
    violations.push({ field: 'dominant_cid', reason: 'missing' });
  }
  const dominant_cid = rawDominant || 'unknown.unattributed';

  const scoreRaw = Number(report.session_consistency_score);
  if (!Number.isFinite(scoreRaw)) {
    violations.push({ field: 'session_consistency_score', reason: 'invalid' });
  }
  const session_consistency_score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, scoreRaw)) : 0;

  const linkRaw =
    report.predictive_feedback_then_repair && typeof report.predictive_feedback_then_repair === 'object'
      ? report.predictive_feedback_then_repair
      : {};
  if (!report.predictive_feedback_then_repair || typeof report.predictive_feedback_then_repair !== 'object') {
    violations.push({ field: 'predictive_feedback_then_repair', reason: 'missing' });
  }

  const driftRaw = linkRaw.drift_vector && typeof linkRaw.drift_vector === 'object' ? linkRaw.drift_vector : {};
  if (!linkRaw.drift_vector || typeof linkRaw.drift_vector !== 'object') {
    violations.push({ field: 'predictive_feedback_then_repair.drift_vector', reason: 'missing' });
  }

  const rawDeltaReason = String(driftRaw.delta_reason ?? '').trim();
  if (!rawDeltaReason) {
    violations.push({ field: 'predictive_feedback_then_repair.drift_vector.delta_reason', reason: 'missing' });
  }
  const delta_reason = rawDeltaReason || 'unknown';

  const rawDeltaUtility = Number(driftRaw.delta_utility);
  if (!Number.isFinite(rawDeltaUtility)) {
    violations.push({ field: 'predictive_feedback_then_repair.drift_vector.delta_utility', reason: 'invalid' });
  }
  const delta_utility = Number.isFinite(rawDeltaUtility) ? rawDeltaUtility : 0;

  const intent_revision_flag = Boolean(linkRaw.intent_revision_flag);

  return {
    audit_report: {
      ...report,
      dominant_cid,
      session_consistency_score,
      predictive_feedback_then_repair: {
        ...linkRaw,
        intent_revision_flag,
        drift_vector: {
          delta_reason,
          delta_utility,
        },
      },
    },
    dominant_cid,
    session_consistency_score,
    delta_reason,
    delta_utility,
    intent_revision_flag,
    violations,
  };
}
