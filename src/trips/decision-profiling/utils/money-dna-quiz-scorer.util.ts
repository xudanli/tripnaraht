import type { MoneyDnaCard, MoneyDnaQuizVector, SubmitQuizAnswer } from '../types/decision-profiling.types';
import { MONEY_DNA_QUIZ_QUESTIONS } from '../config/money-dna-quiz.config';

interface Accumulator {
  experienceTendency: number[];
  qualityTendency: number[];
  timeValueTendency: number[];
  socialScarcityTendency: number[];
  frugality: number[];
  budgetMax: number[];
  plannedPace: number;
  spontaneousPace: number;
  flexiblePace: number;
}

function avg(values: number[], fallback = 0.5): number {
  if (values.length === 0) return fallback;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function scoreMoneyDnaVector(answers: SubmitQuizAnswer[]): MoneyDnaQuizVector {
  const acc: Accumulator = {
    experienceTendency: [],
    qualityTendency: [],
    timeValueTendency: [],
    socialScarcityTendency: [],
    frugality: [],
    budgetMax: [],
    plannedPace: 0,
    spontaneousPace: 0,
    flexiblePace: 0,
  };

  for (const answer of answers) {
    const question = MONEY_DNA_QUIZ_QUESTIONS.find((q) => q.id === answer.questionId);
    if (!question) continue;
    const option = question.options.find((o) => o.id === answer.optionId);
    if (!option) continue;

    const s = option.scores;
    if (s.experienceTendency != null) acc.experienceTendency.push(s.experienceTendency);
    if (s.qualityTendency != null) acc.qualityTendency.push(s.qualityTendency);
    if (s.timeValueTendency != null) acc.timeValueTendency.push(s.timeValueTendency);
    if (s.socialScarcityTendency != null) acc.socialScarcityTendency.push(s.socialScarcityTendency);
    if (s.frugality != null) acc.frugality.push(s.frugality);
    if (s.budgetMax != null) acc.budgetMax.push(s.budgetMax);
    if (s.plannedPace != null) acc.plannedPace += s.plannedPace;
    if (s.spontaneousPace != null) acc.spontaneousPace += s.spontaneousPace;
    if (s.flexiblePace != null) acc.flexiblePace += s.flexiblePace;
  }

  const frugalityAvg = avg(acc.frugality, 0.4);

  return {
    experienceTendency: clamp01(avg(acc.experienceTendency, 0.5)),
    qualityTendency: clamp01(avg(acc.qualityTendency, 0.5)),
    timeValueTendency: clamp01(avg(acc.timeValueTendency, 0.5)),
    socialScarcityTendency: clamp01(avg(acc.socialScarcityTendency, 0.5) * (1 - frugalityAvg * 0.3)),
  };
}

export function resolveBudgetRange(answers: SubmitQuizAnswer[]): {
  budgetRangeMin?: number;
  budgetRangeMax?: number;
} {
  const maxValues: number[] = [];
  for (const answer of answers) {
    const question = MONEY_DNA_QUIZ_QUESTIONS.find((q) => q.id === answer.questionId);
    const option = question?.options.find((o) => o.id === answer.optionId);
    if (option?.scores.budgetMax != null) {
      maxValues.push(option.scores.budgetMax);
    }
  }
  if (maxValues.length === 0) return {};
  const max = Math.max(...maxValues);
  const min = Math.min(...maxValues.filter((v) => v < 50000));
  return {
    budgetRangeMin: min < max ? Math.round(min * 0.6) : undefined,
    budgetRangeMax: max < 50000 ? max : undefined,
  };
}

export function resolveConsumptionPace(
  answers: SubmitQuizAnswer[],
): 'planned' | 'spontaneous' | 'balanced' {
  let planned = 0;
  let spontaneous = 0;
  let flexible = 0;

  for (const answer of answers) {
    const question = MONEY_DNA_QUIZ_QUESTIONS.find((q) => q.id === answer.questionId);
    const option = question?.options.find((o) => o.id === answer.optionId);
    if (!option) continue;
    planned += option.scores.plannedPace ?? 0;
    spontaneous += option.scores.spontaneousPace ?? 0;
    flexible += option.scores.flexiblePace ?? 0;
  }

  if (flexible >= planned && flexible >= spontaneous) return 'balanced';
  if (planned > spontaneous) return 'planned';
  if (spontaneous > planned) return 'spontaneous';
  return 'balanced';
}

export function buildMoneyDnaCard(
  userId: string,
  answers: SubmitQuizAnswer[],
  userNote?: string,
): MoneyDnaCard {
  const vector = scoreMoneyDnaVector(answers);
  const budget = resolveBudgetRange(answers);
  const consumptionPace = resolveConsumptionPace(answers);
  const magnitudes = Object.values(vector);
  const spread = Math.max(...magnitudes) - Math.min(...magnitudes);

  return {
    userId,
    vector,
    ...budget,
    consumptionPace,
    userNote,
    confidence: Math.min(1, Math.max(0.4, 0.5 + spread * 0.5)),
    completedAt: new Date().toISOString(),
  };
}

function clamp01(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

export function cosineSimilarity(a: MoneyDnaQuizVector, b: MoneyDnaQuizVector): number {
  const keys = [
    'experienceTendency',
    'qualityTendency',
    'timeValueTendency',
    'socialScarcityTendency',
  ] as const;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const k of keys) {
    dot += a[k] * b[k];
    normA += a[k] * a[k];
    normB += b[k] * b[k];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function meanPairwiseSimilarity(cards: MoneyDnaCard[]): number {
  if (cards.length < 2) return 1;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      sum += cosineSimilarity(cards[i].vector, cards[j].vector);
      count++;
    }
  }
  return count > 0 ? sum / count : 1;
}
