/**
 * OntologyCanonicalApply — seal wrapper only.
 * executeMutation MUST delegate to Decision Problem → Preview → Confirm → Apply / DecisionCore execute.
 * Never calls setEffective / writes ItineraryItem directly.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ActionProposal } from '../contracts/action-proposal.types';
import type { ConstraintAssessment } from '../contracts/constraint-assessment.types';
import type { TravelWorldFact } from '../contracts/travel-world-fact.types';
import { assertCanonicalEffectiveWriteOrFailedSafe } from '../authority/canonical-effective-write-seal.util';
import {
  assertActionProposalRevisionFresh,
  runOntologyOutcomeReevaluation,
  type OntologyOutcomeEventV1,
} from '../authority/ontology-outcome-reevaluation.util';
import {
  persistOntologyOutcomeEvent,
  upsertTripAssessments,
} from '../authority/ontology-outcome-event.store';
import { recordAuthorityConsumptionTrace } from '../authority/record-authority-consumption-trace.util';
import type { AuthorityConsumer } from '../authority/authority-consumption-trace.types';

export type OntologyCanonicalApplyConsumer =
  | 'decision'
  | 'exploration'
  | 'repair'
  | 'agent'
  | 'tep'
  | 'monitoring';

const CONSUMER_TO_ACT: Record<OntologyCanonicalApplyConsumer, AuthorityConsumer> = {
  decision: 'plan.repair',
  exploration: 'monitoring.apply',
  repair: 'plan.repair',
  agent: 'agent.verify',
  tep: 'plan.repair',
  monitoring: 'monitoring.apply',
};

export interface OntologyCanonicalApplyInput {
  tripId: string;
  consumer: OntologyCanonicalApplyConsumer;
  action: ActionProposal;
  sourceAssessment: ConstraintAssessment;
  contextId: string;
  authorityRunId: string;
  currentRevision: number;
  factsAfterMutation: TravelWorldFact[];
  /** Injected write — must be UWC apply or DecisionCore execute only. */
  executeMutation: () => Promise<{ changedPlanVersion?: string }>;
}

export interface OntologyCanonicalApplyResult {
  ok: true;
  outcomeEvent: OntologyOutcomeEventV1;
  nextAssessment: ConstraintAssessment;
  invalidatedAssessmentIds: string[];
  outputRevision: number;
  changedPlanVersion?: string;
  consumer: OntologyCanonicalApplyConsumer;
}

@Injectable()
export class OntologyCanonicalApplyService {
  private readonly logger = new Logger(OntologyCanonicalApplyService.name);

  async applyAdopt(input: OntologyCanonicalApplyInput): Promise<OntologyCanonicalApplyResult> {
    const { action, sourceAssessment, currentRevision } = input;

    if (action.assessmentId !== sourceAssessment.assessmentId) {
      throw new Error(
        `ONT-P0-07D: ActionProposal.assessmentId=${action.assessmentId} != sourceAssessment=${sourceAssessment.assessmentId}`,
      );
    }

    assertActionProposalRevisionFresh({ proposal: action, currentRevision });

    for (const pre of action.preconditions) {
      if (pre.type === 'ASSESSMENT_OUTCOME' && pre.assessmentId) {
        if (pre.assessmentId !== sourceAssessment.assessmentId) {
          throw new Error(
            `ONT-P0-07D: precondition assessmentId mismatch (${pre.assessmentId})`,
          );
        }
      }
      if (pre.type === 'REVISION_MATCH' && pre.expectedRevision != null) {
        if (pre.expectedRevision !== currentRevision) {
          throw new Error(
            `ONT-P0-07D: REVISION_MATCH failed expected=${pre.expectedRevision} actual=${currentRevision}`,
          );
        }
      }
    }

    assertCanonicalEffectiveWriteOrFailedSafe({
      caller: `ontology-canonical-apply:${input.consumer}`,
      assessmentId: action.assessmentId,
      authorityRunId: input.authorityRunId,
      basedOnRevision: action.basedOnRevision,
      semanticScope: input.consumer,
      tripId: input.tripId,
      canonicalApply: true,
      directSetEffective: false,
    });

    const mutation = await input.executeMutation();
    const outputRevision = currentRevision + 1;
    const { outcomeEvent, invalidated, nextAssessment } = runOntologyOutcomeReevaluation({
      action,
      sourceAssessment,
      factsAfter: input.factsAfterMutation,
      contextId: input.contextId,
      authorityRunId: input.authorityRunId,
      changedPlanVersion: mutation.changedPlanVersion,
      result: 'APPLIED',
    });

    persistOntologyOutcomeEvent(input.tripId, outcomeEvent);
    upsertTripAssessments(input.tripId, [...invalidated, nextAssessment]);

    recordAuthorityConsumptionTrace({
      consumer: CONSUMER_TO_ACT[input.consumer],
      tripId: input.tripId,
      inputRevision: currentRevision,
      assessmentId: nextAssessment.assessmentId,
      runtimeAuthority: 'ONTOLOGY_CANONICAL',
      factsUsed: nextAssessment.factRefs,
      constraintVersion: nextAssessment.basis.constraintVersion,
      outputRevision,
      legacyWriteAttempted: false,
      reasonCodes: nextAssessment.reasonCodes,
    });

    this.logger.log(
      `Canonical Apply trip=${input.tripId} consumer=${input.consumer} ` +
        `src=${sourceAssessment.assessmentId} → next=${nextAssessment.assessmentId} ` +
        `outcome=${nextAssessment.outcome} rev=${currentRevision}→${outputRevision}`,
    );

    return {
      ok: true,
      outcomeEvent,
      nextAssessment,
      invalidatedAssessmentIds: invalidated.map((a) => a.assessmentId),
      outputRevision,
      changedPlanVersion: mutation.changedPlanVersion,
      consumer: input.consumer,
    };
  }
}
