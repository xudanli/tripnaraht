import { PackingListContext, EnhancedPackingListItem, Season } from '../types/packing-template.types';
export declare class PackingTemplateService {
    private readonly logger;
    private templateData;
    private guideData;
    constructor();
    private loadTemplateData;
    generatePackingList(context: PackingListContext): EnhancedPackingListItem[];
    private getQuickChecklist;
    private parseQuickChecklistItems;
    private parseItemString;
    private inferCategory;
    private getUserTypeItems;
    private getActivityItems;
    private adjustQuantitiesByDuration;
    private getDurationKey;
    private deduplicateAndMerge;
    inferSeasonFromDate(date: Date): Season;
    getPackingOrderSteps(): any;
    getPreDepartureChecklist(): any;
}
