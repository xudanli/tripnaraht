export declare class PreferencesDto {
    budget?: {
        total: number;
        currency: string;
    };
    travelers?: {
        adults: number;
        children?: number;
    };
    activities?: string[];
    travelStyle?: string;
}
export declare class RecommendationFiltersDto {
    countryCode?: string;
    region?: string;
    excludeCountries?: string[];
}
export declare class RecommendationsRequestDto {
    sessionId?: string;
    userId?: string;
    naturalLanguageDescription?: string;
    preferences?: PreferencesDto;
    filters?: RecommendationFiltersDto;
    implicitSignals?: {
        browsedDestinations?: string[];
        clickedPlans?: string[];
        currentLocation?: {
            lat: number;
            lng: number;
        };
        timeContext?: {
            season?: string;
            isHoliday?: boolean;
        };
    };
    limit?: number;
    language?: 'en' | 'zh';
}
