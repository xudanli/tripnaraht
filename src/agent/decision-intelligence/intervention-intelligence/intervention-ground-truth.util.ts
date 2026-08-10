/**
 * 人工 Intervention Ground Truth。
 */

import type { InterventionCandidateV1 } from './intervention-candidate.util';

export const INTERVENTION_GROUND_TRUTH_SCHEMA =
  'nara.intervention_ground_truth@v1' as const;

export type InterventionGroundTruthLabel =
  | 'SHOULD_INTERRUPT'
  | 'SHOULD_NOT_INTERRUPT'
  | 'UNCERTAIN';

export type InterventionGroundTruthV1 = {
  schemaId: typeof INTERVENTION_GROUND_TRUTH_SCHEMA;
  version: 1;
  truthId: string;
  candidateId: string;
  label: InterventionGroundTruthLabel;
  labeledBy: string;
  labeledAt: string;
  noteZh?: string;
  isHumanLabeled: true;
};

export function labelInterventionGroundTruth(input: {
  candidate: InterventionCandidateV1;
  label: InterventionGroundTruthLabel;
  labeledBy: string;
  noteZh?: string;
  truthId?: string;
  labeledAt?: string;
}): InterventionGroundTruthV1 {
  if (!input.labeledBy.trim()) {
    throw new Error('[InterventionGT] labeledBy_required');
  }
  return {
    schemaId: INTERVENTION_GROUND_TRUTH_SCHEMA,
    version: 1,
    truthId: input.truthId ?? `igt_${input.candidate.candidateId}`,
    candidateId: input.candidate.candidateId,
    label: input.label,
    labeledBy: input.labeledBy,
    labeledAt: input.labeledAt ?? new Date().toISOString(),
    noteZh: input.noteZh,
    isHumanLabeled: true,
  };
}
