import { PrismaService } from '../../../../prisma/prisma.service';
import { UserPreferences } from '../../planning-assistant/interfaces/planning-assistant.interface';
export interface LearnedPreference {
    category: string;
    key: string;
    value: any;
    confidence: number;
    sourceCount: number;
    lastUpdated: Date;
}
export interface UserPreferenceProfile {
    userId: string;
    preferences: LearnedPreference[];
    tripHistory: {
        totalTrips: number;
        destinations: string[];
        averageBudget: number;
        averageDays: number;
        preferredTravelersCount: number;
    };
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
}
export interface PreferenceLearningInput {
    userId: string;
    action: 'destination_selected' | 'plan_generated' | 'plan_confirmed' | 'trip_completed' | 'preference_stated';
    data: {
        destination?: string;
        destinationType?: string[];
        budget?: number;
        days?: number;
        travelers?: {
            adults?: number;
            children?: number;
        };
        activities?: string[];
        pace?: 'relaxed' | 'moderate' | 'intensive';
        season?: string;
        rating?: number;
    };
}
export declare class PreferenceLearningService {
    private readonly prisma?;
    private readonly logger;
    private readonly profileCache;
    private readonly learningWeights;
    constructor(prisma?: PrismaService);
    learnFromAction(input: PreferenceLearningInput): Promise<void>;
    getProfile(userId: string): Promise<UserPreferenceProfile | null>;
    private saveProfile;
    private createEmptyProfile;
    private updatePreference;
    private extractKey;
    private isSameKey;
    private calculateRunningAverage;
    private prunePreferences;
    getAsUserPreferences(userId: string): Promise<Partial<UserPreferences> & {
        days?: number;
        pace?: string;
    }>;
    getPreferenceSummary(userId: string): Promise<{
        summary: string;
        summaryCN: string;
        topPreferences: {
            label: string;
            labelCN: string;
            value: string;
        }[];
    }>;
    private getCategoryLabel;
    private formatPreferenceValue;
    mergeWithLearnedPreferences(userId: string, explicitPreferences: Partial<UserPreferences>): Promise<UserPreferences>;
    clearProfile(userId: string): Promise<void>;
}
