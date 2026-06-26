import { TeamCollaborationService } from './team-collaboration.service';

describe('TeamCollaborationService', () => {
  it('updates an existing team member by teamId and userId', async () => {
    const prisma = {
      collaborationTeam: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'team_1',
          name: 'QA Team',
          type: 'CUSTOM',
          decisionWeightMode: 'CUSTOM',
          teamConstraints: {
            useWeakestLink: true,
            maxAcceptableDisagreement: 0.3,
            unanimityRequired: ['SAFETY_CRITICAL'],
          },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          members: [
            {
              userId: 'user_1',
              displayName: 'Old Name',
              role: 'MEMBER',
              decisionWeight: 0.5,
              fitnessLevel: 'INTERMEDIATE',
              experienceLevel: 'SOME_EXPERIENCE',
              personalWeights: { safety: 1 },
              specialConstraints: null,
              joinedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
            {
              userId: 'user_2',
              displayName: 'Other',
              role: 'MEMBER',
              decisionWeight: 0.5,
              fitnessLevel: 'INTERMEDIATE',
              experienceLevel: 'SOME_EXPERIENCE',
              personalWeights: { safety: 1 },
              specialConstraints: null,
              joinedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      collaborationTeamMember: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new TeamCollaborationService(prisma as any, {} as any);

    const result = await service.updateMember('team_1', 'user_1', {
      displayName: 'New Name',
      role: 'LEADER',
      decisionWeight: 0.7,
      specialConstraints: { maxDailyHours: 6 },
    });

    expect(prisma.collaborationTeamMember.update).toHaveBeenCalledWith({
      where: { teamId_userId: { teamId: 'team_1', userId: 'user_1' } },
      data: {
        displayName: 'New Name',
        role: 'LEADER',
        decisionWeight: 0.7,
        specialConstraints: { maxDailyHours: 6 },
      },
    });
    expect(result.members.find((member) => member.userId === 'user_1')).toMatchObject({
      displayName: 'New Name',
      role: 'LEADER',
      specialConstraints: { maxDailyHours: 6 },
    });
  });
});
