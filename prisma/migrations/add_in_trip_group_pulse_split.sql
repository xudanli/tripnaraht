-- M10: Group Pulse + Split Orchestrator

CREATE TABLE IF NOT EXISTS trip_member_realtime_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  physical_level VARCHAR(16) NOT NULL,
  emotional_level VARCHAR(16) NOT NULL,
  spending_level VARCHAR(16) NOT NULL,
  social_level VARCHAR(16) NOT NULL,
  decision_fatigue VARCHAR(16) NOT NULL,
  confidence_score DOUBLE PRECISION NOT NULL,
  signals JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL,
  UNIQUE (trip_id, user_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_trip_member_realtime_states_trip_day
  ON trip_member_realtime_states(trip_id, day_number);

CREATE TABLE IF NOT EXISTS trip_team_thermometer_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  level VARCHAR(8) NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  factors JSONB NOT NULL DEFAULT '[]',
  computed_at TIMESTAMPTZ NOT NULL,
  UNIQUE (trip_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_trip_team_thermometer_trip_day
  ON trip_team_thermometer_snapshots(trip_id, day_number);

CREATE TABLE IF NOT EXISTS trip_split_party_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  trigger_reason VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'proposed',
  groups JSONB NOT NULL DEFAULT '[]',
  shared_nodes JSONB NOT NULL DEFAULT '[]',
  cost_routing JSONB NOT NULL DEFAULT '{}',
  experience_sharing JSONB NOT NULL DEFAULT '[]',
  reunion JSONB,
  satisfaction JSONB,
  proposed_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trip_split_party_sessions_trip_day_status
  ON trip_split_party_sessions(trip_id, day_number, status);

CREATE TABLE IF NOT EXISTS trip_protective_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  rule_id VARCHAR(32) NOT NULL,
  level INTEGER NOT NULL,
  message_zh TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  split_session_id UUID,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_protective_interventions_trip_status
  ON trip_protective_interventions(trip_id, status);
