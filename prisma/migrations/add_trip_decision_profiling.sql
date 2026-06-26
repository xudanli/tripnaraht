-- PDI-4: 轻量决策风格画像与摩擦预警

CREATE TABLE IF NOT EXISTS user_travel_style_cards (
  user_id UUID PRIMARY KEY,
  style_type VARCHAR(32) NOT NULL,
  style_label VARCHAR(64) NOT NULL,
  core_drivers JSONB NOT NULL DEFAULT '[]',
  team_role TEXT NOT NULL,
  compatibility_hints JSONB NOT NULL DEFAULT '[]',
  user_note TEXT,
  quiz_answers JSONB NOT NULL DEFAULT '[]',
  style_scores JSONB NOT NULL DEFAULT '{}',
  source VARCHAR(16) NOT NULL DEFAULT 'quiz',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_money_dna_quiz (
  user_id UUID PRIMARY KEY,
  experience_tendency DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  quality_tendency DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  time_value_tendency DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  social_scarcity_tendency DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  budget_range_min DOUBLE PRECISION,
  budget_range_max DOUBLE PRECISION,
  consumption_pace VARCHAR(16) NOT NULL DEFAULT 'balanced',
  user_note TEXT,
  quiz_answers JSONB NOT NULL DEFAULT '[]',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_decision_profiling_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  travel_style_completed BOOLEAN NOT NULL DEFAULT FALSE,
  money_dna_completed BOOLEAN NOT NULL DEFAULT FALSE,
  quiz_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_decision_profiling_status_trip
  ON trip_decision_profiling_status(trip_id);

CREATE TABLE IF NOT EXISTS trip_friction_snapshots (
  trip_id TEXT PRIMARY KEY REFERENCES "Trip"(id) ON DELETE CASCADE,
  friction_matrix JSONB NOT NULL DEFAULT '[]',
  high_risk_alerts JSONB NOT NULL DEFAULT '[]',
  compatibility JSONB NOT NULL DEFAULT '{}',
  completion_rate INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_split_mechanism_consensus (
  trip_id TEXT PRIMARY KEY REFERENCES "Trip"(id) ON DELETE CASCADE,
  recommended_mode VARCHAR(32) NOT NULL,
  selected_mode VARCHAR(32),
  simulation_input JSONB,
  confirmations JSONB NOT NULL DEFAULT '{}',
  locked_at TIMESTAMPTZ,
  locked_mode VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
