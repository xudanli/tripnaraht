import type { LedgerNode } from './decision-ledger.types';
import type {
  LedgerLogicConstraintValidationContextV1,
  LedgerLogicConstraintValidator,
} from './ledger-logic-constraint-validator.port';

const CHECKIN_RE = /checkInLatestEpoch[:=]\s*(\d+)/i;

function parseArrivalEpoch(output: unknown): number | null {
  if (!output || typeof output !== 'object') return null;
  const v = (output as Record<string, unknown>).arrivalEpoch;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseCheckInLatestFromNode(n: LedgerNode): number | null {
  const s = n.outputRef.summary?.trim();
  if (!s) return null;
  const m = s.match(CHECKIN_RE);
  if (!m) return null;
  const n0 = Number(m[1]);
  return Number.isFinite(n0) ? n0 : null;
}

function nodeReferencesUpstream(n: LedgerNode, upstreamId: string): boolean {
  return n.parentIds.includes(upstreamId) || n.consumesNodeIds.includes(upstreamId);
}

/**
 * v0 时间线模拟器：若本轮合并的交通 `arrivalEpoch` 晚于仍 STABLE 的住宿摘要中的 `checkInLatestEpoch`，
 * 将住宿节点作为冲突 seed（由 Writeback 做 HARD 级联）。
 */
export class TimelineLedgerLogicConstraintValidator implements LedgerLogicConstraintValidator {
  readonly name = 'TIMELINE_CONSISTENCY';

  validate(ctx: LedgerLogicConstraintValidationContextV1): string[] {
    const seeds: string[] = [];
    const byId = new Map(ctx.ledger.nodes.map(n => [n.nodeId, n]));

    for (const [mergedId, output] of ctx.mergedOutputs) {
      const mergedNode = byId.get(mergedId);
      if (!mergedNode || mergedNode.actionType !== 'TRANSPORT') continue;
      const arrival = parseArrivalEpoch(output);
      if (arrival === null) continue;

      for (const n of ctx.ledger.nodes) {
        if (n.nodeId === mergedId) continue;
        if (n.status !== 'STABLE' || n.actionType !== 'ACCOMMODATION') continue;
        if (!nodeReferencesUpstream(n, mergedId)) continue;
        const latest = parseCheckInLatestFromNode(n);
        if (latest === null) continue;
        if (arrival > latest) seeds.push(n.nodeId);
      }
    }

    return [...new Set(seeds)];
  }
}
