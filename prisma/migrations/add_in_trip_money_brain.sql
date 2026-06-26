-- M9: 行中 Money Brain（智能记账 + 助推 + 预算再平衡）

CREATE TABLE IF NOT EXISTS trip_smart_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  ledger_entry_id UUID,
  amount_local DOUBLE PRECISION NOT NULL,
  currency_local VARCHAR(8) NOT NULL,
  amount_cny DOUBLE PRECISION NOT NULL,
  exchange_rate DOUBLE PRECISION NOT NULL,
  category VARCHAR(16) NOT NULL,
  merchant VARCHAR(256),
  description TEXT,
  capture_method VARCHAR(16) NOT NULL,
  split_group_id UUID,
  split_rule VARCHAR(16) NOT NULL DEFAULT 'split_aa',
  split_details JSONB NOT NULL DEFAULT '[]',
  bucket_assignment VARCHAR(16) NOT NULL,
  spend_rationality VARCHAR(16),
  nudges_triggered JSONB NOT NULL DEFAULT '[]',
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trip_smart_transactions_trip_recorded
  ON trip_smart_transactions(trip_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_smart_transactions_trip_member
  ON trip_smart_transactions(trip_id, member_id);

CREATE TABLE IF NOT EXISTS trip_budget_rebalance_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE,
  scenario VARCHAR(16) NOT NULL,
  message TEXT NOT NULL,
  proposal JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  user_response VARCHAR(16),
  responded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trip_budget_rebalance_trip_status
  ON trip_budget_rebalance_suggestions(trip_id, status);
