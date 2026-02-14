import { RouteDirectionCardDto } from './route-direction-card.dto';
import { ScoreBreakdown } from '../interfaces/route-direction-explanation.interface';
export declare class RouteDirectionInteractionDto {
    direction: RouteDirectionCardDto;
    score: number;
    scoreBreakdown: ScoreBreakdown;
    explanation: string;
    whyNotOthers?: {
        topAlternative?: {
            routeDirectionId: number;
            routeDirectionName: string;
            whyNot: string;
            scoreDifference: number;
        };
        commonReasons?: string[];
    };
}
export declare class RouteDirectionInteractionListDto {
    directions: RouteDirectionInteractionDto[];
    countryCode: string;
    month?: number;
    preferences: string[];
}
