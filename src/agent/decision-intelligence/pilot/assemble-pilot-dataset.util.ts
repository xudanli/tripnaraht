/**
 * 组装第一批可用于真实 Decision Evaluation 的高质量 Travel Decision Dataset（Pilot）。
 * DoD：得到高质量 Dataset，不是更多测试通过。
 */

import type { EvidenceFactV1 } from '../../harness/hardening/evidence.contract';
import type { TravelWorldStateV1 } from '../../state-learning/travel-world-state.types';
import {
  createTravelDecisionDataset,
  appendTravelDecisionRecord,
  type TravelDecisionDatasetV1,
  type TravelDecisionDatasetRecordV1,
} from '../evidence-accumulation/travel-decision-dataset.util';
import type { CanaryCandidateEvaluationV1 } from '../canary/canary-candidate-evaluation.util';
import { assertRealDecisionPilotKeyOrThrow } from './pilot-decision-keys.util';
import {
  advanceDecisionDataFunnel,
  type DecisionFunnelProgressV1,
} from './decision-data-funnel.util';
import { classifyDecisionFailure } from './decision-failure-taxonomy.util';
import type { DecisionFailureLabelV1 } from './decision-failure-taxonomy.util';

export type PilotEpisodeInput = {
  recordId: string;
  tripId: string;
  decisionKey: string;
  snapshotId: string;
  worldState: TravelWorldStateV1;
  evidence: EvidenceFactV1[];
  productionOptionId: string;
  candidateOptionId: string;
  userChosenOptionId?: string | null;
  outcomeObservable: boolean;
  outcomeValueZh?: string;
  evaluation?: CanaryCandidateEvaluationV1 | null;
  eligible: boolean;
  comparable: boolean;
  attributionValid: boolean;
  evaluationValid: boolean;
};

export type PilotEpisodeBundleV1 = {
  dataset: TravelDecisionDatasetV1;
  funnelProgresses: DecisionFunnelProgressV1[];
  failureLabels: DecisionFailureLabelV1[];
  /** Evaluation Valid 且 Pilot Key 的记录数 */
  highQualityCount: number;
};

export function assemblePilotTravelDecisionDataset(input: {
  episodes: PilotEpisodeInput[];
  minRecordsForTemporal?: number;
}): PilotEpisodeBundleV1 {
  let dataset = createTravelDecisionDataset({
    minRecordsForTemporal: input.minRecordsForTemporal ?? 20,
  });
  const funnelProgresses: DecisionFunnelProgressV1[] = [];
  const failureLabels: DecisionFailureLabelV1[] = [];

  for (const ep of input.episodes) {
    assertRealDecisionPilotKeyOrThrow(ep.decisionKey);
    const hasDisagreement =
      ep.productionOptionId !== ep.candidateOptionId;
    const progress = advanceDecisionDataFunnel({
      isDecision: true,
      isEligible: ep.eligible,
      isComparable: ep.comparable,
      outcomeObservable: ep.outcomeObservable,
      attributionValid: ep.attributionValid,
      evaluationValid: ep.evaluationValid,
      hasDisagreement,
    });
    funnelProgresses.push(progress);

    failureLabels.push(
      classifyDecisionFailure({
        productionOptionId: ep.productionOptionId,
        candidateOptionId: ep.candidateOptionId,
        userChosenOptionId: ep.userChosenOptionId,
        outcomeGood: ep.outcomeObservable ? true : undefined,
      }),
    );

    /** 仅 Evaluation Valid 写入高质量 Dataset */
    if (
      progress.stageReached === 'EVALUATION_VALID' ||
      progress.stageReached === 'DISAGREEMENT'
    ) {
      const record: Omit<
        TravelDecisionDatasetRecordV1,
        'schemaId' | 'version' | 'recordedAt'
      > = {
        recordId: ep.recordId,
        tripId: ep.tripId,
        decisionKey: ep.decisionKey,
        snapshotId: ep.snapshotId,
        worldState: ep.worldState,
        evidence: ep.evidence,
        decision: { decisionId: `dec_${ep.recordId}`, state: 'COMMITTED' },
        recommendation: {
          productionOptionId: ep.productionOptionId,
          candidateOptionId: ep.candidateOptionId,
        },
        choice: { userChosenOptionId: ep.userChosenOptionId ?? null },
        action: { actionId: null, appliedToItinerary: false },
        outcome: {
          observable: ep.outcomeObservable,
          valueZh: ep.outcomeValueZh ?? null,
        },
        evaluation: ep.evaluation ?? null,
      };
      dataset = appendTravelDecisionRecord(dataset, record);
    }
  }

  return {
    dataset,
    funnelProgresses,
    failureLabels,
    highQualityCount: dataset.records.length,
  };
}
