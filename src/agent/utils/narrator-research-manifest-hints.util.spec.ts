import type { NarrationLike } from '../../decision/kernel/interfaces/phase-executor.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { mergeResearchManifestIntoNarration } from './narrator-research-manifest-hints.util';

const aggressiveNegotiation = {
  version: 1 as const,
  has_conflicts: true,
  conflict_flags: ['SUTURE_COEXISTENCE'] as const,
  primary_narrative_stance: 'STITCH_TRANSPARENCY' as const,
  items: [{ kind: 'SUTURE_COEXISTENCE' as const, summary: '缝合与实时并存' }],
  stitch_tactic: 'AGGRESSIVE_COMPENSATION' as const,
};

describe('narrator-research-manifest-hints.util', () => {
  const baseState = (): OrchestratorState =>
    ({
      request_id: 'r',
      current_step: 'NARRATE',
      evidence_registry: new Map(),
      decision_log: [],
      errors: [],
      metadata: { started_at: '', last_updated_at: '' },
    }) as OrchestratorState;

  it('injects STALE_RECOVERED tips and research_ui_hints', () => {
    const state = baseState();
    state.research_data = {
      __research_asset_manifest: {
        version: 1,
        scopes: {
          hotel: { freshness: 'STALE_RECOVERED', attribution: 'HARNESS:stitch' },
        },
      },
    } as any;
    const n: NarrationLike = {
      user_friendly_summary: 's',
      day_by_day_narrative: [],
      highlights: [],
      tips: ['existing'],
    };
    const out = mergeResearchManifestIntoNarration(n, state);
    expect(out.voice_tone_modifier).toBe('reassuring_transparency');
    expect(out.research_ui_hints?.[0]?.freshness).toBe('STALE_RECOVERED');
    expect(out.research_ui_hints?.[0]?.attribution).toBe('HARNESS:stitch');
    expect(out.tips?.[0]).toContain('[数据说明]');
    expect(out.tips?.[1]).toBe('existing');
  });

  it('is idempotent on second merge', () => {
    const state = baseState();
    state.research_data = {
      __research_asset_manifest: {
        version: 1,
        scopes: { hotel: { freshness: 'STALE_RECOVERED' } },
      },
    } as any;
    const n: NarrationLike = {
      user_friendly_summary: '',
      day_by_day_narrative: [],
      highlights: [],
      tips: [],
    };
    const once = mergeResearchManifestIntoNarration(n, state);
    const twice = mergeResearchManifestIntoNarration(once, state);
    expect(twice.tips?.length).toBe(once.tips?.length);
    expect(twice.research_ui_hints?.length).toBe(once.research_ui_hints?.length);
  });

  it('6.2 AGGRESSIVE_COMPENSATION：多域 STALE_RECOVERED 坍缩为单条说明与聚合 hint', () => {
    const state = baseState();
    state.research_data = {
      __research_conflict_negotiation: aggressiveNegotiation,
      __research_asset_manifest: {
        version: 1,
        scopes: {
          hotel: { freshness: 'STALE_RECOVERED', attribution: 'HARNESS:stitch' },
          flight: { freshness: 'STALE_RECOVERED' },
        },
      },
    } as any;
    const n: NarrationLike = {
      user_friendly_summary: '',
      day_by_day_narrative: [],
      highlights: [],
      tips: [],
    };
    const audit = { collapsed_suture_count: 0 };
    const out = mergeResearchManifestIntoNarration(n, state, audit);
    expect(audit.collapsed_suture_count).toBe(2);
    const dataTips = (out.tips ?? []).filter((t) => t.startsWith('[数据说明]'));
    expect(dataTips.length).toBe(1);
    expect(dataTips[0]).toContain('合并为一处展示');
    expect(out.research_ui_hints?.some((h) => h.freshness === 'AGGREGATED_STALE_RECOVERED')).toBe(true);
    expect(out.research_ui_hints?.some((h) => h.scope === 'hotel' && h.freshness === 'STALE_RECOVERED')).toBe(false);
    expect(out.voice_tone_modifier).toBe('reassuring_transparency');
  });

  it('6.2 AGGRESSIVE：compliance 的 STALE_RECOVERED 仍分项，不与商业域混坍缩', () => {
    const state = baseState();
    state.research_data = {
      __research_conflict_negotiation: aggressiveNegotiation,
      __research_asset_manifest: {
        version: 1,
        scopes: {
          hotel: { freshness: 'STALE_RECOVERED' },
          compliance: { freshness: 'STALE_RECOVERED', attribution: 'HARNESS:stitch' },
        },
      },
    } as any;
    const n: NarrationLike = {
      user_friendly_summary: '',
      day_by_day_narrative: [],
      highlights: [],
      tips: [],
    };
    const audit = { collapsed_suture_count: 0 };
    const out = mergeResearchManifestIntoNarration(n, state, audit);
    expect(audit.collapsed_suture_count).toBe(1);
    expect(out.research_ui_hints?.some((h) => h.scope === 'compliance' && h.freshness === 'STALE_RECOVERED')).toBe(true);
    expect(out.research_ui_hints?.some((h) => h.freshness === 'AGGREGATED_STALE_RECOVERED')).toBe(true);
  });

  it('TRANSPARENT_SEGMENTED：仍按域分项列出 STALE_RECOVERED', () => {
    const state = baseState();
    state.research_data = {
      __research_conflict_negotiation: {
        ...aggressiveNegotiation,
        stitch_tactic: 'TRANSPARENT_SEGMENTED',
      },
      __research_asset_manifest: {
        version: 1,
        scopes: {
          hotel: { freshness: 'STALE_RECOVERED' },
          flight: { freshness: 'STALE_RECOVERED' },
        },
      },
    } as any;
    const n: NarrationLike = {
      user_friendly_summary: '',
      day_by_day_narrative: [],
      highlights: [],
      tips: [],
    };
    const audit = { collapsed_suture_count: 0 };
    const out = mergeResearchManifestIntoNarration(n, state, audit);
    expect(audit.collapsed_suture_count).toBe(0);
    expect(out.research_ui_hints?.filter((h) => h.freshness === 'STALE_RECOVERED').length).toBe(2);
    expect(out.research_ui_hints?.some((h) => h.freshness === 'AGGREGATED_STALE_RECOVERED')).toBe(false);
  });
});
