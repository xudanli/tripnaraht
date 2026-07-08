import { BadRequestException } from '@nestjs/common';
import { resolveDecisionAuthority, domainFromAssertion } from '../authority/decision-authority.matrix';
import type {
  ConstraintEnforcement,
  DecisionAuthority,
  DecisionProblemDetail,
  DecisionProblemType,
} from '../types/decision-semantics.types';

export function buildRequiredAcknowledgementsFromAuthority(authority: DecisionAuthority): string[] {
  const required: string[] = [];
  if (authority.overrideRequirements?.acknowledgementRequired) {
    required.push('我已了解该决策对行程的影响与约束说明');
  }
  if (authority.overrideRequirements?.liabilityNoticeRequired) {
    required.push('我确认已知悉相关风险并自愿承担决策后果');
  }
  if (
    !authority.overridable &&
    authority.executionMode === 'EXPLICIT_CONFIRMATION' &&
    !required.length
  ) {
    required.push('我确认在了解阻断原因后仍执行该方案');
  }
  return [...new Set(required)];
}

export function buildRequiredAcknowledgements(input: {
  requiresConfirmation?: boolean;
  enforcement: ConstraintEnforcement;
  detail: Pick<DecisionProblemDetail, 'type' | 'semanticKey' | 'assertions'>;
}): string[] {
  const primary = input.detail.assertions[0];
  if (!primary) return [];

  const authority = resolveDecisionAuthority({
    problemType: input.detail.type as DecisionProblemType,
    primaryDomain: domainFromAssertion(primary),
    enforcement: input.enforcement,
    overridable: primary.overridable,
  });

  const required = buildRequiredAcknowledgementsFromAuthority(authority);
  if (input.requiresConfirmation && !required.length) {
    required.push('我确认已阅读方案说明并同意应用该修复');
  }
  return required;
}

export function assertAcknowledgementsProvided(input: {
  requiresConfirmation?: boolean;
  enforcement: ConstraintEnforcement;
  detail: Pick<DecisionProblemDetail, 'type' | 'semanticKey' | 'assertions'>;
  acknowledgement?: string[];
}): void {
  const requiredAcknowledgements = buildRequiredAcknowledgements(input);
  if (!requiredAcknowledgements.length) return;

  const provided = new Set((input.acknowledgement ?? []).map((a) => a.trim()).filter(Boolean));
  const missing = requiredAcknowledgements.filter((r) => !provided.has(r));
  if (missing.length === 0) return;

  throw new BadRequestException({
    message: 'DECISION_ACKNOWLEDGEMENT_REQUIRED',
    details: { requiredAcknowledgements, missingAcknowledgements: missing },
  });
}

export function extractBadRequestDetails(
  e: BadRequestException,
): Record<string, unknown> | undefined {
  const resp = e.getResponse();
  if (typeof resp === 'object' && resp !== null && 'details' in resp) {
    return (resp as { details?: Record<string, unknown> }).details;
  }
  return undefined;
}
