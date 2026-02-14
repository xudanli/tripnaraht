import { PrismaService } from '../../../../prisma/prisma.service';
import { ItineraryGapType, GapSeverity } from '../interfaces/intent-uncertainty.interface';
import { ResponseItineraryGap } from '../interfaces/trip-planner.interface';
export interface GapDisplayPreferences {
    collapsed: boolean;
    showOnlyCritical: boolean;
    filterTypes: ItineraryGapType[];
    ignoredPatterns: IgnorePattern[];
}
export interface IgnorePattern {
    type: ItineraryGapType;
    timeSlot?: {
        start: string;
        end: string;
    };
    severity?: GapSeverity;
}
export declare class GapPreferencesService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getPreferences(userId: string, tripId?: string, sessionId?: string): Promise<GapDisplayPreferences>;
    updatePreferences(userId: string, preferences: Partial<GapDisplayPreferences>, tripId?: string, sessionId?: string): Promise<GapDisplayPreferences>;
    ignoreGap(userId: string, gapId: string, gapType: ItineraryGapType, pattern?: IgnorePattern, tripId?: string): Promise<void>;
    ignoreGapsBatch(userId: string, gapIds: string[], gapType?: ItineraryGapType, pattern?: IgnorePattern, tripId?: string): Promise<number>;
    isGapIgnored(userId: string, gap: ResponseItineraryGap, tripId?: string): Promise<boolean>;
    filterIgnoredGaps(userId: string, gaps: ResponseItineraryGap[], tripId?: string): Promise<ResponseItineraryGap[]>;
    unignoreGap(userId: string, gapId: string, tripId?: string): Promise<void>;
    unignoreGapsBatch(userId: string, gapIds: string[], tripId?: string): Promise<number>;
    private isValidUUID;
    private matchesPattern;
}
