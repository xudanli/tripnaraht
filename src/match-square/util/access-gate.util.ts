import type { MatchSquareAccess } from '../types/match-square.types';

/** PRD 2.1 — 未完成测评仅可浏览 */
export function buildMatchSquareAccess(quizComplete: boolean): MatchSquareAccess {
  return {
    canBrowse: true,
    canPost: quizComplete,
    canApply: quizComplete,
    quizComplete,
  };
}
