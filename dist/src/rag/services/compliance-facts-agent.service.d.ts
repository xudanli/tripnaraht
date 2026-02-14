import { PrismaService } from '../../prisma/prisma.service';
import { ChunkRetrievalService } from './chunk-retrieval.service';
import { LlmExtractionService } from './llm-extraction.service';
export interface RailPassRule {
    passType: 'EURAIL_GLOBAL' | 'EURAIL_ONE_COUNTRY' | 'INTERRAIL_GLOBAL' | 'INTERRAIL_ONE_COUNTRY';
    eligibleTraveler: {
        regions: string[];
        citizenship?: string[];
    };
    validCountries: string[];
    requiresReservation: boolean;
    seatReservationFee?: number;
    notValidOn: string[];
    seasonalRestrictions?: {
        months: number[];
        reason: string;
    };
}
export interface TrailAccessRule {
    trailId: string;
    requiresPermit: boolean;
    permitType?: 'DAILY' | 'SEASONAL' | 'ANNUAL';
    permitCost?: number;
    bookingRequired: boolean;
    bookingAdvanceDays?: number;
    seasonalClosure?: {
        months: number[];
        reason: string;
    };
}
export interface PermitRequirement {
    countryCode: string;
    region?: string;
    activityType: 'HIKING' | 'CAMPING' | 'MOUNTAINEERING' | 'WILD_CAMPING';
    requiresPermit: boolean;
    permitDetails?: {
        whereToGet: string;
        cost: number;
        advanceBooking: boolean;
        validityPeriod: string;
    };
}
export declare class ComplianceFactsAgent {
    private readonly prisma;
    private readonly chunkRetrieval;
    private readonly llmExtraction;
    private readonly logger;
    constructor(prisma: PrismaService, chunkRetrieval: ChunkRetrievalService, llmExtraction: LlmExtractionService);
    extractRailPassRules(passType: string, countryCode: string): Promise<RailPassRule[]>;
    extractTrailAccessRules(trailId: string, countryCode: string): Promise<TrailAccessRule[]>;
    refreshComplianceRules(): Promise<void>;
}
