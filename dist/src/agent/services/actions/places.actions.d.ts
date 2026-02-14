import { Action } from '../../interfaces/action.interface';
import { PlacesService } from '../../../places/places.service';
import { VectorSearchService } from '../../../places/services/vector-search.service';
import { EntityResolutionService } from '../../../places/services/entity-resolution.service';
export declare function createPlacesActions(placesService: PlacesService, vectorSearchService?: VectorSearchService, entityResolutionService?: EntityResolutionService): Action[];
