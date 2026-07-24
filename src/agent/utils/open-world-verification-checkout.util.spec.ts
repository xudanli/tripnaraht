import { applyOpenWorldVerificationAction } from './open-world-verification-checkout.util';
import type { OpenWorldDiscoveryUi } from '../delivery/utils/open-world-discovery-ui.builder.util';

function sampleDiscovery(): OpenWorldDiscoveryUi {
  return {
    schema: 'tripnara.open_world_discovery@v1',
    sparse_profile_id: 'greenland_sparse_v1',
    mention_count: 1,
    stub_count: 1,
    verification_tasks: [
      {
        task_id: 'verify_provisional_disco_kayak_gl',
        stub_id: 'provisional_disco_kayak_gl',
        title_zh: '核实：迪斯科湾皮划艇',
        description_zh: '对齐天气窗',
        priority: 'P1',
        constraint_tags: ['weather_window'],
        status: 'pending',
        cta_label_zh: '标记已核实',
      },
    ],
    computed_at: '2026-06-13T00:00:00.000Z',
  };
}

describe('open-world-verification-checkout.util', () => {
  it('rejects missing stub_id', () => {
    const res = applyOpenWorldVerificationAction({
      discovery: sampleDiscovery(),
      action: 'mark_verified',
      payload: { stub_id: '' },
    });
    expect(res.status).toBe('REJECTED');
    expect(res.rejection_reason_zh).toContain('stub_id');
  });

  it('marks stub verified', () => {
    const res = applyOpenWorldVerificationAction({
      discovery: sampleDiscovery(),
      action: 'mark_verified',
      payload: { stub_id: 'provisional_disco_kayak_gl', promoted_place_id: 42 },
    });
    expect(res.status).toBe('OK');
    expect(res.open_world_discovery.verification_tasks[0]?.status).toBe('done');
    expect(res.updated_stub?.status).toBe('promoted');
    expect(res.updated_stub?.promotedPlaceId).toBe(42);
  });

  it('discards stub and removes task', () => {
    const res = applyOpenWorldVerificationAction({
      discovery: sampleDiscovery(),
      action: 'discard_stub',
      payload: { stub_id: 'provisional_disco_kayak_gl' },
    });
    expect(res.status).toBe('OK');
    expect(res.open_world_discovery.verification_tasks).toHaveLength(0);
    expect(res.open_world_discovery.stub_count).toBe(0);
    expect(res.updated_stub?.status).toBe('discarded');
  });
});
