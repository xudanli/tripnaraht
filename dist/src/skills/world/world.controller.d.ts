import { WorldBuildContextSkill } from './world-build-context.skill';
export declare class WorldController {
    private readonly worldBuildContextSkill;
    constructor(worldBuildContextSkill: WorldBuildContextSkill);
    buildContext(input: {
        tripId?: string;
        countryCode?: string;
        season?: number;
        duration?: number;
        partyProfile?: {
            mobilityProfile?: string;
            riskTolerance?: 'low' | 'medium' | 'high';
            fitness?: 'low' | 'medium' | 'high';
            pace?: 'relaxed' | 'moderate' | 'intense';
        };
        routeDirectionId?: string;
    }): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
}
