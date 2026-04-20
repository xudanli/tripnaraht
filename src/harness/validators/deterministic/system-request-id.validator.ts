import { Injectable } from '@nestjs/common';
import type { HarnessDeterministicValidator } from './deterministic-validator.interface';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';
import type { HarnessValidationResult } from '../../contracts/validation.types';

/**
 * 契约须将 `systemState` 列入 `readableStatePaths` 时生效：
 * 校验投影中的 `systemState.requestId` 与 **`HarnessExecutionContext.requestId`** 一致，降低跨请求串单风险。
 */
@Injectable()
export class HarnessSystemRequestIdValidator implements HarnessDeterministicValidator {
  readonly name = 'system-request-id.validator';

  validate(
    _input: unknown,
    context: HarnessExecutionContext,
  ): HarnessValidationResult {
    if (process.env.HARNESS_RELAX_SYSTEM_REQUEST_ID_MATCH === '1') {
      return {
        passed: true,
        severity: 'L1',
        code: 'SYSTEM_REQUEST_ID_RELAXED',
        message:
          'HARNESS_RELAX_SYSTEM_REQUEST_ID_MATCH=1: skipping systemState.requestId vs context.requestId check (dev / legacy path only).',
        details: { step: context.step, requestId: context.requestId },
      };
    }

    const vis = context.visibleState as Record<string, unknown>;
    if (!('systemState' in vis)) {
      return {
        passed: true,
        severity: 'L1',
        code: 'SYSTEM_REQUEST_ID_SKIPPED',
        message: 'systemState not in visible projection; request id match skipped.',
      };
    }
    const ss = vis.systemState;
    if (ss == null || typeof ss !== 'object') {
      return {
        passed: true,
        severity: 'L1',
        code: 'SYSTEM_REQUEST_ID_SKIPPED',
        message: 'systemState missing or null in visible projection; skipped.',
      };
    }
    const rid = (ss as Record<string, unknown>).requestId;
    if (rid == null || String(rid).trim() === '') {
      return {
        passed: true,
        severity: 'L1',
        code: 'SYSTEM_REQUEST_ID_SKIPPED',
        message: 'systemState.requestId unset in visible projection; skipped.',
      };
    }
    const a = String(context.requestId ?? '').trim();
    const b = String(rid).trim();
    if (a === '' || b === '') {
      return {
        passed: true,
        severity: 'L1',
        code: 'SYSTEM_REQUEST_ID_SKIPPED',
        message: 'Empty context or visible requestId; skipped.',
      };
    }
    if (a !== b) {
      return {
        passed: false,
        severity: 'L2',
        code: 'SYSTEM_REQUEST_ID_MISMATCH',
        message:
          'systemState.requestId in visible state does not match harness execution context requestId (possible cross-request mix-up).',
        details: { contextRequestId: a, visibleRequestId: b, step: context.step },
      };
    }
    return {
      passed: true,
      severity: 'L1',
      code: 'SYSTEM_REQUEST_ID_OK',
      message: 'systemState.requestId matches harness context requestId.',
    };
  }
}
