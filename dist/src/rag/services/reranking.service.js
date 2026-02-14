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
var RerankingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RerankingService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../llm/services/llm.service");
let RerankingService = RerankingService_1 = class RerankingService {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(RerankingService_1.name);
        this.DEFAULT_TOP_K = 20;
        this.DEFAULT_RETURN_TOP = 10;
        if (!llmService) {
            this.logger.warn('LlmService 未注入，Reranking 将使用基于分数的简单重排序');
        }
    }
    async rerank(params) {
        const { query, results, topK = this.DEFAULT_TOP_K, returnTop = this.DEFAULT_RETURN_TOP, useLLM = true, } = params;
        if (results.length === 0) {
            return [];
        }
        const candidates = results.slice(0, Math.min(topK, results.length));
        this.logger.debug(`Reranking: query="${query.substring(0, 50)}...", candidates=${candidates.length}, returnTop=${returnTop}`);
        try {
            if (useLLM && this.llmService) {
                return await this.rerankWithLLM(query, candidates, returnTop);
            }
            else {
                return this.rerankByScore(candidates, returnTop);
            }
        }
        catch (error) {
            this.logger.warn(`Reranking 失败，降级到基于分数的排序: ${error.message}`);
            return this.rerankByScore(candidates, returnTop);
        }
    }
    async rerankWithLLM(query, candidates, returnTop) {
        const prompt = this.buildRerankingPrompt(query, candidates);
        try {
            const fullPrompt = `你是一个专业的文档检索质量评估专家。你的任务是对检索结果进行重新排序，找出与查询最相关的文档。

${prompt}`;
            if (!this.llmService) {
                throw new Error('LlmService 未注入，无法进行 LLM 重排序');
            }
            const provider = this.llmService.getDefaultProvider();
            const response = await this.llmService.callLlmWithSchema(provider, fullPrompt, this.getRerankingSchema());
            const rerankedResults = this.parseLLMResponse(response, candidates);
            if (rerankedResults.length === 0) {
                this.logger.warn('LLM 响应解析失败，降级到基于分数的排序');
                return this.rerankByScore(candidates, returnTop);
            }
            return rerankedResults.slice(0, returnTop);
        }
        catch (error) {
            this.logger.error(`LLM 重排序失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    buildRerankingPrompt(query, candidates) {
        const candidatesText = candidates
            .map((candidate, index) => {
            const contentPreview = candidate.content.substring(0, 500);
            const score = candidate.hybridScore || candidate.similarity || 0;
            return `[${index + 1}] 分数: ${score.toFixed(3)}
内容: ${contentPreview}${candidate.content.length > 500 ? '...' : ''}
类型: ${candidate.type}
可信度: ${candidate.credibilityScore.toFixed(2)}`;
        })
            .join('\n\n');
        return `查询: "${query}"

请对以下检索结果进行重新排序，找出与查询最相关的文档。

要求：
1. 评估每个文档与查询的相关性（0-1分）
2. 考虑语义相关性、信息完整性、可信度
3. 返回排序后的文档编号列表（按相关性从高到低）
4. 格式：JSON数组，每个元素包含 {"index": 文档编号(1-based), "score": 相关性分数(0-1), "reason": "简短原因"}

检索结果：
${candidatesText}

请返回JSON格式的排序结果：`;
    }
    parseLLMResponse(response, candidates) {
        try {
            let jsonStr = response.trim();
            if (jsonStr.startsWith('```')) {
                const lines = jsonStr.split('\n');
                jsonStr = lines.slice(1, -1).join('\n');
            }
            if (jsonStr.startsWith('json\n')) {
                jsonStr = jsonStr.substring(4);
            }
            const parsed = JSON.parse(jsonStr);
            if (!Array.isArray(parsed)) {
                throw new Error('响应不是数组格式');
            }
            const rerankedMap = new Map();
            parsed.forEach((item) => {
                const index = item.index || item.rank || item.id;
                if (typeof index === 'number' && index >= 1 && index <= candidates.length) {
                    rerankedMap.set(index - 1, {
                        score: item.score || 0,
                        reason: item.reason || item.explanation || '',
                    });
                }
            });
            if (rerankedMap.size === 0) {
                return [];
            }
            const reranked = Array.from(rerankedMap.entries())
                .map(([originalIndex, rerankInfo]) => ({
                ...candidates[originalIndex],
                rerankScore: rerankInfo.score,
                rerankReason: rerankInfo.reason,
            }))
                .sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));
            return reranked;
        }
        catch (error) {
            this.logger.warn(`解析LLM响应失败: ${error.message}, response: ${response.substring(0, 200)}`);
            return [];
        }
    }
    rerankByScore(candidates, returnTop) {
        return candidates
            .map((candidate) => ({
            ...candidate,
            rerankScore: candidate.hybridScore || candidate.similarity || 0,
            rerankReason: '基于检索分数排序',
        }))
            .sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0))
            .slice(0, returnTop);
    }
    getRerankingSchema() {
        return {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    index: {
                        type: 'number',
                        description: '文档编号（1-based，从1开始）',
                    },
                    score: {
                        type: 'number',
                        description: '相关性分数（0-1）',
                        minimum: 0,
                        maximum: 1,
                    },
                    reason: {
                        type: 'string',
                        description: '简短的重排序原因',
                    },
                },
                required: ['index', 'score'],
            },
        };
    }
    async rerankBatch(queries, topK, returnTop) {
        const rerankPromises = queries.map(({ query, results }) => this.rerank({
            query,
            results,
            topK,
            returnTop,
        }));
        return Promise.all(rerankPromises);
    }
};
exports.RerankingService = RerankingService;
exports.RerankingService = RerankingService = RerankingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], RerankingService);
//# sourceMappingURL=reranking.service.js.map