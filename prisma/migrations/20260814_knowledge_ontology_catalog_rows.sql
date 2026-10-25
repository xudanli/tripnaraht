-- Knowledge System: durable Ontology catalog rows (types / attributes / predicates)
-- Apply: npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260814_knowledge_ontology_catalog_rows.sql

CREATE TABLE IF NOT EXISTS knowledge_ontology_types (
  type_id           VARCHAR(64) PRIMARY KEY,
  name_en           VARCHAR(128) NOT NULL,
  display_name      VARCHAR(200) NOT NULL,
  kind              VARCHAR(32) NOT NULL,
  domain            VARCHAR(32) NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  schema_ref        VARCHAR(255) NOT NULL DEFAULT '',
  attribute_ids     TEXT[] NOT NULL DEFAULT '{}',
  status            VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  source            VARCHAR(64) NOT NULL DEFAULT 'travel-ontology-contract',
  origin            VARCHAR(32) NOT NULL DEFAULT 'PROJECTION',
  catalog_version   VARCHAR(128) NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_ontology_types_domain_idx
  ON knowledge_ontology_types (domain);
CREATE INDEX IF NOT EXISTS knowledge_ontology_types_kind_idx
  ON knowledge_ontology_types (kind);
CREATE INDEX IF NOT EXISTS knowledge_ontology_types_status_idx
  ON knowledge_ontology_types (status);

CREATE TABLE IF NOT EXISTS knowledge_ontology_attributes (
  attribute_id      VARCHAR(191) PRIMARY KEY,
  name              VARCHAR(128) NOT NULL,
  display_name      VARCHAR(200) NOT NULL,
  label             VARCHAR(200) NOT NULL,
  owner_type_id     VARCHAR(64) NOT NULL,
  domain            VARCHAR(32) NOT NULL,
  value_kind        VARCHAR(32) NOT NULL,
  enum_values       JSONB NOT NULL DEFAULT '[]',
  required          BOOLEAN NOT NULL DEFAULT FALSE,
  description       TEXT NOT NULL DEFAULT '',
  status            VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  origin            VARCHAR(32) NOT NULL DEFAULT 'PROJECTION',
  catalog_version   VARCHAR(128) NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_ontology_attributes_owner_type_idx
  ON knowledge_ontology_attributes (owner_type_id);
CREATE INDEX IF NOT EXISTS knowledge_ontology_attributes_domain_idx
  ON knowledge_ontology_attributes (domain);
CREATE INDEX IF NOT EXISTS knowledge_ontology_attributes_value_kind_idx
  ON knowledge_ontology_attributes (value_kind);
CREATE INDEX IF NOT EXISTS knowledge_ontology_attributes_status_idx
  ON knowledge_ontology_attributes (status);
CREATE INDEX IF NOT EXISTS knowledge_ontology_attributes_display_name_idx
  ON knowledge_ontology_attributes (display_name);

CREATE TABLE IF NOT EXISTS knowledge_ontology_predicates (
  predicate_id      VARCHAR(128) PRIMARY KEY,
  predicate         VARCHAR(128) NOT NULL,
  domain            VARCHAR(32) NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  origin            VARCHAR(32) NOT NULL DEFAULT 'PROJECTION',
  catalog_version   VARCHAR(128) NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_ontology_predicates_domain_idx
  ON knowledge_ontology_predicates (domain);
