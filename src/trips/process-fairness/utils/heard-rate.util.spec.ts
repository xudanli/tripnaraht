import {
  HEARD_RATE_THRESHOLD,
  buildHeardInterventions,
  computeHeardRates,
} from './heard-rate.util';

describe('heard-rate.util', () => {
  it('computes heard rates and flags below threshold', () => {
    const rates = computeHeardRates(
      [
        { targetUserId: 'a', heard: true },
        { targetUserId: 'a', heard: true },
        { targetUserId: 'a', heard: false },
        { targetUserId: 'b', heard: false },
        { targetUserId: 'b', heard: false },
      ],
      2,
    );

    const a = rates.find((r) => r.targetUserId === 'a');
    const b = rates.find((r) => r.targetUserId === 'b');
    expect(a?.heardRate).toBeCloseTo(2 / 3);
    expect(a?.belowThreshold).toBe(true);
    expect(b?.heardRate).toBe(0);
    expect(b?.belowThreshold).toBe(true);
    expect(HEARD_RATE_THRESHOLD).toBe(0.8);
  });

  it('builds intervention messages for low heard rates', () => {
    const interventions = buildHeardInterventions(
      [
        {
          targetUserId: 'u1',
          heardRate: 0.5,
          voteCount: 4,
          belowThreshold: true,
        },
      ],
      new Map([['u1', '莎莎']]),
    );
    expect(interventions).toHaveLength(1);
    expect(interventions[0].messageCN).toContain('莎莎');
    expect(interventions[0].messageCN).toContain('50%');
  });
});
