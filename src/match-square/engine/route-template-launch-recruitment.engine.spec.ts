import {
  buildForcedRouteTemplateMatchPlan,
  buildLaunchRecruitmentPostFields,
  buildLaunchVibeParseView,
  buildRouteTemplateLaunchSnapshot,
  resolveCatalogEntryForRouteTemplate,
} from './route-template-launch-recruitment.engine';

describe('route-template-launch-recruitment.engine', () => {
  it('resolves catalog by route direction + duration', () => {
    const entry = resolveCatalogEntryForRouteTemplate({
      routeDirectionName: 'IS_LAUGAVEGUR',
      durationDays: 4,
    });
    expect(entry?.catalogId).toBe('is_laugavegur_55km_heavy_4d');
  });

  it('builds forced highlight match plan', () => {
    const entry = resolveCatalogEntryForRouteTemplate({
      routeDirectionName: 'ANJI_DNA_RETREAT',
      durationDays: 3,
    })!;
    const plan = buildForcedRouteTemplateMatchPlan(entry);
    expect(plan.primaryMatch?.matchPercent).toBe(100);
    expect(plan.primaryMatch?.confidence).toBe('highlight');
    expect(plan.primaryMatch?.launchRecruitmentAction).toBe('confirm_template');
    expect(plan.associationHint).toContain('安吉 DNA');
  });

  it('builds launch post fields and vibe parse with routeTemplateMatch', () => {
    const catalog = resolveCatalogEntryForRouteTemplate({
      routeDirectionName: 'IS_LAUGAVEGUR',
      durationDays: 4,
    })!;
    const fields = buildLaunchRecruitmentPostFields({
      catalog,
      templateName: '兰格维格 4 日官方模板',
      routeDirectionNameCn: '朗格迈维卢尔步道',
      dto: {
        startDate: '2026-07-01',
        endDate: '2026-07-04',
        slotsNeeded: 3,
        planningStyle: 'full_managed',
      },
    });
    expect(fields.destination).toBe('朗格迈维卢尔步道');
    expect(fields.itinerarySummary).toContain('兰格维格');

    const matchPlan = buildForcedRouteTemplateMatchPlan(catalog);
    const vibe = buildLaunchVibeParseView({
      catalog,
      fields,
      routeTemplateMatch: matchPlan,
      planningStyle: 'full_managed',
    });
    expect(vibe.routeTemplateMatch?.primaryMatch?.catalogId).toBe('is_laugavegur_55km_heavy_4d');
    expect(vibe.payload.recruitment_script_id).toBe('iceland_laugavegur_heavy_trek');
    expect(vibe.trekkingOrchestration).not.toBeNull();

    const launch = buildRouteTemplateLaunchSnapshot({
      routeTemplateId: 42,
      routeTemplateUuid: 'uuid-42',
      catalog,
    });
    expect(launch.catalogId).toBe('is_laugavegur_55km_heavy_4d');
  });
});
