-- Project Fit documents + appeal metadata support

CREATE TABLE IF NOT EXISTS "project_fit_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "document_type" VARCHAR(32) NOT NULL,
    "file_name" VARCHAR(512) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_url" TEXT,
    "file_size" INTEGER NOT NULL,
    "ocr_status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "ocr_result" JSONB,
    "extracted_fields" JSONB,
    "linked_question_key" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_fit_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_fit_documents_assessment_id_idx"
  ON "project_fit_documents"("assessment_id");

CREATE INDEX IF NOT EXISTS "project_fit_documents_user_document_type_idx"
  ON "project_fit_documents"("user_id", "document_type");

ALTER TABLE "project_fit_documents"
  ADD CONSTRAINT "project_fit_documents_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "project_fit_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
