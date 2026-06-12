/** 候选打分 / 过滤的可观测标签（Phase 1.5） */
export const POI_PLANNING_SCORE_REASON = {
  REQUIRED_ANCHOR: 'poi_planning_required_anchor',
  OPTIONAL_BOOST: 'poi_planning_optional_boost',
  EXCLUDED_FILTERED: 'poi_planning_excluded_filtered',
  ANCHOR_MATCHED_EXISTING: 'poi_planning_anchor_matched_existing',
  ANCHOR_FALLBACK_PLACEHOLDER: 'poi_planning_anchor_fallback_placeholder',
  OFF_BEATEN_PATH: 'off_beaten_path_quota',
} as const;
