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
var QueryExpansionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryExpansionService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../llm/services/llm.service");
let QueryExpansionService = QueryExpansionService_1 = class QueryExpansionService {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(QueryExpansionService_1.name);
        this.DEFAULT_MAX_VARIANTS = 3;
        if (!llmService) {
            this.logger.warn('LlmService 未注入，查询扩展将使用简单的同义词扩展');
        }
    }
    async expandQuery(params) {
        const { query, maxVariants = this.DEFAULT_MAX_VARIANTS, useLLM = true, } = params;
        this.logger.debug(`查询扩展: query="${query.substring(0, 50)}...", maxVariants=${maxVariants}`);
        try {
            if (useLLM && this.llmService) {
                return await this.expandWithLLM(query, maxVariants);
            }
            else {
                return this.expandWithSynonyms(query, maxVariants);
            }
        }
        catch (error) {
            this.logger.warn(`查询扩展失败，降级到简单扩展: ${error.message}`);
            return this.expandWithSynonyms(query, maxVariants);
        }
    }
    async expandWithLLM(query, maxVariants) {
        const prompt = this.buildExpansionPrompt(query, maxVariants);
        try {
            const provider = this.llmService.getDefaultProvider();
            const response = await this.llmService.callLlmWithSchema(provider, prompt, this.getExpansionSchema());
            const variants = this.parseExpansionResponse(response, maxVariants);
            return {
                original: query,
                variants,
                allQueries: [query, ...variants],
            };
        }
        catch (error) {
            this.logger.error(`LLM 查询扩展失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    expandWithSynonyms(query, maxVariants) {
        const synonymMap = {
            '租车': ['租车', '汽车租赁', '租用车辆'],
            '保险': ['保险', '保障', '保护'],
            '路线': ['路线', '路径', '行程', '路线规划'],
            '景点': ['景点', '旅游景点', '景点推荐', '必游景点'],
            '酒店': ['酒店', '住宿', '旅馆', '宾馆'],
            '餐厅': ['餐厅', '饭店', '餐馆', '美食'],
        };
        const variants = [];
        const words = query.split(/\s+/);
        for (const word of words) {
            if (synonymMap[word]) {
                for (const synonym of synonymMap[word]) {
                    if (synonym !== word && variants.length < maxVariants) {
                        const variant = query.replace(word, synonym);
                        if (!variants.includes(variant)) {
                            variants.push(variant);
                        }
                    }
                }
            }
        }
        if (variants.length === 0) {
            if (!query.startsWith('如何') && !query.startsWith('什么') && !query.startsWith('哪里')) {
                variants.push(`如何${query}`);
                if (variants.length < maxVariants) {
                    variants.push(`${query}是什么`);
                }
            }
        }
        return {
            original: query,
            variants: variants.slice(0, maxVariants),
            allQueries: [query, ...variants.slice(0, maxVariants)],
        };
    }
    buildExpansionPrompt(query, maxVariants) {
        return `你是一个专业的查询扩展专家。请为以下查询生成 ${maxVariants} 个查询变体，用于提升检索召回率。

要求：
1. 生成同义词、相关词、改写查询
2. 保持查询的核心意图不变
3. 考虑不同的表达方式和角度
4. 返回JSON数组格式

原始查询: "${query}"

请返回 ${maxVariants} 个查询变体（JSON数组）：`;
    }
    getExpansionSchema() {
        return {
            type: 'array',
            items: {
                type: 'string',
                description: '查询变体',
            },
            minItems: 1,
            maxItems: 5,
        };
    }
    parseExpansionResponse(response, maxVariants) {
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
            const variants = parsed
                .filter((v) => typeof v === 'string' && v.trim().length > 0)
                .map((v) => v.trim())
                .filter((v, index, arr) => arr.indexOf(v) === index)
                .slice(0, maxVariants);
            return variants;
        }
        catch (error) {
            this.logger.warn(`解析查询扩展响应失败: ${error.message}, response: ${response.substring(0, 200)}`);
            return [];
        }
    }
    mergeResults(resultsMap, originalQuery, limit) {
        const resultScores = new Map();
        const originalResults = resultsMap.get(originalQuery) || [];
        originalResults.forEach((result, index) => {
            const existing = resultScores.get(result.id);
            const score = (result.hybridScore || result.similarity || 0) * 1.0;
            if (!existing || score > existing.score) {
                resultScores.set(result.id, { result, score });
            }
        });
        let variantIndex = 0;
        for (const [query, results] of resultsMap.entries()) {
            if (query === originalQuery)
                continue;
            const weight = 0.7 / (variantIndex + 1);
            results.forEach((result) => {
                const existing = resultScores.get(result.id);
                const score = (result.hybridScore || result.similarity || 0) * weight;
                if (!existing || score > existing.score) {
                    resultScores.set(result.id, { result, score });
                }
            });
            variantIndex++;
        }
        return Array.from(resultScores.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(({ result, score }) => ({
            ...result,
            similarity: score,
        }));
    }
};
exports.QueryExpansionService = QueryExpansionService;
exports.QueryExpansionService = QueryExpansionService = QueryExpansionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], QueryExpansionService);
//# sourceMappingURL=query-expansion.service.js.map