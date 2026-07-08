import {
  evaluateRevalidationFromRows,
  isProblemStillOpenInRows,
} from './decision-problem-revalidation.util';
import type { InternalUnifiedProblemRow } from './unified-decision-problem-projection.util';

function row(partial: Partial<InternalUnifiedProblemRow> & Pick<InternalUnifiedProblemRow, 'problemId'>): InternalUnifiedProblemRow {
  return {
    authority: 'LEGACY',
    semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
    instanceKey: 'inst1',
    type: 'INFEASIBILITY',
    dimension: 'TRANSPORT',
    enforcement: 'BLOCK',
    phase: 'PLANNING',
    affectsPlan: true,
    workflowStatus: 'OPEN',
    executionStatus: 'NOT_STARTED',
    title: 'F208',
    summary: 'closed',
    scope: { tripId: 'trip1' },
    evidenceCount: 0,
    evidenceFreshness: 'FRESH',
    occurrenceCount: 1,
    occurrences: [],
    sourceIds: [],
    ...partial,
  };
}

describe('decision-problem-revalidation.util', () => {
  it('detects open problem by problemId', () => {
    expect(
      isProblemStillOpenInRows([row({ problemId: 'p1', workflowStatus: 'OPEN' })], {
        problemId: 'p1',
      }),
    ).toBe(true);
    expect(
      isProblemStillOpenInRows([row({ problemId: 'p1', workflowStatus: 'RESOLVED' })], {
        problemId: 'p1',
      }),
    ).toBe(false);
  });

  it('passes revalidation when matching problem is gone', () => {
    const verdict = evaluateRevalidationFromRows({
      rows: [row({ problemId: 'other', semanticKey: 'EXCESSIVE_DAILY_LOAD', workflowStatus: 'OPEN' })],
      problemId: 'p1',
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
    });
    expect(verdict.status).toBe('PASSED');
    expect(verdict.problemStillOpen).toBe(false);
  });

  it('stays pending when problem remains open', () => {
    const verdict = evaluateRevalidationFromRows({
      rows: [row({ problemId: 'p1', workflowStatus: 'WAITING_DECISION' })],
      problemId: 'p1',
    });
    expect(verdict.status).toBe('PENDING');
    expect(verdict.problemStillOpen).toBe(true);
  });

  it('passes on CONFIRMED validation even if collector still open briefly', () => {
    const verdict = evaluateRevalidationFromRows({
      rows: [row({ problemId: 'p1', workflowStatus: 'OPEN' })],
      problemId: 'p1',
      validationVerdict: 'CONFIRMED',
    });
    expect(verdict.status).toBe('PASSED');
  });
});
