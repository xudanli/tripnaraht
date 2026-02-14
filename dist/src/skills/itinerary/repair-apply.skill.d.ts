import { Skill, SkillInput, SkillOutput, SkillMetadata } from '../interfaces/skill.interface';
import { Itinerary, RequiredAdjustment } from '../../agent/interfaces/trip-plan.interface';
export interface RepairApplyInput extends SkillInput {
    itinerary: Itinerary;
    adjustments: RequiredAdjustment[];
    alternatives?: {
        alternative_pois?: Array<{
            poi_id: string;
            name: string;
            reason: string;
            evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
            evidence_refs?: string[];
        }>;
        alternative_routes?: Array<{
            route_id: string;
            description: string;
            reason: string;
            evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
            evidence_refs?: string[];
        }>;
    };
}
export interface RepairApplyOutput extends SkillOutput {
    repaired: boolean;
    itinerary: Itinerary;
    applied_fixes: Array<{
        adjustment_type: string;
        target?: string;
        description: string;
    }>;
}
export declare class RepairApplySkill implements Skill<RepairApplyInput, RepairApplyOutput> {
    private readonly logger;
    metadata: SkillMetadata;
    constructor();
    execute(input: RepairApplyInput): Promise<RepairApplyOutput>;
    private applyAdjustment;
    private replacePoi;
    private doReplacePoi;
    private replaceSegment;
    private addBuffer;
    private shortenDay;
    private changeTransport;
    private changeMode;
    private changeDates;
    private parseTimeWindow;
}
