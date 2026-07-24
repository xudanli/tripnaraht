import {
  deriveConstraintSinkUiAnchorV1,
  deriveMemoryConsoleUiStateV1,
} from './memory-console-ui-state.v1';

describe('memory-console-ui-state.v1', () => {
  it('deriveConstraintSinkUiAnchorV1 maps pivot hydrate to Gate anchor', () => {
    const anchor = deriveConstraintSinkUiAnchorV1({
      hydrated: true,
      applied_keys: ['destination', 'guardian_debate_intent_hint'],
      patch_ids: ['p1'],
    });
    expect(anchor?.headline_key).toBe('memory.ui.constraint_sink.pivot_applied');
    expect(anchor?.drawer_tab).toBe('constraint_sink');
  });

  it('deriveMemoryConsoleUiStateV1 includes trip_patches when sink patches exist', () => {
    const ui = deriveMemoryConsoleUiStateV1({
      feature_flags: { memory_console: true, constraint_sink: true },
      l1: { pacePreference: 'SLOW' },
      l2_recent: [{ id: '1' }],
      trip_constraints: { patches: [{ id: 'p1' }] },
    });
    expect(ui.enabled).toBe(true);
    expect(ui.sections).toContain('trip_patches');
    expect(ui.trip_patches_count).toBe(1);
  });

  it('deriveMemoryConsoleUiStateV1 includes decision_ledger_causality when links exist', () => {
    const ui = deriveMemoryConsoleUiStateV1({
      feature_flags: { memory_console: true, decision_semantics: true },
      decision_ledger_causality: {
        links: [{ ledger_node_id: 'n1', decision_id: 'dec_1' }],
      },
    });
    expect(ui.sections).toContain('decision_ledger_causality');
    expect(ui.decision_ledger_links_count).toBe(1);
  });
});
