import type { DecisionTriggerLineageEntry } from './decision-trigger-lineage.store';
import { buildTriggerCenterView } from './trigger-center.view';

describe('trigger-center.view', () => {
  const baseEntry = (
    overrides: Partial<DecisionTriggerLineageEntry['request']> & {
      metadata?: Record<string, unknown>;
    },
  ): DecisionTriggerLineageEntry => ({
    runId: 'run-1',
    recordedAt: '2026-07-02T10:00:00.000Z',
    request: {
      schemaId: 'tripnara.decision_run_request@v1',
      runId: 'run-1',
      tripId: 'trip-1',
      triggerKind: 'IN_TRIP_DEVIATION',
      routeTarget: 'UNSUPPORTED',
      source: 'INTERNAL',
      createdAt: '2026-07-02T10:00:00.000Z',
      metadata: overrides.metadata,
      ...overrides,
    },
  });

  it('maps in-trip LOCAL_REPAIR to AUTO_REPAIR disposition', () => {
    const view = buildTriggerCenterView('trip-1', [
      baseEntry({
        metadata: {
          triggerType: 'ROAD_CLOSED',
          replanningDecision: {
            schemaId: 'tripnara.replanning_trigger_decision@v1',
            shouldTrigger: true,
            scope: 'ITEM',
            strategy: 'LOCAL_REPAIR',
            urgency: 'HIGH',
            humanConfirmationRequired: false,
            action: 'LOCAL_REPAIR',
            policyEnabled: true,
            rationale: 'trigger=IN_TRIP_DEVIATION severity=HIGH → LOCAL_REPAIR',
          },
        },
      }),
    ]);

    expect(view.items[0].headline).toContain('Road Closed');
    expect(view.items[0].planValidity).toBe('REPAIRING');
    expect(view.items[0].disposition).toBe('AUTO_REPAIR');
    expect(view.items[0].detectorId).toBe('detector.in-trip-recovery');
  });

  it('maps skipped full replan to DELEGATED_FULL_REPLAN', () => {
    const view = buildTriggerCenterView('trip-1', [
      baseEntry({
        metadata: {
          triggerType: 'ROAD_CLOSED',
          skipped: 'replanning_policy_full_replan',
          replanningDecision: {
            schemaId: 'tripnara.replanning_trigger_decision@v1',
            shouldTrigger: true,
            scope: 'FULL_TRIP',
            strategy: 'FULL_REPLAN',
            urgency: 'HIGH',
            humanConfirmationRequired: false,
            action: 'FULL_REPLAN',
            policyEnabled: true,
            rationale: '→ FULL_REPLAN',
          },
        },
      }),
    ]);

    expect(view.items[0].disposition).toBe('DELEGATED_FULL_REPLAN');
    expect(view.items[0].planValidity).toBe('VALID');
  });

  it('sorts newest first', () => {
    const view = buildTriggerCenterView('trip-1', [
      { ...baseEntry({}), recordedAt: '2026-07-02T09:00:00.000Z', runId: 'old' },
      { ...baseEntry({}), recordedAt: '2026-07-02T11:00:00.000Z', runId: 'new' },
    ]);
    expect(view.items[0].runId).toBe('new');
  });
});
