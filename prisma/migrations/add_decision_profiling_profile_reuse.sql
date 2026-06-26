-- P0: 决策画像跨行程沿用 — user profile + trip status source tracking

CREATE TABLE IF NOT EXISTS user_decision_profiling_profile (
  user_id UUID PRIMARY KEY,
  travel_style_answers JSONB NOT NULL DEFAULT '[]',
  travel_style_card JSONB NOT NULL DEFAULT '{}',
  money_dna_answers JSONB NOT NULL DEFAULT '[]',
  money_dna_card JSONB NOT NULL DEFAULT '{}',
  last_completed_trip_id TEXT,
  last_completed_at TIMESTAMPTZ,
  quiz_version VARCHAR(32) NOT NULL DEFAULT 'ts-md-v1',
  last_completed_trip_label VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE trip_decision_profiling_status
  ADD COLUMN IF NOT EXISTS travel_style_source VARCHAR(16),
  ADD COLUMN IF NOT EXISTS money_dna_source VARCHAR(16),
  ADD COLUMN IF NOT EXISTS reused_from_trip_id TEXT,
  ADD COLUMN IF NOT EXISTS reused_at TIMESTAMPTZ;

ALTER TABLE user_money_dna_quiz
  ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'quiz';

CREATE INDEX IF NOT EXISTS idx_user_decision_profiling_profile_last_completed
  ON user_decision_profiling_profile(last_completed_at DESC);
