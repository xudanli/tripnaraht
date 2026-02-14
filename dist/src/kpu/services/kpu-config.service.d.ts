import { ConfigService } from '@nestjs/config';
export interface KPUConfig {
    enableSnippetValidation: boolean;
    minValidationScore: number;
    enableFactCheck: boolean;
    enableConsistencyCheck: boolean;
    enableCitationCheck: boolean;
    cacheTTL: number;
    cacheEnabled: boolean;
    cacheMemorySize: number;
    cacheRedisEnabled: boolean;
    defaultLlmProvider: string;
    maxConcurrentValidations: number;
    maxConcurrentGenerations: number;
    validationTimeout: number;
    generationTimeout: number;
}
export declare class KPUConfigService {
    private readonly configService;
    constructor(configService: ConfigService);
    getConfig(): KPUConfig;
    getDefaultValidationOptions(): {
        enableFactCheck: boolean;
        enableConsistencyCheck: boolean;
        enableCitationCheck: boolean;
    };
}
