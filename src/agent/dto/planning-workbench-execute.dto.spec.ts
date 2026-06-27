import {
  resolveSelectedOptionIdFromExecuteRequest,
  resolveSkeletonOptionsFromExecuteRequest,
  validatePlanningWorkbenchExecuteSemantics,
  type PlanningWorkbenchExecuteDto,
} from './planning-workbench-execute.dto';
import type { PlanSkeletonSet, PlanState } from '../../skills/plan/shared/plan-state.types';

const baseContext = {
  destination: { country: '冰岛' },
  days: 5,
};

const skeletonSet: PlanSkeletonSet = {
  options: [
    { id: 'compact_1', name: '紧凑', dayThemes: [], anchors: [], transferDays: [], rationale: { philosophy: '', tradeoffs: [], strengths: [], weaknesses: [] } },
    { id: 'balanced_1', name: '均衡', dayThemes: [], anchors: [], transferDays: [], rationale: { philosophy: '', tradeoffs: [], strengths: [], weaknesses: [] } },
  ],
  recommendation: { optionId: 'balanced_1', reason: '推荐' },
};

const planStateWithSkeleton = {
  plan_id: 'plan_1',
  metadata: { skeletonOptions: skeletonSet },
} as PlanState;

describe('planning-workbench-execute.dto', () => {
  describe('resolveSkeletonOptionsFromExecuteRequest', () => {
    it('prefers explicit skeletonOptions', () => {
      const resolved = resolveSkeletonOptionsFromExecuteRequest({
        skeletonOptions: skeletonSet,
        existingPlanState: undefined,
      });
      expect(resolved).toBe(skeletonSet);
    });

    it('falls back to existingPlanState.metadata.skeletonOptions', () => {
      const resolved = resolveSkeletonOptionsFromExecuteRequest({
        existingPlanState: planStateWithSkeleton,
      });
      expect(resolved).toEqual(skeletonSet);
    });
  });

  describe('resolveSelectedOptionIdFromExecuteRequest', () => {
    it('falls back to metadata.recommendedOptionId', () => {
      const resolved = resolveSelectedOptionIdFromExecuteRequest({
        existingPlanState: {
          ...planStateWithSkeleton,
          metadata: {
            ...planStateWithSkeleton.metadata,
            recommendedOptionId: 'balanced_1',
          },
        },
      });
      expect(resolved).toBe('balanced_1');
    });

    it('falls back to skeletonOptions.recommendation.optionId', () => {
      const resolved = resolveSelectedOptionIdFromExecuteRequest({
        existingPlanState: planStateWithSkeleton,
      });
      expect(resolved).toBe('balanced_1');
    });

    it('falls back to single skeleton option', () => {
      const singleSet: PlanSkeletonSet = {
        options: [
          {
            id: 'default_1',
            name: '默认',
            dayThemes: [],
            anchors: [],
            transferDays: [],
            rationale: { philosophy: '', tradeoffs: [], strengths: [], weaknesses: [] },
          },
        ],
      };
      const resolved = resolveSelectedOptionIdFromExecuteRequest({
        existingPlanState: {
          plan_id: 'plan_1',
          metadata: { skeletonOptions: singleSet },
        } as PlanState,
      });
      expect(resolved).toBe('default_1');
    });

    it('falls back to applied segment skeletonId when recommendation absent', () => {
      const resolved = resolveSelectedOptionIdFromExecuteRequest({
        existingPlanState: {
          plan_id: 'plan_1',
          metadata: {
            skeletonOptions: {
              options: skeletonSet.options,
            },
          },
          itinerary: {
            tripId: 't1',
            routeDirectionId: 'r1',
            segments: [
              {
                segmentId: 's1',
                dayIndex: 0,
                distanceKm: 0,
                ascentM: 0,
                slopePct: 0,
                metadata: { skeletonId: 'compact_1' },
              },
            ],
          },
        } as PlanState,
      });
      expect(resolved).toBe('compact_1');
    });
  });

  describe('validatePlanningWorkbenchExecuteSemantics', () => {
    it('allows generate without skeletonOptions', () => {
      expect(
        validatePlanningWorkbenchExecuteSemantics({
          context: baseContext,
          userAction: 'generate',
        } as PlanningWorkbenchExecuteDto),
      ).toBeNull();
    });

    it('rejects compare when fewer than 2 options in metadata', () => {
      const error = validatePlanningWorkbenchExecuteSemantics({
        context: baseContext,
        userAction: 'compare',
        existingPlanState: {
          plan_id: 'plan_1',
          metadata: {
            skeletonOptions: {
              options: [{ id: 'only_1', name: '唯一', dayThemes: [], anchors: [], transferDays: [], rationale: { philosophy: '', tradeoffs: [], strengths: [], weaknesses: [] } }],
            },
          },
        } as PlanState,
      } as PlanningWorkbenchExecuteDto);

      expect(error?.code).toBe('MISSING_SKELETON_OPTIONS');
    });

    it('allows compare with existingPlanState.metadata.skeletonOptions only', () => {
      expect(
        validatePlanningWorkbenchExecuteSemantics({
          context: baseContext,
          userAction: 'compare',
          existingPlanState: planStateWithSkeleton,
        } as PlanningWorkbenchExecuteDto),
      ).toBeNull();
    });

    it('allows commit with metadata skeleton + recommendedOptionId', () => {
      expect(
        validatePlanningWorkbenchExecuteSemantics({
          context: baseContext,
          userAction: 'commit',
          existingPlanState: {
            ...planStateWithSkeleton,
            metadata: {
              ...planStateWithSkeleton.metadata,
              recommendedOptionId: 'balanced_1',
            },
          },
        } as PlanningWorkbenchExecuteDto),
      ).toBeNull();
    });

    it('allows commit after generate with skeletonOptions.recommendation only', () => {
      expect(
        validatePlanningWorkbenchExecuteSemantics({
          context: baseContext,
          userAction: 'commit',
          tripId: 'trip_1',
          existingPlanState: planStateWithSkeleton,
        } as PlanningWorkbenchExecuteDto),
      ).toBeNull();
    });

    it('allows commit with single default skeleton after generate', () => {
      expect(
        validatePlanningWorkbenchExecuteSemantics({
          context: baseContext,
          userAction: 'commit',
          existingPlanState: {
            plan_id: 'plan_1',
            metadata: {
              skeletonOptions: {
                options: [
                  {
                    id: 'default_1',
                    name: '均衡型方案',
                    dayThemes: [],
                    anchors: [],
                    transferDays: [],
                    rationale: { philosophy: '', tradeoffs: [], strengths: [], weaknesses: [] },
                  },
                ],
                recommendation: { optionId: 'default_1', reason: '默认' },
              },
            },
            itinerary: {
              tripId: 'trip_1',
              routeDirectionId: 'r1',
              segments: [
                {
                  segmentId: 'day_1_segment_1',
                  dayIndex: 0,
                  distanceKm: 0,
                  ascentM: 0,
                  slopePct: 0,
                  metadata: { skeletonId: 'default_1' },
                },
              ],
            },
          } as PlanState,
        } as PlanningWorkbenchExecuteDto),
      ).toBeNull();
    });

    it('rejects commit when multiple options and no resolvable selection', () => {
      const error = validatePlanningWorkbenchExecuteSemantics({
        context: baseContext,
        userAction: 'commit',
        existingPlanState: {
          plan_id: 'plan_1',
          metadata: {
            skeletonOptions: {
              options: skeletonSet.options,
            },
          },
        } as PlanState,
      } as PlanningWorkbenchExecuteDto);

      expect(error?.code).toBe('MISSING_SELECTED_OPTION');
    });

    it('rejects adjust without paceFeedback', () => {
      const error = validatePlanningWorkbenchExecuteSemantics({
        context: baseContext,
        userAction: 'adjust',
      } as PlanningWorkbenchExecuteDto);

      expect(error?.code).toBe('MISSING_PACE_FEEDBACK');
    });
  });
});
