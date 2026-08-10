import {
  finalizeOrchestrationOutcome,
  shouldExecuteSystem1Delegation,
} from './orchestration-outcome.util';

describe('orchestration-outcome.util', () => {
  it('DONE marks success and userTaskCompleted', () => {
    expect(finalizeOrchestrationOutcome({ status: 'DONE' })).toMatchObject({
      success: true,
      technicalSuccess: true,
      userTaskCompleted: true,
      status: 'DONE',
    });
  });

  it('DELEGATED is not user-complete and not legacy success', () => {
    expect(
      finalizeOrchestrationOutcome({
        status: 'DELEGATED',
        technicalSuccess: true,
        userTaskCompleted: false,
        delegateTo: 'AGENT_SERVICE_SYSTEM1',
      }),
    ).toMatchObject({
      success: false,
      technicalSuccess: true,
      userTaskCompleted: false,
      status: 'DELEGATED',
      delegateTo: 'AGENT_SERVICE_SYSTEM1',
    });
  });

  it('NEED_USER_INPUT keeps technicalSuccess without completing the task', () => {
    expect(
      finalizeOrchestrationOutcome({
        status: 'NEED_USER_INPUT',
        technicalSuccess: true,
        userTaskCompleted: false,
      }),
    ).toMatchObject({
      success: false,
      technicalSuccess: true,
      userTaskCompleted: false,
    });
  });

  it('shouldExecuteSystem1Delegation accepts DELEGATED even when success=false', () => {
    expect(
      shouldExecuteSystem1Delegation({
        status: 'DELEGATED',
        success: false,
        result: { routingDecision: { route: 'SYSTEM1_API' } },
      }),
    ).toBe(true);
  });

  it('shouldExecuteSystem1Delegation rejects DONE system2', () => {
    expect(
      shouldExecuteSystem1Delegation({
        status: 'DONE',
        success: true,
        result: { routingDecision: { route: 'SYSTEM2_REASONING' } },
      }),
    ).toBe(false);
  });
});
