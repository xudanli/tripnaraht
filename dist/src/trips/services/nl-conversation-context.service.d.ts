import { RedisService } from '../../redis/redis.service';
export interface ConversationMessageMetadata {
    needsClarification?: boolean;
    suggestedQuestions?: string[];
    plannerResponseBlocks?: any[];
    clarificationQuestions?: any[];
    parsedParams?: Record<string, any>;
    showConfirmCard?: boolean;
    questionAnswers?: Record<string, string | string[] | number | boolean | null>;
    tripId?: string;
    success?: boolean;
    [key: string]: any;
}
export interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    metadata?: ConversationMessageMetadata;
}
export interface NLConversationContext {
    sessionId: string;
    userId: string;
    messages: ConversationMessage[];
    conversationContext?: Record<string, any>;
    partialParams?: Record<string, any>;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
}
export declare class NLConversationContextService {
    private readonly redisService?;
    private readonly logger;
    private readonly cachePrefix;
    private readonly defaultTtl;
    private readonly memoryCache;
    private readonly userClearedFlags;
    constructor(redisService?: RedisService);
    getOrCreateSession(sessionId: string | undefined, userId: string): Promise<string>;
    getContext(sessionId: string, userId: string): Promise<NLConversationContext | null>;
    saveContext(context: NLConversationContext): Promise<void>;
    addMessage(sessionId: string, userId: string, role: 'user' | 'assistant', content: string, metadata?: ConversationMessageMetadata): Promise<NLConversationContext>;
    updateContext(sessionId: string, userId: string, updates: {
        conversationContext?: Record<string, any>;
        partialParams?: Record<string, any>;
    }): Promise<NLConversationContext>;
    deleteSession(sessionId: string, userId: string): Promise<void>;
    deleteAllUserSessions(userId: string): Promise<number>;
    getAllSessions(): Promise<Array<{
        userId: string;
        sessionId: string;
    }>>;
    clearAllSessions(): Promise<number>;
    getUserSessions(userId: string): Promise<Array<Omit<NLConversationContext, 'messages'> & {
        messages: ConversationMessage[];
    }>>;
    updateMessageQuestionAnswers(sessionId: string, userId: string, messageId: string, questionAnswers: Record<string, string | string[] | number | boolean | null>): Promise<ConversationMessage>;
    private questionIdToParamName;
    sessionExists(sessionId: string, userId: string): Promise<boolean>;
    private buildCacheKey;
    private cleanExpiredMemoryCache;
}
