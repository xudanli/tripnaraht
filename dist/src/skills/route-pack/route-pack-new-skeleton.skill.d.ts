import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { BlockEvidence, BlockDataSource } from '../../agent/context-engine/types/context-package.types';
export interface RoutePack {
    metadata: {
        packId: string;
        routeDirectionId?: number;
        routeDirectionUuid?: string;
        countryCode: string;
        version: string;
        lastVerifiedAt: string;
    };
    blocks: Array<{
        blockId: string;
        type: 'constraint' | 'preference' | 'safety' | 'logistics' | 'seasonality' | 'risk';
        content: string;
        evidence: BlockEvidence[];
        source: BlockDataSource;
        lastVerifiedAt: string;
        metadata?: Record<string, any>;
    }>;
}
export interface RoutePackNewSkeletonInput extends SkillInput {
    routeDirectionId?: number;
    routeDirectionUuid?: string;
    countryCode: string;
    routeDirectionName?: string;
    routeDirectionNameCN?: string;
    routeDirectionNameEN?: string;
    version?: string;
}
export interface RoutePackNewSkeletonOutput extends SkillOutput {
    pack: RoutePack;
    template: {
        type: string;
        description: string;
        requiredFields: string[];
        optionalFields: string[];
    };
}
export declare class RoutePackNewSkeletonSkill implements Skill<RoutePackNewSkeletonInput, RoutePackNewSkeletonOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "countryPack";
    };
    constructor();
    execute(input: RoutePackNewSkeletonInput): Promise<RoutePackNewSkeletonOutput>;
}
