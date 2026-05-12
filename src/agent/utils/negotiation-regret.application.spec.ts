import { NEGOTIATION_REASONING_TAG } from '../constants/negotiation-reasoning.constants';
import { applyNegotiationRegretFromRollbackHistory, REGRET_EFFORT_DELTA } from './negotiation-regret.application';

describe('applyNegotiationRegretFromRollbackHistory', () => {
  it('no-ops when regret reader is missing', async () => {
    const alternatives = [{ id: 'UPGRADE_TO_DRIVE' }, { id: 'POSTPONE_SCHEDULE' }];
    const r = await applyNegotiationRegretFromRollbackHistory({
      tripId: 't1',
      regret: undefined,
      alternatives,
      default_option_id: 'POSTPONE_SCHEDULE',
      driveTooExpensive: false,
    });
    expect(r.alternatives).toEqual(alternatives);
    expect(r.default_option_id).toBe('POSTPONE_SCHEDULE');
  });

  it('marks POSTPONE and prefers UPGRADE default when user rolled back from postpone', async () => {
    const regret = {
      getAlternativeIdSupersededByLatestRollback: jest.fn().mockResolvedValue('POSTPONE_SCHEDULE'),
    };
    const alternatives = [
      { id: 'UPGRADE_TO_DRIVE', effort_delta: 0.1 },
      { id: 'POSTPONE_SCHEDULE', effort_delta: 0 },
    ];
    const r = await applyNegotiationRegretFromRollbackHistory({
      tripId: 't1',
      regret,
      alternatives,
      default_option_id: 'POSTPONE_SCHEDULE',
      driveTooExpensive: false,
    });
    expect(r.default_option_id).toBe('UPGRADE_TO_DRIVE');
    expect(r.alternatives[0].id).toBe('UPGRADE_TO_DRIVE');
    const po = r.alternatives.find((x: any) => x.id === 'POSTPONE_SCHEDULE');
    expect(po?.previously_rejected).toBe(true);
    expect(po?.prior_rollback_of_same_alternative).toBe(true);
    expect(String(po?.regret_notice ?? '')).toContain('回滚');
    expect(po?.effort_delta).toBeGreaterThanOrEqual(0.5);
    expect(po?.reasoning_tags).toContain(NEGOTIATION_REASONING_TAG.ROLLBACK_MEMORY);
  });

  it('does not override default to UPGRADE when drive is too expensive', async () => {
    const regret = {
      getAlternativeIdSupersededByLatestRollback: jest.fn().mockResolvedValue('POSTPONE_SCHEDULE'),
    };
    const alternatives = [{ id: 'UPGRADE_TO_DRIVE' }, { id: 'POSTPONE_SCHEDULE' }];
    const r = await applyNegotiationRegretFromRollbackHistory({
      tripId: 't1',
      regret,
      alternatives,
      default_option_id: 'POSTPONE_SCHEDULE',
      driveTooExpensive: true,
    });
    expect(r.default_option_id).toBe('POSTPONE_SCHEDULE');
    const po = r.alternatives.find((x: any) => x.id === 'POSTPONE_SCHEDULE');
    expect(po?.previously_rejected).toBe(true);
    expect(po?.prior_rollback_of_same_alternative).toBe(true);
  });

  it('marks UPGRADE when that was the rolled-back alternative', async () => {
    const regret = {
      getAlternativeIdSupersededByLatestRollback: jest.fn().mockResolvedValue('UPGRADE_TO_DRIVE'),
    };
    const alternatives = [
      { id: 'UPGRADE_TO_DRIVE', effort_delta: 0.1 },
      { id: 'POSTPONE_SCHEDULE', effort_delta: 0 },
    ];
    const r = await applyNegotiationRegretFromRollbackHistory({
      tripId: 't1',
      regret,
      alternatives,
      default_option_id: 'UPGRADE_TO_DRIVE',
      driveTooExpensive: false,
    });
    expect(r.default_option_id).toBe('POSTPONE_SCHEDULE');
    const up = r.alternatives.find((x: any) => x.id === 'UPGRADE_TO_DRIVE');
    expect(up?.previously_rejected).toBe(true);
    expect(r.alternatives[r.alternatives.length - 1].id).toBe('UPGRADE_TO_DRIVE');
  });

  it('regret effort is additive on top of prior penalties', async () => {
    const regret = {
      getAlternativeIdSupersededByLatestRollback: jest.fn().mockResolvedValue('POSTPONE_SCHEDULE'),
    };
    const alternatives = [
      { id: 'UPGRADE_TO_DRIVE' },
      { id: 'POSTPONE_SCHEDULE', effort_delta: 0.4 },
    ];
    const r = await applyNegotiationRegretFromRollbackHistory({
      tripId: 't1',
      regret,
      alternatives,
      default_option_id: 'POSTPONE_SCHEDULE',
      driveTooExpensive: true,
    });
    const po = r.alternatives.find((x: any) => x.id === 'POSTPONE_SCHEDULE');
    expect(po?.effort_delta).toBeCloseTo(0.4 + REGRET_EFFORT_DELTA, 5);
  });
});
