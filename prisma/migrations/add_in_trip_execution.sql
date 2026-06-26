-- M7: 行中执行阶段基础表（锚点移交 + 签到 + 离线队列）

CREATE TABLE IF NOT EXISTS trip_in_trip_anchor_snapshots (
  trip_id TEXT PRIMARY KEY REFERENCES "Trip"(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL,
  materialized_at TIMESTAMPTZ NOT NULL,
  materialized_by TEXT
);

CREATE TABLE IF NOT EXISTS trip_mood_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  source VARCHAR(16) NOT NULL DEFAULT 'mood_check',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, user_id, day_number, source)
);

CREATE INDEX IF NOT EXISTS idx_trip_mood_checks_trip_day
  ON trip_mood_checks(trip_id, day_number);

CREATE TABLE IF NOT EXISTS trip_in_trip_offline_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  operation_type VARCHAR(32) NOT NULL,
  payload JSONB NOT NULL,
  client_seq BIGINT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ,
  conflict_status VARCHAR(16)
);

CREATE INDEX IF NOT EXISTS idx_trip_in_trip_offline_queue_trip_sync
  ON trip_in_trip_offline_queue(trip_id, synced_at);
