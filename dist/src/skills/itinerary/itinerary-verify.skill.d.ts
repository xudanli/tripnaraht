import { Skill, SkillInput, SkillOutput, SkillMetadata } from '../interfaces/skill.interface';
import { Itinerary } from '../../agent/interfaces/trip-plan.interface';
export interface ItineraryVerifyInput extends SkillInput {
    itinerary: Itinerary;
    research_data?: Record<string, any>;
}
export interface ItineraryVerifyOutput extends SkillOutput {
    verified: boolean;
    issues: Array<{
        type: 'OPENING_HOURS_CONFLICT' | 'TRANSFER_BUFFER_INSUFFICIENT' | 'REACHABILITY_ISSUE' | 'FATIGUE_THRESHOLD_EXCEEDED' | 'TIME_WINDOW_OVERLAP';
        severity: 'ERROR' | 'WARNING';
        item_id?: string;
        day?: string;
        message: string;
        suggestion?: string;
    }>;
    summary: {
        total_issues: number;
        error_count: number;
        warning_count: number;
    };
}
export declare class ItineraryVerifySkill implements Skill<ItineraryVerifyInput, ItineraryVerifyOutput> {
    private readonly logger;
    metadata: SkillMetadata;
    constructor();
    execute(input: ItineraryVerifyInput): Promise<ItineraryVerifyOutput>;
    private verifyOpeningHours;
    private verifyTransferBuffers;
    private verifyReachability;
    private verifyFatigueThresholds;
    private verifyTimeWindowOverlaps;
    private parseTimeWindow;
}
