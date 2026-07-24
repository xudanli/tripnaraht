/**
 * Post-apply revalidation — closes DECIDED → APPLIED → VERIFIED → RESOLVED loop.
 */

import type { OutcomeValidationVerdict } from '../../../trips/decision-semantics/types/decision-semantics.types';
import type { InternalUnifiedProblemRow } from './unified-decision-problem-projection.util';

export type RevalidationStatus = 'PENDING' | 'PASSED' | 'FAILED';

export interface RevalidationVerdict {
  status: RevalidationStatus;
  message?: string;
  problemStillOpen: boolean;
}

export function isProblemStillOpenInRows(
  rows: InternalUnifiedProblemRow[],
  match: { problemId: string; semanticKey?: string; instanceKey?: string },
): boolean {
  return rows.some((row) => {
    const idMatch = row.problemId === match.problemId;
    const semanticMatch =
      Boolean(match.semanticKey) &&
      (row.semanticKey === match.semanticKey ||
        row.semanticKey.startsWith(`${match.semanticKey}:`));
    const instanceMatch = Boolean(match.instanceKey) && row.instanceKey === match.instanceKey;
    if (!idMatch && !semanticMatch && !instanceMatch) return false;
    return !['RESOLVED', 'DISMISSED'].includes(row.workflowStatus);
  });
}

export function evaluateRevalidationFromRows(input: {
  rows: InternalUnifiedProblemRow[];
  problemId: string;
  semanticKey?: string;
  instanceKey?: string;
  validationVerdict?: OutcomeValidationVerdict;
}): RevalidationVerdict {
  const problemStillOpen = isProblemStillOpenInRows(input.rows, {
    problemId: input.problemId,
    semanticKey: input.semanticKey,
    instanceKey: input.instanceKey,
  });

  if (input.validationVerdict === 'REFUTED') {
    return {
      status: 'FAILED',
      message: '修复后问题仍存在',
      problemStillOpen,
    };
  }

  if (!problemStillOpen) {
    return {
      status: 'PASSED',
      message: '问题已关闭',
      problemStillOpen: false,
    };
  }

  if (input.validationVerdict === 'CONFIRMED' || input.validationVerdict === 'PARTIALLY_CONFIRMED') {
    return {
      status: 'PASSED',
      message: '决策结果已确认',
      problemStillOpen: true,
    };
  }

  return {
    status: 'PENDING',
    message: '正在重新验证可行性…',
    problemStillOpen: true,
  };
}
