"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('kpu', () => ({
    enableSnippetValidation: process.env.KPU_ENABLE_SNIPPET_VALIDATION !== 'false',
    minValidationScore: parseFloat(process.env.KPU_MIN_VALIDATION_SCORE || '0.6'),
    enableFactCheck: process.env.KPU_ENABLE_FACT_CHECK !== 'false',
    enableConsistencyCheck: process.env.KPU_ENABLE_CONSISTENCY_CHECK !== 'false',
    enableCitationCheck: process.env.KPU_ENABLE_CITATION_CHECK !== 'false',
    cacheTTL: parseInt(process.env.KPU_CACHE_TTL || '3600', 10),
    cacheEnabled: process.env.KPU_CACHE_ENABLED !== 'false',
    cacheMemorySize: parseInt(process.env.KPU_CACHE_MEMORY_SIZE || '1000', 10),
    cacheRedisEnabled: process.env.KPU_CACHE_REDIS_ENABLED !== 'false',
    defaultLlmProvider: process.env.KPU_DEFAULT_LLM_PROVIDER || 'DEEPSEEK',
    maxConcurrentValidations: parseInt(process.env.KPU_MAX_CONCURRENT_VALIDATIONS || '10', 10),
    maxConcurrentGenerations: parseInt(process.env.KPU_MAX_CONCURRENT_GENERATIONS || '5', 10),
    validationTimeout: parseInt(process.env.KPU_VALIDATION_TIMEOUT || '5000', 10),
    generationTimeout: parseInt(process.env.KPU_GENERATION_TIMEOUT || '10000', 10),
}));
//# sourceMappingURL=kpu.config.js.map