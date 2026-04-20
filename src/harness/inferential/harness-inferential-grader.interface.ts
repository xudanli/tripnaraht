import type { HarnessExecutionContext } from '../runtime/execution-context.types';

/** 对齐 docs/Harness Runtime.md §7.5 */
export interface HarnessGraderResult {
  passed: boolean;
  score: number;
  label: string;
  explanation: string;
  severity: 'L1' | 'L2' | 'L3';
}

export interface HarnessInferentialGrader {
  readonly name: string;
  grade(
    input: unknown,
    context: HarnessExecutionContext,
  ): Promise<HarnessGraderResult>;
}
