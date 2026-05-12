import { wrapSkillExecution } from './skill-execution-wrap.util';
import { SkillExecutionError } from '../errors/skill-execution.error';

describe('wrapSkillExecution', () => {
  it('returns result on success', async () => {
    const r = await wrapSkillExecution('my.skill', async () => 42);
    expect(r).toBe(42);
  });

  it('wraps errors with SkillExecutionError and I5 metadata', async () => {
    await expect(
      wrapSkillExecution('transport.search', async () => {
        throw new Error('ETIMEDOUT from upstream');
      }),
    ).rejects.toBeInstanceOf(SkillExecutionError);

    try {
      await wrapSkillExecution('transport.search', async () => {
        throw new Error('ETIMEDOUT from upstream');
      });
    } catch (e: unknown) {
      const se = e as SkillExecutionError;
      expect(se.skillName).toBe('transport.search');
      expect(se.orchestratorRobustness.source_layer).toBe('SKILL');
      expect(se.orchestratorRobustness.failure_code).toBe('SKILL_TRANSIENT_ERROR');
    }
  });
});
