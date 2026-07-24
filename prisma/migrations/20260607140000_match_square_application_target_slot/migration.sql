-- Match Square: team puzzle slot binding on recruitment applications

ALTER TABLE "match_square_recruitment_applications"
    ADD COLUMN IF NOT EXISTS "target_slot_index" INTEGER,
    ADD COLUMN IF NOT EXISTS "target_slot_id" VARCHAR(64),
    ADD COLUMN IF NOT EXISTS "target_slot_label" VARCHAR(255);
