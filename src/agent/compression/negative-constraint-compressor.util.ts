// src/agent/compression/negative-constraint-compressor.util.ts
import type { DecisionMemory } from '../memory/decision-memory/decision-memory.types';
import type {
  OperationalNegativeConstraintLineV1,
  OperationalNegativeConstraintsV1,
} from './world-state-compression.types';

const MD_HEADER = '### Operational Constraints (From Previous Decisions In This Request)\n';

const MAX_LINES = 14;
const MAX_RATIONALE_LEN = 220;
const MAX_CAUSED = 6;

function decisionTypeLabel(t: DecisionMemory['decisionType']): string {
  switch (t) {
    case 'vehicle':
      return 'Vehicle';
    case 'route':
      return 'Route';
    case 'weather_reroute':
      return 'Reroute';
    case 'risk_block':
      return 'Risk';
    default:
      return String(t);
  }
}

function shouldInclude(d: DecisionMemory): boolean {
  return d.outcome === 'rejected' || d.outcome === 'failed';
}

function firstNonEmptyRationale(d: DecisionMemory): string {
  for (const r of d.rationale ?? []) {
    const s = String(r ?? '').trim();
    if (s) return s.slice(0, MAX_RATIONALE_LEN);
  }
  return `${d.decisionType} (${d.outcome})`;
}

function lineFromDecision(d: DecisionMemory): OperationalNegativeConstraintLineV1 {
  const caused = (d.causedBy ?? []).slice(0, MAX_CAUSED).map(String);
  const rat = firstNonEmptyRationale(d);
  const label = decisionTypeLabel(d.decisionType);
  const constraintLine = `[${label}] Prior attempt outcome=${d.outcome}: ${rat}`;
  return {
    decisionType: d.decisionType,
    outcome: d.outcome,
    causalityId: d.causalityId,
    constraintLine,
    causedBySummary: caused,
    rationaleSummary: (d.rationale ?? []).map(String).slice(0, 3).map((s) => s.slice(0, 120)),
  };
}

export function compressOperationalNegativesFromDecisions(
  decisions: readonly DecisionMemory[],
): OperationalNegativeConstraintsV1 {
  const filtered = decisions.filter(shouldInclude).slice(-MAX_LINES);
  const lines = filtered.map(lineFromDecision);
  return {
    revision: 'v1',
    scope: 'current_request_ring',
    lines,
    markdownBlock: compressOperationalNegativesToMarkdown({ revision: 'v1', scope: 'current_request_ring', lines }),
  };
}

export function compressOperationalNegativesToMarkdown(v1: Omit<OperationalNegativeConstraintsV1, 'markdownBlock'>): string {
  if (!v1.lines.length) return '';
  const bullets = v1.lines.map((l) => `- ${l.constraintLine}`).join('\n');
  return `${MD_HEADER}${bullets}\n`;
}

export type DecisionRingReader = {
  listForRequest(requestId: string): DecisionMemory[];
};

/**
 * 将 ring 压缩结果写回执行上下文（不入冻结 Memory snapshot，避免 deepFreeze 冲突）。
 */
export function applyDecisionRingToExecutionOperationalOverlay(
  exec: { requestId: string; operationalNegativeConstraints?: OperationalNegativeConstraintsV1 | null; operationalNegativeConstraintsMarkdown?: string | null },
  requestId: string,
  ring: DecisionRingReader,
): void {
  if (String(exec.requestId) !== String(requestId).trim()) return;
  const list = ring.listForRequest(requestId);
  const v1 = compressOperationalNegativesFromDecisions(list);
  if (!v1.lines.length) {
    exec.operationalNegativeConstraints = null;
    exec.operationalNegativeConstraintsMarkdown = null;
    return;
  }
  exec.operationalNegativeConstraints = v1;
  exec.operationalNegativeConstraintsMarkdown = v1.markdownBlock;
}
