import type { HarnessStepName } from '../contracts/harness-step.types';
import type { HarnessValidationResult } from '../contracts/validation.types';
import type { HarnessGraderResult } from '../inferential/harness-inferential-grader.interface';
import type { HarnessStepRunStatus } from '../tracing/harness-trace.types';

/** `validateStepAdmission`：仅判断「当前 DSO 是否满足进入该 Harness 步骤的契约」，不写 trace（由调用方 `skipTrace` 保证）。 */
export interface HarnessStepAdmissionResult {
  passed: boolean;
  harness_step: HarnessStepName;
  run_status: HarnessStepRunStatus;
  validation_results: HarnessValidationResult[];
  grader_results?: HarnessGraderResult[];
  /** 不满足契约时建议回退到的 Harness 步骤（通常为上一硬阶段） */
  suggested_fallback_step?: HarnessStepName;
}
