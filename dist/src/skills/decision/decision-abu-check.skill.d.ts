import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { AbuStrategy } from '../../trips/decision/strategies/abu-strategy.service';
import { RoutePlanDraft, DemDecisionEvidence } from '../../trips/decision/shared/world-model.types';
import { PhysicalRealityModel } from '../../trips/decision/models/physical-reality.model';
import { HumanCapabilityModel } from '../../trips/decision/models/human-capability.model';
export interface DecisionAbuCheckInput extends SkillInput {
    world: {
        physical: PhysicalRealityModel;
        human: HumanCapabilityModel;
        routeDirection?: any;
    };
    candidatePlan: RoutePlanDraft;
}
export interface DecisionAbuCheckOutput extends SkillOutput {
    allowed: boolean;
    violations: DemDecisionEvidence[];
    decisionLog: Array<{
        persona: string;
        action: string;
        explanation: string;
        reasonCodes: string[];
        timestamp: string;
    }>;
}
export declare class DecisionAbuCheckSkill implements Skill<DecisionAbuCheckInput, DecisionAbuCheckOutput> {
    private readonly abuStrategy;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "decision";
        toolGroup: "DOMAIN";
    };
    constructor(abuStrategy: AbuStrategy);
    execute(input: DecisionAbuCheckInput): Promise<DecisionAbuCheckOutput>;
}
