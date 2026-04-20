import { Injectable } from '@nestjs/common';
import type { HarnessDeterministicValidator } from './deterministic-validator.interface';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';
import type { HarnessValidationResult } from '../../contracts/validation.types';

/**
 * P0：要求非空 idempotencyKey（重试与外部 API / 计费前的最低保障）。
 * 是否跳过重复调用由调用方在执行前使用 `HarnessIdempotencyRegistryService.hasCommitted`。
 */
@Injectable()
export class HarnessIdempotencyKeyValidator implements HarnessDeterministicValidator {
  readonly name = 'idempotency-key.validator';

  validate(
    _input: unknown,
    context: HarnessExecutionContext,
  ): HarnessValidationResult {
    const key = context.metadata.idempotencyKey;
    if (key == null || String(key).trim() === '') {
      return {
        passed: false,
        severity: 'L2',
        code: 'IDEMPOTENCY_KEY_MISSING',
        message:
          'idempotencyKey is required in execution context metadata for this step.',
        details: { requestId: context.requestId, step: context.step },
      };
    }
    return {
      passed: true,
      severity: 'L1',
      code: 'IDEMPOTENCY_KEY_PRESENT',
      message: 'Idempotency key present.',
    };
  }
}
