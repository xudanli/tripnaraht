export declare class TravelerFromTemplateDto {
    type: 'ADULT' | 'ELDERLY' | 'CHILD';
    mobilityTag: 'IRON_LEGS' | 'ACTIVE_SENIOR' | 'CITY_POTATO' | 'LIMITED';
}
export declare class ConstraintsFromTemplateDto {
    withChildren?: boolean;
    withElderly?: boolean;
    earlyRiser?: boolean;
    dietaryRestrictions?: string[];
    avoidCategories?: string[];
}
export declare class CreateTripFromRouteTemplateDto {
    destination: string;
    startDate: string;
    endDate: string;
    totalBudget?: number;
    pacePreference?: 'RELAXED' | 'BALANCED' | 'CHALLENGE';
    intensity?: 'relaxed' | 'balanced' | 'intense';
    transport?: 'walk' | 'transit' | 'car';
    travelers?: TravelerFromTemplateDto[];
    constraints?: ConstraintsFromTemplateDto;
    name?: string;
}
