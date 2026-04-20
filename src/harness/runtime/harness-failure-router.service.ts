import { Injectable } from '@nestjs/common';
import type { HarnessStepContract } from '../contracts/harness-step.types';
import type { HarnessValidationResult } from '../contracts/validation.types';
import { HarnessFailureLevel } from '../failures/failure-level.enum';
import type {
  HarnessFailureEvent,
  HarnessSuggestedAction,
} from '../failures/failure-event.types';
import type { HarnessStepName } from '../contracts/harness-step.types';
import type { HarnessGraderResult } from '../inferential/harness-inferential-grader.interface';

@Injectable()
export class HarnessFailureRouterService {
  eventsFromValidation(
    contract: HarnessStepContract,
    traceId: string,
    requestId: string,
    step: HarnessStepName,
    results: HarnessValidationResult[],
  ): HarnessFailureEvent[] {
    const events: HarnessFailureEvent[] = [];
    const now = new Date().toISOString();
    for (const r of results) {
      if (r.passed) continue;
      const level =
        r.severity === 'L3'
          ? HarnessFailureLevel.LEVEL_3_HARD_BLOCK
          : r.severity === 'L2'
            ? HarnessFailureLevel.LEVEL_2_LOGIC_GAP
            : HarnessFailureLevel.LEVEL_1_SOFT_FAIL;

      let suggestedAction: HarnessSuggestedAction = 'RETRY';
      if (r.severity === 'L3') {
        const l3 = contract.onFailure.level3;
        if (l3 === 'NEED_USER_CONFIRM') {
          suggestedAction = 'NEED_USER_CONFIRM';
        } else {
          suggestedAction = 'BLOCK';
        }
      } else if (r.severity === 'L2') {
        suggestedAction = 'RETURN_TO_RESEARCH';
      }

      events.push({
        traceId,
        requestId,
        step,
        level,
        type: 'LOGIC',
        code: r.code,
        message: r.message,
        autoRecoverable: r.severity !== 'L3',
        suggestedAction,
        createdAt: now,
      });
    }
    return events;
  }

  eventsFromGraderResults(
    contract: HarnessStepContract,
    traceId: string,
    requestId: string,
    step: HarnessStepName,
    results: HarnessGraderResult[],
  ): HarnessFailureEvent[] {
    const events: HarnessFailureEvent[] = [];
    const now = new Date().toISOString();
    for (const g of results) {
      if (g.passed) continue;
      const level =
        g.severity === 'L3'
          ? HarnessFailureLevel.LEVEL_3_HARD_BLOCK
          : g.severity === 'L2'
            ? HarnessFailureLevel.LEVEL_2_LOGIC_GAP
            : HarnessFailureLevel.LEVEL_1_SOFT_FAIL;
      let suggestedAction: HarnessSuggestedAction = 'RETRY';
      if (g.severity === 'L3') {
        suggestedAction =
          contract.onFailure.level3 === 'NEED_USER_CONFIRM' ? 'NEED_USER_CONFIRM' : 'BLOCK';
      } else if (g.severity === 'L2') {
        suggestedAction = 'RETURN_TO_RESEARCH';
      }
      const safeLabel = g.label.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48);
      events.push({
        traceId,
        requestId,
        step,
        level,
        type: 'LOGIC',
        code: `GRADER_${safeLabel || 'UNKNOWN'}`,
        message: g.explanation,
        autoRecoverable: g.severity !== 'L3',
        suggestedAction,
        createdAt: now,
      });
    }
    return events;
  }
}
