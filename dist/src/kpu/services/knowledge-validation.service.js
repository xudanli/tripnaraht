"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var KnowledgeValidationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeValidationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
const validation_cache_service_1 = require("./validation-cache.service");
const kpu_monitoring_service_1 = require("./kpu-monitoring.service");
let KnowledgeValidationService = KnowledgeValidationService_1 = class KnowledgeValidationService {
    constructor(prisma, llmService, cacheService, monitoringService) {
        this.prisma = prisma;
        this.llmService = llmService;
        this.cacheService = cacheService;
        this.monitoringService = monitoringService;
        this.logger = new common_1.Logger(KnowledgeValidationService_1.name);
    }
    async validateSnippet(params) {
        const { content, source, metadata, context, options } = params;
        if (this.cacheService) {
            const cached = await this.cacheService.getCachedSnippetValidation(content);
            if (cached) {
                this.logger.debug('使用缓存的片段验证结果');
                if (this.monitoringService) {
                    this.monitoringService.recordCacheHit();
                }
                return cached;
            }
            if (this.monitoringService) {
                this.monitoringService.recordCacheMiss();
            }
        }
        let factCheck = 'unknown';
        if (options === null || options === void 0 ? void 0 : options.enableFactCheck) {
            factCheck = await this.checkFactAccuracy(content, source);
        }
        const sourceCredibility = await this.assessSourceCredibility(source, metadata);
        const freshness = await this.assessFreshness(metadata);
        const completeness = await this.assessCompleteness(content, context);
        let consistency = 'unknown';
        if (options === null || options === void 0 ? void 0 : options.enableConsistencyCheck) {
            consistency = await this.checkConsistency(content, source, context);
        }
        let citations = [];
        if (options === null || options === void 0 ? void 0 : options.enableCitationCheck) {
            citations = await this.extractCitations(content, source);
        }
        const result = {
            factCheck,
            sourceCredibility,
            freshness,
            completeness,
            consistency,
            citations,
        };
        if (this.cacheService) {
            await this.cacheService.cacheSnippetValidation(content, result);
        }
        return result;
    }
    async validateOutput(params) {
        const { output, sources, query, context, options } = params;
        if (this.cacheService) {
            const cached = await this.cacheService.getCachedOutputValidation(output);
            if (cached) {
                this.logger.debug('使用缓存的输出验证结果');
                return cached;
            }
        }
        const factChecks = [];
        const consistencyChecks = [];
        const warnings = [];
        let totalScore = 100;
        if (options === null || options === void 0 ? void 0 : options.enableFactCheck) {
            const factCheckResult = await this.checkOutputFacts(output, sources);
            factChecks.push(...factCheckResult.checks);
            if (!factCheckResult.allPassed) {
                totalScore -= factCheckResult.failedCount * 10;
                warnings.push(`发现 ${factCheckResult.failedCount} 个事实错误`);
            }
        }
        if (options === null || options === void 0 ? void 0 : options.enableConsistencyCheck) {
            const consistencyResult = await this.checkOutputConsistency(output, sources, query);
            consistencyChecks.push(...consistencyResult.checks);
            if (!consistencyResult.allConsistent) {
                totalScore -= consistencyResult.inconsistentCount * 5;
                warnings.push(`发现 ${consistencyResult.inconsistentCount} 个一致性问题`);
            }
        }
        if (options === null || options === void 0 ? void 0 : options.enableCitationCheck) {
            const citationResult = await this.checkCitationIntegrity(output, sources);
            if (!citationResult.allValid) {
                totalScore -= citationResult.invalidCount * 15;
                warnings.push(`发现 ${citationResult.invalidCount} 个无效引用`);
            }
        }
        if (options === null || options === void 0 ? void 0 : options.enableCompletenessCheck) {
            const completenessResult = await this.checkOutputCompleteness(output, query);
            if (!completenessResult.isComplete) {
                totalScore -= 10;
                warnings.push('输出信息可能不完整');
            }
        }
        const overall = totalScore >= 80 ? 'pass' :
            totalScore >= 60 ? 'warning' : 'fail';
        const citations = await this.extractOutputCitations(output, sources);
        const result = {
            overall,
            score: Math.max(0, Math.min(100, totalScore)),
            factChecks,
            consistencyChecks,
            citations,
            warnings,
        };
        if (this.cacheService) {
            await this.cacheService.cacheOutputValidation(output, result);
        }
        return result;
    }
    async checkFactAccuracy(content, source) {
        if (!this.llmService) {
            return 'unknown';
        }
        try {
            if (!this.llmService) {
                return 'unknown';
            }
            const prompt = `请检查以下文本是否包含明显的事实错误或矛盾。只回答"pass"（通过）、"fail"（失败）或"unknown"（无法判断）。

文本：
${content.substring(0, 500)}

来源：${source || '未知'}

请只回答一个词：pass、fail或unknown`;
            const llmStartTime = Date.now();
            const response = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt);
            const llmLatency = Date.now() - llmStartTime;
            if (this.monitoringService) {
                this.monitoringService.recordLlmCall(true, llmLatency);
            }
            const lowerResponse = response.toLowerCase().trim();
            if (lowerResponse.includes('pass')) {
                return 'pass';
            }
            else if (lowerResponse.includes('fail')) {
                return 'fail';
            }
            else {
                return 'unknown';
            }
        }
        catch (error) {
            this.logger.warn(`事实准确性检查失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            if (this.monitoringService) {
                this.monitoringService.recordLlmCall(false, 0);
            }
            return 'unknown';
        }
    }
    async assessSourceCredibility(source, metadata) {
        if ((metadata === null || metadata === void 0 ? void 0 : metadata.sourceCredibility) !== undefined) {
            return Math.max(0, Math.min(1, metadata.sourceCredibility));
        }
        if ((metadata === null || metadata === void 0 ? void 0 : metadata.credibilityScore) !== undefined) {
            return Math.max(0, Math.min(1, metadata.credibilityScore));
        }
        return 0.5;
    }
    async assessFreshness(metadata) {
        if (metadata === null || metadata === void 0 ? void 0 : metadata.lastUpdated) {
            const daysSinceUpdate = (Date.now() - new Date(metadata.lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
            return Math.max(0, 1 - daysSinceUpdate / 365);
        }
        return 0.5;
    }
    async assessCompleteness(content, context) {
        if (!content || content.length < 50) {
            return 0.3;
        }
        return 0.8;
    }
    async checkConsistency(content, source, context) {
        if (!this.llmService) {
            return 'unknown';
        }
        try {
            const prompt = `请检查以下文本内部是否存在矛盾或不一致的地方。只回答"consistent"（一致）、"inconsistent"（不一致）或"unknown"（无法判断）。

文本：
${content.substring(0, 500)}

请只回答一个词：consistent、inconsistent或unknown`;
            const response = 'unknown';
            const lowerResponse = response.toLowerCase().trim();
            if (lowerResponse.includes('inconsistent')) {
                return 'inconsistent';
            }
            else if (lowerResponse.includes('consistent')) {
                return 'consistent';
            }
            else {
                return 'unknown';
            }
        }
        catch (error) {
            this.logger.warn(`一致性检查失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return 'unknown';
        }
    }
    async extractCitations(content, source) {
        const citations = [];
        const urlRegex = /https?:\/\/[^\s]+/g;
        const urls = content.match(urlRegex) || [];
        urls.forEach((url, index) => {
            citations.push({
                id: `url_${index}`,
                content: url,
                source: source || 'unknown',
                confidence: 0.8,
            });
        });
        const citationMarkRegex = /\[(\d+)\]/g;
        const marks = Array.from(content.matchAll(citationMarkRegex));
        marks.forEach((match, index) => {
            citations.push({
                id: `mark_${match[1]}`,
                content: match[0],
                source: source || 'unknown',
                confidence: 0.7,
            });
        });
        if (source) {
            citations.push({
                id: 'source',
                content: `来源: ${source}`,
                source: source,
                confidence: 0.9,
            });
        }
        return citations;
    }
    async checkOutputFacts(output, sources) {
        const checks = [];
        let failedCount = 0;
        if (!this.llmService || sources.length === 0) {
            return { checks, allPassed: true, failedCount: 0 };
        }
        try {
            const sourceTexts = sources.map(s => s.content.substring(0, 200)).join('\n\n');
            const prompt = `请检查以下AI输出中的事实是否与提供的知识源一致。对于每个不一致的事实，请指出。

AI输出：
${output.substring(0, 1000)}

知识源：
${sourceTexts.substring(0, 1000)}

请以JSON格式返回检查结果，格式：
{
  "checks": [
    {
      "id": "fact_1",
      "description": "事实描述",
      "passed": true,
      "details": "详细信息",
      "sources": ["source1"]
    }
  ]
}`;
            const llmStartTime = Date.now();
            const response = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt);
            const llmLatency = Date.now() - llmStartTime;
            if (this.monitoringService) {
                this.monitoringService.recordLlmCall(true, llmLatency);
            }
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    if (result.checks && Array.isArray(result.checks)) {
                        checks.push(...result.checks);
                        failedCount = checks.filter(c => !c.passed).length;
                    }
                }
            }
            catch (parseError) {
                this.logger.warn(`解析事实检查结果失败: ${parseError}`);
            }
        }
        catch (error) {
            this.logger.warn(`输出事实检查失败: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
        return {
            checks,
            allPassed: failedCount === 0,
            failedCount,
        };
    }
    async checkOutputConsistency(output, sources, query) {
        const checks = [];
        let inconsistentCount = 0;
        if (!this.llmService) {
            return { checks, allConsistent: true, inconsistentCount: 0 };
        }
        try {
            if (!this.llmService) {
                return { checks: [], allConsistent: true, inconsistentCount: 0 };
            }
            const prompt = `请检查以下AI输出的一致性：
1. 输出内部是否一致（没有矛盾）
2. 输出是否与查询一致（回答了问题）
3. 输出是否与知识源一致（基于知识源）

查询：${query}

AI输出：
${output.substring(0, 1000)}

请以JSON格式返回检查结果，格式：
{
  "checks": [
    {
      "id": "consistency_1",
      "type": "internal",
      "passed": true,
      "details": "详细信息"
    }
  ]
}`;
            const llmStartTime = Date.now();
            const response = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt);
            const llmLatency = Date.now() - llmStartTime;
            if (this.monitoringService) {
                this.monitoringService.recordLlmCall(true, llmLatency);
            }
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    if (result.checks && Array.isArray(result.checks)) {
                        checks.push(...result.checks);
                        inconsistentCount = checks.filter(c => !c.passed).length;
                    }
                }
            }
            catch (parseError) {
                this.logger.warn(`解析一致性检查结果失败: ${parseError}`);
            }
        }
        catch (error) {
            this.logger.warn(`输出一致性检查失败: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
        return {
            checks,
            allConsistent: inconsistentCount === 0,
            inconsistentCount,
        };
    }
    async checkCitationIntegrity(output, sources) {
        return { allValid: true, invalidCount: 0 };
    }
    async checkOutputCompleteness(output, query) {
        return { isComplete: true };
    }
    async extractOutputCitations(output, sources) {
        return sources.map(s => ({
            id: s.id,
            content: s.content.substring(0, 200),
            source: s.sourceFile || 'unknown',
            documentId: s.id,
            confidence: s.validation.overallScore,
        }));
    }
};
exports.KnowledgeValidationService = KnowledgeValidationService;
exports.KnowledgeValidationService = KnowledgeValidationService = KnowledgeValidationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        llm_service_1.LlmService,
        validation_cache_service_1.ValidationCacheService,
        kpu_monitoring_service_1.KPUMonitoringService])
], KnowledgeValidationService);
//# sourceMappingURL=knowledge-validation.service.js.map