-- Optional backfill: seed user_decision_profiling_profile from latest quiz-completed trips.
-- Only quiz | quiz_edited sources; excludes inferred.

INSERT INTO user_decision_profiling_profile (
  user_id,
  travel_style_answers,
  travel_style_card,
  money_dna_answers,
  money_dna_card,
  last_completed_trip_id,
  last_completed_at,
  quiz_version,
  last_completed_trip_label,
  created_at,
  updated_at
)
SELECT DISTINCT ON (s.user_id)
  s.user_id::uuid,
  COALESCE(ts.quiz_answers, '[]'::jsonb),
  jsonb_build_object(
    'styleType', ts.style_type,
    'styleLabel', ts.style_label,
    'coreDrivers', ts.core_drivers,
    'teamRole', ts.team_role,
    'compatibilityHints', ts.compatibility_hints,
    'userNote', ts.user_note,
    'confidence', ts.confidence,
    'completedAt', ts.completed_at,
    'source', ts.source
  ),
  COALESCE(md.quiz_answers, '[]'::jsonb),
  jsonb_build_object(
    'vector', jsonb_build_object(
      'experienceTendency', md.experience_tendency,
      'qualityTendency', md.quality_tendency,
      'timeValueTendency', md.time_value_tendency,
      'socialScarcityTendency', md.social_scarcity_tendency
    ),
    'budgetRangeMin', md.budget_range_min,
    'budgetRangeMax', md.budget_range_max,
    'consumptionPace', md.consumption_pace,
    'userNote', md.user_note,
    'confidence', md.confidence,
    'completedAt', md.completed_at,
    'source', COALESCE(md.source, 'quiz')
  ),
  s.trip_id,
  GREATEST(ts.completed_at, md.completed_at),
  'ts-md-v1',
  COALESCE(
    NULLIF(TRIM(t.name), ''),
    t.destination
  ) || ' · ' || EXTRACT(MONTH FROM t."startDate")::int || '月',
  NOW(),
  NOW()
FROM trip_decision_profiling_status s
JOIN user_travel_style_cards ts ON ts.user_id::text = s.user_id
JOIN user_money_dna_quiz md ON md.user_id::text = s.user_id
JOIN "Trip" t ON t.id = s.trip_id
WHERE s.quiz_completed = TRUE
  AND ts.source IN ('quiz', 'quiz_edited')
  AND COALESCE(md.source, 'quiz') IN ('quiz', 'quiz_edited')
ORDER BY s.user_id, GREATEST(ts.completed_at, md.completed_at) DESC
ON CONFLICT (user_id) DO UPDATE SET
  travel_style_answers = EXCLUDED.travel_style_answers,
  travel_style_card = EXCLUDED.travel_style_card,
  money_dna_answers = EXCLUDED.money_dna_answers,
  money_dna_card = EXCLUDED.money_dna_card,
  last_completed_trip_id = EXCLUDED.last_completed_trip_id,
  last_completed_at = EXCLUDED.last_completed_at,
  quiz_version = EXCLUDED.quiz_version,
  last_completed_trip_label = EXCLUDED.last_completed_trip_label,
  updated_at = NOW()
WHERE EXCLUDED.last_completed_at >= user_decision_profiling_profile.last_completed_at
   OR user_decision_profiling_profile.last_completed_at IS NULL;
