/**
 * P1：组合 AO-04（claude_exec 切片）与 K3（decision_log 对齐）便于组装/E2E 一处断言
 */

import { validateAo04RouteAndRunContract } from './claude-exec-route-and-run.contract';
import { validateK3RouteAndRunDecisionLogAlignment } from './route-and-run-k3-decision-log.contract';

export type P1RouteAndRunValidationSummary = {
  valid: boolean;
  ao04: ReturnType<typeof validateAo04RouteAndRunContract>;
  k3: ReturnType<typeof validateK3RouteAndRunDecisionLogAlignment>;
  allErrors: string[];
  allWarnings: string[];
};

export function summarizeP1RouteAndRunValidation(res: unknown): P1RouteAndRunValidationSummary {
  const ao04 = validateAo04RouteAndRunContract(res);
  const k3 = validateK3RouteAndRunDecisionLogAlignment(res);
  return {
    valid: ao04.valid && k3.valid,
    ao04,
    k3,
    allErrors: [...ao04.errors, ...k3.errors],
    allWarnings: [...ao04.warnings, ...k3.warnings],
  };
}
