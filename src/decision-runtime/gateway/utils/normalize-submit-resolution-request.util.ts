import { BadRequestException } from '@nestjs/common';
import type {
  CausalTraceReference,
  SubmitDecisionProblemResolutionRequest,
} from '../contracts/unified-decision-ui.types';

/** Accept legacy/alias field names from clients that send actionId instead of selectedActionId. */
export type SubmitResolutionRequestInput = {
  selectedActionId?: string;
  actionId?: string;
  optionId?: string;
  selectedOptionId?: string;
  idempotencyKey?: string;
  reason?: string;
  acknowledgement?: string[];
  causalTraceRef?: CausalTraceReference;
};

export function normalizeSubmitResolutionRequest(
  raw: SubmitResolutionRequestInput,
): SubmitDecisionProblemResolutionRequest {
  const selectedActionId = pickNonEmptyString(
    raw.selectedActionId,
    raw.actionId,
    raw.optionId,
    raw.selectedOptionId,
  );

  if (!selectedActionId) {
    throw new BadRequestException(
      'DECISION_ACTION_REQUIRED: provide selectedActionId (alias: actionId, optionId)',
    );
  }

  return {
    selectedActionId,
    idempotencyKey: raw.idempotencyKey,
    reason: raw.reason,
    acknowledgement: raw.acknowledgement,
    causalTraceRef: raw.causalTraceRef,
  };
}

function pickNonEmptyString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}
