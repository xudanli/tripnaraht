-- Road.is / EnvSyncWorker: cache live condition on spatial segments (async sync, atomic consume in validator).

ALTER TABLE "spatial_domain_segments"
ADD COLUMN IF NOT EXISTS "latest_status" JSONB,
ADD COLUMN IF NOT EXISTS "last_synced_at" TIMESTAMPTZ(6);
