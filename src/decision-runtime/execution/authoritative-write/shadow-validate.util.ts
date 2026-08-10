import {
  AUTHORITATIVE_WRITE_CONTRACT_VERSION,
  AUTHORITATIVE_WRITE_ERROR_CODES,
  type AuthoritativeWriteCommand,
  type AuthoritativeWriteOutcome,
  type AuthoritativeWriteResult,
} from './authoritative-write.types';
import { validateAuthoritativeWriteCommand } from './authoritative-write-validate.util';
import {
  UWC_AUTHORITATIVE_HARD_BLOCK_REASON,
  isAuthoritativeAllowedForCorridor,
  type CorridorWriteMode,
} from './corridor-write-mode.config';
import type {
  CorridorShadowHandler,
  ShadowGateCheck,
  ShadowValidateReport,
} from './corridor-handler.types';
import { getCorridorWriteTargetProfile } from './write-target.registry';

export function runShadowGatePipeline(
  command: AuthoritativeWriteCommand,
  mode: CorridorWriteMode,
): ShadowValidateReport {
  const profile = getCorridorWriteTargetProfile(command.corridor);
  const gateChecks: ShadowGateCheck[] = [];

  gateChecks.push({
    stage: 'authority',
    pass: command.authority.verdict === 'ALLOW',
    detail: `verdict=${command.authority.verdict}`,
  });
  gateChecks.push({
    stage: 'verification',
    pass: command.verification.kind !== 'none_required' || true,
    detail: `kind=${command.verification.kind}`,
  });
  gateChecks.push({
    stage: 'freshness',
    pass: true,
    detail: `basePlanVersionId=${command.freshness.basePlanVersionId ?? 'omit'} contextVersion=${command.freshness.contextVersion ?? 'omit'}`,
  });
  gateChecks.push({
    stage: 'idempotency',
    pass: Boolean(command.idempotency?.key?.trim()),
    detail: `durability=${command.idempotency.durability}`,
  });
  gateChecks.push({
    stage: 'write_targets',
    pass: command.writeTargets.length > 0,
    detail: `count=${command.writeTargets.length} profile=${profile.auditRowId}`,
  });
  gateChecks.push({
    stage: 'audit',
    pass: Boolean(command.audit.tripId && command.audit.requestedAt),
    detail: `tripId=${command.audit.tripId}`,
  });
  gateChecks.push({
    stage: 'compensation_model',
    pass: command.compensationModel === profile.compensationModel,
    detail: command.compensationModel,
  });

  const failure = validateAuthoritativeWriteCommand(command);
  const reasonCodes = failure
    ? failure.reasonCodes
    : gateChecks.filter((g) => !g.pass).map((g) => `GATE_FAIL_${g.stage}`);

  let predictedOutcome: AuthoritativeWriteOutcome = 'APPLIED';
  if (failure) {
    if (failure.errorCode === AUTHORITATIVE_WRITE_ERROR_CODES.VERIFICATION_REQUIRED) {
      predictedOutcome = 'VERIFICATION_REQUIRED';
    } else if (
      failure.errorCode === AUTHORITATIVE_WRITE_ERROR_CODES.FRESHNESS_CONFLICT ||
      failure.errorCode === AUTHORITATIVE_WRITE_ERROR_CODES.BASE_PLAN_VERSION_STALE ||
      failure.errorCode === AUTHORITATIVE_WRITE_ERROR_CODES.CONTEXT_VERSION_CONFLICT
    ) {
      predictedOutcome = 'CONFLICT';
    } else {
      predictedOutcome = 'REJECTED';
    }
  } else if (reasonCodes.length) {
    predictedOutcome = 'REJECTED';
  }

  return {
    schemaId: 'tripnara.uwc_shadow_validate_report@v1',
    corridor: command.corridor,
    mode,
    sideEffectsForbidden: true,
    writesPerformed: false,
    gateChecks,
    resolvedWriteTargets: profile.writeTargets,
    predictedOutcome,
    reasonCodes: failure
      ? [failure.errorCode, ...reasonCodes]
      : reasonCodes.length
        ? reasonCodes
        : ['SHADOW_VALIDATE_OK'],
    command,
  };
}

export function hardBlockAuthoritativeApply(
  command: AuthoritativeWriteCommand,
): never {
  throw new Error(
    `${UWC_AUTHORITATIVE_HARD_BLOCK_REASON}: corridor=${command.corridor} authoritativeApply forbidden until dual gates (code+switch) or corridor cutover auth`,
  );
}

/** Throw unless corridor is allowed for AUTHORITATIVE (global or cutover). */
export function assertAuthoritativeApplyAllowed(
  command: AuthoritativeWriteCommand,
): void {
  if (!isAuthoritativeAllowedForCorridor(command.corridor)) {
    hardBlockAuthoritativeApply(command);
  }
}

export function blockedAuthoritativeResult(
  command: AuthoritativeWriteCommand,
): AuthoritativeWriteResult {
  return {
    schemaId: 'tripnara.authoritative_write_result@v1',
    contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
    outcome: 'REJECTED',
    corridor: command.corridor,
    errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
    reasonCodes: [UWC_AUTHORITATIVE_HARD_BLOCK_REASON],
    writeTargetsTouched: [],
    idempotencyKey: command.idempotency.key,
  };
}
