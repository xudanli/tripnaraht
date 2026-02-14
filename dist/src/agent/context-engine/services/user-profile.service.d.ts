import { PrismaService } from '../../../prisma/prisma.service';
import { ContextLearningInput } from './context-learning.service';
export interface UserProfile {
    userId: string;
    preferredBlockTypes: string[];
    preferredTopics: string[];
    blockImportanceScores: Record<string, number>;
    lastUpdated: Date;
    sampleSize: number;
    confidence: number;
}
export declare class UserProfileService {
    private readonly prisma?;
    private readonly logger;
    private readonly profileCache;
    private readonly cacheTtl;
    constructor(prisma?: PrismaService);
    learnUserProfile(userId: string, events: ContextLearningInput[]): Promise<UserProfile>;
    private buildUserProfile;
    private extractTopicFromBlockKey;
    getUserProfile(userId: string): Promise<UserProfile | null>;
    private buildUserProfileFromLearningResults;
    getRecommendedContext(userId: string, phase: string, agent: string, globalLearningResult?: {
        recommendedBlocks?: string[];
        confidence: number;
    }): Promise<string[]>;
    private fuseRecommendations;
    private updateUserProfile;
    private createEmptyProfile;
    private cleanExpiredCache;
}
