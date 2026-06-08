/** PRD 5.2 — 行后互评精简问卷（5 题五星） */

export const REPUTATION_SURVEY_QUESTIONS = [
  {
    id: 'q1_overall',
    order: 1,
    text: '总体而言，你对这次同行的体验打几分？',
    mapsTo: 'overall_satisfaction',
  },
  {
    id: 'q2_pace_sync',
    order: 2,
    text: '你们的旅行节奏（暴走/松弛/作息）有多同步？',
    mapsTo: 'planning_pace_validation',
  },
  {
    id: 'q3_communication',
    order: 3,
    text: '出现分歧（如迷路/行程延误）时，沟通顺畅吗？',
    mapsTo: 'decision_communication_validation',
  },
  {
    id: 'q4_spending',
    order: 4,
    text: '在实际行中花费上，你们的默契程度如何？',
    mapsTo: 'spending_validation',
  },
  {
    id: 'q5_would_again',
    order: 5,
    text: '下次旅行，你还愿意和这个人组队吗？',
    mapsTo: 'retention_intent',
  },
] as const;

export const REPUTATION_PUSH_COPY = {
  title: '旅行已结束，给你的旅伴打个分吧',
  modalPriority: 'global_top',
} as const;

export type SurveyScoreField =
  | 'q1Overall'
  | 'q2PaceSync'
  | 'q3Communication'
  | 'q4Spending'
  | 'q5WouldAgain';

export interface SurveyScores {
  q1Overall: number;
  q2PaceSync: number;
  q3Communication: number;
  q4Spending: number;
  q5WouldAgain: number;
}

export function isValidStarScore(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}
