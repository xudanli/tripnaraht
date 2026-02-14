export interface SkillInput {
    [key: string]: any;
}
export interface SkillOutput {
    [key: string]: any;
}
export interface ParameterTypeCheck {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    format?: 'email' | 'url' | 'date' | 'date-time' | 'uuid';
    enum?: (string | number)[];
    validator?: string;
}
export interface ParameterExtractor {
    type: 'context' | 'request' | 'step';
    name?: string;
    stepId?: string;
    path?: string;
    defaultValue?: any;
}
export interface SkillInputSchema {
    required?: string[];
    dependencies?: Array<{
        param: string;
        alternatives?: string[];
    }>;
    extractors?: Record<string, string | ParameterExtractor>;
    typeChecks?: Record<string, ParameterTypeCheck>;
}
export interface SkillMetadata {
    name: string;
    description: string;
    version: string;
    category: 'decision' | 'dem' | 'routeDirection' | 'countryPack' | 'readiness' | 'whatIf' | 'analytics' | 'rag' | 'world' | 'trip' | 'geo';
    toolGroup?: 'DOMAIN' | 'CONTEXT';
    inputSchema?: SkillInputSchema;
}
export interface Skill<TInput extends SkillInput = SkillInput, TOutput extends SkillOutput = SkillOutput> {
    metadata: SkillMetadata;
    execute(input: TInput): Promise<TOutput>;
}
