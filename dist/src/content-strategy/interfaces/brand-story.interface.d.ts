export type StoryContext = 'first_screen' | 'copy_example' | 'user_education' | 'onboarding' | 'encouragement';
export interface BrandStory {
    problem: string;
    character: string;
    conflict: string;
    turningPoint: string;
    result: string;
    revelation: string;
}
export type UserStoryType = 'NEGATION_TO_ACCEPTANCE' | 'RISK_TO_CAPABILITY' | 'DOUBT_TO_CONFIDENCE' | 'FEAR_TO_COURAGE' | 'FAILURE_TO_LEARNING';
export interface UserStory {
    type: UserStoryType;
    title: string;
    content: string;
    keyPoints: string[];
    applicableScenarios: StoryContext[];
}
export interface StoryMaterial {
    id: string;
    story: UserStory;
    tags: string[];
    usageCount?: number;
}
export interface StoryGenerationOptions {
    context: StoryContext;
    userPersona?: 'RATIONAL_EXPLORER' | 'EXPERIENCE_SEEKER' | 'CONSERVATIVE_SAFETY';
    theme?: string;
    length?: 'SHORT' | 'MEDIUM' | 'LONG';
}
