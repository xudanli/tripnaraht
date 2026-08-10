import { createHash, randomUUID } from 'crypto';
import {
  AUTHORITY_CONSUMPTION_TRACE_SCHEMA_ID,
  isAuthorityConsumptionTraceComplete,
  type AuthorityConsumptionTrace,
  type AuthorityConsumer,
  type AuthorityRuntimeAuthority,
} from './authority-consumption-trace.types';

const MAX_TRACES = 200;
const ring: AuthorityConsumptionTrace[] = [];

export function resetAuthorityConsumptionTracesForTests(): void {
  ring.length = 0;
}

export function getRecentAuthorityConsumptionTraces(
  limit = 50,
): AuthorityConsumptionTrace[] {
  return ring.slice(-Math.max(1, limit));
}

export function recordAuthorityConsumptionTrace(
  partial: Omit<AuthorityConsumptionTrace, 'schemaId' | 'traceId' | 'evaluatedAt'> & {
    traceId?: string;
    evaluatedAt?: string;
  },
): AuthorityConsumptionTrace {
  const trace: AuthorityConsumptionTrace = {
    schemaId: AUTHORITY_CONSUMPTION_TRACE_SCHEMA_ID,
    traceId: partial.traceId ?? `act_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    evaluatedAt: partial.evaluatedAt ?? new Date().toISOString(),
    consumer: partial.consumer,
    inputRevision: partial.inputRevision,
    assessmentId: partial.assessmentId,
    runtimeAuthority: partial.runtimeAuthority,
    factsUsed: [...partial.factsUsed],
    constraintVersion: partial.constraintVersion,
    outputRevision: partial.outputRevision,
    legacyWriteAttempted: partial.legacyWriteAttempted,
    tripId: partial.tripId,
    reasonCodes: partial.reasonCodes ? [...partial.reasonCodes] : undefined,
  };
  ring.push(trace);
  if (ring.length > MAX_TRACES) ring.shift();
  return trace;
}

export function buildSnapshotAuthorityTrace(input: {
  tripId?: string;
  revision: number | string;
  assessmentId: string | null;
  factsUsed: string[];
  constraintVersion: string;
  runtimeAuthority?: AuthorityRuntimeAuthority;
  reasonCodes?: string[];
}): AuthorityConsumptionTrace {
  return recordAuthorityConsumptionTrace({
    consumer: 'snapshot.assemble',
    tripId: input.tripId,
    inputRevision: input.revision,
    assessmentId: input.assessmentId,
    runtimeAuthority: input.runtimeAuthority ?? 'ONTOLOGY_CANONICAL',
    factsUsed: input.factsUsed,
    constraintVersion: input.constraintVersion,
    outputRevision: null,
    legacyWriteAttempted: false,
    reasonCodes: input.reasonCodes,
  });
}

export function assertNoLegacyEffectiveWrite(trace: AuthorityConsumptionTrace): void {
  if (trace.legacyWriteAttempted && trace.outputRevision != null) {
    throw new Error(
      `ONT-P0-06: Legacy/Shadow must not produce effective Revision (consumer=${trace.consumer})`,
    );
  }
}

export function summarizeAuthorityAuditByConsumer(): Record<
  string,
  { count: number; complete: number; missingAssessmentId: number }
> {
  const out: Record<
    string,
    { count: number; complete: number; missingAssessmentId: number }
  > = {};
  for (const t of ring) {
    const key = t.consumer;
    if (!out[key]) out[key] = { count: 0, complete: 0, missingAssessmentId: 0 };
    out[key].count += 1;
    if (isAuthorityConsumptionTraceComplete(t)) out[key].complete += 1;
    if (!t.assessmentId) out[key].missingAssessmentId += 1;
  }
  return out;
}

export function fingerprintAuthorityOutcome(input: {
  assessmentId: string | null;
  reasonCodes: string[];
  runtimeAuthority: AuthorityRuntimeAuthority;
}): string {
  const payload = JSON.stringify({
    a: input.assessmentId,
    r: [...input.reasonCodes].sort(),
    auth: input.runtimeAuthority,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export type { AuthorityConsumer, AuthorityRuntimeAuthority };
