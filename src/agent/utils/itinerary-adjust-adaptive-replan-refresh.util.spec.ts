import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { ItineraryAdaptiveReplanSkill } from '../../skills/itinerary/itinerary-adaptive-replan.skill';
import { ItineraryExperienceCuratorSkill } from '../../skills/itinerary/itinerary-experience-curator.skill';
import { ItinerarySmartUpdateSkill } from '../../skills/itinerary/itinerary-smart-update.skill';
import { ItineraryVerifySkill } from '../../skills/itinerary/itinerary-verify.skill';
import { RepairApplySkill } from '../../skills/itinerary/repair-apply.skill';
import type { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import {
  extractScheduleItemsFromItineraryDay,
  refreshItineraryAdjustOptimizationResult,
} from './itinerary-adjust-decision-log.util';
import { runAdaptiveReplanForAdjustState } from './itinerary-adjust-adaptive-replan.util';

function buildRegistry(): SkillsRegistryService {
  const verify = new ItineraryVerifySkill();
  const repair = new RepairApplySkill();
  const smartUpdate = new ItinerarySmartUpdateSkill(verify, repair);
  const curator = new ItineraryExperienceCuratorSkill();
  let adaptiveReplan: ItineraryAdaptiveReplanSkill;
  const registry = {
    getSkill: (name: string) => {
      if (name === 'itinerary.adaptive_replan') return adaptiveReplan;
      if (name === 'itinerary.smart_update') return smartUpdate;
      if (name === 'itinerary.experience_curator' || name === 'itinerary.experience_align') return curator;
      return undefined;
    },
    getAllSkills: () => [],
  } as unknown as SkillsRegistryService;
  adaptiveReplan = new ItineraryAdaptiveReplanSkill(registry);
  return registry;
}

describe('runAdaptiveReplanForAdjustState refresh', () => {
  it('writes itinerary_adjust_result from post-replan itinerary', async () => {
    const state = {
      request_id: 'req-refresh',
      trip_plan_request: {
        trip_id: 'trip-refresh',
        message: '明天太累了，轻松一点',
        date_range: { start_date: '2026-06-01', end_date: '2026-06-07' },
      },
      itinerary: {
        request_id: 'req-refresh',
        days: [
          { date: '2026-06-01', items: [] },
          {
            date: '2026-06-02',
            items: [
              {
                id: 'a',
                type: 'POI',
                start_window: '2026-06-02T08:00',
                end_window: '2026-06-02T10:00',
                location_ref: { name: '斯科加瀑布' },
                evidence_refs: [],
                verified: false,
              },
              {
                id: 'b',
                type: 'POI',
                start_window: '2026-06-02T10:30',
                end_window: '2026-06-02T12:00',
                location_ref: { name: '塞里雅兰瀑布' },
                evidence_refs: [],
                verified: false,
              },
              {
                id: 'c',
                type: 'POI',
                start_window: '2026-06-02T13:00',
                end_window: '2026-06-02T15:00',
                location_ref: { name: '黑沙滩' },
                evidence_refs: [],
                verified: false,
              },
              {
                id: 'd',
                type: 'POI',
                start_window: '2026-06-02T15:30',
                end_window: '2026-06-02T17:00',
                location_ref: { name: '迪霍拉利' },
                evidence_refs: [],
                verified: false,
              },
            ],
          },
        ],
      },
      metadata: {
        adaptive_replan_requested: true,
        itinerary_adjust_intake: true,
        itinerary_adjust_target_date_iso: '2026-06-02',
        intake_user_message: '明天太累了，轻松一点',
        odyssey_planning_branch: {
          tier: 3,
          tier_label: 'Sovereign',
          planning_pace: 'relaxed',
          style_tags: ['managed', 'restorative', 'digital_detox'],
        },
      },
      decision_log: [],
    } as unknown as OrchestratorState;

    await runAdaptiveReplanForAdjustState(state, buildRegistry());

    refreshItineraryAdjustOptimizationResult(state);
    const result = state.metadata?.itinerary_adjust_result as {
      draft_schedule_zh?: string[];
      optimization_summary_zh?: string;
    };
    expect(result).toBeDefined();
    expect(result?.optimization_summary_zh).toMatch(/第 2 天|其它天不变|轻松|节奏/i);
  });
});
