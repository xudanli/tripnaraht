import type { Prisma, GovernanceLedgerEventRecord } from '@prisma/client';
import type { GovernanceLedgerEvent } from './governance-ledger.types';

export function governanceLedgerEventToPrismaCreate(
  e: GovernanceLedgerEvent,
): Prisma.GovernanceLedgerEventRecordCreateInput {
  const base: Prisma.GovernanceLedgerEventRecordCreateInput = {
    id: e.id,
    tripId: e.tripId ?? null,
    timestampMs: e.timestamp,
    eventType: e.eventType,
    eventLevel: e.eventLevel,
    executionStatus: e.executionDecision.status,
    policyVersion: e.policyVersion,
    causedByPolicies: e.causedByPolicies,
    affectedSubsystems: e.affectedSubsystems,
    executionDecision: e.executionDecision as unknown as Prisma.InputJsonValue,
    routeRegion: e.executionContextSummary?.routeRegion ?? null,
    countryCode: e.executionContextSummary?.countryCode ?? null,
    correlationId: e.correlationId,
    causalityChainId: e.causalityChainId,
  };
  if (e.recoveryActions?.length) {
    base.recoveryActions = e.recoveryActions as unknown as Prisma.InputJsonValue;
  }
  if (e.executionContextSummary && Object.keys(e.executionContextSummary).length > 0) {
    base.executionContext = e.executionContextSummary as unknown as Prisma.InputJsonValue;
  }
  return base;
}

export function prismaRowToGovernanceLedgerEvent(row: GovernanceLedgerEventRecord): GovernanceLedgerEvent {
  const executionDecision = row.executionDecision as unknown as GovernanceLedgerEvent['executionDecision'];
  const causedBy = Array.isArray(row.causedByPolicies)
    ? (row.causedByPolicies as string[])
    : [];
  const affected = Array.isArray(row.affectedSubsystems) ? (row.affectedSubsystems as string[]) : [];
  const recovery =
    row.recoveryActions != null
      ? (row.recoveryActions as unknown as GovernanceLedgerEvent['recoveryActions'])
      : undefined;
  const ctx =
    row.executionContext != null && typeof row.executionContext === 'object'
      ? (row.executionContext as GovernanceLedgerEvent['executionContextSummary'])
      : undefined;
  return {
    id: row.id,
    tripId: row.tripId ?? undefined,
    timestamp: Number(row.timestampMs),
    eventLevel: row.eventLevel as GovernanceLedgerEvent['eventLevel'],
    eventType: row.eventType as GovernanceLedgerEvent['eventType'],
    correlationId: row.correlationId,
    causalityChainId: row.causalityChainId,
    executionDecision,
    causedByPolicies: causedBy,
    policyVersion: row.policyVersion,
    affectedSubsystems: affected,
    recoveryActions: recovery,
    executionContextSummary: ctx ?? {
      routeRegion: row.routeRegion ?? undefined,
      countryCode: row.countryCode ?? undefined,
    },
  };
}
