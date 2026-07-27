export const AUTHORITY_CONSUMPTION_TRACE_SCHEMA_ID =
  'tripnara.authority_consumption_trace@v1' as const;

export type AuthorityConsumer =
  | 'exploration.issues'
  | 'exploration.check'
  | 'bff.readiness'
  | 'bff.executability'
  | 'snapshot.assemble'
  | 'agent.gate_eval'
  | 'agent.verify'
  | 'agent.narrate'
  | 'plan.verify'
  | 'plan.repair'
  | 'monitoring.apply'
  | 'execute.set_effective'
  | 'harness.ontology'
  | 'unknown';

export type AuthorityRuntimeAuthority =
  | 'ONTOLOGY_CANONICAL'
  | 'GATEWAY_ON'
  | 'GATEWAY_SHADOW'
  | 'LEGACY'
  | 'HEURISTIC'
  | 'UNKNOWN';

export interface AuthorityConsumptionTrace {
  schemaId: typeof AUTHORITY_CONSUMPTION_TRACE_SCHEMA_ID;
  traceId: string;
  consumer: AuthorityConsumer;
  inputRevision: number | string;
  assessmentId: string | null;
  runtimeAuthority: AuthorityRuntimeAuthority;
  factsUsed: string[];
  constraintVersion: string;
  outputRevision: number | string | null;
  legacyWriteAttempted: boolean;
  evaluatedAt: string;
  tripId?: string;
  reasonCodes?: string[];
}

export function isAuthorityConsumptionTraceComplete(
  trace: Pick<
    AuthorityConsumptionTrace,
    | 'consumer'
    | 'inputRevision'
    | 'assessmentId'
    | 'runtimeAuthority'
    | 'factsUsed'
    | 'constraintVersion'
    | 'outputRevision'
  >,
): boolean {
  return (
    !!trace.consumer &&
    trace.inputRevision != null &&
    trace.runtimeAuthority != null &&
    Array.isArray(trace.factsUsed) &&
    !!trace.constraintVersion
  );
}

export const USER_VISIBLE_GATE_CONSUMERS: ReadonlySet<AuthorityConsumer> = new Set([
  'bff.readiness',
  'bff.executability',
  'agent.gate_eval',
  'plan.verify',
]);
