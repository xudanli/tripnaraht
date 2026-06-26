/**
 * 用户侧确定性表达 — PRD §13.5（禁止工程术语直出）
 */

export type UserCertaintyLevel =
  | 'EXCELLENT_CONDITIONS'
  | 'SUITABLE'
  | 'UNCERTAIN'
  | 'NOT_RECOMMENDED';

export interface CertaintyDimension {
  level: UserCertaintyLevel;
  labelZh: string;
  detail: string;
}

export interface ExperienceExplanationCard {
  revision: 'v1';
  overallLevel: UserCertaintyLevel;
  overallLabelZh: string;
  overallSummary: string;
  dimensions: {
    routeFeasibility: CertaintyDimension;
    experienceMatch: CertaintyDimension;
    changingFactors: CertaintyDimension & { factors: string[] };
  };
  whyRecommended: string[];
  risks: string[];
  planBHints: string[];
}

export const USER_CERTAINTY_LABELS: Record<UserCertaintyLevel, string> = {
  EXCELLENT_CONDITIONS: '条件极佳',
  SUITABLE: '适合前往',
  UNCERTAIN: '存在不确定性',
  NOT_RECOMMENDED: '不建议前往',
};
