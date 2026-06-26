import { ContingencySilentHealHandler } from './contingency-silent-heal.handler';
import { ContingencyAdvisorPlanBHandler } from './contingency-advisor-plan-b.handler';

describe('Contingency path handlers (Sprint 3)', () => {
  it('SILENT_HEAL records success from metadata', async () => {
    const handler = new ContingencySilentHealHandler();
    const result = await handler.handle('trip-1', 'silent_heal:budget_drift', {
      success: true,
      healing_summary: 'scaled',
    });
    expect(result.outcome).toBe('SUCCESS');
  });

  it('ADVISOR_PLAN_B returns PARTIAL when triggered but not adopted', async () => {
    const handler = new ContingencyAdvisorPlanBHandler();
    const result = await handler.handle('trip-1', 'plan_b_triggered', {
      triggered: true,
      adopted: false,
      projectId: 'p1',
    });
    expect(result.outcome).toBe('PARTIAL');
    expect(result.humanAssisted).toBe(true);
  });

  it('ADVISOR_PLAN_B returns SUCCESS when adopted', async () => {
    const handler = new ContingencyAdvisorPlanBHandler();
    const result = await handler.handle('trip-1', 'plan_b_triggered', {
      triggered: true,
      adopted: true,
    });
    expect(result.outcome).toBe('SUCCESS');
  });
});
