import { BrandStory, UserStory, UserStoryType, StoryContext, StoryMaterial, StoryGenerationOptions } from '../interfaces/brand-story.interface';
export declare class BrandStoryService {
    private readonly logger;
    getBrandCoreStory(): BrandStory;
    useBrandStory(context: StoryContext): string;
    getUserStoryMaterial(storyType: UserStoryType): UserStory;
    getAllUserStoryMaterials(): StoryMaterial[];
    generateStoryForContext(options: StoryGenerationOptions): string;
    private generateFirstScreenStory;
    private generateCopyExampleStory;
    private generateUserEducationStory;
    private generateOnboardingStory;
    private generateEncouragementStory;
    private generateDefaultStory;
    private getNegationToAcceptanceStory;
    private getRiskToCapabilityStory;
    private getDoubtToConfidenceStory;
    private getFearToCourageStory;
    private getFailureToLearningStory;
    private getDefaultUserStory;
    private extractTags;
    private selectRelevantStory;
    private adaptStoryForContext;
}
