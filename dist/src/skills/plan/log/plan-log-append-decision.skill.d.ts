import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { DecisionLogRef } from '../shared/plan-state.types';
export interface PlanLogAppendDecisionInput extends SkillInput {
    decision_id: string;
    diff: any;
    evidence_refs: string[];
    rule_version: string;
    decisionMaker?: string;
    reason?: string;
}
export interface PlanLogAppendDecisionOutput extends SkillOutput {
    decisionLogRef: DecisionLogRef;
}
export declare class PlanLogAppendDecisionSkill implements Skill<PlanLogAppendDecisionInput, PlanLogAppendDecisionOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: PlanLogAppendDecisionInput): Promise<PlanLogAppendDecisionOutput>;
}
