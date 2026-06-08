import type { SurveyScores } from '../config/survey-questions.config';
import type { OdysseyIntakeProfile } from '../../odyssey-intake/types/odyssey-intake.types';
import { computeDimensionPercents, resolveIdentityCard, resolveMbtiType } from '../../odyssey-intake/engine/intake-scoring.engine';

/** 将五星互评回流至 Odyssey 画像（PRD 5.2 维度验证 → 雷达图微调） */
export function applySurveyScoresToProfile(
  existing: OdysseyIntakeProfile,
  scores: SurveyScores,
): OdysseyIntakeProfile {
  const raw = { ...existing.rawScores };
  const refreshMessages: string[] = [];

  if (scores.q4Spending <= 2) {
    raw.financial_flexibility -= 1;
    refreshMessages.push('消费带宽');
  } else if (scores.q4Spending >= 4) {
    raw.financial_flexibility += 1;
    refreshMessages.push('消费带宽');
  }

  if (scores.q2PaceSync <= 2) {
    raw.planning_index -= 1;
    raw.mbti_j_score -= 1;
    refreshMessages.push('计划硬度');
  }

  if (scores.q3Communication <= 2) {
    raw.compromise_index -= 1;
    refreshMessages.push('沟通顺畅度');
  } else if (scores.q3Communication >= 4) {
    raw.compromise_index += 1;
    raw.mbti_f_score += 1;
    refreshMessages.push('沟通顺畅度');
  }

  const percents = computeDimensionPercents(raw);
  const mbti = resolveMbtiType(percents);

  return {
    ...existing,
    rawScores: raw,
    dimensionPercents: percents,
    mbtiType: mbti,
    card: resolveIdentityCard(raw, percents, mbti),
    profileRefreshPending: refreshMessages.length > 0,
    profileRefreshMessage:
      refreshMessages.length > 0
        ? `基于旅伴互评，你的『${[...new Set(refreshMessages)].join('、')}』画像已更新`
        : undefined,
    lastPeerFeedbackAt: new Date().toISOString(),
  };
}
