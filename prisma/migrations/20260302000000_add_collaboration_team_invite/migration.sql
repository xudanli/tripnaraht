-- CreateTable: 决策/优化模块 - 团队邀请链接
CREATE TABLE IF NOT EXISTS "CollaborationTeamInvite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "team_id" TEXT NOT NULL,
    "invite_token" VARCHAR(64) NOT NULL,
    "inviter_user_id" VARCHAR(255) NOT NULL,
    "trip_id" VARCHAR(255),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 0,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaborationTeamInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationTeamInvite_invite_token_key" ON "CollaborationTeamInvite"("invite_token");
CREATE INDEX IF NOT EXISTS "CollaborationTeamInvite_team_id_idx" ON "CollaborationTeamInvite"("team_id");
CREATE INDEX IF NOT EXISTS "CollaborationTeamInvite_invite_token_idx" ON "CollaborationTeamInvite"("invite_token");
CREATE INDEX IF NOT EXISTS "CollaborationTeamInvite_expires_at_idx" ON "CollaborationTeamInvite"("expires_at");

ALTER TABLE "CollaborationTeamInvite" ADD CONSTRAINT "CollaborationTeamInvite_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "CollaborationTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
