import { SmartRoutesService } from '../../../transport/services/smart-routes.service';
import { TravelLeg, GeoPoint } from '../world-model';
import { SenseTools } from '../trip-decision-engine.service';
export declare class SenseToolsAdapter implements SenseTools {
    private readonly smartRoutesService;
    constructor(smartRoutesService: SmartRoutesService);
    getHotelPointForDate(date: string): Promise<GeoPoint | undefined>;
    getTravelLeg(from: GeoPoint, to: GeoPoint): Promise<TravelLeg>;
    private mapTransportMode;
    private fallbackEstimate;
    private calculateDistance;
    private toRad;
}
