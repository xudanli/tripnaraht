import {
  inferCountryCodeFromText,
  resolveDestinationLlmPromptSupplement,
} from './destination-llm-prompt-supplement.util';
import {
  normalizeOrchestrationTriageResult,
  isOrchestrationTriageEnabled,
} from './orchestration-triage.util';
import {
  isNarratorPersonaSsotEnabled,
  shouldSkipGuardianProseInNarration,
} from '../narrator/utils/narrator-persona-ssot.util';

describe('destination-llm-prompt-supplement.util', () => {
  it('infers GL from greenland text', () => {
    expect(inferCountryCodeFromText('想去格陵兰迪斯科湾')).toBe('GL');
  });

  it('builds sparse polar supplement for svalbard', () => {
    const s = resolveDestinationLlmPromptSupplement({
      userMessage: '朗伊尔城等极光天气窗',
      countryCode: 'SJ',
    });
    expect(s).toContain('稀疏');
    expect(s).toContain('斯瓦尔巴');
  });
});

describe('orchestration-triage.util', () => {
  it('is enabled by default', () => {
    const prev = process.env.ORCHESTRATION_TRIAGE_LLM;
    delete process.env.ORCHESTRATION_TRIAGE_LLM;
    expect(isOrchestrationTriageEnabled()).toBe(true);
    process.env.ORCHESTRATION_TRIAGE_LLM = prev;
  });

  it('normalizes triage payload', () => {
    const out = normalizeOrchestrationTriageResult({
      intentAnalysis: {
        intentType: 'complex_planning',
        complexity: 'complex',
        requiredCapabilities: ['planning'],
        confidence: 0.9,
        reasoning: 'plan trip',
      },
      routingDecision: {
        route: 'SYSTEM2_REASONING',
        confidence: 0.8,
        reasoning: 'needs planning',
        budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 0 },
      },
      skillsPlan: {
        selectedSkills: [
          {
            skillName: 'itinerary.generate',
            reason: 'plan',
            priority: 1,
            input: {},
          },
        ],
        executionOrder: ['itinerary.generate'],
        dependencies: {},
      },
    });
    expect(out?.routingDecision.route).toBe('SYSTEM2_REASONING');
    expect(out?.skillsPlan.selectedSkills[0]?.skillName).toBe('itinerary.generate');
  });
});

describe('narrator-persona-ssot.util', () => {
  it('skips guardian prose when SSOT enabled', () => {
    const prev = process.env.NARRATOR_PERSONA_SSOT;
    process.env.NARRATOR_PERSONA_SSOT = '1';
    expect(
      shouldSkipGuardianProseInNarration({
        request_id: 'r1',
        metadata: { sparse_region_profile: 'sparse_polar_greenland' },
      } as any),
    ).toBe(true);
    process.env.NARRATOR_PERSONA_SSOT = prev;
  });

  it('allows legacy prose when SSOT off', () => {
    const prev = process.env.NARRATOR_PERSONA_SSOT;
    process.env.NARRATOR_PERSONA_SSOT = '0';
    expect(isNarratorPersonaSsotEnabled()).toBe(false);
    expect(
      shouldSkipGuardianProseInNarration({ request_id: 'r1', metadata: {} } as any),
    ).toBe(false);
    process.env.NARRATOR_PERSONA_SSOT = prev;
  });
});
