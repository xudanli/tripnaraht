import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TripPlanRequest, ItineraryDay, GateResult } from '../../agent/interfaces/trip-plan.interface';
import { PlanningWorkbenchAgentService } from '../../agent/services/planning-workbench-agent.service';
export interface ItineraryGenerateInput extends SkillInput {
    request: TripPlanRequest;
    research_data?: Record<string, any>;
    gate_result?: GateResult;
}
export interface ItineraryGenerateOutput extends SkillOutput {
    request_id: string;
    days: ItineraryDay[];
    metadata?: {
        total_days: number;
        total_cost_estimate?: number;
        robustness_score?: number;
    };
}
export declare class ItineraryGenerateSkill implements Skill<ItineraryGenerateInput, ItineraryGenerateOutput> {
    private readonly planningWorkbench?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
        inputSchema: {
            required: string[];
        };
    };
    constructor(planningWorkbench?: PlanningWorkbenchAgentService);
    execute(input: ItineraryGenerateInput): Promise<ItineraryGenerateOutput>;
    private calculateRobustnessScore;
}
