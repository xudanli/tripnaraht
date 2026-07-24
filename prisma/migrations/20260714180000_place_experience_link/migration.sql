-- Place ↔ Experience（规划层挂靠，无供应商）
CREATE TABLE IF NOT EXISTS "place_experience_link" (
    "id" TEXT NOT NULL,
    "place_id" INTEGER NOT NULL,
    "experience_definition_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "label" VARCHAR(128),
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "place_experience_link_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "place_experience_link_place_id_experience_definition_id_key"
  ON "place_experience_link"("place_id", "experience_definition_id");

CREATE INDEX IF NOT EXISTS "place_experience_link_place_id_is_active_sort_order_idx"
  ON "place_experience_link"("place_id", "is_active", "sort_order");

CREATE INDEX IF NOT EXISTS "place_experience_link_experience_definition_id_idx"
  ON "place_experience_link"("experience_definition_id");

ALTER TABLE "place_experience_link"
  DROP CONSTRAINT IF EXISTS "place_experience_link_place_id_fkey";
ALTER TABLE "place_experience_link"
  ADD CONSTRAINT "place_experience_link_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "Place"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "place_experience_link"
  DROP CONSTRAINT IF EXISTS "place_experience_link_experience_definition_id_fkey";
ALTER TABLE "place_experience_link"
  ADD CONSTRAINT "place_experience_link_experience_definition_id_fkey"
  FOREIGN KEY ("experience_definition_id") REFERENCES "experience_definition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
