import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TripStatusUnderstanding } from './shared/detail-state.types';
export interface DetailUnderstandStatusInput extends SkillInput {
    tripId: string;
    tripData?: any;
}
export interface DetailUnderstandStatusOutput extends SkillOutput {
    statusUnderstanding: TripStatusUnderstanding;
}
export declare class DetailUnderstandStatusSkill implements Skill<DetailUnderstandStatusInput, DetailUnderstandStatusOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: DetailUnderstandStatusInput): Promise<DetailUnderstandStatusOutput>;
}
