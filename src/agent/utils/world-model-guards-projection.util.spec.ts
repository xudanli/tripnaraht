import { projectWorldModelGuardsExplain } from './world-model-guards-projection.util';
import type { DecisionState } from '../../decision/kernel/decision-state.types';

describe('projectWorldModelGuardsExplain', () => {
  it('returns undefined when no guard signals', () => {
    expect(projectWorldModelGuardsExplain(undefined)).toBeUndefined();
    expect(projectWorldModelGuardsExplain({} as DecisionState)).toBeUndefined();
  });

  it('projects physical incomplete from environmentState and research fallback', () => {
    const fromEnv = projectWorldModelGuardsExplain({
      environmentState: { physicalRealityIncomplete: true, physicalDataRegion: 'iceland' },
    } as DecisionState);
    expect(fromEnv?.physical_reality_incomplete).toBe(true);
    expect(fromEnv?.physical_data_region).toBe('iceland');
    expect(fromEnv?.segment_editor_mode).toBe('readonly');
    expect(fromEnv?.banner_message_zh).toContain('草稿');

    const fromRd = projectWorldModelGuardsExplain(undefined, {
      worldModelMeta: { physicalRealityIncomplete: true, dataRegion: 'iceland' },
    });
    expect(fromRd?.physical_reality_incomplete).toBe(true);
    expect(fromRd?.physical_data_region).toBe('iceland');
  });

  it('projects route topology lock and freeze flag from DSO', () => {
    const row = projectWorldModelGuardsExplain({
      environmentState: { isRouteTopologyLocked: true },
      tripState: {
        routeTopologyLock: {
          route_skeleton_locked: true,
          lockedSegmentIds: ['seg-a', 'seg-b'],
          routeSkeletonSignature: 'sig-1',
          lockedAt: '2026-05-19T00:00:00.000Z',
          topologyMatch: false,
          recommendedPlanRejected: true,
        },
      },
      optimizationHints: {
        optimizationFlags: { freezeRouteSelection: true },
      },
    } as DecisionState);

    expect(row?.is_route_topology_locked).toBe(true);
    expect(row?.locked_segment_ids).toEqual(['seg-a', 'seg-b']);
    expect(row?.freeze_route_selection).toBe(true);
    expect(row?.topology_match).toBe(false);
    expect(row?.recommended_plan_rejected).toBe(true);
    expect(row?.segment_editor_mode).toBe('slot_timing_only');
    expect(row?.banner_message_zh).toContain('拓扑不一致');
  });
});
