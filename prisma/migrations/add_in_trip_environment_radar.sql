-- M8: 行中环境感知引擎（Environment Radar）

CREATE TABLE IF NOT EXISTS trip_environment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  type VARCHAR(16) NOT NULL,
  severity VARCHAR(8) NOT NULL,
  description TEXT NOT NULL,
  affected_items JSONB NOT NULL DEFAULT '[]',
  alternative_plans JSONB NOT NULL DEFAULT '[]',
  cascade_impact JSONB NOT NULL DEFAULT '[]',
  runtime_graph JSONB,
  resolution JSONB,
  silent_vote_id UUID,
  detected_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  source_observed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_environment_events_trip_status
  ON trip_environment_events(trip_id, status, severity);

CREATE TABLE IF NOT EXISTS trip_day_vulnerability_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  date DATE NOT NULL,
  stability_score DOUBLE PRECISION NOT NULL,
  severity VARCHAR(8) NOT NULL,
  factors JSONB NOT NULL DEFAULT '[]',
  computed_at TIMESTAMPTZ NOT NULL,
  UNIQUE (trip_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_trip_day_vulnerability_trip
  ON trip_day_vulnerability_scores(trip_id, day_number);
