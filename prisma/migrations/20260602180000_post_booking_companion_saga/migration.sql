-- PRD v1.1 post-booking companion saga persistence
CREATE TABLE IF NOT EXISTS "post_booking_companion_sagas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" VARCHAR(255) NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "trip_id" UUID,
    "phase" VARCHAR(40) NOT NULL,
    "deposit_cents" INTEGER NOT NULL,
    "total_paid_cents" INTEGER,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'cny',
    "payment_intent_id" VARCHAR(255),
    "match_request_id" UUID,
    "refund_cents" INTEGER,
    "stripe_refund_id" VARCHAR(255),
    "forfeit_split" JSONB,
    "compensation_steps" JSONB,
    "lock_version" INTEGER NOT NULL DEFAULT 0,
    "departure_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_booking_companion_sagas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "post_booking_companion_sagas_order_id_key"
    ON "post_booking_companion_sagas"("order_id");
CREATE INDEX IF NOT EXISTS "post_booking_companion_sagas_user_id_idx"
    ON "post_booking_companion_sagas"("user_id");
CREATE INDEX IF NOT EXISTS "post_booking_companion_sagas_phase_idx"
    ON "post_booking_companion_sagas"("phase");
