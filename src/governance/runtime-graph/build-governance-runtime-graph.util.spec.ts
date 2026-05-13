import { buildGovernanceRuntimeGraph } from './build-governance-runtime-graph.util';
import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import { buildGovernanceRuntimeTransitionLedgerEvent } from '../runtime-state-machine/governance-runtime-transition-ledger.util';
import { buildGovernanceResolutionLedgerEvent } from '../runtime-state-machine/governance-resolution-ledger.util';

const base = {
  correlationId: 'c1',
  causalityChainId: 'h1',
  policyVersion: 'v',
  affectedSubsystems: [] as string[],
  executionContextSummary: {},
};

function ev(
  id: string,
  ts: number,
  level: GovernanceLedgerEvent['eventLevel'],
  type: GovernanceLedgerEvent['eventType'],
): GovernanceLedgerEvent {
  return {
    id,
    tripId: 'trip',
    timestamp: ts,
    eventLevel: level,
    eventType: type,
    correlationId: base.correlationId,
    causalityChainId: base.causalityChainId,
    executionDecision: { status: 'restricted', reasonCodes: [], enforcedPolicies: {} },
    causedByPolicies: [],
    ...base,
  };
}

describe('buildGovernanceRuntimeGraph', () => {
  it('links consecutive events on same causality chain', () => {
    const events: GovernanceLedgerEvent[] = [
      ev('1', 10, 'L3_world', 'weather_escalated'),
      ev('2', 20, 'L2_policy', 'policy_restriction'),
    ];
    const g = buildGovernanceRuntimeGraph(events);
    expect(g.edges.some((e) => e.fromNodeId === 'grn:1' && e.toNodeId === 'grn:2' && e.edgeType === 'caused')).toBe(
      true,
    );
  });

  it('adds runtime_state_transition edges between governance_runtime_transition events on same trip', () => {
    const t1 = buildGovernanceRuntimeTransitionLedgerEvent({
      tripId: 'trip',
      requestId: 'req',
      fromState: 'NORMAL',
      toState: 'REPLANNING',
      event: 'replanning_started',
      transitionReasonCodes: ['test'],
    });
    const t2 = buildGovernanceRuntimeTransitionLedgerEvent({
      tripId: 'trip',
      requestId: 'req',
      fromState: 'REPLANNING',
      toState: 'RECOVERING',
      event: 'replanning_succeeded',
      transitionReasonCodes: ['test'],
    });
    t1.id = 'tr-a';
    t1.timestamp = 100;
    t2.id = 'tr-b';
    t2.timestamp = 200;
    const g = buildGovernanceRuntimeGraph([t1, t2]);
    expect(
      g.edges.some(
        (e) =>
          e.edgeType === 'runtime_state_transition' &&
          e.fromNodeId === 'grn:tr-a' &&
          e.toNodeId === 'grn:tr-b',
      ),
    ).toBe(true);
  });

  it('adds recovery_validated and recovery_resumed edges for RCC chain', () => {
    const trRec = buildGovernanceRuntimeTransitionLedgerEvent({
      tripId: 'trip',
      requestId: 'req',
      fromState: 'REPLANNING',
      toState: 'RECOVERING',
      event: 'replanning_succeeded',
      transitionReasonCodes: [],
    });
    trRec.id = 'to-rec';
    trRec.timestamp = 100;
    const res = buildGovernanceResolutionLedgerEvent({
      tripId: 'trip',
      requestId: 'req',
      resolvedLedgerEventId: 'blk',
      resolutionKind: 'recovery_closure',
      reasonCodes: [],
    });
    res.id = 'res1';
    res.timestamp = 150;
    const trNorm = buildGovernanceRuntimeTransitionLedgerEvent({
      tripId: 'trip',
      requestId: 'req',
      fromState: 'RECOVERING',
      toState: 'NORMAL',
      event: 'execution_resumed',
      transitionReasonCodes: [],
    });
    trNorm.id = 'to-norm';
    trNorm.timestamp = 200;
    const g = buildGovernanceRuntimeGraph([trRec, res, trNorm]);
    expect(
      g.edges.some(
        (e) => e.edgeType === 'recovery_validated' && e.fromNodeId === 'grn:to-rec' && e.toNodeId === 'grn:res1',
      ),
    ).toBe(true);
    expect(
      g.edges.some(
        (e) => e.edgeType === 'recovery_resumed' && e.fromNodeId === 'grn:res1' && e.toNodeId === 'grn:to-norm',
      ),
    ).toBe(true);
  });
});
