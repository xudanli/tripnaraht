import {
  buildTeamFitnessActivityBookingMeta,
  buildTeamFitnessActivityBookingPromptLines,
} from './team-fitness-activity-booking.util';
import type { TeamFitnessMemberStatus } from './team-fitness-submission-status.util';

describe('team-fitness-activity-booking.util', () => {
  const members: TeamFitnessMemberStatus[] = [
    {
      userId: 'u1',
      displayName: '队长A',
      role: '队长',
      submitted: true,
      fitnessLevel: 'HIGH',
    },
    {
      userId: 'u2',
      displayName: '成员B',
      role: '成员',
      submitted: true,
      fitnessLevel: 'MEDIUM',
    },
    {
      userId: 'u3',
      displayName: '成员C',
      role: '成员',
      submitted: false,
      fitnessLevel: null,
    },
  ];

  it('木桶取最弱已提交成员，并对冰川徒步给出 tight/insufficient', () => {
    const meta = buildTeamFitnessActivityBookingMeta(
      members,
      '预订第4天的冰川徒步活动',
    );
    expect(meta.floor_level).toBe('MEDIUM');
    expect(meta.activity_need_level).toBe('MEDIUM_HIGH');
    expect(meta.missing_count).toBe(1);
    expect(['tight', 'insufficient']).toContain(meta.fit);
    expect(meta.fit_zh).toMatch(/木桶|体能/);
  });

  it('prompt 含未提交提醒与适配结论', () => {
    const meta = buildTeamFitnessActivityBookingMeta(
      members,
      '预定冰川徒步',
    );
    const lines = buildTeamFitnessActivityBookingPromptLines(meta);
    expect(lines.some((l) => /团队体能/.test(l))).toBe(true);
    expect(lines.some((l) => /未提交/.test(l))).toBe(true);
    expect(lines.some((l) => /适配结论/.test(l))).toBe(true);
  });

  it('全员高强度 → ok', () => {
    const strong: TeamFitnessMemberStatus[] = [
      {
        userId: 'a',
        displayName: 'A',
        role: '队长',
        submitted: true,
        fitnessLevel: 'HIGH',
      },
      {
        userId: 'b',
        displayName: 'B',
        role: '成员',
        submitted: true,
        fitnessLevel: 'MEDIUM_HIGH',
      },
    ];
    const meta = buildTeamFitnessActivityBookingMeta(strong, '冰川徒步');
    expect(meta.fit).toBe('ok');
  });
});
