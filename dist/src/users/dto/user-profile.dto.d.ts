export declare class UserPreferencesDto {
    preferredAttractionTypes?: string[];
    dietaryRestrictions?: string[];
    preferOffbeatAttractions?: boolean;
    travelPreferences?: {
        pace?: string;
        budget?: string;
        accommodation?: string;
    };
    other?: Record<string, any>;
    nationality?: string;
    residencyCountry?: string;
    tags?: string[];
}
export declare class GetUserProfileResponseDto {
    userId: string;
    preferences?: UserPreferencesDto;
    createdAt: Date;
    updatedAt: Date;
}
export declare class UpdateUserProfileDto {
    preferences?: UserPreferencesDto;
}
