import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';
export interface RouteDirectionListForCountryInput extends SkillInput {
    countryCode: string;
    season?: number;
    intentTags?: string[];
    difficultyLevel?: 'easy' | 'medium' | 'hard';
}
export interface RouteDirectionListForCountryOutput extends SkillOutput {
    routeDirections: Array<{
        id: string;
        uuid: string;
        name: string;
        nameCN: string;
        nameEN?: string;
        distanceKm?: number;
        durationDays?: number;
        tags: string[];
        suitableFor: string[];
        description?: string;
        difficulty?: string;
    }>;
}
export declare class RouteDirectionListForCountrySkill implements Skill<RouteDirectionListForCountryInput, RouteDirectionListForCountryOutput> {
    private readonly routeDirectionsService?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "routeDirection";
    };
    constructor(routeDirectionsService?: RouteDirectionsService);
    execute(input: RouteDirectionListForCountryInput): Promise<RouteDirectionListForCountryOutput>;
    private extractDurationDays;
    private extractDistanceKm;
    private extractSuitableFor;
    private extractDifficulty;
}
