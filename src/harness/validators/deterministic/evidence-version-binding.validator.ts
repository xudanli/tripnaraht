import { Injectable } from '@nestjs/common';
import type { HarnessDeterministicValidator } from './deterministic-validator.interface';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';
import type { HarnessValidationResult } from '../../contracts/validation.types';

type VisibleWithBinding = {
  boundResearchSnapshotId?: string;
};

/**
 * P0：VERIFY 等步骤可见状态中须携带与 DSO.harnessRuntime 一致的快照绑定。
 * 由 StateProjectionService 注入 boundResearchSnapshotId。
 */
@Injectable()
export class HarnessEvidenceVersionBindingValidator
  implements HarnessDeterministicValidator
{
  readonly name = 'evidence-version-binding.validator';

  validate(
    _input: unknown,
    context: HarnessExecutionContext,
  ): HarnessValidationResult {
    if (process.env.HARNESS_RELAX_VERIFY_EVIDENCE_BINDING === '1') {
      return {
        passed: true,
        severity: 'L1',
        code: 'EVIDENCE_BINDING_RELAXED',
        message:
          'HARNESS_RELAX_VERIFY_EVIDENCE_BINDING=1: skipping evidence snapshot binding check (dev / legacy path only).',
        details: { step: context.step, requestId: context.requestId },
      };
    }
    const vis = context.visibleState as VisibleWithBinding | undefined;
    const bound = vis?.boundResearchSnapshotId;
    if (bound == null || bound === '') {
      return {
        passed: false,
        severity: 'L2',
        code: 'EVIDENCE_SNAPSHOT_UNBOUND',
        message:
          'VERIFY requires boundResearchSnapshotId on visible state (RESEARCH freeze).',
        details: { step: context.step },
      };
    }
    return {
      passed: true,
      severity: 'L1',
      code: 'EVIDENCE_VERSION_OK',
      message: 'Research evidence snapshot binding present.',
    };
  }
}
