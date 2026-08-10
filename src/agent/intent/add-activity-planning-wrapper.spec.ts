import { stripPlanningModeWrapper } from '../utils/strip-planning-mode-wrapper.util';
import { resolveUnifiedIntent } from './unified-intent.resolver';
import { resolveCreOperation } from '../context-requirement/operation-resolver.util';
import { buildContextRequirementPlan } from '../context-requirement/context-requirement.service';

const WRAPPED_ADD_DAY4 =
  '【请使用行程规划模式】结合当前行程草案，在完整规划与校验下落实以下需求（可调整日程、交通与住宿）：\n\n第四天增加可行的活动吧\n\n[日程] Day1 Day 1 · 抵达雷克雅未克';

describe('planning-mode wrapper + day add activity', () => {
  it('strips planning-mode wrapper', () => {
    expect(stripPlanningModeWrapper(WRAPPED_ADD_DAY4)).toContain('第四天增加可行的活动吧');
    expect(stripPlanningModeWrapper(WRAPPED_ADD_DAY4)).not.toContain('请使用行程规划模式');
  });

  it('wrapped「第四天增加活动」→ LOCAL_EDIT + ADD_ACTIVITY_TO_DAY（勿 GLOBAL/DAY_PACE）', () => {
    const d = resolveUnifiedIntent({
      message: WRAPPED_ADD_DAY4,
      tripId: 't1',
      entryPoint: 'itinerary_day_editor',
    });
    expect(d.semanticIntent).toBe('LOCAL_EDIT');
    expect(d.target.dayIndex).toBe(4);

    const cre = resolveCreOperation({
      message: WRAPPED_ADD_DAY4,
      tripId: 't1',
      unifiedSemanticIntent: d.semanticIntent,
    });
    expect(cre.operation).toBe('ADD_ACTIVITY_TO_DAY');
    expect(cre.target.dayIndex).toBe(4);

    const plan = buildContextRequirementPlan({
      message: WRAPPED_ADD_DAY4,
      tripId: 't1',
      unifiedSemanticIntent: 'LOCAL_EDIT',
      focusDayIndex: 4,
    });
    expect(plan.operation).toBe('ADD_ACTIVITY_TO_DAY');
  });
});
