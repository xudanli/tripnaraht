import { Injectable, Optional } from '@nestjs/common';
import {
  AUTHORITATIVE_WRITE_CONTRACT_VERSION,
  AUTHORITATIVE_WRITE_ERROR_CODES,
  type AuthoritativeWriteCommand,
  type AuthoritativeWriteResult,
} from './authoritative-write.types';
import type { AuthoritativeWriteHandlerRegistry } from './authoritative-write-handler';
import { validateAuthoritativeWriteCommand } from './authoritative-write-validate.util';
import { getCorridorWriteTargetProfile } from './write-target.registry';

/**
 * Lightweight AuthoritativeWriteGateway.
 *
 * Stages (shared): Authority → Verification → Freshness shape → Idempotency key →
 * WriteTarget profile → Audit completeness → (optional) Transaction/Audit via handler.
 *
 * Persistence remains in corridor executors. This gateway does not create a write bus.
 */
@Injectable()
export class AuthoritativeWriteGatewayService {
  constructor(
    @Optional()
    private readonly handlers: AuthoritativeWriteHandlerRegistry | null = null,
  ) {}

  /**
   * Validate-only path for contract tests and Preview-stage clients.
   */
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

  /**
   * Apply path: shared validation then corridor handler.
   * If no handler bound → REJECTED / HANDLER_NOT_BOUND (safe default).
   */
  async apply(command: AuthoritativeWriteCommand): Promise<AuthoritativeWriteResult> {
    const failure = validateAuthoritativeWriteCommand(command);
    if (failure) {
      return this.reject(command, failure.errorCode, failure.reasonCodes);
    }

    const handler = this.handlers?.[command.corridor];
    if (!handler) {
      const profile = getCorridorWriteTargetProfile(command.corridor);
      return this.reject(command, AUTHORITATIVE_WRITE_ERROR_CODES.HANDLER_NOT_BOUND, [
        'bind corridor handler to existing executor',
        `delegate=${profile.delegatePath}#${profile.delegateSymbol}`,
      ]);
    }

    return handler(command);
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
