import {
  buildLightweightClockFactPromptLines,
  buildLightweightMacroStatFactPromptLines,
  coerceLightweightKnowledgeUserVisibleAnswer,
  isCarRentalOrDrivingTravelQuery,
  lightweightAnswerImpliesMissingTripContext,
  resolveLightweightLlmHttpTimeoutMs,
  stripConsultationPromptLeakageFromLightweightAnswer,
} from './lightweight-knowledge-helpers.runner';
import type { LightweightKnowledgeHelpersHost } from './lightweight-knowledge-helpers.host';

describe('lightweight-knowledge-helpers.runner', () => {
  const host = {
    logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    prisma: {} as any,
    extractCountryCodeFromMessage: () => undefined,
    extractSeason: () => 'summer',
  } as LightweightKnowledgeHelpersHost;

  it('resolveLightweightLlmHttpTimeoutMs falls back', () => {
    const ms = resolveLightweightLlmHttpTimeoutMs(host);
    expect(ms).toBeGreaterThanOrEqual(10_000);
  });

  it('strips consultation leakage', () => {
    const out = stripConsultationPromptLeakageFromLightweightAnswer(
      host,
      '正文\n【可视化 Dashboard JSON】x\n<<<CONSULTATION_UI_JSON>>>{}<<<END_CONSULTATION_UI_JSON>>>',
    );
    expect(out).toContain('正文');
    expect(out).not.toContain('Dashboard');
    expect(out).not.toContain('CONSULTATION_UI');
  });

  it('coerces empty json answer', () => {
    const out = coerceLightweightKnowledgeUserVisibleAnswer(host, '{}', {
      request_id: 'r1',
    });
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toBe('{}');
  });

  it('builds clock / macro prompt lines', () => {
    expect(buildLightweightClockFactPromptLines(host, '冰岛现在几点').length).toBeGreaterThan(0);
    expect(buildLightweightMacroStatFactPromptLines(host).length).toBeGreaterThan(0);
  });

  it('detects driving query and missing destination phrasing', () => {
    expect(isCarRentalOrDrivingTravelQuery(host, '冰岛租车自驾')).toBe(true);
    expect(
      lightweightAnswerImpliesMissingTripContext(host, '您尚未告知目的地'),
    ).toBe(true);
  });
});
