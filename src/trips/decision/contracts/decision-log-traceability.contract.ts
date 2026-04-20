/**
 * TD-04：决策日志条目可追溯性（人格 / 阶段 / 时间 / 解释），便于回放与聚类。
 * 校验对象：`DecisionLogEntry[]` 或同形状的持久化/回放 JSON。
 */

import { JEPA_TRACE_CONTRACT_VERSION } from '../shared/decision-trace-jepa.types';

const PERSONAS = new Set(['ABU', 'DR_DRE', 'NEPTUNE', 'EXPECTED_UTILITY', 'USER_ACTION']);
const SOURCES = new Set(['PHYSICAL', 'HUMAN', 'PHILOSOPHY', 'HEURISTIC', 'UTILITY', 'USER']);
const STAGES = new Set([
  'ROUTE_PICK',
  'DEM_EVIDENCE',
  'ABU_GATE',
  'PACE_ADJUST',
  'SPATIAL_REPAIR',
  'READINESS',
  'FINALIZE',
  'PLAN_SCORE',
  'PLAN_EDIT',
]);

const PREDICTION_ERROR_KINDS = new Set(['WORLD', 'USER_DRIFT', 'UTILITY']);

export type DecisionLogTraceabilityResult = {
  valid: boolean;
  /** 阻断：缺字段或类型非法 */
  errors: string[];
  /** 非阻断：建议补证据引用等 */
  warnings: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateCandidateSearchAuditMeta(meta: Record<string, unknown>, p: string, warnings: string[]) {
  const csa = meta.candidateSearchAudit;
  if (!isRecord(csa)) return;
  const budget = (csa as Record<string, unknown>).budget;
  if (!isRecord(budget)) {
    warnings.push(`entry ${p}.metadata.candidateSearchAudit.budget should be an object`);
    return;
  }
  for (const k of [
    'maxCandidates',
    'repairMaxIters',
    'repairTopKPerCandidate',
    'maxNewCandidatesPerIter',
    'maxPoolSize',
  ] as const) {
    if (!isFiniteNumber((budget as Record<string, unknown>)[k])) {
      warnings.push(`entry ${p}.metadata.candidateSearchAudit.budget.${k} should be a finite number`);
    }
  }
  if (!isFiniteNumber((csa as Record<string, unknown>).initialVariantCount)) {
    warnings.push(`entry ${p}.metadata.candidateSearchAudit.initialVariantCount should be a finite number`);
  }
  if (!isFiniteNumber((csa as Record<string, unknown>).finalCandidateCount)) {
    warnings.push(`entry ${p}.metadata.candidateSearchAudit.finalCandidateCount should be a finite number`);
  }
}

/**
 * 与 `shared/decision-result.types` 中 DecisionLogEntry 对齐的最小可追踪性检查。
 */
export function analyzeDecisionLogTraceability(logs: unknown): DecisionLogTraceabilityResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(logs)) {
    return { valid: false, errors: ['decision log must be an array'], warnings: [] };
  }

  logs.forEach((entry, i) => {
    const p = `[${i}]`;
    if (!isRecord(entry)) {
      errors.push(`entry ${p} must be an object`);
      return;
    }
    if (typeof entry.timestamp !== 'string' || !entry.timestamp.trim()) {
      errors.push(`entry ${p}.timestamp must be a non-empty string (ISO-8601)`);
    }
    if (typeof entry.persona !== 'string' || !PERSONAS.has(entry.persona)) {
      errors.push(`entry ${p}.persona must be a known DecisionPersona`);
    }
    if (typeof entry.action !== 'string' || !entry.action.trim()) {
      errors.push(`entry ${p}.action must be a non-empty string`);
    }
    if (typeof entry.explanation !== 'string' || !entry.explanation.trim()) {
      errors.push(`entry ${p}.explanation must be non-empty (traceability)`);
    }
    if (!Array.isArray(entry.reasonCodes)) {
      errors.push(`entry ${p}.reasonCodes must be an array`);
    }
    if (typeof entry.decisionSource !== 'string' || !SOURCES.has(entry.decisionSource)) {
      errors.push(`entry ${p}.decisionSource must be a valid DecisionSource`);
    }
    if (typeof entry.decisionStage !== 'string' || !STAGES.has(entry.decisionStage)) {
      errors.push(`entry ${p}.decisionStage must be a valid DecisionStage`);
    }
    if (entry.evidenceRefs !== undefined && !Array.isArray(entry.evidenceRefs)) {
      errors.push(`entry ${p}.evidenceRefs must be an array when present`);
    }
    if (entry.jepaTrace !== undefined) {
      if (!isRecord(entry.jepaTrace)) {
        errors.push(`entry ${p}.jepaTrace must be an object when present`);
      } else {
        const j = entry.jepaTrace;
        if (j.contractVersion !== undefined && j.contractVersion !== JEPA_TRACE_CONTRACT_VERSION) {
          errors.push(
            `entry ${p}.jepaTrace.contractVersion must be "${JEPA_TRACE_CONTRACT_VERSION}" when present`,
          );
        }
        if (
          j.predictionErrorKind !== undefined &&
          (typeof j.predictionErrorKind !== 'string' || !PREDICTION_ERROR_KINDS.has(j.predictionErrorKind))
        ) {
          errors.push(`entry ${p}.jepaTrace.predictionErrorKind must be WORLD | USER_DRIFT | UTILITY when present`);
        }
        for (const key of ['z_state', 'z_pred', 'z_real', 'delta', 'weakLabels'] as const) {
          const v = j[key];
          if (v !== undefined && !isRecord(v)) {
            errors.push(`entry ${p}.jepaTrace.${key} must be an object when present`);
          }
        }
        if (j.contractVersion === JEPA_TRACE_CONTRACT_VERSION) {
          const hasAnySignal =
            isRecord(j.z_state) ||
            isRecord(j.z_pred) ||
            isRecord(j.z_real) ||
            isRecord(j.delta) ||
            (typeof j.candidateId === 'string' && j.candidateId.trim().length > 0);
          if (!hasAnySignal) {
            warnings.push(`entry ${p}.jepaTrace: empty trace (consider z_state / z_pred / candidateId)`);
          }
        }
      }
    }
    // Optional: if metadata carries candidateSearchAudit, validate shape (non-blocking).
    if (isRecord((entry as Record<string, unknown>).metadata)) {
      validateCandidateSearchAuditMeta(
        (entry as Record<string, unknown>).metadata as Record<string, unknown>,
        p,
        warnings,
      );
    }
    // 建议：物理现实判断尽量带证据引用（不阻断）
    if (
      entry.decisionSource === 'PHYSICAL' &&
      (!Array.isArray(entry.evidenceRefs) || entry.evidenceRefs.length === 0)
    ) {
      warnings.push(`entry ${p}: PHYSICAL decisionSource 建议提供 evidenceRefs（TD-04）`);
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}
