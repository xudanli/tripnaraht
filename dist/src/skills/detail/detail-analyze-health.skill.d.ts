import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TripHealth } from './shared/detail-state.types';
import { TripConflictsService } from '../../trips/services/trip-conflicts.service';
export interface DetailAnalyzeHealthInput extends SkillInput {
    tripId: string;
    tripData?: any;
    planState?: any;
}
export interface DetailAnalyzeHealthOutput extends SkillOutput {
    health: TripHealth;
}
export declare class DetailAnalyzeHealthSkill implements Skill<DetailAnalyzeHealthInput, DetailAnalyzeHealthOutput> {
    private readonly tripConflictsService?;
    private readonly logger;
    constructor(tripConflictsService?: TripConflictsService);
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: DetailAnalyzeHealthInput): Promise<DetailAnalyzeHealthOutput>;
    private analyzeSchedule;
    private analyzeBudget;
    private analyzePace;
    private analyzeFeasibility;
}
