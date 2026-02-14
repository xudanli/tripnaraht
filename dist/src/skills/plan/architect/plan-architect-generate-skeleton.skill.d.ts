import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanContext, PlanSkeletonSet } from '../shared/plan-state.types';
import { WorldBuildContextSkill } from '../../world/world-build-context.skill';
import { LlmService } from '../../../llm/services/llm.service';
import { PlacesService } from '../../../places/places.service';
import { PrismaService } from '../../../prisma/prisma.service';
export interface PlanArchitectGenerateSkeletonInput extends SkillInput {
    context: PlanContext;
    tripId?: string;
    world?: any;
}
export interface PlanArchitectGenerateSkeletonOutput extends SkillOutput {
    skeletonSet: PlanSkeletonSet;
    evidence?: any[];
}
export declare class PlanArchitectGenerateSkeletonSkill implements Skill<PlanArchitectGenerateSkeletonInput, PlanArchitectGenerateSkeletonOutput> {
    private readonly llmService;
    private readonly worldBuildContext?;
    private readonly placesService?;
    private readonly prisma?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    constructor(llmService: LlmService, worldBuildContext?: WorldBuildContextSkill, placesService?: PlacesService, prisma?: PrismaService);
    execute(input: PlanArchitectGenerateSkeletonInput): Promise<PlanArchitectGenerateSkeletonOutput>;
    private extractJSON;
    private tryFixIncompleteJSON;
    private buildPrompt;
    private getFewShotExamples;
    private getShortTripExample;
    private getMediumTripExample;
    private getLongTripExample;
    private enrichSkeletonWithPois;
    private applyTripPoisToSkeleton;
    private buildSemanticQuery;
    private extractSearchKeywords;
    private placeToSkeletonPoi;
    private getDefaultSkeletonSet;
    private validateSeasonalConstraints;
}
