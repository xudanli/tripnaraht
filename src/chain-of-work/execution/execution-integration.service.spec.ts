import { SkillExecutionError } from '../../skills/errors/skill-execution.error';
import { classifyOrchestratorFailure } from '../../agent/utils/orchestrator-failure-taxonomy.util';
import { ExecutionIntegrationService } from './execution-integration.service';

describe('ExecutionIntegrationService', () => {
  let svc: ExecutionIntegrationService;

  beforeEach(() => {
    svc = new ExecutionIntegrationService();
  });

  it('executeWithI5Recovery succeeds without retry', async () => {
    const out = await svc.executeWithI5Recovery(async () => 'ok');
    expect(out).toBe('ok');
  });

  it('executeWithI5Recovery retries on LIVE_TOOL_TIMEOUT then succeeds', async () => {
    let n = 0;
    const out = await svc.executeWithI5Recovery(async () => {
      n += 1;
      if (n < 2) throw new Error('LIVE_TOOL_TIMEOUT');
      return 'recovered';
    });
    expect(out).toBe('recovered');
    expect(n).toBe(2);
  });

  it('executeWithI5Recovery does not retry VERIFICATION_FATAL', async () => {
    await expect(
      svc.executeWithI5Recovery(async () => {
        throw new Error('VERIFICATION_FATAL: slope');
      }),
    ).rejects.toThrow(/VERIFICATION_FATAL/);
  });

  it('executeWithI5Recovery retries SkillExecutionError with TRANSIENT fingerprint', async () => {
    let n = 0;
    const meta = classifyOrchestratorFailure(new Error('ETIMEDOUT'), { skill_name: 'demo.skill' });
    const out = await svc.executeWithI5Recovery(async () => {
      n += 1;
      if (n < 2) {
        throw new SkillExecutionError('demo.skill', 'ETIMEDOUT', {
          orchestratorRobustness: meta,
        });
      }
      return 'ok';
    });
    expect(out).toBe('ok');
    expect(n).toBe(2);
  });
});
