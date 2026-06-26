import {
  DECISION_STYLE_TYPES,
  type DecisionStyleType,
  type SubmitQuizAnswer,
  type TravelStyleCard,
} from '../types/decision-profiling.types';
import {
  DECISION_STYLE_LABELS,
  DECISION_STYLE_META,
  TRAVEL_STYLE_QUIZ_QUESTIONS,
} from '../config/travel-style-quiz.config';

export function scoreDecisionStyles(
  answers: SubmitQuizAnswer[],
): Record<DecisionStyleType, number> {
  const scores = Object.fromEntries(
    DECISION_STYLE_TYPES.map((s) => [s, 0]),
  ) as Record<DecisionStyleType, number>;

  for (const answer of answers) {
    const question = TRAVEL_STYLE_QUIZ_QUESTIONS.find((q) => q.id === answer.questionId);
    if (!question) continue;
    const option = question.options.find((o) => o.id === answer.optionId);
    if (!option) continue;
    for (const [key, delta] of Object.entries(option.scores)) {
      if (key in scores) {
        scores[key as DecisionStyleType] += delta;
      }
    }
  }

  return scores;
}

export function pickDominantStyle(
  scores: Record<DecisionStyleType, number>,
): { styleType: DecisionStyleType; confidence: number } {
  const ranked = [...DECISION_STYLE_TYPES]
    .map((s) => ({ style: s, score: scores[s] }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1]?.score ?? 0;
  const total = ranked.reduce((sum, r) => sum + r.score, 0) || 1;
  const margin = top.score - second;
  const confidence = Math.min(1, Math.max(0.35, margin / total + top.score / (total * 2)));

  return { styleType: top.style, confidence: Math.round(confidence * 100) / 100 };
}

export function buildTravelStyleCard(
  userId: string,
  answers: SubmitQuizAnswer[],
  userNote?: string,
): TravelStyleCard {
  const scores = scoreDecisionStyles(answers);
  const { styleType, confidence } = pickDominantStyle(scores);
  const meta = DECISION_STYLE_META[styleType];

  return {
    userId,
    styleType,
    styleLabel: DECISION_STYLE_LABELS[styleType],
    coreDrivers: meta.coreDrivers,
    teamRole: meta.teamRole,
    compatibilityHints: meta.compatibilityHints,
    userNote,
    confidence,
    completedAt: new Date().toISOString(),
    source: userNote ? 'quiz_edited' : 'quiz',
  };
}

export function toTeamStyleView(
  card: TravelStyleCard,
  displayName: string,
): { userId: string; displayName: string; styleLabel: string; compatibilityHints: string[] } {
  return {
    userId: card.userId,
    displayName,
    styleLabel: card.styleLabel,
    compatibilityHints: card.compatibilityHints,
  };
}
