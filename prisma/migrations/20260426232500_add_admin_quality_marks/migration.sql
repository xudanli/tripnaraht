-- Admin quality marks for drift labeling / training

CREATE TABLE IF NOT EXISTS "admin_quality_marks" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" VARCHAR(255),
    "target_type" VARCHAR(32) NOT NULL,
    "target_id" VARCHAR(255) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "comment" TEXT,
    "meta" JSONB,

    CONSTRAINT "admin_quality_marks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_quality_marks_target_idx"
    ON "admin_quality_marks"("target_type", "target_id");

CREATE INDEX IF NOT EXISTS "admin_quality_marks_label_idx"
    ON "admin_quality_marks"("label");

CREATE INDEX IF NOT EXISTS "admin_quality_marks_created_at_idx"
    ON "admin_quality_marks"("created_at");

