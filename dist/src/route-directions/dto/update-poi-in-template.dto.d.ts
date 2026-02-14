import { PoiPriority } from '../interfaces/route-direction.interface';
export declare class UpdatePoiInTemplateDto {
    day: number;
    poiId: number;
    required?: boolean;
    priority?: PoiPriority;
    order?: number;
    durationMinutes?: number;
    priorityReason?: string;
}
export declare class BulkUpdatePoiPriorityDto {
    updates: Array<{
        day: number;
        poiId: number;
        priority: PoiPriority;
        priorityReason?: string;
    }>;
}
