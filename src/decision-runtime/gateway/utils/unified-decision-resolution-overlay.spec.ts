import { overlayStoredResolutionOnListItem } from './unified-decision-problem-projection.util';
import type { UnifiedDecisionProblemListItem } from '../contracts/unified-decision-ui.types';

const baseItem: UnifiedDecisionProblemListItem = {
  problemId: 'p1',
  semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
  instanceKey: 'inst1',
  type: 'INFEASIBILITY',
  dimension: 'TRANSPORT',
  enforcement: 'BLOCK',
  phase: 'PLANNING',
  workflowStatus: 'WAITING_DECISION',
  executionStatus: 'NOT_STARTED',
  title: 'F208',
  summary: 'closed',
  scope: { tripId: 'trip1' },
  evidenceSummary: { count: 1, freshness: 'FRESH' },
  occurrenceCount: 1,
  actionability: {
    requiresAction: true,
    allowedActions: ['ACCEPT', 'ADJUST'],
  },
  detectors: [{ detectorId: 'FEASIBILITY', label: '可行性分析' }],
  origin: { authority: 'LEGACY', primaryDetector: 'FEASIBILITY', engineId: 'LEGACY_V15_ADAPTER' },
};

describe('overlayStoredResolutionOnListItem', () => {
  it('marks VERIFIED resolution as RESOLVED', () => {
    const item = overlayStoredResolutionOnListItem(baseItem, {
      resolutionId: 'res1',
      problemId: 'p1',
      selectedActionId: 'cand_a',
      writeChain: 'EVALUATE_AUTHORIZE_EXECUTE',
      status: 'VERIFIED',
      decidedAt: '2026-07-03T00:00:00Z',
      decidedByUserId: 'u1',
    });
    expect(item.workflowStatus).toBe('RESOLVED');
    expect(item.executionStatus).toBe('VERIFIED');
    expect(item.actionability.requiresAction).toBe(false);
  });

  it('keeps APPLIED resolution in DECIDED until verified', () => {
    const item = overlayStoredResolutionOnListItem(baseItem, {
      resolutionId: 'res1',
      problemId: 'p1',
      selectedActionId: 'cand_a',
      writeChain: 'EVALUATE_AUTHORIZE_EXECUTE',
      status: 'APPLIED',
      decidedAt: '2026-07-03T00:00:00Z',
      decidedByUserId: 'u1',
    });
    expect(item.workflowStatus).toBe('DECIDED');
    expect(item.executionStatus).toBe('APPLIED');
  });
});
