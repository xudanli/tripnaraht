/**
 * TD-04：决策日志条目可追溯性（人格 / 阶段 / 时间 / 解释），便于回放与聚类。
 * 校验对象：`DecisionLogEntry[]` 或同形状的持久化/回放 JSON。
 */

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
