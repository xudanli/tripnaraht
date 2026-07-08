import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { StoredDecisionProblemResolution } from '../persistence/decision-problem-resolution.store';

/**
 * Bind collaborative sub-tasks to the SSOT resolution row for a problem.
 * Accepts optional client resolutionId, decisionId alias, or omits id entirely.
 */
export function resolveCollaborativeSubTaskResolution(
  resolution: StoredDecisionProblemResolution | undefined,
  problemId: string,
  requestedResolutionId?: string,
): StoredDecisionProblemResolution {
  if (!resolution) {
    throw new NotFoundException(`DECISION_RESOLUTION_NOT_FOUND: ${problemId}`);
  }

  const requested = requestedResolutionId?.trim();
  if (!requested) {
    return resolution;
  }

  const matches =
    requested === resolution.resolutionId ||
    (resolution.decisionId != null && requested === resolution.decisionId);

  if (matches) {
    return resolution;
  }

  throw new BadRequestException({
    message: 'COLLAB_SUBTASK_RESOLUTION_MISMATCH',
    details: {
      requestedResolutionId: requested,
      expectedResolutionId: resolution.resolutionId,
      decisionId: resolution.decisionId,
    },
  });
}
