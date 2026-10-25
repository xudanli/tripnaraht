-- Knowledge System: durable Entity Identity + Ontology catalog snapshot
-- Apply: npx prisma db execute --file prisma/migrations/20260814_knowledge_entity_identity.sql
-- Or: psql $DATABASE_URL -f prisma/migrations/20260814_knowledge_entity_identity.sql

CREATE TABLE IF NOT EXISTS knowledge_entity_identities (
  canonical_entity_id   VARCHAR(191) PRIMARY KEY,
  entity_type           VARCHAR(64) NOT NULL,
  domain                VARCHAR(32) NOT NULL,
  display_name          VARCHAR(500),
  aliases               TEXT[] NOT NULL DEFAULT '{}',
  country               VARCHAR(8),
  status                VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  description           TEXT,
  properties            JSONB NOT NULL DEFAULT '{}',
  source_refs           JSONB NOT NULL DEFAULT '[]',
  origin                VARCHAR(32) NOT NULL DEFAULT 'ADMIN',
  payload               JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_entity_identities_entity_type_idx
  ON knowledge_entity_identities (entity_type);
CREATE INDEX IF NOT EXISTS knowledge_entity_identities_domain_idx
  ON knowledge_entity_identities (domain);
CREATE INDEX IF NOT EXISTS knowledge_entity_identities_country_idx
  ON knowledge_entity_identities (country);
CREATE INDEX IF NOT EXISTS knowledge_entity_identities_status_idx
  ON knowledge_entity_identities (status);
CREATE INDEX IF NOT EXISTS knowledge_entity_identities_origin_idx
  ON knowledge_entity_identities (origin);
CREATE INDEX IF NOT EXISTS knowledge_entity_identities_display_name_idx
  ON knowledge_entity_identities (display_name);

CREATE TABLE IF NOT EXISTS knowledge_ontology_catalog_snapshots (
  id                    VARCHAR(64) PRIMARY KEY,
  catalog_version       VARCHAR(128) NOT NULL,
  source                VARCHAR(64) NOT NULL DEFAULT 'boot_projection',
  note                  TEXT,
  type_count            INT NOT NULL DEFAULT 0,
  attribute_count       INT NOT NULL DEFAULT 0,
  predicate_count       INT NOT NULL DEFAULT 0,
  payload               JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_ontology_catalog_snapshots_version_idx
  ON knowledge_ontology_catalog_snapshots (catalog_version);
CREATE INDEX IF NOT EXISTS knowledge_ontology_catalog_snapshots_created_at_idx
  ON knowledge_ontology_catalog_snapshots (created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_identity_sync_runs (
  id                    VARCHAR(64) PRIMARY KEY,
  sources               TEXT[] NOT NULL DEFAULT '{}',
  status                VARCHAR(32) NOT NULL,
  stats                 JSONB NOT NULL DEFAULT '{}',
  error_message         TEXT,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS knowledge_identity_sync_runs_started_at_idx
  ON knowledge_identity_sync_runs (started_at DESC);
