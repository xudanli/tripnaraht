-- AgentActionLog stage timestamps + AgentFinancialHold amount/currency

ALTER TABLE "agent_action_logs" ADD COLUMN IF NOT EXISTS "committed_at" TIMESTAMPTZ(6);
ALTER TABLE "agent_action_logs" ADD COLUMN IF NOT EXISTS "side_effect_done_at" TIMESTAMPTZ(6);
ALTER TABLE "agent_action_logs" ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMPTZ(6);

ALTER TABLE "agent_financial_holds" ADD COLUMN IF NOT EXISTS "amount" DOUBLE PRECISION;
ALTER TABLE "agent_financial_holds" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(8);

