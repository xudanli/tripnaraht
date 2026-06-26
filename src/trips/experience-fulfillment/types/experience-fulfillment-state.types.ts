/**
 * DSO / Trip metadata 上的体验兑现状态切片（Round 3）
 */

import type { ExperienceIntentDigest } from './experience-intent.types';
import type { RepairContract } from './repair-contract.types';
import type { VerificationResult } from './verification-result.types';
import type { ExperienceCandidate } from './candidate-contract.types';

export interface ExperienceFulfillmentState {
  revision: 'v1';
  experienceIntent?: ExperienceIntentDigest;
  verificationResult?: VerificationResult;
  repairContract?: RepairContract;
  /** LLM 候选校验摘要 */
  candidateValidation?: {
    valid: boolean;
    errors: string[];
    candidateCount: number;
  };
  updatedAt?: string;
}
