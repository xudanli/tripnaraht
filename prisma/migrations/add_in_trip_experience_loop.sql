-- M11: Experience Loop（微调查 + 行后总结）

CREATE TABLE IF NOT EXISTS trip_experience_pulses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  trigger_type VARCHAR(16) NOT NULL,
  activity_name VARCHAR(256),
  expectation_confirmation INTEGER,
  emotional_value_score INTEGER,
  sense_of_control INTEGER,
  spend_worth_it INTEGER,
  team_atmosphere INTEGER,
  free_text TEXT,
  emotion_polarity DOUBLE PRECISION,
  weight_adjustment_applied JSONB,
  submitted_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trip_experience_pulses_trip_member
  ON trip_experience_pulses(trip_id, member_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_experience_pulses_trip_trigger
  ON trip_experience_pulses(trip_id, trigger_type, submitted_at DESC);
