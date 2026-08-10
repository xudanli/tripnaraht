/**
 * Observation Gap Backlog — 优先修复最影响 Dataset Qualification 的数据缺失。
 */

import type { RankedDataGapV1 } from './rank-data-gaps.util';
import type { CaseReviewRootCauseCategory } from './decision-case-review.util';

export const OBSERVATION_GAP_BACKLOG_SCHEMA =
  'nara.observation_gap_backlog@v1' as const;

export type ObservationGapItemV1 = {
  gapId: string;
  source: 'FUNNEL_DROP' | 'CASE_REVIEW';
  titleZh: string;
  needDataTypeZh: string;
  impactScore: number;
  rootCauseCategory?: CaseReviewRootCauseCategory;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE';
};

export type ObservationGapBacklogV1 = {
  schemaId: typeof OBSERVATION_GAP_BACKLOG_SCHEMA;
  version: 1;
  builtAt: string;
  items: ObservationGapItemV1[];
  /** 研发任务只能来自真实 Top Gap */
  tasksMustComeFromTopGaps: true;
};

export function buildObservationGapBacklog(input: {
  rankedGaps: RankedDataGapV1[];
  caseReviewGaps?: Array<{
    recordId: string;
    rootCauseCategory: CaseReviewRootCauseCategory;
    notesZh?: string;
  }>;
  topN?: number;
}): ObservationGapBacklogV1 {
  const topN = input.topN ?? 5;
  const items: ObservationGapItemV1[] = input.rankedGaps
    .slice(0, topN)
    .map((g, i) => ({
      gapId: `funnel_${g.reasonCode}_${i}`,
      source: 'FUNNEL_DROP' as const,
      titleZh: g.suggestedDevTaskZh,
      needDataTypeZh: g.needDataTypeZh,
      impactScore: g.impactScore,
      status: 'OPEN' as const,
    }));

  for (const c of input.caseReviewGaps ?? []) {
    items.push({
      gapId: `review_${c.recordId}`,
      source: 'CASE_REVIEW',
      titleZh: c.notesZh ?? `Case Review 归因 ${c.rootCauseCategory}`,
      needDataTypeZh: `修复 ${c.rootCauseCategory} 类缺口`,
      impactScore: 10,
      rootCauseCategory: c.rootCauseCategory,
      status: 'OPEN',
    });
  }

  items.sort((a, b) => b.impactScore - a.impactScore);
  return {
    schemaId: OBSERVATION_GAP_BACKLOG_SCHEMA,
    version: 1,
    builtAt: new Date().toISOString(),
    items,
    tasksMustComeFromTopGaps: true,
  };
}
