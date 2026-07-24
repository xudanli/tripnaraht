import {
  canRecommendOption,
  detectDataConflict,
  isGenericScheduleConflictProblem,
  pickValidatedRecommendation,
  buildNoValidatedRecommendationSelection,
  toRecommendGatePreview,
} from '../contracts/generic-conflict-ai';
import { getDecisionCaseAIContract } from '../contracts/decision-case-ai-contracts';
import { selectDecisionSpaceInsight } from './decision-space-insight.selector';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';

function lunchProblem(): UnifiedDecisionProblemListItem {
  return {
    problemId: 'dp_lunch_t',
    semanticKey: 'same_day_travel:lunch_window',
    instanceKey: 'dp_lunch_t',
    type: 'TIME_CONFLICT',
    dimension: 'TIME',
    enforcement: 'REQUIRE_ADJUSTMENT',
    phase: 'PLANNING',
    affectsPlan: true,
    workflowStatus: 'WAITING_DECISION',
    executionStatus: 'NOT_REQUIRED',
    title: '午餐时间冲突',
    summary: '上一活动预计延迟至 12:30，占用原午餐时间。',
    scope: { tripId: 'trip_t' },
    evidenceSummary: { count: 1, freshness: 'FRESH', confidence: 0.8 },
    actionability: {
      requiresAction: true,
      recommendedAction: 'ALTERNATIVE',
      allowedActions: ['ALTERNATIVE'],
      writeChain: 'CONSTRAINT_WRITEBACK',
    },
    occurrenceCount: 1,
    detectors: [{ detectorId: 'lunch', sourceRefIds: [] }],
    origin: { authority: 'CANONICAL', primaryDetector: 'lunch' },
  };
}

describe('generic conflict recommend gate', () => {
  it('canRecommendOption requires matching problem + resolved + no blockers', () => {
    const problem = { id: 'dp_1', planVersion: 'pv1' };
    const option = { optionId: 'opt_shift', allowed: true };
    expect(
      canRecommendOption(problem, option, {
        problemId: 'dp_1',
        optionId: 'opt_shift',
        resolved: true,
        remainingBlockingIssues: [],
        planVersion: 'pv1',
      }),
    ).toBe(true);
    expect(
      canRecommendOption(problem, option, {
        problemId: 'dp_1',
        optionId: 'opt_shift',
        resolved: true,
        remainingBlockingIssues: ['still_overlap'],
        planVersion: 'pv1',
      }),
    ).toBe(false);
    expect(
      canRecommendOption(problem, option, {
        problemId: 'dp_other',
        optionId: 'opt_shift',
        resolved: true,
        remainingBlockingIssues: [],
        planVersion: 'pv1',
      }),
    ).toBe(false);
  });

  it('detects 17:00 vs 12:30 style DATA_CONFLICT', () => {
    expect(
      detectDataConflict({
        factSummaries: ['活动延迟至 17:00'],
        recommendationText: '午餐后移，按 12:30 衔接',
      }),
    ).toBe(true);
    expect(
      detectDataConflict({
        factSummaries: ['延迟至 12:30'],
        recommendationText: '午餐后移 30 分钟（自 12:30）',
      }),
    ).toBe(false);
  });

  it('maps schedule conflict to CANONICAL.SCHEDULE_CONFLICT contract', () => {
    const c = getDecisionCaseAIContract({
      hasDecisionCase: false,
      type: 'TIME_CONFLICT',
      title: '午餐时间冲突',
      problemId: 'dp_lunch_t',
    });
    expect(c.semanticKey).toBe('CANONICAL.SCHEDULE_CONFLICT');
    expect(c.maxChineseChars).toBe(55);
  });

  it('selector without validatedPreviews → NO_VALIDATED_RECOMMENDATION', () => {
    const focused = lunchProblem();
    expect(
      isGenericScheduleConflictProblem({
        problemId: focused.problemId,
        semanticKey: focused.semanticKey,
        type: focused.type,
        title: focused.title,
        hasDecisionCase: false,
      }),
    ).toBe(true);

    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      explicitAsk: true,
      surface: 'DETAIL',
      optionsView: {
        schemaId: 'tripnara.unified_decision_options@v2',
        tripId: 'trip_t',
        problemId: focused.problemId,
        generatedAt: new Date().toISOString(),
        actions: [
          {
            actionId: 'shift_lunch_30',
            type: 'ALTERNATIVE',
            source: 'RULE_ENGINE',
            title: '午餐后移 30 分钟',
            summary: '…',
            requiresConfirmation: true,
            allowed: true,
          },
        ],
        actionability: {
          requiresAction: true,
          allowedActions: ['ALTERNATIVE'],
          writeChain: 'CONSTRAINT_WRITEBACK',
        },
      },
    });

    expect(insight.modeReason).toBe('NO_VALIDATED_RECOMMENDATION');
    expect(insight.recommendation).toBeUndefined();
    expect(insight.observationSummary).toContain('可验证');
  });

  it('selector with validated preview may recommend', () => {
    const focused = lunchProblem();
    const insight = selectDecisionSpaceInsight({
      openProblems: [focused],
      focused,
      explicitAsk: true,
      surface: 'DETAIL',
      planVersion: 'pv1',
      validatedPreviews: [
        {
          problemId: focused.problemId,
          optionId: 'shift_lunch_30',
          resolved: true,
          remainingBlockingIssues: [],
          planVersion: 'pv1',
          claimedLabels: ['12:30'],
        },
      ],
      optionsView: {
        schemaId: 'tripnara.unified_decision_options@v2',
        tripId: 'trip_t',
        problemId: focused.problemId,
        generatedAt: new Date().toISOString(),
        actions: [
          {
            actionId: 'shift_lunch_30',
            type: 'ALTERNATIVE',
            source: 'RULE_ENGINE',
            title: '午餐后移 30 分钟',
            summary: '…',
            requiresConfirmation: true,
            allowed: true,
          },
        ],
        actionability: {
          requiresAction: true,
          allowedActions: ['ALTERNATIVE'],
          writeChain: 'CONSTRAINT_WRITEBACK',
        },
      },
    });

    expect(insight.recommendation?.recommendedOptionId).toBe('shift_lunch_30');
    expect(insight.recommendation?.summary).toContain('午餐后移');
  });

  it('toRecommendGatePreview marks unresolved when repair blocks', () => {
    const p = toRecommendGatePreview({
      problemId: 'dp_1',
      planVersion: 'pv1',
      preview: {
        problemId: 'dp_1',
        actionId: 'opt_a',
        action: { allowed: true, title: '后移' },
        repairPreview: { remainingBlockingIssues: ['overlap'] },
      },
    });
    expect(p.resolved).toBe(false);
    expect(pickValidatedRecommendation({
      problem: { id: 'dp_1', planVersion: 'pv1' },
      options: [{ optionId: 'opt_a', allowed: true }],
      previews: [p],
    })).toBeNull();
  });

  it('buildNoValidatedRecommendationSelection shape', () => {
    const s = buildNoValidatedRecommendationSelection({
      focusedProblemId: 'dp_x',
      conflictSummary: '冲突',
    });
    expect(s.modeReason).toBe('NO_VALIDATED_RECOMMENDATION');
    expect(s.recommendation).toBeUndefined();
  });
});
