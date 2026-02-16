-- CreateTable: 决策/优化模块 - 团队协同与成员
CREATE TABLE IF NOT EXISTS "CollaborationTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "decision_weight_mode" VARCHAR(20) NOT NULL,
    "team_constraints" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollaborationTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CollaborationTeamMember" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "team_id" TEXT NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "decision_weight" DOUBLE PRECISION NOT NULL,
    "fitness_level" VARCHAR(20) NOT NULL,
    "experience_level" VARCHAR(20) NOT NULL,
    "personal_weights" JSONB NOT NULL,
    "special_constraints" JSONB,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaborationTeamMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationTeamMember_team_id_user_id_key" ON "CollaborationTeamMember"("team_id", "user_id");
CREATE INDEX IF NOT EXISTS "CollaborationTeam_type_idx" ON "CollaborationTeam"("type");
CREATE INDEX IF NOT EXISTS "CollaborationTeamMember_team_id_idx" ON "CollaborationTeamMember"("team_id");
CREATE INDEX IF NOT EXISTS "CollaborationTeamMember_user_id_idx" ON "CollaborationTeamMember"("user_id");

ALTER TABLE "CollaborationTeamMember" ADD CONSTRAINT "CollaborationTeamMember_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "CollaborationTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
