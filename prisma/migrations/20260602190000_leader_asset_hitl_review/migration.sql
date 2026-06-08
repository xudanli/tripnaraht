-- B 端领队资产 HITL 三级确权
CREATE TABLE IF NOT EXISTS "leader_asset_hitl_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leader_id" VARCHAR(255) NOT NULL,
    "asset_id" VARCHAR(255) NOT NULL,
    "level" VARCHAR(40) NOT NULL,
    "zone" VARCHAR(40) NOT NULL,
    "block_auto_scheduling" BOOLEAN NOT NULL DEFAULT false,
    "notify_leader_mobile" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "extraction" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewer_id" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leader_asset_hitl_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "leader_asset_hitl_reviews_leader_id_idx"
    ON "leader_asset_hitl_reviews"("leader_id");
CREATE INDEX IF NOT EXISTS "leader_asset_hitl_reviews_asset_id_idx"
    ON "leader_asset_hitl_reviews"("asset_id");
CREATE INDEX IF NOT EXISTS "leader_asset_hitl_reviews_level_idx"
    ON "leader_asset_hitl_reviews"("level");
CREATE INDEX IF NOT EXISTS "leader_asset_hitl_reviews_status_idx"
    ON "leader_asset_hitl_reviews"("status");
