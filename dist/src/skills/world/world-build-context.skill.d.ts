import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { PrismaService } from '../../prisma/prisma.service';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';
import { ExaIntegrationService } from '../../mcp/exa-integration.service';
export interface WorldBuildContextInput extends SkillInput {
    tripId?: string;
    countryCode?: string;
    season?: number;
    duration?: number;
    partyProfile?: {
        mobilityProfile?: string;
        riskTolerance?: 'low' | 'medium' | 'high';
        fitness?: 'low' | 'medium' | 'high';
        pace?: 'relaxed' | 'moderate' | 'intense';
    };
    routeDirectionId?: string;
}
export interface WorldBuildContextOutput extends SkillOutput {
    world: WorldModelContext;
    missingPieces: {
        demGaps?: string[];
        humanProfileIncomplete?: boolean;
        routeDirectionMissing?: boolean;
        physicalRealityIncomplete?: boolean;
    };
}
export declare class WorldBuildContextSkill implements Skill<WorldBuildContextInput, WorldBuildContextOutput> {
    private readonly prisma;
    private readonly routeDirectionsService?;
    private readonly exaIntegration?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "world";
        inputSchema: {
            dependencies: {
                param: string;
                alternatives: string[];
            }[];
            extractors: {
                tripId: string;
                countryCode: string;
            };
        };
    };
    constructor(prisma: PrismaService, routeDirectionsService?: RouteDirectionsService, exaIntegration?: ExaIntegrationService);
    execute(input: WorldBuildContextInput): Promise<WorldBuildContextOutput>;
    private buildHumanCapabilityModel;
    private buildComplianceEvidence;
}
