import { parseVibeFreeTextWithRules, buildVibeLlmParseViewFromPayload } from './vibe-llm-parse.engine';

const LAUGAVEGUR_TEXT =
  '2026年盛夏，打算去冰岛内陆搞一次经典的兰格维格（Laugavegur）55公里重装徒步。Landmannalaugar 到 Þórsmörk，12.5米 DEM 离线 3D 路线，冰川强涉水，LNT Plan B。';

const ANJI_DYL_TEXT =
  '被大厂 OKR 燃尽，去安吉 DNA 数字游民公社隐居。傍晚山谷徒步露营，围炉煮茶，用 Stanford DYL 做人生转型复盘。拒绝爹味说教。';

describe('route-template-intent.engine', () => {
  it('highlights Laugavegur template for iceland laugavegur script', () => {
    const payload = parseVibeFreeTextWithRules(LAUGAVEGUR_TEXT);
    payload.source_text = LAUGAVEGUR_TEXT;
    const view = buildVibeLlmParseViewFromPayload(payload);

    expect(view.routeTemplateMatch).not.toBeNull();
    expect(view.routeTemplateMatch!.primaryMatch?.catalogId).toBe('is_laugavegur_55km_heavy_4d');
    expect(view.routeTemplateMatch!.primaryMatch?.routeDirectionName).toBe('IS_LAUGAVEGUR');
    expect(view.routeTemplateMatch!.primaryMatch!.matchPercent).toBeGreaterThanOrEqual(85);
    expect(view.routeTemplateMatch!.primaryMatch!.confidence).toBe('highlight');
    expect(view.routeTemplateMatch!.associationHint).toContain('兰格维格');
    expect(view.routeTemplateMatch!.primaryMatch!.slotAugmentations.length).toBeGreaterThan(0);
  });

  it('highlights Anji DNA template for mountain dyl retreat script', () => {
    const payload = parseVibeFreeTextWithRules(ANJI_DYL_TEXT);
    payload.source_text = ANJI_DYL_TEXT;
    const view = buildVibeLlmParseViewFromPayload(payload);

    expect(view.routeTemplateMatch?.primaryMatch?.catalogId).toBe('anji_dna_light_camp_3d');
    expect(view.routeTemplateMatch?.primaryMatch?.confidence).toBe('highlight');
    expect(view.routeTemplateMatch?.associationHint).toContain('安吉 DNA');
  });

  it('returns null for unrelated vibe text', () => {
    const payload = parseVibeFreeTextWithRules('去大理躺尸疗愈发呆');
    const view = buildVibeLlmParseViewFromPayload(payload);
    expect(view.routeTemplateMatch).toBeNull();
  });
});
