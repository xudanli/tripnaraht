import { RouteType } from '../interfaces/router.interface';
import { AgentState } from '../interfaces/agent-state.interface';
import { PlacesService } from '../../places/places.service';
import { TripsService } from '../../trips/trips.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import { EnhancedChatService } from '../../rag/services/enhanced-chat.service';
import { System1InfoCardService } from './system1-info-card.service';
import { System1Result } from '../interfaces/system1-info-card.interface';
export declare class System1ExecutorService {
    private placesService;
    private tripsService;
    private itineraryItemsService;
    private enhancedChat?;
    private infoCardService?;
    private readonly logger;
    constructor(placesService: PlacesService, tripsService: TripsService, itineraryItemsService: ItineraryItemsService, enhancedChat?: EnhancedChatService, infoCardService?: System1InfoCardService);
    execute(route: RouteType, state: AgentState): Promise<System1Result>;
    private shouldGenerateInfoCard;
    private generateInfoCard;
    private extractRouteId;
    private executeAPI;
    private executeRAG;
    private isRouteQuestion;
    private extractRouteContext;
}
