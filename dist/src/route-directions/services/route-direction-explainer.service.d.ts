import { RouteDirectionRecommendation } from './route-direction-selector.service';
import { RouteDirectionExplainer } from '../interfaces/route-direction-explainer.interface';
export declare class RouteDirectionExplainerService {
    private readonly logger;
    generateExplainer(recommendation: RouteDirectionRecommendation): RouteDirectionExplainer;
    private generateTagline;
    private generateDescription;
    private generateSuitability;
    private generateTerrainProfile;
    private generateRiskProfileExplainer;
    private generateKeywords;
    private extractHighlights;
    private inferTypicalDuration;
    private inferDifficultyLevel;
    private inferDifficulty;
    private getAltitudeDescription;
    private getWeatherDescription;
    private getIsolationDescription;
}
