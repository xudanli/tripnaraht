/**
 * PR-C — Dr.Dre DecisionResult → Rfc001LoadAssessment (no plan mutation).
 */

import type { DecisionResult } from '../../decision/shared/decision-result.types';
import type { Rfc001LoadAssessment } from '../contracts/guardian-outputs.types';

const DRDRE_MODEL_VERSION = 'drdre-strategy-rfc001-adapter-0.1.0';

function inferLoadScores(result: DecisionResult): {
  physicalLoad: number;
  scheduleStress: number;
  recoveryDeficit: number;
} {
  const eu = result.expectedUtility;
  const basePhysical = eu != null ? Math.max(0, Math.min(1, 1 - eu)) : 0.45;
  const codes = result.logs.flatMap((l) => l.reasonCodes ?? []).join(' ');
  const stressBump = /FATIGUE|OVERLOAD|PACE|ROLLING/i.test(codes) ? 0.15 : 0;
  return {
    physicalLoad: Math.min(1, basePhysical + stressBump),
    scheduleStress: Math.min(1, basePhysical * 0.9 + stressBump),
    recoveryDeficit: result.action === 'ADJUST' ? 0.35 : 0.2,
  };
}

export function mapDreResultToAssessment(input: {
  workspaceId: string;
  targetCandidateId: string;
  inputSnapshotRef: string;
  result: DecisionResult;
  affectedTravelerIds?: string[];
}): Rfc001LoadAssessment {
  const scores = inferLoadScores(input.result);
  const adjustmentRequirements =
    input.result.action === 'ADJUST'
      ? input.result.logs
          .filter((l) => l.action === 'ADJUST')
          .map((l) => ({
            code: l.reasonCodes[0] ?? 'ADJUST_PACE',
            description: l.explanation,
          }))
      : [];

  return {
    assessmentId: `dre_${input.workspaceId}_${input.targetCandidateId}_${Date.now()}`,
    workspaceId: input.workspaceId,
    actor: 'DRDRE',
    targetCandidateId: input.targetCandidateId,
    affectedTravelerIds: input.affectedTravelerIds ?? ['party_default'],
    physicalLoad: scores.physicalLoad,
    scheduleStress: scores.scheduleStress,
    recoveryDeficit: scores.recoveryDeficit,
    adjustmentRequirements,
    modelVersion: DRDRE_MODEL_VERSION,
    inputSnapshotRef: input.inputSnapshotRef,
    confidence: 0.8,
    createdAt: new Date().toISOString(),
  };
}
