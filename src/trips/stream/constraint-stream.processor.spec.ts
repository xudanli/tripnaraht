import { SelfHealingController } from '../healing/self-healing.controller';
import { ConstraintStateStore } from './constraint-state.store';
import {
  buildExecutionSemanticRuntimeFromStream,
  healingSnapshotFromIngest,
  normalizeConstraintEvent,
  processConstraintStream,
  stableNormalizedEventId,
} from './constraint-stream.processor';

describe('constraint stream processor', () => {
  const tripPlan = {
    version: '1',
    createdAt: 't',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          {
            id: 's1',
            time: '09:00',
            title: 'Drive',
            type: 'nature' as const,
          },
        ],
      },
    ],
  };

  it('normalizeConstraintEvent is deterministic per raw payload', () => {
    const raw = {
      kind: 'ROAD' as const,
      roadId: 'F208',
      status: 'IMPASSABLE' as const,
      at: 1_700_000_000_000,
      severity: 'HIGH' as const,
      affectedSlotIds: ['s1'] as const,
    };
    expect(stableNormalizedEventId(raw)).toBe(
      normalizeConstraintEvent(raw).id,
    );
  });

  it('first road update yields meaningful diff and optional STREAMING_REPLAN delta', () => {
    const store = new ConstraintStateStore();
    const raw = {
      kind: 'ROAD' as const,
      roadId: 'F208',
      status: 'IMPASSABLE' as const,
      at: 1_700_000_000_000,
      severity: 'HIGH' as const,
      affectedSlotIds: ['s1'] as const,
    };
    const out = processConstraintStream(store, raw, { tripPlan });
    expect(out.diff.isMeaningfulChange).toBe(true);
    expect(out.diff.changedSlots).toContain('s1');
    expect(out.streamingReplanDelta?.kind).toBe('STREAMING_REPLAN');
    if (out.streamingReplanDelta?.kind === 'STREAMING_REPLAN') {
      expect(
        out.streamingReplanDelta.payload.planDiff.changedSlotIds.length,
      ).toBeGreaterThan(0);
    }
  });

  it('self-healing controller emits SELF_HEALING_STATE and snapshot helper', () => {
    const store = new ConstraintStateStore();
    const ctrl = new SelfHealingController({ velocityThreshold: 100 });
    const raw = {
      kind: 'ROAD' as const,
      roadId: 'F208',
      status: 'OPEN' as const,
      at: 300,
      severity: 'LOW' as const,
      affectedSlotIds: ['s1'] as const,
    };
    const out = processConstraintStream(store, raw, {
      selfHealingController: ctrl,
    });
    expect(out.selfHealingDelta?.kind).toBe('SELF_HEALING_STATE');
    expect(out.healingState?.status).toBeDefined();
    if (out.healingState) {
      const snap = healingSnapshotFromIngest(out.healingState);
      expect(snap.iteration).toBe(out.healingState.iteration);
    }
  });

  it('identical road status replay does not change slot fingerprint', () => {
    const store = new ConstraintStateStore();
    const raw = {
      kind: 'ROAD' as const,
      roadId: 'F208',
      status: 'OPEN' as const,
      at: 100,
      severity: 'LOW' as const,
      affectedSlotIds: ['s1'] as const,
    };
    const first = processConstraintStream(store, raw, { tripPlan });
    expect(first.diff.changedSlots.length).toBeGreaterThan(0);

    const second = processConstraintStream(store, { ...raw, at: 200 }, {
      tripPlan,
    });
    expect(second.diff.changedSlots.length).toBe(0);
    expect(second.streamingReplanDelta).toBeUndefined();
  });

  it('buildExecutionSemanticRuntimeFromStream carries severity', () => {
    const rt = buildExecutionSemanticRuntimeFromStream(42, {
      changedSlots: ['s1'],
      severity: 'HIGH',
      requiresReplan: true,
      isMeaningfulChange: true,
    });
    expect(rt.source).toBe('STREAM');
    expect(rt.lastUpdatedAt).toBe(42);
    expect(rt.lastStreamSeverity).toBe('HIGH');
  });
});
