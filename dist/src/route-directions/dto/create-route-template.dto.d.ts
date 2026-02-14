import { DayPlan } from '../interfaces/route-direction.interface';
export declare class CreateRouteTemplateDto {
    routeDirectionId: number;
    durationDays: number;
    name?: string;
    nameCN?: string;
    nameEN?: string;
    dayPlans: DayPlan[] | any[];
    defaultPacePreference?: 'RELAXED' | 'BALANCED' | 'INTENSE';
    metadata?: Record<string, any>;
    isActive?: boolean;
}
