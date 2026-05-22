import { HarnessStepName } from '../contracts/harness-step.types';

/** Harness 主链顺序（编排图、准入回退、Durable resume 共用） */
export const HARNESS_STEP_ORDER: HarnessStepName[] = [
  HarnessStepName.INTAKE,
  HarnessStepName.RESEARCH,
  HarnessStepName.GATE_EVAL,
  HarnessStepName.PLAN_GEN,
  HarnessStepName.VERIFY,
  HarnessStepName.REPAIR,
  HarnessStepName.NARRATE,
];

export function suggestPreviousHarnessStep(step: HarnessStepName): HarnessStepName {
  const i = HARNESS_STEP_ORDER.indexOf(step);
  if (i <= 0) return HarnessStepName.INTAKE;
  return HARNESS_STEP_ORDER[i - 1]!;
}

export function nextHarnessStepAfter(last: HarnessStepName): HarnessStepName {
  const idx = HARNESS_STEP_ORDER.indexOf(last);
  if (idx < 0) return HarnessStepName.INTAKE;
  return HARNESS_STEP_ORDER[Math.min(idx + 1, HARNESS_STEP_ORDER.length - 1)]!;
}
