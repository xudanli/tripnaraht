import {
  buildInitialPlanState,
  classifyInitialPlanStatus,
  generatingInitialPlanState,
  toCompatInitialSchedule,
} from './iceland-self-drive-initial-plan.util';

describe('iceland-self-drive-initial-plan.util', () => {
  it('classifies READY when applied with activities', () => {
    expect(
      classifyInitialPlanStatus({
        applied: true,
        verificationStatus: 'PASS',
        metrics: {
          scheduledDayCount: 7,
          scheduledActivityCount: 5,
          scheduledAnchorCount: 2,
          emptyDayCount: 1,
          totalItemCount: 7,
        },
      }),
    ).toBe('READY');
  });

  it('classifies PARTIAL when only anchors', () => {
    expect(
      classifyInitialPlanStatus({
        applied: false,
        verificationStatus: 'BLOCK',
        metrics: {
          scheduledDayCount: 7,
          scheduledActivityCount: 0,
          scheduledAnchorCount: 3,
          emptyDayCount: 4,
          totalItemCount: 3,
        },
      }),
    ).toBe('PARTIAL');
  });

  it('classifies FAILED when empty', () => {
    expect(
      classifyInitialPlanStatus({
        applied: false,
        verificationStatus: 'NOT_RUN',
        metrics: {
          scheduledDayCount: 7,
          scheduledActivityCount: 0,
          scheduledAnchorCount: 0,
          emptyDayCount: 7,
          totalItemCount: 0,
        },
      }),
    ).toBe('FAILED');
  });

  it('fallbackAllowed only on FAILED', () => {
    const ready = buildInitialPlanState({
      status: 'READY',
      verificationStatus: 'PASS',
      metrics: {
        scheduledDayCount: 1,
        scheduledActivityCount: 1,
        scheduledAnchorCount: 0,
        emptyDayCount: 0,
        totalItemCount: 1,
      },
      lastProposalId: 'p1',
      generatedAt: '2027-01-01T00:00:00.000Z',
    });
    expect(ready.fallbackAllowed).toBe(false);

    const failed = buildInitialPlanState({
      status: 'FAILED',
      verificationStatus: 'BLOCK',
      metrics: {
        scheduledDayCount: 1,
        scheduledActivityCount: 0,
        scheduledAnchorCount: 0,
        emptyDayCount: 1,
        totalItemCount: 0,
      },
      lastProposalId: null,
      generatedAt: null,
    });
    expect(failed.fallbackAllowed).toBe(true);
  });

  it('generating placeholder has NOT_RUN and no fallback', () => {
    const g = generatingInitialPlanState();
    expect(g.status).toBe('GENERATING');
    expect(g.verificationStatus).toBe('NOT_RUN');
    expect(g.fallbackAllowed).toBe(false);
    expect(toCompatInitialSchedule(g).ready).toBe(false);
  });
});
