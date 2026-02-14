import { RouteDirectionCardDto } from '../dto/route-direction-card.dto';
import { RouteDirectionRecommendation } from './route-direction-selector.service';
import { ScoreBreakdown, MatchedSignals } from '../interfaces/route-direction-explanation.interface';
import { RouteDirectionExplainerService } from './route-direction-explainer.service';
export declare class RouteDirectionCardService {
    private readonly explainerService?;
    private readonly logger;
    constructor(explainerService?: RouteDirectionExplainerService);
    toCard(recommendation: RouteDirectionRecommendation, scoreBreakdown?: ScoreBreakdown, matchedSignals?: MatchedSignals): RouteDirectionCardDto;
    private generateWhyThis;
    private getTopScoreReason;
    private generateSuitability;
    private generateTerrainSignature;
    private generateExperienceTags;
    private generateRiskProfileDetail;
    private inferTypicalDuration;
    private generateSimpleTagline;
    private generateSimpleDescription;
    private extractRiskTypes;
}
