import {
  dedupeExcessiveDailyLoadProblemViews,
  resolveExcessiveDailyLoadDayIndex,
  resolveExcessiveDailyLoadDisplayDayIndex,
} from './excessive-daily-load-problem.util';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { Rfc001DecisionCenterProblemView } from '../adapters/decision-center-bridge.adapter';

function loadProblem(
  overrides: Partial<Rfc001DecisionProblem> & { problemId: string },
): Rfc001DecisionProblem {
  return {
    tripId: 'trip_1',
    planVersionId: 'plan_1',
    type: 'EXCESSIVE_LOAD',
    triggerEventId: 'evt_load_day_5',
    semanticCapability: 'EXCESSIVE_DAILY_LOAD',
    affectedEntityRefs: [{ kind: 'PLAN_ITEM', id: 'item_1', label: 'day5' }],
    affectedPlanItemIds: ['item_1'],
    worldStateSnapshotId: 'snap_1',
    detectedAt: '2026-06-30T10:00:00.000Z',
    urgency: 'HIGH',
    status: 'OPEN',
    ...overrides,
  };
}

function viewFor(problem: Rfc001DecisionProblem): Rfc001DecisionCenterProblemView {
  return {
    schemaId: 'tripnara.rfc001_problem_view@v1',
    tripId: problem.tripId,
    problemId: problem.problemId,
    problemSummary: {} as Rfc001DecisionCenterProblemView['problemSummary'],
    rfc001Problem: problem,
    leadingPersona: 'DRDRE',
    requiresUserConfirmation: true,
    candidates: [],
    options: [],
    lineage: [],
  };
}

describe('excessive-daily-load-problem.util', () => {
  it('LOAD-DEDUP-001: resolves plan day from label and display day for UI', () => {
    const problem = loadProblem({ problemId: 'p1' });
    expect(resolveExcessiveDailyLoadDayIndex(problem)).toBe(5);
    expect(resolveExcessiveDailyLoadDisplayDayIndex(problem)).toBe(6);
  });

  it('LOAD-DEDUP-002: dedupes multiple OPEN problems on same day', () => {
    const views = dedupeExcessiveDailyLoadProblemViews([
      viewFor(
        loadProblem({
          problemId: 'old',
          detectedAt: '2026-06-30T10:00:00.000Z',
        }),
      ),
      viewFor(
        loadProblem({
          problemId: 'new',
          detectedAt: '2026-06-30T11:00:00.000Z',
        }),
      ),
      viewFor(
        loadProblem({
          problemId: 'other_day',
          detectedAt: '2026-06-30T12:00:00.000Z',
          affectedEntityRefs: [{ kind: 'PLAN_ITEM', id: 'i2', label: 'day6' }],
        }),
      ),
    ]);

    expect(views).toHaveLength(2);
    expect(views.map((v) => v.problemId).sort()).toEqual(['new', 'other_day']);
  });

  it('LOAD-DEDUP-003: prefers PROPOSED record over fresh OPEN duplicate', () => {
    const views = dedupeExcessiveDailyLoadProblemViews([
      viewFor(
        loadProblem({
          problemId: 'open_new',
          detectedAt: '2026-06-30T12:00:00.000Z',
        }),
      ),
      {
        ...viewFor(
          loadProblem({
            problemId: 'proposed_old',
            detectedAt: '2026-06-30T10:00:00.000Z',
            status: 'DECIDED',
          }),
        ),
        record: {
          recordStatus: 'PROPOSED',
          decisionId: 'dec_1',
          problemId: 'proposed_old',
        } as Rfc001DecisionCenterProblemView['record'],
      },
    ]);

    expect(views).toHaveLength(1);
    expect(views[0].problemId).toBe('proposed_old');
  });
});
