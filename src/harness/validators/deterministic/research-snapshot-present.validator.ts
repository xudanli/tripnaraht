import { Injectable } from '@nestjs/common';
import type { HarnessDeterministicValidator } from './deterministic-validator.interface';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';
import type { HarnessValidationResult } from '../../contracts/validation.types';

type VisibleHarness = {
  harnessRuntime?: { researchEvidenceSnapshotId?: string };
};

/**
 * GATE_EVAL 前：要求已完成 RESEARCH 并写入 `harnessRuntime.researchEvidenceSnapshotId`（证据冻结锚点）。
 */
@Injectable()
export class HarnessResearchSnapshotPresentValidator
  implements HarnessDeterministicValidator
{
  readonly name = 'research-snapshot-present.validator';

  validate(
    _input: unknown,
    context: HarnessExecutionContext,
  ): HarnessValidationResult {
    if (process.env.HARNESS_RELAX_GATE_RESEARCH_SNAPSHOT === '1') {
      return {
        passed: true,
        severity: 'L1',
        code: 'RESEARCH_SNAPSHOT_RELAXED',
        message:
          'HARNESS_RELAX_GATE_RESEARCH_SNAPSHOT=1: skipping research snapshot requirement (dev / legacy path only).',
        details: { step: context.step, requestId: context.requestId },
      };
    }
    const vis = context.visibleState as VisibleHarness;
    const id = vis.harnessRuntime?.researchEvidenceSnapshotId;
    if (id == null || String(id).trim() === '') {
      return {
        passed: false,
        severity: 'L2',
        code: 'RESEARCH_SNAPSHOT_MISSING',
        message:
          'GATE_EVAL requires harnessRuntime.researchEvidenceSnapshotId from a completed RESEARCH phase.',
        details: { step: context.step, requestId: context.requestId },
      };
    }
    return {
      passed: true,
      severity: 'L1',
      code: 'RESEARCH_SNAPSHOT_OK',
      message: 'Research evidence snapshot is present.',
    };
  }
}
