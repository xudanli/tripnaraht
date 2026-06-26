/**
 * Runtime validators for Experience Fulfillment contracts
 */

import type { ZodError } from 'zod';

import {
  ExperienceCandidateSchema,
  RepairContractSchema,
  VerificationResultSchema,
} from '../schemas/experience-fulfillment.schemas';

export type ContractValidationResult = {
  valid: boolean;
  errors: string[];
};

function formatZodErrors(error: ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`);
}

export function validateExperienceCandidate(candidate: unknown): ContractValidationResult {
  const parsed = ExperienceCandidateSchema.safeParse(candidate);
  if (parsed.success) {
    return { valid: true, errors: [] };
  }
  return { valid: false, errors: formatZodErrors(parsed.error) };
}

export function validateVerificationResult(result: unknown): ContractValidationResult {
  const parsed = VerificationResultSchema.safeParse(result);
  if (parsed.success) {
    const metricIssues = assertVerificationMetricsSeparated(parsed.data.metrics);
    if (metricIssues.length) {
      return { valid: false, errors: metricIssues };
    }
    return { valid: true, errors: [] };
  }
  return { valid: false, errors: formatZodErrors(parsed.error) };
}

export function validateRepairContract(contract: unknown): ContractValidationResult {
  const parsed = RepairContractSchema.safeParse(contract);
  if (parsed.success) {
    const preserveIssues = assertRepairPreserveGoals(parsed.data.preserveGoals);
    if (preserveIssues.length) {
      return { valid: false, errors: preserveIssues };
    }
    return { valid: true, errors: [] };
  }
  return { valid: false, errors: formatZodErrors(parsed.error) };
}

/**
 * PRD §11：feasibility / evidence / experience 三分数必须分别存在，不能合并为单一概率。
 * 当 status 为 PASS 或 PASS_WITH_WARNING 时，三项均须 present。
 */
export function assertVerificationMetricsSeparated(
  metrics: {
    feasibilityScore?: number;
    evidenceConfidence?: number;
    experienceFulfillmentEstimate?: number;
    scheduleRobustness?: number;
  },
  requireAll = false,
): string[] {
  const errors: string[] = [];
  const keys = ['feasibilityScore', 'evidenceConfidence', 'experienceFulfillmentEstimate'] as const;
  const present = keys.filter((k) => typeof metrics[k] === 'number');
  if (requireAll && present.length < 3) {
    errors.push(
      'metrics must include feasibilityScore, evidenceConfidence, and experienceFulfillmentEstimate separately',
    );
  }
  return errors;
}

/** Repair Contract 须显式声明 MUST_PRESERVE 目标（PRD 不变式一） */
export function assertRepairPreserveGoals(
  preserveGoals: Array<{ intent: string; priority: string }>,
): string[] {
  if (!preserveGoals.some((g) => g.priority === 'MUST_PRESERVE')) {
    return ['preserveGoals must include at least one MUST_PRESERVE intent'];
  }
  return [];
}

/**
 * UNKNOWN 状态不得伪装为 PASS（PRD §19.1 + 金测 #7）
 */
export function assertUnknownNotTreatedAsPass(status: string, treatedAsPass: boolean): string[] {
  if (status === 'UNKNOWN' && treatedAsPass) {
    return ['UNKNOWN status cannot be treated as PASS'];
  }
  return [];
}

export function verificationStatusAllowsStrongPass(status: string): boolean {
  return status === 'PASS' || status === 'PASS_WITH_WARNING';
}

export function verificationStatusIsUnknown(status: string): boolean {
  return status === 'UNKNOWN';
}
