import { Injectable, Optional } from '@nestjs/common';
import {
  AUTHORITATIVE_WRITE_CONTRACT_VERSION,
  AUTHORITATIVE_WRITE_ERROR_CODES,
  type AuthoritativeWriteCommand,
  type AuthoritativeWriteResult,
} from './authoritative-write.types';
import { validateAuthoritativeWriteCommand } from './authoritative-write-validate.util';
import { AuthoritativeWriteHandlerRegistryService } from './corridor-handler.registry';
import {
  resolveCorridorWriteMode,
  UWC_AUTHORITATIVE_HARD_BLOCK_REASON,
} from './corridor-write-mode.config';
import { getCorridorWriteTargetProfile } from './write-target.registry';

/**
 * Gateway: validate + mode-aware dispatch.
 * AUTHORITATIVE → hard reject until UWC-1c.
 * SHADOW_VALIDATE → handler.shadowValidate only (no writes).
 * DISABLED → HANDLER path skipped / REJECTED with DISABLED.
 */
@Injectable()
export class AuthoritativeWriteGatewayService {
  constructor(
    @Optional()
    private readonly registry: AuthoritativeWriteHandlerRegistryService | null = null,
  ) {}

  validate(command: AuthoritativeWriteCommand): AuthoritativeWriteResult {
    const failure = validateAuthoritativeWriteCommand(command);
    if (failure) {
      return this.reject(command, failure.errorCode, failure.reasonCodes);
    }
    return {
      schemaId: 'tripnara.authoritative_write_result@v1',
      contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
      outcome: 'VERIFICATION_REQUIRED',
      corridor: command.corridor,
      reasonCodes: ['VALIDATE_OK_AWAITING_APPLY'],
      writeTargetsTouched: [],
      idempotencyKey: command.idempotency.key,
    };
  }

  async apply(command: AuthoritativeWriteCommand): Promise<AuthoritativeWriteResult> {
    const failure = validateAuthoritativeWriteCommand(command);
    if (failure) {
      return this.reject(command, failure.errorCode, failure.reasonCodes);
    }

    const mode = resolveCorridorWriteMode(command.corridor);
    if (mode.authoritativeHardBlocked || mode.requested === 'AUTHORITATIVE') {
      return this.reject(command, AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY, [
        UWC_AUTHORITATIVE_HARD_BLOCK_REASON,
        `requested=${mode.requested}`,
        `effective=${mode.effective}`,
      ]);
    }

    if (mode.effective === 'DISABLED') {
      return this.reject(command, AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY, [
        'CORRIDOR_MODE_DISABLED',
      ]);
    }

    const handler = this.registry?.get(command.corridor);
    if (!handler) {
      const profile = getCorridorWriteTargetProfile(command.corridor);
      return this.reject(command, AUTHORITATIVE_WRITE_ERROR_CODES.HANDLER_NOT_BOUND, [
        'bind corridor handler',
        `delegate=${profile.delegatePath}#${profile.delegateSymbol}`,
      ]);
    }

    if (mode.effective === 'SHADOW_VALIDATE') {
      const report = handler.shadowValidate(command);
      return {
        schemaId: 'tripnara.authoritative_write_result@v1',
        contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
        outcome: report.predictedOutcome,
        corridor: command.corridor,
        reasonCodes: [...report.reasonCodes, 'SHADOW_VALIDATE_NO_WRITE'],
        writeTargetsTouched: [],
        idempotencyKey: command.idempotency.key,
        corridorResult: {
          shadow: true,
          writesPerformed: false,
          resolvedWriteTargets: report.resolvedWriteTargets,
          gateChecks: report.gateChecks,
        },
      };
    }

    // AUTHORITATIVE effective only if unlock — still call handler which hard-throws
    return handler.authoritativeApply(command);
  }

  private reject(
    command: AuthoritativeWriteCommand,
    errorCode: AuthoritativeWriteResult['errorCode'],
    reasonCodes: string[],
  ): AuthoritativeWriteResult {
    const outcome =
      errorCode === AUTHORITATIVE_WRITE_ERROR_CODES.VERIFICATION_REQUIRED
        ? 'VERIFICATION_REQUIRED'
        : errorCode === AUTHORITATIVE_WRITE_ERROR_CODES.FRESHNESS_CONFLICT ||
            errorCode === AUTHORITATIVE_WRITE_ERROR_CODES.BASE_PLAN_VERSION_STALE ||
            errorCode === AUTHORITATIVE_WRITE_ERROR_CODES.CONTEXT_VERSION_CONFLICT ||
            errorCode === AUTHORITATIVE_WRITE_ERROR_CODES.IDEMPOTENCY_CONFLICT
          ? 'CONFLICT'
          : 'REJECTED';

    return {
      schemaId: 'tripnara.authoritative_write_result@v1',
      contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
      outcome,
      corridor: command.corridor,
      errorCode,
      reasonCodes,
      writeTargetsTouched: [],
      idempotencyKey: command.idempotency?.key ?? '',
    };
  }
}
