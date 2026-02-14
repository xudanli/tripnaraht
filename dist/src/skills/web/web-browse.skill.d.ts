import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
export interface WebBrowseInput extends SkillInput {
    url: string;
    query?: string;
    waitForSelector?: string;
    timeout?: number;
    extractAllText?: boolean;
    disableCache?: boolean;
    userAgent?: string;
    evidence_id?: string;
}
export interface WebBrowseOutput extends SkillOutput {
    url: string;
    title: string;
    content: string;
    metadata?: {
        description?: string;
        keywords?: string[];
        author?: string;
        lastModified?: string;
    };
    links?: Array<{
        href: string;
        text: string;
    }>;
    evidence_id: string;
    source: string;
    cached: boolean;
    duration_ms: number;
    relevance_score?: number;
}
export declare class WebBrowseSkill implements Skill<WebBrowseInput, WebBrowseOutput> {
    private readonly logger;
    private browser;
    private cache;
    private readonly DEFAULT_CACHE_TTL_MS;
    private readonly DEFAULT_TIMEOUT_MS;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "rag";
        toolGroup: "DOMAIN";
        inputSchema: {
            required: string[];
            typeChecks: {
                url: {
                    type: "string";
                    format: "url";
                };
                query: {
                    type: "string";
                };
                timeout: {
                    type: "number";
                    min: number;
                    max: number;
                };
                waitForSelector: {
                    type: "string";
                };
            };
        };
    };
    constructor();
    execute(input: WebBrowseInput): Promise<WebBrowseOutput>;
    private extractContent;
    private extractMetadata;
    private extractLinks;
    private calculateRelevance;
    private ensureBrowser;
    private getCache;
    private setCache;
    clearCache(): void;
    onModuleDestroy(): Promise<void>;
}
