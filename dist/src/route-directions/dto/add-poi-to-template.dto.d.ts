import { PoiPriority } from '../interfaces/route-direction.interface';
export declare class AddPoiToTemplateDto {
    day: number;
    poiId: number;
    required?: boolean;
    priority?: PoiPriority;
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
    priorityReason?: string;
}
