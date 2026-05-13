import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import { randomUUID } from 'node:crypto';
import { governanceEventLevelForType } from '../../agent/ledger/governance-ledger-event-level.util';
import { defaultExecutionDecision } from '../../world/operational/execution-governance.contract';

export function parseGovernanceResolutionLedgerPayload(e: GovernanceLedgerEvent): {
  resolvedLedgerEventId: string;
  resolutionKind?: string;
  reasonCodes?: string[];
} | null {
  if (e.eventType !== 'governance_resolution_event') return null;
  const raw = e.executionContextSummary?.routeRegion ?? '';
  try {
    const j = JSON.parse(raw) as {
      resolvedLedgerEventId?: string;
      resolutionKind?: string;
      reasonCodes?: string[];
    };
    if (!j.resolvedLedgerEventId) return null;
    return {
      resolvedLedgerEventId: j.resolvedLedgerEventId,
      resolutionKind: j.resolutionKind,
      reasonCodes: j.reasonCodes,
    };
  } catch {
    return null;
  }
}

export function buildGovernanceResolutionLedgerEvent(args: {
  tripId: string;
  requestId: string;
  resolvedLedgerEventId: string;
  resolutionKind: 'recovery_closure' | 'policy_ack' | 'manual_clear';
  reasonCodes: string[];
}): GovernanceLedgerEvent {
  const id = randomUUID();
  const now = Date.now();
  const decision = { ...defaultExecutionDecision(), status: 'allow' as const };
  decision.reasonCodes = [
    'governance.resolution_event',
    `governance.resolution.${args.resolutionKind}`,
    `governance.resolved_block.${args.resolvedLedgerEventId}`,
    ...args.reasonCodes.slice(0, 20),
  ];
  const payload = JSON.stringify({
    resolvedLedgerEventId: args.resolvedLedgerEventId,
    resolutionKind: args.resolutionKind,
    reasonCodes: args.reasonCodes,
  });
  return {
    id,
    tripId: args.tripId,
    timestamp: now,
    eventLevel: governanceEventLevelForType('governance_resolution_event'),
    eventType: 'governance_resolution_event',
    correlationId: args.requestId,
    causalityChainId: args.requestId,
    executionDecision: decision,
    causedByPolicies: ['governance.resolution@v1'],
    policyVersion: 'governance-resolution@v1',
    affectedSubsystems: ['orchestration', 'planner'],
    executionContextSummary: {
      routeRegion: payload.slice(0, 480),
    },
  };
}
