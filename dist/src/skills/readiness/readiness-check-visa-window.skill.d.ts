import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { PackStorageService } from '../../trips/readiness/storage/pack-storage.service';
import { ExaIntegrationService } from '../../mcp/exa-integration.service';
export interface ReadinessCheckVisaWindowInput extends SkillInput {
    tripMeta: {
        departureCountryCode: string;
        destinationCountryCode: string;
        departureDate: string;
        returnDate: string;
        nationality?: string;
    };
}
export interface ReadinessCheckVisaWindowOutput extends SkillOutput {
    visaRiskLevel: 'none' | 'low' | 'medium' | 'high';
    recommendedLeadTime: number;
    specialRules: Array<{
        rule: string;
        description: string;
        actionRequired: boolean;
    }>;
    visaStatus?: {
        required: boolean;
        type?: 'VISA_FREE' | 'VISA_REQUIRED' | 'EVISA' | 'VOA' | 'SCHENGEN';
        allowedStay?: string;
        processingTime?: string;
    };
}
export declare class ReadinessCheckVisaWindowSkill implements Skill<ReadinessCheckVisaWindowInput, ReadinessCheckVisaWindowOutput> {
    private readonly prisma;
    private readonly packStorage;
    private readonly exaIntegration?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "readiness";
    };
    constructor(prisma: PrismaService, packStorage: PackStorageService, exaIntegration?: ExaIntegrationService);
    execute(input: ReadinessCheckVisaWindowInput): Promise<ReadinessCheckVisaWindowOutput>;
    private determineVisaStatus;
    private assessRiskLevel;
    private parseProcessingTime;
    private calculateRecommendedLeadTime;
    private extractSpecialRules;
    private extractVisaInfoFromRules;
}
