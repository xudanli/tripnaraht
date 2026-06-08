import {
  appendConstraintSinkPatch,
  foldConstraintSinkPatches,
  readConstraintSinkState,
  removeConstraintSinkPatch,
} from './constraint-sink-state.util';
import { CONSTRAINT_SINK_V1_KEY } from './constraint-sink.types';

describe('constraint-sink-state.util', () => {
  const patch = {
    id: 'patch-a',
    at: '2026-06-04T00:00:00.000Z',
    confidence: 0.9,
    provenance: 'rule' as const,
    delta: { pace: 'relaxed' as const },
  };

  it('append and read round-trip', () => {
    const constraints = appendConstraintSinkPatch(null, patch);
    const state = readConstraintSinkState(constraints);
    expect(state?.patches).toHaveLength(1);
    expect(state?.patches[0].id).toBe('patch-a');
  });

  it('preserves tool_policies when appending', () => {
    const existing = {
      tripId: 't1',
      constraints: { tool_policies: { foo: 1 } },
    } as any;
    const next = appendConstraintSinkPatch(existing, patch);
    expect(next.tool_policies).toEqual({ foo: 1 });
    expect(next[CONSTRAINT_SINK_V1_KEY]).toBeDefined();
  });

  it('fold later patch wins for pace', () => {
    const state = readConstraintSinkState(
      appendConstraintSinkPatch(null, patch) as Record<string, unknown>,
    );
    const folded = foldConstraintSinkPatches({
      revision: 'v1',
      patches: [
        ...(state?.patches ?? []),
        {
          ...patch,
          id: 'patch-b',
          delta: { pace: 'tight' },
        },
      ],
    });
    expect(folded.delta.pace).toBe('tight');
    expect(folded.patch_ids).toEqual(['patch-a', 'patch-b']);
  });

  it('remove patch clears key when empty', () => {
    const constraints = appendConstraintSinkPatch(null, patch) as Record<string, unknown>;
    const next = removeConstraintSinkPatch(constraints, 'patch-a');
    expect(next?.[CONSTRAINT_SINK_V1_KEY]).toBeUndefined();
  });
});
