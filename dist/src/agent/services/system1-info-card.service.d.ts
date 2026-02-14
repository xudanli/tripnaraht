import { System1InfoCard } from '../interfaces/system1-info-card.interface';
import { AgentState } from '../interfaces/agent-state.interface';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';
import { PlacesService } from '../../places/places.service';
import { UncertaintyModelingService } from '../../data-modeling/services/uncertainty-modeling.service';
export declare class System1InfoCardService {
    private readonly routeDirectionsService?;
    private readonly placesService?;
    private readonly uncertaintyModeling?;
    private readonly logger;
    constructor(routeDirectionsService?: RouteDirectionsService, placesService?: PlacesService, uncertaintyModeling?: UncertaintyModelingService);
    generateInfoCard(routeId: string, state: AgentState): Promise<System1InfoCard>;
    private getRouteData;
    private getCurrentConditions;
    private getWeatherConditions;
    private getCrowdConditions;
    private getSeasonStatus;
    private getTransportationConditions;
    private calculateYourMatch;
    private calculateFitnessMatch;
    private calculateTimeMatch;
    private calculateDifficultyMatch;
    private calculateCostMatch;
    private calculateRiskOverview;
    private mapDifficultyLevel;
    private mapDifficultyToNumber;
    private mapRiskLevel;
}
