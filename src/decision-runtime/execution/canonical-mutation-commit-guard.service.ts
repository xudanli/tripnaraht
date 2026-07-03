import { Injectable, Logger } from '@nestjs/common';
import {
  commitEffectivePlanMutation,
  validateMutationAuthority,
  type CommitEffectivePlanMutationInput,
  type MutationValidationResult,
  type PartialMutationEnvelope,
} from './canonical-mutation-commit-guard.util';

/**
 * Injectable wrapper — all effective trip mutations must pass through this guard.
 */
@Injectable()
export class CanonicalMutationCommitGuardService {
  private readonly logger = new Logger(CanonicalMutationCommitGuardService.name);

  validateMutationAuthority(envelope: PartialMutationEnvelope): MutationValidationResult {
    const result = validateMutationAuthority(envelope);
    if (!result.allowed) {
      this.logger.warn(
        `[CanonicalMutationCommitGuard] DENY trip=${envelope.tripId ?? 'n/a'} reasons=${result.reasonCodes.join(',')}`,
      );
    }
    return result;
  }

  commitEffectivePlanMutation(input: CommitEffectivePlanMutationInput) {
    return commitEffectivePlanMutation(input);
  }
}
