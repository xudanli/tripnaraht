-- Trip detail files tab
CREATE TABLE "trip_files" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'UPLOADED',
    "file_name" VARCHAR(512),
    "mime_type" VARCHAR(128),
    "storage_key" TEXT,
    "file_url" TEXT,
    "file_size_bytes" INTEGER NOT NULL DEFAULT 0,
    "title" VARCHAR(256),
    "description" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "itinerary_item_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trip_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_files_trip_id_category_idx" ON "trip_files"("trip_id", "category");
CREATE INDEX "trip_files_trip_id_status_idx" ON "trip_files"("trip_id", "status");

ALTER TABLE "trip_files" ADD CONSTRAINT "trip_files_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
