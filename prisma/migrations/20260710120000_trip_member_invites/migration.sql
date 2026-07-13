CREATE TABLE IF NOT EXISTS "trip_member_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "invite_code" VARCHAR(64) NOT NULL,
    "role_slot" VARCHAR(32) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "contact_hint" VARCHAR(255),
    "invited_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_member_invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_member_invites_trip_id_fkey"
        FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "trip_member_invites_invite_code_key"
    ON "trip_member_invites"("invite_code");
CREATE INDEX IF NOT EXISTS "trip_member_invites_trip_id_role_slot_idx"
    ON "trip_member_invites"("trip_id", "role_slot");
CREATE INDEX IF NOT EXISTS "trip_member_invites_invite_code_idx"
    ON "trip_member_invites"("invite_code");
