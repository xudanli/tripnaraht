import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { PrismaService } from '../../prisma/prisma.service';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';
import { ExaIntegrationService } from '../../mcp/exa-integration.service';
import { DEMEffortMetadataService } from '../../trips/dem/services/dem-effort-metadata.service';
import { CacheService } from '../../common/cache/cache.service';
import { CountryConfigService } from './services/country-config.service';
declare enum ErrorSeverity {
    CRITICAL = "critical",
    HIGH = "high",
    MEDIUM = "medium",
    LOW = "low"
}
declare class WorldModelError extends Error {
    severity: ErrorSeverity;
    recoverable: boolean;
    context?: Record<string, any>;
    constructor(message: string, severity: ErrorSeverity, recoverable?: boolean, context?: Record<string, any>);
}
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
    private readonly demEffortMetadataService?;
    private readonly cacheService?;
    private readonly countryConfigService?;
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
    private readonly cachePrefix;
    private readonly cacheTtlSeconds;
    constructor(prisma: PrismaService, routeDirectionsService?: RouteDirectionsService, exaIntegration?: ExaIntegrationService, demEffortMetadataService?: DEMEffortMetadataService, cacheService?: CacheService, countryConfigService?: CountryConfigService);
    execute(input: WorldBuildContextInput): Promise<WorldBuildContextOutput>;
    private buildHumanCapabilityModel;
    private buildComplianceEvidence;
    private validateInputParameters;
    private generateCacheKey;
    private validateWorldModelContext;
    private extractPointsFromCorridorGeometry;
}
export { WorldModelError, ErrorSeverity };
