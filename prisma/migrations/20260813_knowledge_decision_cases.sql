-- Knowledge System: durable DecisionCase store (Episode → Case)
-- Apply with: psql $DATABASE_URL -f prisma/migrations/20260813_knowledge_decision_cases.sql
-- Or: npx prisma db execute --file prisma/migrations/20260813_knowledge_decision_cases.sql

CREATE TABLE IF NOT EXISTS knowledge_decision_cases (
  id                    VARCHAR(64) PRIMARY KEY,
  episode_id            VARCHAR(128) NOT NULL UNIQUE,
  trip_id               VARCHAR(128) NOT NULL,
  country               VARCHAR(8) NOT NULL,
  decision_type         VARCHAR(128) NOT NULL,
  situation_tags        TEXT[] NOT NULL DEFAULT '{}',
  risk_type             VARCHAR(64),
  situation_snapshot_id VARCHAR(128),
  user_choice_action    VARCHAR(32) NOT NULL,
  outcome_label         VARCHAR(32) NOT NULL,
  regret                VARCHAR(16),
  confidence            DOUBLE PRECISION NOT NULL DEFAULT 0,
  payload               JSONB NOT NULL,
  projected_at          TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_decision_cases_country_decision_type_idx
  ON knowledge_decision_cases (country, decision_type);
CREATE INDEX IF NOT EXISTS knowledge_decision_cases_trip_id_projected_at_idx
  ON knowledge_decision_cases (trip_id, projected_at);
CREATE INDEX IF NOT EXISTS knowledge_decision_cases_risk_type_idx
  ON knowledge_decision_cases (risk_type);
CREATE INDEX IF NOT EXISTS knowledge_decision_cases_outcome_label_idx
  ON knowledge_decision_cases (outcome_label);
CREATE INDEX IF NOT EXISTS knowledge_decision_cases_regret_idx
  ON knowledge_decision_cases (regret);
CREATE INDEX IF NOT EXISTS knowledge_decision_cases_user_choice_action_idx
  ON knowledge_decision_cases (user_choice_action);
