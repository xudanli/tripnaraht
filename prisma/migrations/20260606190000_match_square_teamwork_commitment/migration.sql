ALTER TABLE "match_square_recruitment_applications"
    ADD COLUMN IF NOT EXISTS "teamwork_commitment_accepted" BOOLEAN NOT NULL DEFAULT false;
