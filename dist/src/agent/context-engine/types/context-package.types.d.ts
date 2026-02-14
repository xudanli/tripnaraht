export interface ContextBlock {
    key: string;
    type: BlockType;
    text: string;
    data?: Record<string, any>;
    priority: number;
    visibility: 'public' | 'private';
    provenance: BlockProvenance;
    estimatedTokens?: number;
    evidence?: BlockEvidence[];
    dataSource?: BlockDataSource;
    lastVerifiedAt?: string;
}
export type BlockType = 'WORLD_MODEL' | 'COUNTRY_VISA' | 'COUNTRY_DRONE' | 'COUNTRY_ROAD_RULES' | 'COUNTRY_MONEY' | 'COUNTRY_SAFETY' | 'COUNTRY_WEATHER' | 'COUNTRY_TRANSPORT' | 'COUNTRY_BOOKING' | 'ABU_RULES' | 'DRDRE_RULES' | 'NEPTUNE_RULES' | 'PLAN_SUMMARY' | 'PLAN_DAY' | 'PLAN_SEGMENT' | 'DECISION_LOG' | 'REJECTION_LOG' | 'TOOL_OUTPUT' | 'USER_PROFILE' | 'CONSTRAINTS' | 'METADATA' | 'API_DOCUMENTATION' | 'SYSTEM_CAPABILITY';
export interface BlockProvenance {
    source: 'skill' | 'pack' | 'db' | 'memory' | 'computed';
    identifier: string;
    version?: string;
    timestamp: string;
}
export interface BlockEvidence {
    source: string;
    verifiedAt: string;
    confidence: number;
    url?: string;
    reviewer?: string;
    metadata?: Record<string, any>;
}
export type BlockDataSource = 'API' | 'POSTGIS' | 'HUMAN' | 'MIXED' | 'COMPUTED' | 'PACK';
export interface ContextPackage {
    id: string;
    tripId?: string;
    phase: string;
    agent: string;
    userQuery: string;
    blocks: ContextBlock[];
    totalTokens: number;
    tokenBudget: number;
    compressed: boolean;
    createdAt: string;
    metadata?: Record<string, any>;
}
export interface ContextPackageOptions {
    tripId?: string;
    userId?: string;
    phase: string;
    agent: string;
    userQuery: string;
    tokenBudget?: number;
    includePrivate?: boolean;
    requiredTopics?: string[];
    excludeTopics?: string[];
    includeApiDocs?: boolean;
    apiDocCategories?: ApiDocCategory[];
}
export type ApiDocCategory = 'ROLL' | 'ADMIN' | 'CONTEXT' | 'TRAINING' | 'AGENT' | 'TRIPS' | 'DECISION' | 'ALL';
export interface ContextProjection {
    publicBlocks: ContextBlock[];
    privateState: {
        toolRawOutputs: Record<string, string>;
        debugLogs: string[];
        internalScores?: Record<string, any>;
        privateFields?: Record<string, any>;
        poiLists?: Record<string, string>;
    };
    totalTokens: number;
    overBudget: boolean;
}
