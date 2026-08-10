/** 旅行画像 — GET/PATCH /api/mobile/users/me/travel-portrait */

export const TRAVEL_PACE_VALUES = ['relaxed', 'balanced', 'packed'] as const;
export type TravelPaceValue = (typeof TRAVEL_PACE_VALUES)[number];

export const REST_FREQUENCY_VALUES = ['low', 'normal', 'high'] as const;
export type RestFrequencyValue = (typeof REST_FREQUENCY_VALUES)[number];

export const MOBILITY_LIMITATION_VALUES = ['none', 'mild', 'moderate', 'severe'] as const;
export type MobilityLimitationValue = (typeof MOBILITY_LIMITATION_VALUES)[number];

export const NIGHT_DRIVING_ACCEPTANCE_VALUES = ['ok', 'limited', 'avoid'] as const;
export type NightDrivingAcceptanceValue = (typeof NIGHT_DRIVING_ACCEPTANCE_VALUES)[number];

export const GRAVEL_ACCEPTANCE_VALUES = ['low', 'moderate', 'high'] as const;
export type GravelAcceptanceValue = (typeof GRAVEL_ACCEPTANCE_VALUES)[number];

export const DRIVING_PRIORITY_VALUES = ['safety', 'experience'] as const;
export type DrivingPriorityValue = (typeof DRIVING_PRIORITY_VALUES)[number];

export const MOBILE_TRAVEL_PORTRAIT_PREFERENCES_KEY = 'travelPortrait';

export interface TravelPortraitPaceDto {
  travelPace: TravelPaceValue;
  comfortableActivitiesPerDay: number;
  acceptEarlyStart: boolean;
  acceptNightActivities: boolean;
  restFrequency: RestFrequencyValue;
}

export interface TravelPortraitAccessibilityDto {
  motionSickness: boolean;
  mobilityLimitation: MobilityLimitationValue;
  needsFrequentRest: boolean;
  dietaryRestrictions: string[];
  hasChildrenNeeds: boolean;
  hasElderlyNeeds: boolean;
}

export interface TravelPortraitDrivingDefaultsDto {
  comfortableDailyDrivingHours: number;
  nightDrivingAcceptance: NightDrivingAcceptanceValue;
  gravelAcceptance: GravelAcceptanceValue;
  preferAvoidFRoad: boolean;
  priority: DrivingPriorityValue;
}

export interface FitnessProfileRefDto {
  hasProfile: boolean;
  source: string;
}

export interface MobileTravelPortraitResponseDto {
  pace: TravelPortraitPaceDto;
  accessibility: TravelPortraitAccessibilityDto;
  drivingDefaults: TravelPortraitDrivingDefaultsDto;
  fitnessProfileRef: FitnessProfileRefDto;
  updatedAt: string;
}

export interface PatchMobileTravelPortraitDto {
  pace?: Partial<TravelPortraitPaceDto>;
  accessibility?: Partial<TravelPortraitAccessibilityDto>;
  drivingDefaults?: Partial<TravelPortraitDrivingDefaultsDto>;
}

export const DEFAULT_TRAVEL_PORTRAIT: Omit<
  MobileTravelPortraitResponseDto,
  'fitnessProfileRef' | 'updatedAt'
> = {
  pace: {
    travelPace: 'balanced',
    comfortableActivitiesPerDay: 3,
    acceptEarlyStart: true,
    acceptNightActivities: false,
    restFrequency: 'normal',
  },
  accessibility: {
    motionSickness: false,
    mobilityLimitation: 'none',
    needsFrequentRest: false,
    dietaryRestrictions: [],
    hasChildrenNeeds: false,
    hasElderlyNeeds: false,
  },
  drivingDefaults: {
    comfortableDailyDrivingHours: 5,
    nightDrivingAcceptance: 'avoid',
    gravelAcceptance: 'moderate',
    preferAvoidFRoad: true,
    priority: 'safety',
  },
};
