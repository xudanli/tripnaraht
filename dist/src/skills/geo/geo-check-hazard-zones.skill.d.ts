import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { PrismaService } from '../../prisma/prisma.service';
export interface GeoCheckHazardZonesInput extends BaseSkillInput {
    route: Array<{
        lat: number;
        lng: number;
    }>;
    countryCode: string;
    month?: number;
    minLevel?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
    hazardTypes?: Array<'AVALANCHE' | 'MUDSLIDE' | 'FLOOD' | 'ICE' | 'VOLCANIC' | 'OTHER'>;
    bufferRadius?: number;
}
export interface GeoCheckHazardZonesOutput extends SkillOutput {
    hazardZones: Array<{
        zoneId: string;
        type: 'AVALANCHE' | 'MUDSLIDE' | 'FLOOD' | 'ICE' | 'VOLCANIC' | 'OTHER';
        level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
        location?: {
            lat: number;
            lng: number;
        };
        seasonality?: {
            highRiskMonths: number[];
            lowRiskMonths: number[];
        };
        description?: string;
        metadata?: Record<string, any>;
    }>;
    riskAssessment: {
        hasHighRisk: boolean;
        hasMediumRisk: boolean;
        totalHazards: number;
        highRiskCount: number;
        mediumRiskCount: number;
        affectedSegments: number;
    };
    summary: {
        routeLength: number;
        checkedZones: number;
        queryTime: number;
    };
}
export declare class GeoCheckHazardZonesSkill implements Skill<GeoCheckHazardZonesInput, GeoCheckHazardZonesOutput> {
    private readonly prisma?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "rag";
        toolGroup: "DOMAIN";
    };
    constructor(prisma?: PrismaService);
    execute(input: GeoCheckHazardZonesInput): Promise<GeoCheckHazardZonesOutput>;
    private queryHazardZonesFromDatabase;
}
