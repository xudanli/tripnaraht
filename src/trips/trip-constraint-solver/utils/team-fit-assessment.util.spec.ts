import { ConflictType } from '../../dto/trip-conflicts.dto';
import type { DecisionStyleType } from '../../decision-profiling/types/decision-profiling.types';
import {
  assessTeamFit,
  deriveTeamFitChecklistStatus,
  parseStoredTravelStyleCard,
} from './team-fit-assessment.util';

describe('team-fit-assessment.util', () => {
  it('returns perfect score for solo trips', () => {
    const result = assessTeamFit({
      tripId: 'trip-1',
      members: [{ userId: 'u1', displayName: 'Alice', quizCompleted: true }],
      conflicts: [],
    });
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(deriveTeamFitChecklistStatus(result).result).toBe('passed');
  });

  it('flags incomplete profiling for multi-member trips', () => {
    const result = assessTeamFit({
      tripId: 'trip-1',
      members: [
        { userId: 'u1', displayName: 'Alice', quizCompleted: true },
        { userId: 'u2', displayName: 'Bob', quizCompleted: false },
      ],
      conflicts: [],
    });
    expect(result.issues.some((i) => i.issueKind === 'profiling_incomplete')).toBe(true);
    expect(result.issues[0]?.proofs?.[0]?.ruleId).toBe('team_fit.profiling.coverage');
    expect(deriveTeamFitChecklistStatus(result).result).toBe('pending');
  });

  it('maps fatigue conflicts to team fit issues with proofs', () => {
    const result = assessTeamFit({
      tripId: 'trip-1',
      members: [
        { userId: 'u1', displayName: 'Alice', quizCompleted: true },
        { userId: 'u2', displayName: 'Bob', quizCompleted: true },
      ],
      conflicts: [
        {
          id: 'fatigue-1',
          type: ConflictType.FATIGUE_EXCEEDED,
          severity: 'HIGH' as any,
          title: '体力超标',
          description: '当日疲劳指数 92，超过建议值 80',
          affectedDays: ['2026-07-04'],
          affectedItemIds: [],
        },
      ],
    });
    const fatigueIssue = result.issues.find((i) => i.issueKind === 'team_fatigue');
    expect(fatigueIssue?.category).toBe('team_fit');
    expect(fatigueIssue?.proofs?.[0]?.evidenceType).toBe('fatigue_exceeded');
  });

  it('detects high friction between planner and spontaneous styles', () => {
    const mkStyle = (userId: string, styleType: DecisionStyleType) =>
      parseStoredTravelStyleCard(userId, {
        styleType,
        styleLabel: styleType,
        coreDrivers: [],
        teamRole: 'test',
        compatibilityHints: [],
        confidence: 0.9,
        completedAt: new Date().toISOString(),
      })!;

    const result = assessTeamFit({
      tripId: 'trip-1',
      members: [
        {
          userId: 'u1',
          displayName: 'Planner',
          quizCompleted: true,
          style: mkStyle('u1', 'PRAGMATIC_PLANNER'),
          money: {
            userId: 'u1',
            vector: {
              experienceTendency: 0.3,
              qualityTendency: 0.7,
              timeValueTendency: 0.8,
              socialScarcityTendency: 0.2,
            },
            consumptionPace: 'planned',
            confidence: 0.9,
            completedAt: new Date().toISOString(),
          },
        },
        {
          userId: 'u2',
          displayName: 'Spontaneous',
          quizCompleted: true,
          style: mkStyle('u2', 'SPONTANEOUS_ADVENTURER'),
          money: {
            userId: 'u2',
            vector: {
              experienceTendency: 0.9,
              qualityTendency: 0.4,
              timeValueTendency: 0.2,
              socialScarcityTendency: 0.7,
            },
            consumptionPace: 'spontaneous',
            confidence: 0.9,
            completedAt: new Date().toISOString(),
          },
        },
      ],
      conflicts: [],
    });

    const friction = result.issues.filter((i) => i.issueKind === 'member_friction');
    expect(friction.length).toBeGreaterThan(0);
    expect(friction[0]?.proofs?.[0]?.evidenceSource).toBe('decision-profiling.friction-matrix');
  });
});
