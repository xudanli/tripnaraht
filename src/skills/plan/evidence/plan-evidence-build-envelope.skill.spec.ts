import { Test } from '@nestjs/testing';
import { PlanEvidenceBuildEnvelopeSkill } from './plan-evidence-build-envelope.skill';

describe('PlanEvidenceBuildEnvelopeSkill', () => {
  let skill: PlanEvidenceBuildEnvelopeSkill;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PlanEvidenceBuildEnvelopeSkill],
    }).compile();
    skill = module.get(PlanEvidenceBuildEnvelopeSkill);
  });

  it('builds evidence envelope with defaults', async () => {
    const result = await skill.execute({
      source_title: 'SafeTravel RSS',
      excerpt: 'High wind warning in South Iceland',
      relevance: 'Route segment day 2',
    });

    expect(result.envelope.source_title).toBe('SafeTravel RSS');
    expect(result.envelope.excerpt).toContain('wind');
    expect(result.envelope.confidence).toBe('MEDIUM');
    expect(result.envelope.retrieved_at).toBeDefined();
  });

  it('preserves explicit confidence', async () => {
    const result = await skill.execute({
      source_title: 'Vedur',
      excerpt: 'Yellow alert',
      relevance: 'Weather gate',
      confidence: 'HIGH',
    });

    expect(result.envelope.confidence).toBe('HIGH');
  });
});
