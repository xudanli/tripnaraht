-- Match Square: 三档策划协作模式（全托管 / 一起策划 / 一起随便玩）

ALTER TABLE "match_square_recruitment_posts"
    ADD COLUMN IF NOT EXISTS "planning_style" VARCHAR(30);

CREATE INDEX IF NOT EXISTS "match_square_recruitment_posts_planning_style_idx"
    ON "match_square_recruitment_posts"("planning_style");
