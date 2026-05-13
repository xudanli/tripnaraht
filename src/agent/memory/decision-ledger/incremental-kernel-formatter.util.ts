import type { LedgerNode } from './decision-ledger.types';
import type { RecomputePayloadV1 } from './recompute-payload.types';

/** 与 assemble 内 stable 摘要策略对齐，便于「锚点」与「先前结果」表述一致 */
function formatLedgerNodePreviousResultForPrompt(node: LedgerNode): string {
  const s = node.outputRef.summary?.trim();
  if (s) return s;
  const d = node.outputRef.payloadDigest?.trim();
  if (d) return `digest:${d.length > 12 ? `${d.slice(0, 12)}…` : d}`;
  return 'N/A';
}

/**
 * Meta-instruction：与 {@link formatIncrementalKernelUserSegment} 配对，约束决策权边界（v1）。
 */
export const INCREMENTAL_KERNEL_SYSTEM_PROMPT_V1 = [
  'Incremental Decision Mode Activated.',
  '',
  'You are operating on a Differential Ledger.',
  '',
  'Rules:',
  '- STRICT IMMUTABILITY: You MUST NOT change or contradict nodes listed under IMMUTABLE ANCHORS. Treat them as fixed constants.',
  '- RE-PLAN ONLY: Produce new decisions ONLY for nodes listed under RECOMPUTE TASKS (INVALIDATED).',
  '- CONSISTENCY: New decisions MUST satisfy WORLD DRIFT constraints and remain consistent with IMMUTABLE ANCHORS.',
  '',
  '# OUTPUT_FORMAT_REQUIREMENT',
  'Return a single JSON object (not a bare array) with exactly one top-level key: "decisions".',
  'The value MUST be an array of objects, one per RECOMPUTE TASK you are updating, each shaped as:',
  '{ "nodeId": "<string MUST MATCH RECOMPUTE TASKS exactly>", "output": <object DECISION_PAYLOAD>, "summary": "<short human-readable line>" }',
  'Do not rename keys (use exactly nodeId, output, summary). Do not invent nodeIds.',
  'Example: {"decisions":[{"nodeId":"T_1","output":{},"summary":"Adjusted POI after weather drift"}]}',
  '',
  'Backward compatibility: a bare JSON array of the same objects is still accepted by the parser, but prefer the {"decisions":[...]} envelope.',
].join('\n');

/**
 * 将 RecomputePayloadV1 投影为 LLM 易读的 User 段：明确施工区、禁区与因果说明（瑞士奶酪式施工图）。
 */
export function formatIncrementalKernelUserSegment(payload: RecomputePayloadV1): string {
  const sections: string[] = [];

  if (payload.driftContext?.length) {
    sections.push('### [CONTEXT: WORLD DRIFT]');
    for (const d of payload.driftContext) {
      const severityLabel = d.severity === 'HARD' ? '[CRITICAL]' : '[SOFT]';
      const desc = d.description?.trim() || 'Information expired or changed.';
      sections.push(`- ${severityLabel} ${d.topic}: ${desc}`);
    }
  }

  if (payload.stableAnchorNodes.length) {
    sections.push('');
    sections.push('### [IMMUTABLE ANCHORS] (DO NOT CHANGE)');
    for (const node of payload.stableAnchorNodes) {
      sections.push(`- [${node.nodeId}] (${node.actionType}): ${node.summary}`);
    }
  }

  sections.push('');
  sections.push('### [RECOMPUTE TASKS] (FILL IN THE BLANKS)');
  const { nodes, incomingEdges } = payload.invalidatedSubGraph;
  if (nodes.length === 0) {
    sections.push('(none — no INVALIDATED nodes in this payload.)');
  } else {
    nodes.forEach((node, index) => {
      const deps = incomingEdges
        .filter(e => e.to === node.nodeId)
        .map(e => `[${e.from}]`);
      const depStr = deps.length ? `\n    - DEPENDS ON: ${deps.join(', ')}` : '';

      sections.push(
        `${index + 1}. NODE: [${node.nodeId}]\n    - ACTION: ${node.actionType}\n    - STATUS: INVALIDATED${depStr}\n    - PREVIOUS RESULT: ${formatLedgerNodePreviousResultForPrompt(node)}`,
      );
    });
  }

  return sections.join('\n');
}
