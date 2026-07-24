import {
  appendSkillsHitToOutputsSummary,
  extractSkillsHitFromDecisionLog,
  mapOrchestratorDecisionLogToStepsExecuted,
} from './itinerary-item-crud-decision-log.util';

describe('itinerary-item-crud-decision-log.util', () => {
  it('appends skills to outputs summary', () => {
    expect(
      appendSkillsHitToOutputsSummary('已将时间调整为 10:00–11:40', ['trip.applyEdit']),
    ).toBe('已将时间调整为 10:00–11:40 命中 Skill：trip.applyEdit');
  });

  it('extracts skills from decision log metadata', () => {
    const skills = extractSkillsHitFromDecisionLog([
      {
        request_id: 'r1',
        step: 'REPAIR',
        actor: 'LocalInsight',
        inputs_summary: '',
        outputs_summary: '',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { skills_hit: ['poi.search', 'trip.applyEdit'] },
      },
    ]);
    expect(skills).toEqual(['poi.search', 'trip.applyEdit']);
  });

  it('maps skills_hit to stepsExecuted skillName', () => {
    const steps = mapOrchestratorDecisionLogToStepsExecuted([
      {
        request_id: 'r1',
        step: 'REPAIR',
        actor: 'LocalInsight',
        inputs_summary: '',
        outputs_summary: '',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { skills_hit: ['trip.applyEdit'] },
      },
    ]);
    expect(steps[0].skillName).toBe('trip.applyEdit');
  });
});
