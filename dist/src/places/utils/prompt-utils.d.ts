import type { NaraHint, TimeSlotActivity } from '../interfaces/nature-poi.interface';
import type { UserPreferencesDto } from '../../users/dto/user-profile.dto';
export type LanguageCode = 'zh-CN' | 'en' | string;
export declare function buildNaraHintBlock(hint?: NaraHint, language?: LanguageCode): string;
export declare function buildTimeSlotBlock(slot: TimeSlotActivity, language: LanguageCode): string;
export interface ItineraryDay {
    day: number;
    date: string;
    timeSlots: TimeSlotActivity[];
}
export declare function buildDayBlock(day: ItineraryDay, language: LanguageCode): string;
export interface JourneyPromptArgs {
    language: LanguageCode;
    intent?: any;
    startDate: string;
    targetDays: number;
    days: ItineraryDay[];
    userCountry?: string;
    destination?: string;
    budgetConfig?: any;
    pacingConfig?: any;
    userPreferences?: UserPreferencesDto;
}
export declare function buildNaraInstruction(language: LanguageCode): string;
export declare function buildTaskInstruction(language: LanguageCode): string;
export declare function buildJourneyPrompt(args: JourneyPromptArgs): string;
