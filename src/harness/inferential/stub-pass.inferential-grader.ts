import { Injectable } from '@nestjs/common';
import type { HarnessExecutionContext } from '../runtime/execution-context.types';
import type { HarnessGraderResult, HarnessInferentialGrader } from './harness-inferential-grader.interface';

/**
 * 占位 grader：恒通过。VERIFY 等契约可挂载以验证 inferential 管线。
 * 后续替换为真实 pacing / coherence 等实现。
 */
@Injectable()
export class HarnessStubPassInferentialGrader implements HarnessInferentialGrader {
  readonly name = 'stub-pass.grader';

  async grade(
    _input: unknown,
    _context: HarnessExecutionContext,
  ): Promise<HarnessGraderResult> {
    return {
      passed: true,
      score: 1,
      label: 'STUB_PASS',
      explanation: 'Stub inferential grader: no-op pass.',
      severity: 'L1',
    };
  }
}
