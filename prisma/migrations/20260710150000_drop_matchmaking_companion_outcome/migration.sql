-- Drop matchmaking blind box + match-learning soft weights (搭子匹配产品线全量下线)
DROP TABLE IF EXISTS "matchmaking_escrows" CASCADE;
DROP TABLE IF EXISTS "matchmaking_requests" CASCADE;
DROP TABLE IF EXISTS "matchmaking_blind_listings" CASCADE;
DROP TABLE IF EXISTS "matching_soft_weight_runs" CASCADE;
DROP TABLE IF EXISTS "matching_soft_weight_configs" CASCADE;

-- Remove companion satisfaction from travel outcomes
ALTER TABLE "travel_outcomes" DROP COLUMN IF EXISTS "companion_satisfaction";
ALTER TABLE "travel_outcomes" DROP COLUMN IF EXISTS "companion_match_score";
ALTER TABLE "travel_outcomes" DROP COLUMN IF EXISTS "companion_count";
ALTER TABLE "travel_outcomes" DROP COLUMN IF EXISTS "satisfied_companions";
ALTER TABLE "travel_outcomes" DROP COLUMN IF EXISTS "companion_satisfaction_detailed";
ALTER TABLE "travel_outcomes" DROP COLUMN IF EXISTS "companion_satisfaction_weight";
