import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextPackage, ContextBlock } from '../../agent/context-engine/types/context-package.types';
export interface ContextRegressionTestsInput extends SkillInput {
    currentPackage: ContextPackage;
    previousPackage?: ContextPackage;
    previousSnapshotHash?: string;
    tolerance?: {
        blockCountChange?: number;
        tokenCountChange?: number;
        priorityChange?: number;
    };
}
export interface ContextRegressionTestsOutput extends SkillOutput {
    snapshotHash: string;
    snapshot: {
        timestamp: string;
        blockCount: number;
        totalTokens: number;
        blockKeys: string[];
        blockTypeDistribution: Record<string, number>;
        priorityDistribution: {
            high: number;
            medium: number;
            low: number;
        };
        sourceDistribution: Record<string, number>;
    };
    comparison?: {
        hasChanges: boolean;
        hasRegression: boolean;
        blockCountChange: number;
        tokenCountChange: number;
        addedBlocks: string[];
        removedBlocks: string[];
        changedBlocks: Array<{
            key: string;
            changes: string[];
            previous?: Partial<ContextBlock>;
            current?: Partial<ContextBlock>;
        }>;
        regressions: string[];
    };
}
export declare class ContextRegressionTestsSkill implements Skill<ContextRegressionTestsInput, ContextRegressionTestsOutput> {
    private readonly prisma?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "rag";
    };
    constructor(prisma?: any);
    execute(input: ContextRegressionTestsInput): Promise<ContextRegressionTestsOutput>;
    private createSnapshot;
    private generateHash;
    private compareSnapshots;
}
