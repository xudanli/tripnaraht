/**
 * Shared pre-execute validation stages for AuthoritativeWriteGateway.
 * Does not perform persistence — adapters do.
 */

import {
  AUTHORITATIVE_WRITE_ERROR_CODES,
  AUTHORITATIVE_WRITE_V1_CORRIDORS,
  UWC_V1_FORBIDDEN,
  type AuthoritativeWriteCommand,
  type AuthoritativeWriteErrorCode,
  type AuthoritativeWriteCorridorId,
} from './authoritative-write.types';
import { getCorridorWriteTargetProfile } from './write-target.registry';

export type GatewayStageFailure = {
  errorCode: AuthoritativeWriteErrorCode;
  reasonCodes: string[];
};

function isV1Corridor(c: string): c is AuthoritativeWriteCorridorId {
  return (AUTHORITATIVE_WRITE_V1_CORRIDORS as readonly string[]).includes(c);
}

export function validateAuthoritativeWriteCommand(
  command: AuthoritativeWriteCommand,
): GatewayStageFailure | null {
  if (command.schemaId !== 'tripnara.authoritative_write_command@v1') {
    return {
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
      reasonCodes: ['INVALID_SCHEMA_ID'],
    };
  }

  if (!isV1Corridor(command.corridor)) {
    return {
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.CORRIDOR_NOT_IN_V1_BATCH,
      reasonCodes: [`corridor=${command.corridor}`, ...UWC_V1_FORBIDDEN],
    };
  }

  if (!command.audit?.tripId || !command.audit?.requestedAt || !command.audit?.productSurface) {
    return {
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.AUDIT_CONTEXT_INCOMPLETE,
      reasonCodes: ['audit.tripId|requestedAt|productSurface required'],
    };
  }

  if (!command.idempotency?.key?.trim()) {
    return {
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.IDEMPOTENCY_KEY_MISSING,
      reasonCodes: ['idempotency.key required'],
    };
  }

  if (command.authority.verdict !== 'ALLOW') {
    return {
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.AUTHORITY_DENIED,
      reasonCodes:
        command.authority.reasonCodes.length > 0
          ? command.authority.reasonCodes
          : ['authority.verdict=DENY'],
    };
  }

  if (
    command.verification.kind !== 'none_required' &&
    !command.verification.token &&
    command.verification.kind !== 'pending_draft' &&
    command.verification.kind !== 'authorize_record'
  ) {
    // context_signature / envelope require token; authorize_record may use decisionId on authority
    if (command.verification.kind === 'context_signature') {
      return {
        errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.VERIFICATION_REQUIRED,
        reasonCodes: ['verification.token required for context_signature'],
      };
    }
    if (command.verification.kind === 'mutation_authority_envelope') {
      return {
        errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.VERIFICATION_REQUIRED,
        reasonCodes: ['verification.token required for mutation_authority_envelope'],
      };
    }
  }

  if (command.verification.kind === 'authorize_record' && !command.authority.decisionId) {
    return {
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.VERIFICATION_REQUIRED,
      reasonCodes: ['authority.decisionId required for authorize_record'],
    };
  }

  const profile = getCorridorWriteTargetProfile(command.corridor);

  // Phase 1b hint: UNIFIED_EXECUTE should carry basePlanVersionId when clients opt in.
  // Soft check only when freshness.basePlanVersionId is explicitly empty-string (invalid).
  if (
    command.corridor === 'UNIFIED_EXECUTE' &&
    command.freshness.basePlanVersionId === ''
  ) {
    return {
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.BASE_PLAN_VERSION_STALE,
      reasonCodes: ['freshness.basePlanVersionId must not be empty string'],
    };
  }

  if (
    command.corridor === 'ACTIONS_COMMIT' &&
    command.freshness.contextVersion === ''
  ) {
    return {
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.CONTEXT_VERSION_CONFLICT,
      reasonCodes: ['freshness.contextVersion must not be empty string'],
    };
  }

  if (!command.writeTargets?.length) {
    return {
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.WRITE_TARGET_MISMATCH,
      reasonCodes: ['writeTargets empty', `expected profile ${profile.auditRowId}`],
    };
  }

  const allowedKinds = new Set(profile.writeTargets.map((t) => t.kind));
  for (const ref of command.writeTargets) {
    if (!allowedKinds.has(ref.kind)) {
      return {
        errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.WRITE_TARGET_MISMATCH,
        reasonCodes: [
          `unexpected WriteTargetKind=${ref.kind}`,
          `corridor=${command.corridor}`,
        ],
      };
    }
  }

  if (command.compensationModel !== profile.compensationModel) {
    return {
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.COMPENSATION_UNSUPPORTED,
      reasonCodes: [
        `expected ${profile.compensationModel}`,
        `got ${command.compensationModel}`,
      ],
    };
  }

  return null;
}
