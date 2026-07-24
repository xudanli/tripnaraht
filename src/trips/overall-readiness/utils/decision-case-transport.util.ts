/**
 * 从 DecisionCase metadata 投影交通两壳（车型 / 保险）
 */

import {
  SEMANTIC_RENTAL_INSURANCE,
  SEMANTIC_VEHICLE_ROAD_FIT,
} from '../../../decision-runtime/decision-cases/publishers/iceland-p0-case.builders';
import { readDecisionCaseStoreFromMetadata } from '../../../decision-runtime/decision-cases/persistence/decision-case.store';
import type { StoredDecisionCase } from '../../../decision-runtime/decision-cases/contracts/decision-case.types';

const CLOSED_STATUSES = new Set(['RESOLVED', 'DISMISSED']);

export type DecisionCaseTransportProjection = {
  vehicleCase?: StoredDecisionCase;
  insuranceCase?: StoredDecisionCase;
  vehicleResolved: boolean;
  insuranceResolved: boolean;
  vehicleOpen: boolean;
  insuranceOpen: boolean;
  openBlockingProblems: Array<{
    id: string;
    title: string;
    semanticKey?: string;
  }>;
  openCriticalDecisionCount: number;
};

function isOpen(c: StoredDecisionCase): boolean {
  if (!c.published) return false;
  if (CLOSED_STATUSES.has(c.workflowStatus)) return false;
  if (c.resolvedAt && c.resolvedOptionId) return false;
  return true;
}

function isResolved(c: StoredDecisionCase | undefined): boolean {
  if (!c) return false;
  if (CLOSED_STATUSES.has(c.workflowStatus)) return true;
  return Boolean(c.resolvedAt && c.resolvedOptionId);
}

export function projectTransportFromDecisionCases(
  metadata: unknown,
): DecisionCaseTransportProjection {
  const store = readDecisionCaseStoreFromMetadata(metadata);
  const cases = Object.values(store.byProblemId).filter((c) => c.published);

  const vehicleCase = cases.find((c) => c.semanticKey === SEMANTIC_VEHICLE_ROAD_FIT);
  const insuranceCase = cases.find((c) => c.semanticKey === SEMANTIC_RENTAL_INSURANCE);

  const openBlockingProblems = cases
    .filter((c) => isOpen(c) && c.requiredness === 'BLOCKING')
    .filter(
      (c) =>
        c.domain === 'TRANSPORT' ||
        c.domain === 'INSURANCE' ||
        c.semanticKey === SEMANTIC_VEHICLE_ROAD_FIT ||
        c.semanticKey === SEMANTIC_RENTAL_INSURANCE ||
        c.semanticKey.includes('FROAD'),
    )
    .map((c) => ({
      id: c.problemId,
      title: c.title,
      semanticKey: c.semanticKey,
    }));

  const openCritical = cases.filter(
    (c) =>
      isOpen(c) &&
      (c.requiredness === 'BLOCKING' || c.requiredness === 'IMPORTANT') &&
      (c.domain === 'TRANSPORT' ||
        c.domain === 'INSURANCE' ||
        c.domain === 'TEAM' ||
        c.domain === 'EXPERIENCE'),
  ).length;

  return {
    vehicleCase,
    insuranceCase,
    vehicleResolved: isResolved(vehicleCase),
    insuranceResolved: isResolved(insuranceCase),
    vehicleOpen: Boolean(vehicleCase && isOpen(vehicleCase)),
    insuranceOpen: Boolean(insuranceCase && isOpen(insuranceCase)),
    openBlockingProblems,
    openCriticalDecisionCount: openCritical,
  };
}
