/**
 * 专利 6.5 步骤 12：满意度驱动在线学习 + Lyapunov 审计
 *
 * 工程实现：写回 userIntent.preferences 权重增量，并追加 history 审计条目。
 * 完整 RL 训练仍委托 OnlineLearningLoopService / RLHF；本模块为专利最小闭环。
 */

import type { DecisionState, DecisionStatePatch, StateHistoryDelta } from '../decision-state.types';

const PREFERENCE_LEARNING_RATE = 0.05;
const SATISFACTION_LYAPUNOV_KEY = '_patentSatisfactionLyapunov';

export interface PatentFeedbackLearningResult {
  patch: DecisionStatePatch;
  historyDelta?: StateHistoryDelta;
}

function normalizeSatisfactionUk(score: number, max = 5): number {
  return Math.max(0, Math.min(1, score / max));
}

function inferActivityPreferenceKey(selectedPlanId?: string): string | undefined {
  if (!selectedPlanId) return undefined;
  if (/spa|indoor/i.test(selectedPlanId)) return 'spaActivities';
  if (/museum|winery/i.test(selectedPlanId)) return 'culturalActivities';
  return undefined;
}

/**
 * 根据 DSO.feedback 应用偏好写回（专利：SPA 偏好 +0.05）。
 */
export function applyPatentFeedbackLearning(dso: DecisionState): PatentFeedbackLearningResult {
  if (process.env.DECISION_OS_PATENT_FEEDBACK_LEARNING !== '1') {
    return { patch: {} };
  }

  const fb = dso.feedback;
  if (!fb?.accepted && fb?.satisfactionScore === undefined) {
    return { patch: {} };
  }

  const satisfaction = fb.satisfactionScore ?? (fb.accepted ? 4.5 : 3);
  const uk = normalizeSatisfactionUk(satisfaction);
  const prevRaw = (dso.userIntent?.preferences as Record<string, unknown> | undefined)?.[SATISFACTION_LYAPUNOV_KEY];
  const uStar = typeof prevRaw === 'object' && prevRaw !== null && typeof (prevRaw as any).uStar === 'number'
    ? (prevRaw as any).uStar
    : uk;
  const uStarNext = Math.max(uStar, uk);
  const lk = Math.max(0, uStar - uk);
  const lkNext = Math.max(0, uStarNext - uk);
  const lyapunovStable = lkNext <= lk + 1e-9;

  const prefKey = inferActivityPreferenceKey(
    dso.optimizationHints?.selectedPlanId ?? dso.optimizationHints?.recommendedAlternativeId,
  );
  const prevPrefs = { ...(dso.userIntent?.preferences ?? {}) } as Record<string, unknown>;
  const prevWeights = (prevPrefs.activityWeights ?? {}) as Record<string, number>;

  if (prefKey && satisfaction >= 4.5) {
    prevWeights[prefKey] = (prevWeights[prefKey] ?? 0) + PREFERENCE_LEARNING_RATE;
  }

  const patch: DecisionStatePatch = {
    userIntent: {
      preferences: {
        ...prevPrefs,
        activityWeights: prevWeights,
        [SATISFACTION_LYAPUNOV_KEY]: { uk, uStar: uStarNext, Lk: lk, LkNext: lkNext, stable: lyapunovStable },
      },
    },
  };

  const historyDelta: StateHistoryDelta = {
    type: 'patent_feedback_learning',
    at: new Date().toISOString(),
    summary: `FEEDBACK_LEARN(satisfaction=${satisfaction}, uk=${uk.toFixed(3)}, Lk+1=${lkNext.toFixed(3)}, stable=${lyapunovStable}${prefKey ? `, pref=${prefKey}+${PREFERENCE_LEARNING_RATE}` : ''})`,
    payload: {
      phase: 'FEEDBACK',
      satisfactionScore: satisfaction,
      uk,
      uStar: uStarNext,
      Lk: lk,
      LkNext: lkNext,
      lyapunovStable,
      preferenceDelta: prefKey ? { key: prefKey, delta: PREFERENCE_LEARNING_RATE } : undefined,
      selectedPlanId:
        dso.optimizationHints?.selectedPlanId ?? dso.optimizationHints?.recommendedAlternativeId,
    },
  };

  return { patch, historyDelta };
}
