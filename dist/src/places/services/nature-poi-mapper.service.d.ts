import { IcelandNaturePoi, TimeSlotActivity, MapOptions } from '../interfaces/nature-poi.interface';
import { NaraHintService } from './nara-hint.service';
export declare class NaturePoiMapperService {
    private naraHintService;
    constructor(naraHintService: NaraHintService);
    mapNaturePoiToActivitySlot(poi: IcelandNaturePoi, options?: MapOptions): TimeSlotActivity;
    private mapSubCategoryToActivityType;
    private getDefaultDurationBySubCategory;
    private buildActivityTagsFromNaturePoi;
    private buildDefaultNotesFromNaturePoi;
    mapMultiplePoisToActivities(pois: IcelandNaturePoi[], options?: MapOptions): TimeSlotActivity[];
}
