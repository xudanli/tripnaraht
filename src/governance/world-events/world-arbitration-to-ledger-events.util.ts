import { randomUUID } from 'node:crypto';
import type { GovernanceLedgerEvent, GovernanceLedgerEventType } from '../../agent/ledger/governance-ledger.types';
import { governanceEventLevelForType } from '../../agent/ledger/governance-ledger-event-level.util';
import type { ExecutionDecision } from '../../world/operational/execution-governance.contract';
import type { OperationalArbitration } from '../../world/operational/world-operational-arbitrator';
import type { OperationalWorldState } from '../../skills/runtime-os/types/runtime-os.types';

function worldExecutionDecision(
  arbitration: OperationalArbitration,
  reasonCodes: string[],
): ExecutionDecision {
  const st = arbitration.executionStatus;
  const status =
    st === 'blocked' || st === 'dangerous' || st === 'caution' ? 'restricted' : 'allow';
  return {
    status,
    reasonCodes,
    enforcedPolicies: {
      world_execution_status: st,
      arbitration_confidence: arbitration.confidence,
      raw_severity: arbitration.rawSeverity,
    },
  };
}

function oneEvent(args: {
  tripId?: string;
  timestamp: number;
  correlationId: string;
  causalityChainId: string;
  eventType: GovernanceLedgerEventType;
  arbitration: OperationalArbitration;
  causedByPolicies: string[];
}): GovernanceLedgerEvent {
  const eventLevel = governanceEventLevelForType(args.eventType);
  return {
    id: randomUUID(),
    tripId: args.tripId,
    timestamp: args.timestamp,
    eventLevel,
    eventType: args.eventType,
    correlationId: args.correlationId,
    causalityChainId: args.causalityChainId,
    executionDecision: worldExecutionDecision(args.arbitration, [
      ...args.causedByPolicies,
      `world.signal.${args.eventType}`,
    ]),
    causedByPolicies: args.causedByPolicies,
    policyVersion: 'world-operational.v1',
    affectedSubsystems: ['worldState.summarize', 'WorldOperationalArbitrator'],
    executionContextSummary: {
      countryCode: undefined,
      routeRegion: undefined,
    },
  };
}

/**
 * Derives first-class L3 governance ledger rows from operational world + arbitration (append-only).
 * One summarize() call may emit 0–N events; shared correlation/causality links them for GRG.
 */
export function worldArbitrationToGovernanceLedgerEvents(args: {
  tripId?: string;
  operationalWorldState: OperationalWorldState;
  operationalArbitration: OperationalArbitration;
  correlationId?: string;
  causalityChainId?: string;
  timestamp?: number;
}): GovernanceLedgerEvent[] {
  const ts = args.timestamp ?? Date.now();
  const correlationId = args.correlationId?.trim() || randomUUID();
  const causalityChainId = args.causalityChainId?.trim() || randomUUID();
  const arb = args.operationalArbitration;
  const ows = args.operationalWorldState;
  const blob = [
    ...arb.blockingReasons,
    ...ows.blockingFactors,
    ...ows.warnings,
    ...ows.recommendedPolicies,
  ]
    .join(' ')
    .toLowerCase();

  const out: GovernanceLedgerEvent[] = [];
  const push = (eventType: GovernanceLedgerEventType, caused: string[]) => {
    out.push(
      oneEvent({
        tripId: args.tripId,
        timestamp: ts,
        correlationId,
        causalityChainId,
        eventType,
        arbitration: arb,
        causedByPolicies: caused,
      }),
    );
  };

  if (/safetravel|safe\.travel|safe_travel/.test(blob)) {
    push('official_warning_issued', ['world.safetravel.signal']);
  }
  if (/road_closed|road closed|封路|closure|f-road|froad|f_road/.test(blob)) {
    push('road_closed', ['world.road.closure']);
  }
  if (/storm|hurricane|暴风|cyclone/.test(blob)) {
    push('storm_detected', ['world.weather.storm']);
  } else if (/weather|wind|gust|precip|snow|冰|雨/.test(blob)) {
    push('weather_escalated', ['world.weather.elevated']);
  }

  return out;
}
