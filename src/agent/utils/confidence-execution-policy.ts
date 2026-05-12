import type { ArtifactReplayConfidence } from '../contracts/artifact-replay-confidence.types';
import type {
  ConfidenceExecutionDirective,
  ConfidenceExecutionPhase,
  ConfidenceToolDepthHint,
} from '../contracts/confidence-execution-control.types';

function phaseFromBand(band: ArtifactReplayConfidence['band']): ConfidenceExecutionPhase {
  switch (band) {
    case 'HIGH':
      return 'REUSE_ARTIFACT';
    case 'MEDIUM':
      return 'LIGHTWEIGHT_VALIDATE';
    case 'LOW':
      return 'PARTIAL_RECOMPUTE';
    case 'INVALID':
      return 'FULL_RECOMPUTE';
    default:
      return 'FULL_RECOMPUTE';
  }
}

function toolDepthHintFromBand(band: ArtifactReplayConfidence['band']): ConfidenceToolDepthHint {
  switch (band) {
    case 'HIGH':
      return 'REUSE_SKIP_TOOLS';
    case 'MEDIUM':
      return 'VALIDATE_SELECTIVE_TOOLS';
    case 'LOW':
      return 'FULL_TOOL_LOOP';
    case 'INVALID':
      return 'REORCHESTRATE';
    default:
      return 'REORCHESTRATE';
  }
}

function parseAllowMediumDedup(): boolean {
  const v = process.env.CONFIDENCE_ALLOW_MEDIUM_DEDUP;
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Maps artifact replay confidence → execution directive (energy thresholding / gate semantics).
 */
export function resolveConfidenceExecutionDirective(
  confidence: ArtifactReplayConfidence,
  policy?: { allowMediumDedupReplay?: boolean },
): ConfidenceExecutionDirective {
  const allowMedium =
    policy?.allowMediumDedupReplay ?? parseAllowMediumDedup();

  let allowDedupCacheReplay = false;
  if (confidence.band === 'HIGH') allowDedupCacheReplay = true;
  else if (confidence.band === 'MEDIUM' && allowMedium) allowDedupCacheReplay = true;

  return {
    band: confidence.band,
    score: confidence.score,
    phase: phaseFromBand(confidence.band),
    toolDepthHint: toolDepthHintFromBand(confidence.band),
    allowDedupCacheReplay,
  };
}
