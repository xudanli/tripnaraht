import {
  computePreferenceProgress,
  projectPlanningTeamMember,
  resolvePendingConfirmations,
  resolvePlanningMemberStyle,
  resolvePlanningStatusLabel,
} from './planning-team-status.projection.util';

describe('planning-team-status.projection.util', () => {
  describe('computePreferenceProgress', () => {
    it('returns 0 when facts missing', () => {
      expect(computePreferenceProgress()).toBe(0);
    });

    it('weights travel style, money dna, and quiz', () => {
      expect(
        computePreferenceProgress({
          travelStyleCompleted: true,
          moneyDnaCompleted: false,
          quizCompleted: false,
        }),
      ).toBe(0.4);
      expect(
        computePreferenceProgress({
          travelStyleCompleted: true,
          moneyDnaCompleted: true,
          quizCompleted: true,
        }),
      ).toBe(1);
    });
  });

  describe('resolvePlanningMemberStyle', () => {
    it('maps placeholders to invite', () => {
      expect(
        resolvePlanningMemberStyle({ isPlaceholder: true, progress: 0 }),
      ).toBe('invite');
    });

    it('maps full profiling to complete', () => {
      expect(
        resolvePlanningMemberStyle({
          isPlaceholder: false,
          progress: 1,
          profiling: {
            travelStyleCompleted: true,
            moneyDnaCompleted: true,
            quizCompleted: true,
          },
        }),
      ).toBe('complete');
    });

    it('maps missing money dna after partial progress to attention', () => {
      expect(
        resolvePlanningMemberStyle({
          isPlaceholder: false,
          progress: 0.4,
          profiling: {
            travelStyleCompleted: true,
            moneyDnaCompleted: false,
            quizCompleted: false,
          },
        }),
      ).toBe('attention');
    });

    it('maps incomplete joiners to pending', () => {
      expect(
        resolvePlanningMemberStyle({
          isPlaceholder: false,
          progress: 0,
          profiling: {
            travelStyleCompleted: false,
            moneyDnaCompleted: false,
            quizCompleted: false,
          },
        }),
      ).toBe('pending');
    });
  });

  describe('resolvePlanningStatusLabel', () => {
    it('uses fixed Chinese labels for complete / attention / invite', () => {
      expect(
        resolvePlanningStatusLabel({ style: 'complete', progress: 1 }),
      ).toBe('偏好完成');
      expect(
        resolvePlanningStatusLabel({ style: 'attention', progress: 0.4 }),
      ).toBe('体力需求未确认');
      expect(
        resolvePlanningStatusLabel({ style: 'invite', progress: 0 }),
      ).toBe('邀请后可加入协作');
    });

    it('uses wish copy when pending with focus areas and zero progress', () => {
      expect(
        resolvePlanningStatusLabel({
          style: 'pending',
          progress: 0,
          focusAreas: ['轻徒步'],
        }),
      ).toBe('已填写愿望');
    });
  });

  describe('projectPlanningTeamMember', () => {
    it('projects a joined member with consistent progress/style/label', () => {
      const member = projectPlanningTeamMember({
        id: 'collab-1',
        name: '张三',
        role: 'leader',
        isPlaceholder: false,
        profiling: {
          travelStyleCompleted: true,
          moneyDnaCompleted: true,
          quizCompleted: true,
        },
        focusAreas: ['轻徒步', '摄影'],
      });

      expect(member).toMatchObject({
        id: 'collab-1',
        progress: 1,
        style: 'complete',
        statusLabel: '偏好完成',
        isPlaceholder: false,
        focusAreas: ['轻徒步', '摄影'],
      });
      expect(member.pendingConfirmations).toBeUndefined();
    });

    it('projects invite placeholders', () => {
      const member = projectPlanningTeamMember({
        id: 'invite-1',
        name: '驾驶员席位',
        isPlaceholder: true,
      });
      expect(member).toMatchObject({
        style: 'invite',
        progress: 0,
        isPlaceholder: true,
        statusLabel: '邀请后可加入协作',
      });
    });

    it('lists pending confirmations for incomplete members', () => {
      expect(
        resolvePendingConfirmations({
          travelStyleCompleted: true,
          moneyDnaCompleted: false,
          quizCompleted: false,
        }),
      ).toEqual(['体力偏好', '决策画像']);
    });
  });
});
