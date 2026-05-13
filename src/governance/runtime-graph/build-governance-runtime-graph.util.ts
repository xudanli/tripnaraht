import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import type {
  GovernanceRuntimeEdge,
  GovernanceRuntimeGraph,
  GovernanceRuntimeNode,
  GovernanceRuntimeNodeLevel,
} from './governance-runtime-graph.types';
import { parseGovernanceRuntimeTransitionLedgerPayload } from '../runtime-state-machine/parse-governance-runtime-transition-ledger.util';

function runtimeNodeLevel(e: GovernanceLedgerEvent): GovernanceRuntimeNodeLevel {
  if (e.eventLevel === 'L3_world') return 'world';
  if (e.eventLevel === 'L2_policy') return 'policy';
  if (e.eventType === 'recovery_suggested') return 'recovery';
  if (e.eventType === 'governance_resolution_event') return 'recovery';
  return 'execution';
}

function nodeIdFor(eventId: string): string {
  return `grn:${eventId}`;
}

function inferEdgeType(
  a: GovernanceRuntimeNodeLevel,
  b: GovernanceRuntimeNodeLevel,
): GovernanceRuntimeEdge['edgeType'] {
  if (a === 'world' && (b === 'policy' || b === 'execution')) return 'caused';
  if (a === 'policy' && b === 'execution') return 'suppressed';
  if (a === 'execution' && b === 'recovery') return 'recovered';
  if (a === 'policy' && b === 'recovery') return 'recovered';
  if (a === 'world' && b === 'recovery') return 'caused';
  return 'caused';
}

/**
 * Builds a sparse directed graph: one node per ledger event; edges for shared causality chain or level transitions.
 */
export function buildGovernanceRuntimeGraph(events: readonly GovernanceLedgerEvent[]): GovernanceRuntimeGraph {
  const sorted = [...events].sort((a, b) => {
    const ta = a.tripId ?? '';
    const tb = b.tripId ?? '';
    if (ta !== tb) return ta.localeCompare(tb);
    return a.timestamp - b.timestamp;
  });

  const nodes: GovernanceRuntimeNode[] = sorted.map((e) => ({
    nodeId: nodeIdFor(e.id),
    eventId: e.id,
    level: runtimeNodeLevel(e),
    timestamp: e.timestamp,
    tripId: e.tripId,
  }));

  const edges: GovernanceRuntimeEdge[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    const nxt = sorted[i + 1]!;
    if ((cur.tripId ?? '') !== (nxt.tripId ?? '')) continue;
    const aLevel = runtimeNodeLevel(cur);
    const bLevel = runtimeNodeLevel(nxt);
    if (cur.causalityChainId === nxt.causalityChainId) {
      edges.push({
        fromNodeId: nodeIdFor(cur.id),
        toNodeId: nodeIdFor(nxt.id),
        edgeType: 'caused',
        confidence: 0.72,
      });
      continue;
    }
    if (aLevel === bLevel) continue;
    edges.push({
      fromNodeId: nodeIdFor(cur.id),
      toNodeId: nodeIdFor(nxt.id),
      edgeType: inferEdgeType(aLevel, bLevel),
      confidence: 0.55,
    });
  }

  const transitions = sorted.filter((e) => e.eventType === 'governance_runtime_transition');
  for (let i = 1; i < transitions.length; i++) {
    const a = transitions[i - 1]!;
    const b = transitions[i]!;
    if ((a.tripId ?? '') !== (b.tripId ?? '')) continue;
    edges.push({
      fromNodeId: nodeIdFor(a.id),
      toNodeId: nodeIdFor(b.id),
      edgeType: 'runtime_state_transition',
      confidence: 0.9,
    });
  }

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!;
    if (e.eventType !== 'governance_resolution_event') continue;
    const trip = e.tripId ?? '';
    let lastToRecovering: GovernanceLedgerEvent | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const prev = sorted[j]!;
      if ((prev.tripId ?? '') !== trip) break;
      const tr = parseGovernanceRuntimeTransitionLedgerPayload(prev);
      if (prev.eventType === 'governance_runtime_transition' && tr?.to === 'RECOVERING') {
        lastToRecovering = prev;
        break;
      }
    }
    if (lastToRecovering) {
      edges.push({
        fromNodeId: nodeIdFor(lastToRecovering.id),
        toNodeId: nodeIdFor(e.id),
        edgeType: 'recovery_validated',
        confidence: 0.88,
      });
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!;
    if (e.eventType !== 'governance_runtime_transition') continue;
    const tr = parseGovernanceRuntimeTransitionLedgerPayload(e);
    if (
      !tr ||
      tr.event !== 'execution_resumed' ||
      tr.from !== 'RECOVERING' ||
      tr.to !== 'NORMAL'
    ) {
      continue;
    }
    const trip = e.tripId ?? '';
    for (let j = i - 1; j >= 0; j--) {
      const prev = sorted[j]!;
      if ((prev.tripId ?? '') !== trip) break;
      if (prev.eventType === 'governance_resolution_event') {
        edges.push({
          fromNodeId: nodeIdFor(prev.id),
          toNodeId: nodeIdFor(e.id),
          edgeType: 'recovery_resumed',
          confidence: 0.92,
        });
        break;
      }
      if (prev.eventType === 'governance_runtime_transition') break;
    }
  }

  return { nodes, edges };
}
