import { Gate1TravelEventType } from '../types/runtime-event-catalog';
import { TravelEventType } from '../../trips/event-store/types/travel-event.types';
import { projectAuditTimeline } from './audit-timeline.projection';
import { projectDecisionWorkspaceFromEvents } from './decision-workspace.projection';

describe('audit-timeline.projection', () => {
  it('builds chronological audit entries from gate1 and lifecycle events', () => {
    const entries = projectAuditTimeline([
      {
        id: 'e1',
        tripId: 'trip-1',
        eventType: Gate1TravelEventType.DECISION_RECORDED,
        source: 'gate1.runtime',
        occurredAt: '2026-06-25T10:00:00.000Z',
        payload: { decisionId: 'd1' },
        metadata: {
          runtime: {
            canonicalEventType: 'DECISION_RECORDED',
            aggregateType: 'DecisionCase',
            aggregateId: 'd1',
            actor: { type: 'USER', id: 'adv-1', role: 'ADVISOR' },
            privacyClass: 'TEAM',
          },
        },
      },
      {
        id: 'e2',
        tripId: 'trip-1',
        eventType: TravelEventType.TRIP_LIFECYCLE_STATE_CHANGED,
        source: 'trip.lifecycle',
        occurredAt: '2026-06-25T11:00:00.000Z',
        payload: { previousStatus: 'DRAFT', newStatus: 'PLANNING' },
      },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0].canonicalEventType).toBe('DECISION_RECORDED');
    expect(entries[0].actor?.id).toBe('adv-1');
    expect(entries[1].summary).toContain('DRAFT');
  });

  it('removes resolved readiness blockers from workspace projection', () => {
    const projection = projectDecisionWorkspaceFromEvents(
      [
        {
          id: 'r1',
          tripId: 'trip-1',
          eventType: Gate1TravelEventType.READINESS_BLOCKER_RAISED,
          source: 'gate1.runtime',
          occurredAt: '2026-06-25T10:00:00.000Z',
          payload: {
            findingId: 'f1',
            reportId: 'rep-1',
            reportVersion: 1,
            dimension: 'docs',
            status: 'RED',
            title: 'Missing visa',
          },
          metadata: {
            runtime: {
              gate1ProjectId: 'proj-1',
              aggregateId: 'f1',
            },
          },
        },
        {
          id: 'r2',
          tripId: 'trip-1',
          eventType: Gate1TravelEventType.READINESS_BLOCKER_RESOLVED,
          source: 'gate1.runtime',
          occurredAt: '2026-06-25T12:00:00.000Z',
          payload: { findingId: 'f1', resolution: 'RESOLVED' },
          metadata: {
            runtime: {
              gate1ProjectId: 'proj-1',
              aggregateId: 'f1',
            },
          },
        },
      ],
      'trip-1',
    );

    expect(projection.readinessBlockers).toHaveLength(0);
  });
});
