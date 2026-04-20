import { Injectable, Logger } from '@nestjs/common';
import type {
  CandidateScorerBatchOutput,
  CandidateScorerInput,
  ICandidateScorer,
} from './candidate-scorer.interface';

const NOOP_VERSION = 'noop-candidate-scorer@1';

/**
 * Default scorer: no extra signal. Keeps DI graph and CGUS hook stable until a real scorer is wired.
 */
@Injectable()
export class NoopCandidateScorerService implements ICandidateScorer {
  private readonly logger = new Logger(NoopCandidateScorerService.name);

  async score(input: CandidateScorerInput): Promise<CandidateScorerBatchOutput> {
    if (input.mode !== 'off') {
      this.logger.debug(
        `[${NOOP_VERSION}] mode=${input.mode} candidates=${input.candidates.length} (no scores)`,
      );
    }
    return {
      modelVersion: NOOP_VERSION,
      perCandidate: input.candidates.map((c) => ({
        candidateId: c.id,
        modelVersion: NOOP_VERSION,
      })),
    };
  }
}
