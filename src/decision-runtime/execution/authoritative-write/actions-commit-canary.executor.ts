/**
 * ACTIONS_COMMIT AUTHORITATIVE_CANARY executor (first round).
 * Admitted requests: UWC-only decision path; no Legacy dual-exec; no PV/Trip/Item writes.
 */

import { AuthoritativeWriteHandlerRegistryService } from './corridor-handler.registry';
import { validateAuthoritativeWriteCommand } from './authoritative-write-validate.util';
import { evaluateAtomicOccDecision } from './expected-write-version';
import {
  AUTHORITATIVE_WRITE_CONTRACT_VERSION,
  AUTHORITATIVE_WRITE_ERROR_CODES,
  type AuthoritativeWriteResult,
} from './authoritative-write.types';
import { UWC_ACTIONS_CANARY_MODE } from './actions-commit-canary.config';

export type ActionsCommitCanaryExecInput = {
  tripId: string;
  requestId: string;
  idempotencyKey: string;
  contextSignature?: string;
  expectedResourceVersion?: string | number;
  observedResourceVersion?: string | number;
  actorId?: string;
};

export function executeActionsCommitAuthoritativeCanary(
  input: ActionsCommitCanaryExecInput,
  registry: AuthoritativeWriteHandlerRegistryService = new AuthoritativeWriteHandlerRegistryService(),
): AuthoritativeWriteResult {
  const handler = registry.get('ACTIONS_COMMIT');
  const command = handler.buildCommand({
    trip_id: input.tripId,
    request_id: input.requestId,
    idempotency_key: input.idempotencyKey,
    context_signature: input.contextSignature ?? 'canary_no_effect',
    expectedResourceVersion: input.expectedResourceVersion ?? 'canary',
    observedResourceVersion:
      input.observedResourceVersion ?? input.expectedResourceVersion ?? 'canary',
    actorId: input.actorId,
  });

  const failure = validateAuthoritativeWriteCommand(command);
  if (failure) {
    const outcome =
      failure.errorCode === AUTHORITATIVE_WRITE_ERROR_CODES.VERIFICATION_REQUIRED
        ? 'VERIFICATION_REQUIRED'
        : failure.errorCode === AUTHORITATIVE_WRITE_ERROR_CODES.AUTHORITY_DENIED
          ? 'REJECTED'
          : failure.errorCode ===
                AUTHORITATIVE_WRITE_ERROR_CODES.FRESHNESS_CONFLICT ||
              failure.errorCode ===
                AUTHORITATIVE_WRITE_ERROR_CODES.BASE_PLAN_VERSION_STALE ||
              failure.errorCode ===
                AUTHORITATIVE_WRITE_ERROR_CODES.CONTEXT_VERSION_CONFLICT
            ? 'CONFLICT'
            : 'REJECTED';
    return {
      schemaId: 'tripnara.authoritative_write_result@v1',
      contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
      outcome,
      corridor: 'ACTIONS_COMMIT',
      errorCode: failure.errorCode,
      reasonCodes: [...failure.reasonCodes, UWC_ACTIONS_CANARY_MODE],
      writeTargetsTouched: [],
      idempotencyKey: command.idempotency.key,
      corridorResult: {
        canary: true,
        dualExecution: false,
        writesPerformed: false,
      },
    };
  }

  if (command.observedWriteVersion) {
    const occ = evaluateAtomicOccDecision({
      idempotencyKey: command.idempotency.key,
      prior: null,
      expected: command.expectedWriteVersion,
      observed: command.observedWriteVersion,
    });
    if (occ.decision === 'ALREADY_APPLIED') {
      return {
        schemaId: 'tripnara.authoritative_write_result@v1',
        contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
        outcome: 'IDEMPOTENT_REPLAY',
        corridor: 'ACTIONS_COMMIT',
        reasonCodes: [...occ.reasonCodes, UWC_ACTIONS_CANARY_MODE],
        writeTargetsTouched: [],
        idempotencyKey: command.idempotency.key,
        corridorResult: {
          canary: true,
          dualExecution: false,
          writesPerformed: false,
        },
      };
    }
    if (occ.decision === 'VERSION_CONFLICT') {
      return {
        schemaId: 'tripnara.authoritative_write_result@v1',
        contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
        outcome: 'CONFLICT',
        corridor: 'ACTIONS_COMMIT',
        errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FRESHNESS_CONFLICT,
        reasonCodes: [...occ.reasonCodes, UWC_ACTIONS_CANARY_MODE],
        writeTargetsTouched: [],
        idempotencyKey: command.idempotency.key,
        corridorResult: {
          canary: true,
          dualExecution: false,
          writesPerformed: false,
        },
      };
    }
  }

  // First-round admitted scope: no effective writes — authoritative decision only.
  return {
    schemaId: 'tripnara.authoritative_write_result@v1',
    contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
    outcome: 'APPLIED',
    corridor: 'ACTIONS_COMMIT',
    reasonCodes: [
      'AUTHORITATIVE_CANARY_APPLIED',
      'NO_EFFECTIVE_SIDE_EFFECT',
      'NO_DUAL_EXECUTION',
      UWC_ACTIONS_CANARY_MODE,
    ],
    writeTargetsTouched: [],
    idempotencyKey: command.idempotency.key,
    corridorResult: {
      canary: true,
      dualExecution: false,
      writesPerformed: false,
      mode: UWC_ACTIONS_CANARY_MODE,
    },
  };
}
