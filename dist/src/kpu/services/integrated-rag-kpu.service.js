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
var IntegratedRAGKPUService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegratedRAGKPUService = void 0;
const common_1 = require("@nestjs/common");
const chunk_retrieval_service_1 = require("../../rag/services/chunk-retrieval.service");
const knowledge_validation_service_1 = require("./knowledge-validation.service");
const validation_scoring_service_1 = require("./validation-scoring.service");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
const kpu_monitoring_service_1 = require("./kpu-monitoring.service");
let IntegratedRAGKPUService = IntegratedRAGKPUService_1 = class IntegratedRAGKPUService {
    constructor(chunkRetrievalService, validationService, scoringService, llmService, monitoringService) {
        this.chunkRetrievalService = chunkRetrievalService;
        this.validationService = validationService;
        this.scoringService = scoringService;
        this.llmService = llmService;
        this.monitoringService = monitoringService;
        this.logger = new common_1.Logger(IntegratedRAGKPUService_1.name);
    }
    async retrieveAndValidate(params) {
        const startTime = Date.now();
        if (this.monitoringService) {
            this.monitoringService.recordRetrieval(0, 0);
        }
        const candidateMultiplier = params.enableSnippetValidation ? 2 : 1;
        const retrievalParams = {
            query: params.query,
            limit: (params.limit || 10) * candidateMultiplier,
            credibilityMin: params.credibilityMin,
            type: params.type,
            category: params.category,
            chunkCategory: params.chunkCategory,
            fileId: params.fileId,
            useHybridSearch: params.useHybridSearch,
            denseWeight: params.denseWeight,
            sparseWeight: params.sparseWeight,
            useReranking: params.useReranking,
            rerankTopK: params.rerankTopK,
            useQueryExpansion: params.useQueryExpansion,
            maxQueryVariants: params.maxQueryVariants,
            useIntentClassification: params.useIntentClassification,
        };
        const candidates = await this.chunkRetrievalService.retrieve(retrievalParams);
        this.logger.debug(`检索到 ${candidates.length} 个候选知识片段`);
        let validated;
        if (params.enableSnippetValidation) {
            validated = await Promise.all(candidates.map(async (candidate) => {
                try {
                    const validation = await this.validationService.validateSnippet({
                        content: candidate.content,
                        source: candidate.sourceFile,
                        metadata: candidate.metadata,
                        context: params.context,
                        options: params.validationOptions || {
                            enableFactCheck: true,
                            enableConsistencyCheck: true,
                            enableCitationCheck: true,
                        },
                    });
                    const overallScore = this.scoringService.calculateOverallScore({
                        factCheck: validation.factCheck,
                        credibility: validation.sourceCredibility,
                        freshness: validation.freshness,
                        completeness: validation.completeness,
                        consistency: validation.consistency,
                        similarity: candidate.similarity || candidate.hybridScore || 0,
                    });
                    return {
                        ...candidate,
                        validation: {
                            factCheck: validation.factCheck,
                            sourceCredibility: validation.sourceCredibility,
                            freshness: validation.freshness,
                            completeness: validation.completeness,
                            consistency: validation.consistency,
                            overallScore,
                        },
                        citations: validation.citations || [],
                    };
                }
                catch (error) {
                    this.logger.warn(`验证知识片段失败: ${(error === null || error === void 0 ? void 0 : error.message) || 'unknown error'}`, error === null || error === void 0 ? void 0 : error.stack);
                    return {
                        ...candidate,
                        validation: {
                            factCheck: 'unknown',
                            sourceCredibility: 0.5,
                            freshness: 0.5,
                            completeness: 0.5,
                            consistency: 'unknown',
                            overallScore: (candidate.similarity || candidate.hybridScore || 0) * 0.5,
                        },
                        citations: [],
                    };
                }
            }));
        }
        else {
            validated = candidates.map(candidate => ({
                ...candidate,
                validation: {
                    factCheck: 'unknown',
                    sourceCredibility: candidate.credibilityScore || 0.5,
                    freshness: 0.5,
                    completeness: 0.8,
                    consistency: 'unknown',
                    overallScore: candidate.similarity || candidate.hybridScore || 0,
                },
                citations: [],
            }));
        }
        const minScore = params.minValidationScore || 0.5;
        const filtered = validated.filter(v => v.validation.overallScore >= minScore);
        const reranked = filtered.sort((a, b) => {
            const scoreA = (a.similarity || a.hybridScore || 0) * 0.4 +
                a.validation.overallScore * 0.6;
            const scoreB = (b.similarity || b.hybridScore || 0) * 0.4 +
                b.validation.overallScore * 0.6;
            return scoreB - scoreA;
        }).slice(0, params.limit || 10);
        const avgScore = validated.length > 0
            ? validated.reduce((sum, v) => sum + v.validation.overallScore, 0) / validated.length
            : 0;
        const latency = Date.now() - startTime;
        if (this.monitoringService) {
            this.monitoringService.recordRetrieval(latency, candidates.length);
            if (validated.length > 0) {
                this.monitoringService.recordValidation(true, latency, avgScore);
            }
        }
        return {
            results: reranked,
            metadata: {
                totalCandidates: candidates.length,
                validatedCount: validated.length,
                filteredCount: reranked.length,
                avgValidationScore: avgScore,
                latency,
            },
        };
    }
    async generateWithValidation(params) {
        const startTime = Date.now();
        const { query, validatedResults, context, retryOnFailure = true, maxRetries = 2 } = params;
        const highQualityResults = validatedResults.filter(r => r.validation.overallScore >= 0.7);
        const generationStart = Date.now();
        const answer = await this.generateAnswer(query, highQualityResults.length > 0 ? highQualityResults : validatedResults, context);
        const generationLatency = Date.now() - generationStart;
        const validationStart = Date.now();
        const validation = await this.validationService.validateOutput({
            output: answer,
            sources: validatedResults,
            query,
            context,
            options: {
                enableFactCheck: true,
                enableConsistencyCheck: true,
                enableCitationCheck: true,
                enableCompletenessCheck: true,
            },
        });
        const validationLatency = Date.now() - validationStart;
        let retried = false;
        let finalAnswer = answer;
        let finalValidation = validation;
        if (validation.overall === 'fail' && retryOnFailure) {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                const veryHighConfidenceResults = validatedResults.filter(r => r.validation.overallScore >= 0.8 + attempt * 0.1);
                if (veryHighConfidenceResults.length > 0) {
                    this.logger.debug(`验证失败，尝试第 ${attempt + 1} 次重新生成（使用 ${veryHighConfidenceResults.length} 个高质量知识片段）`);
                    const retryAnswer = await this.generateAnswer(query, veryHighConfidenceResults, {
                        ...context,
                        instructions: '只使用提供的高质量知识，不要添加未验证的信息，如果信息不足请明确说明',
                    });
                    const retryValidation = await this.validationService.validateOutput({
                        output: retryAnswer,
                        sources: veryHighConfidenceResults,
                        query,
                        context,
                        options: {
                            enableFactCheck: true,
                            enableConsistencyCheck: true,
                            enableCitationCheck: true,
                            enableCompletenessCheck: false,
                        },
                    });
                    if (retryValidation.overall === 'pass' || retryValidation.score >= 0.8) {
                        finalAnswer = retryAnswer;
                        finalValidation = retryValidation;
                        retried = true;
                        break;
                    }
                }
            }
        }
        const totalLatency = Date.now() - startTime;
        if (this.monitoringService) {
            const success = finalValidation.overall === 'pass' || finalValidation.score >= 60;
            this.monitoringService.recordGeneration(success, totalLatency, retried);
        }
        return {
            answer: finalAnswer,
            validation: finalValidation,
            validatedSources: validatedResults,
            retried,
            metadata: {
                generationLatency,
                validationLatency,
                totalLatency,
            },
        };
    }
    async generateAnswer(query, validatedResults, context) {
        const contextText = validatedResults
            .map((r, idx) => `[${idx + 1}] ${r.content}`)
            .join('\n\n');
        if (this.llmService) {
            try {
                const instructions = (context === null || context === void 0 ? void 0 : context.instructions) ||
                    '请基于提供的知识源回答问题。只使用知识源中的信息，不要添加未验证的信息。如果知识源信息不足，请明确说明。';
                const prompt = `问题：${query}

知识源：
${contextText}

${instructions}

请提供详细、准确的回答：`;
                const llmStartTime = Date.now();
                const answer = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt);
                const llmLatency = Date.now() - llmStartTime;
                if (this.monitoringService) {
                    this.monitoringService.recordLlmCall(true, llmLatency);
                }
                return answer;
            }
            catch (error) {
                this.logger.warn(`LLM生成回答失败: ${error === null || error === void 0 ? void 0 : error.message}，使用简单拼接`);
                if (this.monitoringService) {
                    this.monitoringService.recordLlmCall(false, 0);
                }
            }
        }
        const answer = validatedResults.length > 0
            ? `基于以下知识回答：${query}\n\n${contextText.substring(0, 1000)}`
            : `抱歉，无法找到相关信息来回答：${query}`;
        return answer;
    }
};
exports.IntegratedRAGKPUService = IntegratedRAGKPUService;
exports.IntegratedRAGKPUService = IntegratedRAGKPUService = IntegratedRAGKPUService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [chunk_retrieval_service_1.ChunkRetrievalService,
        knowledge_validation_service_1.KnowledgeValidationService,
        validation_scoring_service_1.ValidationScoringService,
        llm_service_1.LlmService,
        kpu_monitoring_service_1.KPUMonitoringService])
], IntegratedRAGKPUService);
//# sourceMappingURL=integrated-rag-kpu.service.js.map