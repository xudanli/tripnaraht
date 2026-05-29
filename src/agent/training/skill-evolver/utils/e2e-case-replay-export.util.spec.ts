import { e2eCaseToReplayFixture, buildAssertionsFromE2e } from './e2e-case-replay-export.util';
import { icelandHighlandsCase, icelandHighlandsDemMissingCase } from '../../../../trips/decision/evaluation/e2e-cases/iceland-highlands.example';

describe('e2e-case-replay-export.util', () => {
  it('maps highlands case to replay fixture', () => {
    const fx = e2eCaseToReplayFixture(icelandHighlandsCase);
    expect(fx.caseId).toBe('iceland-highlands-001');
    expect(fx.source_e2e_case_id).toBe('iceland-highlands-001');
    expect(fx.tasks[0].initialObservation).toContain('冰岛高地');
    expect(fx.assertions?.some((a) => a.type === 'task_completed')).toBe(true);
  });

  it('includes reject hints for dem missing', () => {
    const assertions = buildAssertionsFromE2e(icelandHighlandsDemMissingCase);
    expect(assertions.some((a) => a.value.includes('reject'))).toBe(true);
  });

  it('skips internal fixture meta tokens and adds highlands semantic assertion', () => {
    const assertions = buildAssertionsFromE2e(icelandHighlandsCase);
    expect(assertions.some((a) => a.value.includes('fixture-meta'))).toBe(false);
    expect(assertions.some((a) => a.value.includes('cand=12'))).toBe(false);
    expect(assertions.some((a) => a.value === '高地')).toBe(true);
  });

  it('maps dem missing case to semantic reject/dem assertions', () => {
    const assertions = buildAssertionsFromE2e(icelandHighlandsDemMissingCase);
    expect(assertions.some((a) => a.value.includes('fixture-dem'))).toBe(false);
    expect(assertions.some((a) => a.value === 'reject' && a.type === 'trajectory_contains')).toBe(true);
    expect(assertions.some((a) => a.value === 'reject' && a.type === 'skill_body_contains')).toBe(true);
    expect(assertions.some((a) => a.value === 'dem' && a.type === 'skill_body_contains')).toBe(true);
    expect(assertions.some((a) => a.type === 'task_completed' && a.value === 'false')).toBe(false);
  });
});
