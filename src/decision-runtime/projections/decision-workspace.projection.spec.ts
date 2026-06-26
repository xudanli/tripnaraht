import {
  projectDecisionWorkspaceFromEvents,
  reconcileDecisionWorkspace,
} from '../projections/decision-workspace.projection';
import { Gate1TravelEventType } from '../types/runtime-event-catalog';

describe('decision-workspace projection', () => {
  const tripId = 'trip-1';
  const projectId = 'proj-1';

  it('rebuilds decisions and conflicts from gate1 runtime events', () => {
    const events = [
      {
        id: 'e1',
        tripId,
        eventType: Gate1TravelEventType.CONFLICT_DETECTED,
        source: 'gate1.runtime',
        occurredAt: '2026-06-25T10:00:00Z',
        payload: {
          gate1ProjectId: projectId,
          reportId: 'rep-1',
          version: 1,
          findingCount: 3,
        },
        metadata: {
          runtime: {
            aggregateId: 'rep-1',
            canonicalEventType: 'CONFLICT_DETECTED',
          },
        },
      },
      {
        id: 'e2',
        tripId,
        eventType: Gate1TravelEventType.DECISION_RECORDED,
        source: 'gate1.runtime',
        occurredAt: '2026-06-25T11:00:00Z',
        payload: {
          gate1ProjectId: projectId,
          decisionId: 'dec-1',
          materialChange: true,
          selectedCandidateId: 'cand-1',
        },
        metadata: {
          runtime: { aggregateId: 'dec-1' },
        },
      },
    ];

    const projection = projectDecisionWorkspaceFromEvents(events, tripId);

    expect(projection.gate1ProjectId).toBe(projectId);
    expect(projection.conflictReports).toHaveLength(1);
    expect(projection.conflictReports[0]).toMatchObject({
      reportId: 'rep-1',
      version: 1,
      findingCount: 3,
    });
    expect(projection.decisions).toHaveLength(1);
    expect(projection.decisions[0]).toMatchObject({
      decisionId: 'dec-1',
      materialChange: true,
    });
  });

  it('reconciles matching gate1 snapshot vs projection', () => {
    const projection = projectDecisionWorkspaceFromEvents(
      [
        {
          id: 'e1',
          tripId,
          eventType: Gate1TravelEventType.DECISION_RECORDED,
          source: 'gate1.runtime',
          occurredAt: '2026-06-25T11:00:00Z',
          payload: { decisionId: 'dec-1', materialChange: false },
          metadata: { runtime: { aggregateId: 'dec-1' } },
        },
      ],
      tripId,
    );

    const report = reconcileDecisionWorkspace({
      projectId,
      tripId,
      projectTitle: 'Test',
      projection,
      gate1DecisionIds: ['dec-1'],
      gate1PublishedConflictKeys: [],
      gate1PublishedCandidateIds: [],
      gate1PublishedPlanBIds: [],
      gate1OutcomeIds: [],
      gate1RedFindingIds: [],
    });

    expect(report.allMatched).toBe(true);
    expect(report.entities.every((e) => e.matched)).toBe(true);
  });

  it('flags missing events in reconciliation', () => {
    const projection = projectDecisionWorkspaceFromEvents([], tripId);

    const report = reconcileDecisionWorkspace({
      projectId,
      tripId,
      projectTitle: 'Test',
      projection,
      gate1DecisionIds: ['dec-missing'],
      gate1PublishedConflictKeys: [],
      gate1PublishedCandidateIds: [],
      gate1PublishedPlanBIds: [],
      gate1OutcomeIds: [],
      gate1RedFindingIds: [],
    });

    expect(report.allMatched).toBe(false);
    expect(report.entities[0].missingInEvents).toEqual(['dec-missing']);
  });
});
