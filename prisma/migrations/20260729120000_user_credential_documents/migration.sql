-- Personal-center credential vault
CREATE TABLE IF NOT EXISTS "user_credential_documents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "expires_on" DATE,
    "notes" TEXT,
    "storage_key" TEXT NOT NULL,
    "file_url" TEXT,
    "mime_type" VARCHAR(128) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_name" VARCHAR(512) NOT NULL,
    "number_last4" VARCHAR(4),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "user_credential_documents_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "user_credential_documents"
    ADD CONSTRAINT "user_credential_documents_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "user_credential_documents_user_id_type_idx"
  ON "user_credential_documents"("user_id", "type");
CREATE INDEX IF NOT EXISTS "user_credential_documents_user_id_deleted_at_idx"
  ON "user_credential_documents"("user_id", "deleted_at");
