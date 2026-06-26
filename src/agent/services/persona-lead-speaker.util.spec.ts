import {
  buildGuardianInsightCard,
  buildPersonaPresentation,
  pickLeadSpeaker,
  resolveLeadSpeakerScenario,
  type PersonaStatementSlice,
} from './persona-lead-speaker.util';

describe('persona-lead-speaker.util', () => {
  const allow = (persona: PersonaStatementSlice['persona'], icon: string, name: string): PersonaStatementSlice => ({
    persona,
    icon,
    name,
    verdict: 'ALLOW',
    explanation: `${name} OK`,
  });

  it('picks Abu for safety block', () => {
    const personas = {
      abu: { persona: 'ABU' as const, icon: '🐻', name: 'Abu', verdict: 'REJECT' as const, explanation: 'F-road blocked' },
      drdre: allow('DR_DRE', '🐕', 'Dr.Dre'),
      neptune: allow('NEPTUNE', '🦦', 'Neptune'),
    };
    expect(resolveLeadSpeakerScenario(personas)).toBe('SAFETY_BLOCK');
    expect(pickLeadSpeaker('SAFETY_BLOCK', personas)).toBe('ABU');
  });

  it('picks Neptune for repair-only scenario', () => {
    const personas = {
      abu: allow('ABU', '🐻', 'Abu'),
      drdre: allow('DR_DRE', '🐕', 'Dr.Dre'),
      neptune: {
        persona: 'NEPTUNE' as const,
        icon: '🦦',
        name: 'Neptune',
        verdict: 'REPLACE' as const,
        explanation: '冰川改上午',
      },
    };
    expect(resolveLeadSpeakerScenario(personas)).toBe('INTENT_REPAIR');
    const presentation = buildPersonaPresentation(personas);
    expect(presentation.leadSpeaker).toBe('NEPTUNE');
    expect(presentation.mode).toBe('single_lead');
    expect(presentation.actions.neptune).toBe('REPAIR');
  });

  it('uses decision_committee for multi-factor', () => {
    const personas = {
      abu: {
        persona: 'ABU' as const,
        icon: '🐻',
        name: 'Abu',
        verdict: 'NEED_CONFIRM' as const,
        explanation: '风速偏高',
      },
      drdre: {
        persona: 'DR_DRE' as const,
        icon: '🐕',
        name: 'Dr.Dre',
        verdict: 'ADJUST' as const,
        explanation: '需提前出发',
      },
      neptune: allow('NEPTUNE', '🦦', 'Neptune'),
    };
    const presentation = buildPersonaPresentation(personas);
    expect(presentation.mode).toBe('decision_committee');
    expect(presentation.supportingLines.length).toBeGreaterThan(0);
  });

  it('buildGuardianInsightCard uses Abu lead for safety error (in_trip brief)', () => {
    const card = buildGuardianInsightCard(
      [
        { persona: 'Neptune', emoji: '🦦', name: 'Neptune', message: '已换方案', severity: 'warning' },
        { persona: 'Abu', emoji: '🐻', name: 'Abu', message: '风速过高', severity: 'error' },
      ],
      { Abu: 1, DrDre: 2, Neptune: 3 },
    );
    expect(card).toContain('Abu');
    expect(card).toContain('风速过高');
  });

  it('in_trip phase produces briefLines and execution_brief style', () => {
    const personas = {
      abu: {
        persona: 'ABU' as const,
        icon: '🐻',
        name: 'Abu',
        verdict: 'REJECT' as const,
        explanation: 'F 路封闭。建议改走 1 号公路。',
      },
      drdre: allow('DR_DRE', '🐕', 'Dr.Dre'),
      neptune: {
        persona: 'NEPTUNE' as const,
        icon: '🦦',
        name: 'Neptune',
        verdict: 'REPLACE' as const,
        explanation: '已保留冰川体验，改到上午。',
      },
    };
    const presentation = buildPersonaPresentation(personas, { expressionPhase: 'in_trip' });
    expect(presentation.expressionPhase).toBe('in_trip');
    expect(presentation.displayStyle).toBe('execution_brief');
    expect(presentation.briefLines?.length).toBeGreaterThan(0);
    expect(presentation.narrative).toBe(presentation.briefLines?.join('\n'));
  });
});
