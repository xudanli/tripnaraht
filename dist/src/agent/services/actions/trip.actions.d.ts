import { Action } from '../../interfaces/action.interface';
import { TripsService } from '../../../trips/trips.service';
import { ItineraryItemsService } from '../../../itinerary-items/itinerary-items.service';
export declare function createTripActions(tripsService: TripsService, itineraryItemsService?: ItineraryItemsService): Action[];
