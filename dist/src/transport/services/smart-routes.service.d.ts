import { GoogleRoutesService } from './google-routes.service';
import { AmapRoutesService } from './amap-routes.service';
import { LocationDetectorService } from './location-detector.service';
import { TransportOption } from '../interfaces/transport.interface';
export declare class SmartRoutesService {
    private googleRoutesService;
    private amapRoutesService;
    private locationDetector;
    private readonly logger;
    constructor(googleRoutesService: GoogleRoutesService, amapRoutesService: AmapRoutesService, locationDetector: LocationDetectorService);
    getRoutes(fromLat: number, fromLng: number, toLat: number, toLng: number, travelMode?: 'TRANSIT' | 'WALKING' | 'DRIVING', preferences?: {
        lessWalking?: boolean;
        avoidHighways?: boolean;
        avoidTolls?: boolean;
    }): Promise<TransportOption[]>;
    private convertTravelModeToAmap;
}
