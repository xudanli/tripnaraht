import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { RouteDirectionSelectorService, UserIntent } from '../../route-directions/services/route-direction-selector.service';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';
export interface RouteDirectionPickForIntentInput extends SkillInput {
    countryCode: string;
    season: number;
    userIntentTags: string[];
    userIntent?: Partial<UserIntent>;
}
export interface RouteDirectionPickForIntentOutput extends SkillOutput {
    routeDirectionId: string;
    reasoning: string;
    alternatives: Array<{
        routeDirectionId: string;
        name: string;
        score: number;
        reasoning: string;
    }>;
}
export declare class RouteDirectionPickForIntentSkill implements Skill<RouteDirectionPickForIntentInput, RouteDirectionPickForIntentOutput> {
    private readonly routeDirectionSelector?;
    private readonly routeDirectionsService?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "routeDirection";
        inputSchema: {
            required: string[];
            extractors: {
                countryCode: string;
            };
        };
    };
    constructor(routeDirectionSelector?: RouteDirectionSelectorService, routeDirectionsService?: RouteDirectionsService);
    execute(input: RouteDirectionPickForIntentInput): Promise<RouteDirectionPickForIntentOutput>;
}
