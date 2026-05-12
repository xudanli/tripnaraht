-- Join key: DecisionCausalityRecordV0.causality_id ↔ decision_outcomes (OPS / learning joins)

ALTER TABLE "decision_outcomes" ADD COLUMN "decision_causality_id" VARCHAR(128);

CREATE INDEX "decision_outcomes_decision_causality_id_idx" ON "decision_outcomes"("decision_causality_id");
