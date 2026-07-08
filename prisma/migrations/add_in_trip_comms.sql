-- P2: In-Trip Comms (team intercom)

CREATE TABLE IF NOT EXISTS trip_in_trip_comms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  client_seq BIGINT NOT NULL,
  server_seq BIGINT NOT NULL,
  message_type VARCHAR(16) NOT NULL,
  body TEXT NOT NULL,
  payload JSONB,
  client_created_at TIMESTAMPTZ NOT NULL,
  server_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, sender_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_comms_trip_server_seq
  ON trip_in_trip_comms_messages(trip_id, server_seq);

CREATE INDEX IF NOT EXISTS idx_comms_trip_server_created
  ON trip_in_trip_comms_messages(trip_id, server_created_at);

CREATE TABLE IF NOT EXISTS trip_in_trip_comms_peer_presence (
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  last_lat DOUBLE PRECISION,
  last_lng DOUBLE PRECISION,
  accuracy_meters REAL,
  share_location BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);
