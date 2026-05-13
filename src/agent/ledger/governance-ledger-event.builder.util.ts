import { randomUUID } from 'node:crypto';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { ExecutionGovernanceMemoryRecord } from '../memory/execution/build-execution-governance-memory.util';
import type {
  ExecutionDecision,
  ItineraryGenerateResultType,
  PartialExecutionState,
  RecoveryAction,
} from '../../world/operational/execution-governance.contract';
import { governanceEventLevelForType } from './governance-ledger-event-level.util';
import type { GovernanceLedgerEvent, GovernanceLedgerEventType } from './governance-ledger.types';

/** Minimal slice of itinerary.generate output needed for ledger (avoids importing the skill module). */
export interface GovernedItineraryGenerateLedgerSnapshot {
  resultType: ItineraryGenerateResultType;
  partialExecutionState: PartialExecutionState;
  executionDecision: ExecutionDecision;
  executionGovernanceMemory?: ExecutionGovernanceMemoryRecord;
}

function derivePrimaryEventType(output: GovernedItineraryGenerateLedgerSnapshot): GovernanceLedgerEventType {
  if (output.resultType === 'execution_block') return 'execution_block';
  if (output.partialExecutionState === 'fallback_only' || output.executionGovernanceMemory?.suppressionApplied) {
    return 'route_suppressed';
  }
  const st = output.executionDecision.status;
  if (st === 'restricted' || st === 'blocked') return 'policy_restriction';
  if ((output.executionGovernanceMemory?.recoverySuggested?.length ?? 0) > 0) {
    return 'recovery_suggested';
  }
  return 'policy_restriction';
}

function resolvePolicyVersion(output: GovernedItineraryGenerateLedgerSnapshot): string {
  const m = output.executionGovernanceMemory;
  if (m?.policyVersion) return m.policyVersion;
  const fromDecision = output.executionDecision.enforcedPolicies?.['policyVersion'];
  return typeof fromDecision === 'string' ? fromDecision : 'unknown';
}

function resolveCausedByPolicies(output: GovernedItineraryGenerateLedgerSnapshot): string[] {
  const fromMem = output.executionGovernanceMemory?.causedByPolicies;
  if (fromMem?.length) return [...fromMem];
  const rc = output.executionDecision.reasonCodes ?? [];
  return rc.length ? [...rc] : [];
}

function affectedSubsystemsFrom(output: GovernedItineraryGenerateLedgerSnapshot): string[] {
  const gen = output.executionGovernanceMemory?.affectedGenerator;
  const base = ['itinerary', 'execution_policy'];
  if (gen === 'incremental_itinerary_generator') return [...base, 'incremental_itinerary_generator'];
  if (gen === 'itinerary.generate') return [...base, 'itinerary.generate'];
  return base;
}

function routeRegionHint(req: TripPlanRequest): string | undefined {
  const d = req.destination;
  if (typeof d === 'string' && d.trim()) return d.trim().slice(0, 200);
  return undefined;
}

function countryHint(req: TripPlanRequest): string | undefined {
  const c = req.ontology_context?.destination?.country_code;
  return typeof c === 'string' && c.trim() ? c.trim().toUpperCase() : undefined;
}

/**
 * Maps governed itinerary.generate output → a single append-only ledger event.
 * Returns null when there is no governance memory (pure allow / no policy surface).
 */
export function buildGovernanceLedgerEventFromItineraryOutput(
  request: TripPlanRequest,
  output: GovernedItineraryGenerateLedgerSnapshot,
  eventId: string,
  timestamp: number,
): GovernanceLedgerEvent | null {
  if (!output.executionGovernanceMemory) return null;

  const tripId =
    request.trip_id ??
    (request as { tripId?: string }).tripId ??
    request.ontology_context?.trip_id;

  const recovery =
    output.executionDecision.recoveryOptions ?? output.executionGovernanceMemory.recoverySuggested;

  const trace = request.governance_trace;
  const correlationId = trace?.correlation_id?.trim() || randomUUID();
  const causalityChainId = trace?.causality_chain_id?.trim() || randomUUID();

  const eventType = derivePrimaryEventType(output);
  const eventLevel = governanceEventLevelForType(eventType);

  return {
    id: eventId,
    tripId: tripId != null ? String(tripId) : undefined,
    timestamp,
    eventType,
    eventLevel,
    correlationId,
    causalityChainId,
    executionDecision: output.executionDecision,
    causedByPolicies: resolveCausedByPolicies(output),
    policyVersion: resolvePolicyVersion(output),
    affectedSubsystems: affectedSubsystemsFrom(output),
    recoveryActions: recovery?.length ? recovery.map((r) => ({ ...r, rationale: [...r.rationale] })) : undefined,
    executionContextSummary: {
      countryCode: countryHint(request),
      routeRegion: routeRegionHint(request),
      vehicleType: request.constraints?.vehicle_type,
    },
  };
}
