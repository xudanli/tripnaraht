-- Knowledge System: durable KnowledgeRelation projections
-- Apply: npx prisma db execute --file prisma/migrations/20260816_knowledge_relations.sql
-- Or: psql $DATABASE_URL -f prisma/migrations/20260816_knowledge_relations.sql

CREATE TABLE IF NOT EXISTS knowledge_relations (
  relation_id  VARCHAR(255) PRIMARY KEY,
  type         VARCHAR(64) NOT NULL,
  from_id      VARCHAR(191) NOT NULL,
  to_id        VARCHAR(191) NOT NULL,
  confidence   DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  source       VARCHAR(32) NOT NULL,
  source_ref   VARCHAR(255),
  country      VARCHAR(8),
  valid_from   TIMESTAMPTZ,
  valid_to     TIMESTAMPTZ,
  metadata     JSONB NOT NULL DEFAULT '{}',
  condition    JSONB NOT NULL DEFAULT '{}',
  payload      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_relations_type_idx
  ON knowledge_relations (type);
CREATE INDEX IF NOT EXISTS knowledge_relations_from_id_idx
  ON knowledge_relations (from_id);
CREATE INDEX IF NOT EXISTS knowledge_relations_to_id_idx
  ON knowledge_relations (to_id);
CREATE INDEX IF NOT EXISTS knowledge_relations_source_idx
  ON knowledge_relations (source);
CREATE INDEX IF NOT EXISTS knowledge_relations_country_idx
  ON knowledge_relations (country);
CREATE INDEX IF NOT EXISTS knowledge_relations_from_to_idx
  ON knowledge_relations (from_id, to_id);
