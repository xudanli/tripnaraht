/**
 * Request-scoped constraint gateway ingress audit (SM VERIFY → authority_audit_v1 merge).
 */

import { AsyncLocalStorage } from 'async_hooks';
import type { CanonicalConstraintReport } from './contracts/canonical-constraint-report';
import type { ConstraintEvaluationMode } from './contracts/constraint-assessment.types';

export type ConstraintGatewayIngressPhase =
  | 'VERIFY'
  | 'GATE_EVAL'
  | 'CANDIDATE_FILTER'
  | 'PLAN_VERIFY'
  | 'UNKNOWN';

export type ConstraintGatewayIngressRecordV1 = {
  schemaId: 'tripnara.constraint_gateway_ingress@v1';
  evaluationId: string;
  tripId: string;
  evaluationMode?: ConstraintEvaluationMode;
  phase: ConstraintGatewayIngressPhase;
  verdict: 'PASS' | 'WARN' | 'BLOCK' | 'UNVERIFIED';
  invokedAt: string;
};

export type ConstraintGatewayIngressSnapshotV1 = {
  schemaId: 'tripnara.constraint_gateway_ingress_snapshot@v1';
  records: ConstraintGatewayIngressRecordV1[];
  primary?: ConstraintGatewayIngressRecordV1;
};

const ingressStorage = new AsyncLocalStorage<{ records: ConstraintGatewayIngressRecordV1[] }>();

export function runWithConstraintGatewayIngressContext<T>(fn: () => T): T {
  return ingressStorage.run({ records: [] }, fn);
}

export function constraintVerdictFromReport(
  report: Pick<CanonicalConstraintReport, 'overallStatus'>,
): ConstraintGatewayIngressRecordV1['verdict'] {
  switch (report.overallStatus) {
    case 'INFEASIBLE':
      return 'BLOCK';
    case 'CONDITIONALLY_FEASIBLE':
      return 'WARN';
    case 'FEASIBLE':
      return 'PASS';
    default:
      return 'UNVERIFIED';
  }
}

export function resolveIngressPhaseFromEvaluationMode(
  mode?: ConstraintEvaluationMode,
): ConstraintGatewayIngressPhase {
  switch (mode) {
    case 'PLAN_VERIFY':
      return 'VERIFY';
    case 'CANDIDATE_FILTER':
      return 'CANDIDATE_FILTER';
    case 'CHANGE_PREVIEW':
      return 'PLAN_VERIFY';
    default:
      return mode ? 'UNKNOWN' : 'UNKNOWN';
  }
}

export function recordConstraintGatewayIngressFromReport(
  report: CanonicalConstraintReport,
  phase?: ConstraintGatewayIngressPhase,
): void {
  const store = ingressStorage.getStore();
  if (!store) return;

  const evaluationId = report.evaluationId?.trim();
  if (!evaluationId) return;

  store.records.push({
    schemaId: 'tripnara.constraint_gateway_ingress@v1',
    evaluationId,
    tripId: report.tripId,
    evaluationMode: report.evaluationMode,
    phase: phase ?? resolveIngressPhaseFromEvaluationMode(report.evaluationMode),
    verdict: constraintVerdictFromReport(report),
    invokedAt: report.evaluatedAt,
  });
}

export function getConstraintGatewayIngressRecords(): ConstraintGatewayIngressRecordV1[] {
  return ingressStorage.getStore()?.records ?? [];
}

/** Prefer SM VERIFY ingress, else latest record in the request scope. */
export function resolvePrimaryConstraintGatewayIngress():
  | ConstraintGatewayIngressRecordV1
  | undefined {
  const records = getConstraintGatewayIngressRecords();
  if (records.length === 0) return undefined;
  return records.find((r) => r.phase === 'VERIFY') ?? records[records.length - 1];
}

export function buildConstraintGatewayIngressSnapshot(): ConstraintGatewayIngressSnapshotV1 {
  const records = getConstraintGatewayIngressRecords();
  return {
    schemaId: 'tripnara.constraint_gateway_ingress_snapshot@v1',
    records,
    primary: resolvePrimaryConstraintGatewayIngress(),
  };
}

export function resetConstraintGatewayIngressForTests(): void {
  ingressStorage.getStore()?.records.splice(0);
}
