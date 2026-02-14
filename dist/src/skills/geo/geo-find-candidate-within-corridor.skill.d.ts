import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { SpatialReplacementService } from '../../trips/decision/services/spatial-replacement.service';
import { PrismaService } from '../../prisma/prisma.service';
export interface GeoFindCandidateWithinCorridorInput extends BaseSkillInput {
    originalLocation: {
        lat: number;
        lng: number;
    };
    corridorGeom: string | any;
    countryCode: string;
    bufferRadius?: number;
    candidateType?: 'POI' | 'ENTRY' | 'BOTH';
    poiCategory?: string[];
    limit?: number;
}
export interface GeoFindCandidateWithinCorridorOutput extends SkillOutput {
    candidates: Array<{
        poiId?: string;
        entryId?: string;
        location: {
            lat: number;
            lng: number;
        };
        distance: number;
        corridorPosition?: number;
        elevationDelta?: number;
        category?: string;
        tags?: string[];
        popularity?: number;
        metadata?: Record<string, any>;
    }>;
    summary: {
        totalFound: number;
        bufferRadius: number;
        queryTime: number;
    };
}
export declare class GeoFindCandidateWithinCorridorSkill implements Skill<GeoFindCandidateWithinCorridorInput, GeoFindCandidateWithinCorridorOutput> {
    private readonly spatialReplacement?;
    private readonly prisma?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "rag";
        toolGroup: "DOMAIN";
    };
    constructor(spatialReplacement?: SpatialReplacementService, prisma?: PrismaService);
    execute(input: GeoFindCandidateWithinCorridorInput): Promise<GeoFindCandidateWithinCorridorOutput>;
    private findPOIsWithinCorridor;
    private deduplicateCandidates;
}
