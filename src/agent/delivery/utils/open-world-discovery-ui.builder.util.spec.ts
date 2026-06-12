import { buildOpenWorldDiscoveryUi } from './open-world-discovery-ui.builder.util';

describe('open-world-discovery-ui.builder', () => {
  it('builds verification tasks for pending stubs', () => {
    const ui = buildOpenWorldDiscoveryUi({
      discovery: {
        mentions: [],
        stubs: [
          {
            stubId: 'provisional_disco_kayak_gl',
            displayName: '迪斯科湾皮划艇（待核实）',
            regionHint: 'Disko Bay',
            constraintTags: ['guide_required', 'permit_required'],
            status: 'verification_pending',
            source: 'user_mention',
            nodeKind: 'elastic',
          },
        ],
        mergedStubCount: 1,
        skippedGroundedCount: 0,
      },
      decisionContext: {
        sparseProfileId: 'sparse_polar_greenland',
        intentionalSlack: [{ reasonCode: 'WEATHER_WINDOW', minutesReserved: 240 }],
      },
    });

    expect(ui?.schema).toBe('tripnara.open_world_discovery@v1');
    expect(ui?.verification_tasks.length).toBe(1);
    expect(ui?.verification_tasks[0].priority).toBe('P0');
    expect(ui?.intentional_slack_summary_zh).toContain('预留');
  });
});
