import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, TransferSegment } from '../shared/plan-state.types';
export interface PlanTransitBuildTransferGraphInput extends SkillInput {
    planState: PlanState;
}
export interface PlanTransitBuildTransferGraphOutput extends SkillOutput {
    transferGraph: {
        segments: TransferSegment[];
        riskSegments: string[];
        infeasibleSegments: string[];
    };
}
export declare class PlanTransitBuildTransferGraphSkill implements Skill<PlanTransitBuildTransferGraphInput, PlanTransitBuildTransferGraphOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: PlanTransitBuildTransferGraphInput): Promise<PlanTransitBuildTransferGraphOutput>;
}
