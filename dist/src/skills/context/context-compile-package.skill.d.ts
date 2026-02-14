import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { ContextBuildSkill } from './context-build.skill';
import { ContextCompressSkill } from './context-compress.skill';
import { ContextEvaluateSkill } from './context-evaluate.skill';
import { ToolsSelectSkill } from './tools-select.skill';
import { PlanSelectSlicesSkill } from './plan-select-slices.skill';
import { ContextPackage } from '../../agent/context-engine/types/context-package.types';
export interface ContextCompilePackageInput extends BaseSkillInput {
    inputContext: {
        userQuery: string;
        planningPhase?: string;
        currentState?: {
            tripId?: string;
            phase?: string;
            agent?: string;
            constraints?: string[];
        };
        constraints?: string[];
    };
    options?: {
        enableCompression?: boolean;
        enableEvaluation?: boolean;
        enableToolSelection?: boolean;
        maxTokens?: number;
        targetCompressionRatio?: number;
        tokenBudget?: number;
        includePrivate?: boolean;
    };
}
export interface ContextCompilePackageOutput extends SkillOutput {
    publicContext: {
        summary: string;
        keyFacts: string[];
        toolAllowlist: string[];
    };
    privateContextRef: {
        contextId: string;
        accessToken?: string;
    };
    toolAllowlist: Array<{
        toolName: string;
        reason: string;
        confidence: number;
        priority?: number;
    }>;
    metadata: {
        originalTokenCount: number;
        compressedTokenCount?: number;
        compressionRatio?: number;
        evaluationScore?: number;
        compilationTime: number;
    };
    contextPackage?: ContextPackage;
}
export declare class ContextCompilePackageSkill implements Skill<ContextCompilePackageInput, ContextCompilePackageOutput> {
    private readonly contextBuild?;
    private readonly contextCompress?;
    private readonly contextEvaluate?;
    private readonly toolsSelect?;
    private readonly planSelectSlices?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "rag";
    };
    constructor(contextBuild?: ContextBuildSkill, contextCompress?: ContextCompressSkill, contextEvaluate?: ContextEvaluateSkill, toolsSelect?: ToolsSelectSkill, planSelectSlices?: PlanSelectSlicesSkill);
    execute(input: ContextCompilePackageInput): Promise<ContextCompilePackageOutput>;
    private estimateTokenCount;
    private extractPublicContext;
    private generateAccessToken;
}
