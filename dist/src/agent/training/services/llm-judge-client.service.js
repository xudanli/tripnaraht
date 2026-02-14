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
var LlmJudgeClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmJudgeClientService = exports.DiagnosticLabel = exports.QualityDimension = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
var QualityDimension;
(function (QualityDimension) {
    QualityDimension["SAFETY"] = "SAFETY";
    QualityDimension["FEASIBILITY"] = "FEASIBILITY";
    QualityDimension["RELEVANCE"] = "RELEVANCE";
    QualityDimension["COMPLETENESS"] = "COMPLETENESS";
    QualityDimension["CLARITY"] = "CLARITY";
    QualityDimension["DECISION_QUALITY"] = "DECISION_QUALITY";
    QualityDimension["TOOL_USAGE"] = "TOOL_USAGE";
})(QualityDimension || (exports.QualityDimension = QualityDimension = {}));
var DiagnosticLabel;
(function (DiagnosticLabel) {
    DiagnosticLabel["EVIDENCE_MISSING"] = "EVIDENCE_MISSING";
    DiagnosticLabel["HALLUCINATION_RISK"] = "HALLUCINATION_RISK";
    DiagnosticLabel["NOT_EXECUTABLE"] = "NOT_EXECUTABLE";
    DiagnosticLabel["SAFETY_CONCERN"] = "SAFETY_CONCERN";
    DiagnosticLabel["COMPLIANCE_ISSUE"] = "COMPLIANCE_ISSUE";
    DiagnosticLabel["TOOL_CALL_ERROR"] = "TOOL_CALL_ERROR";
    DiagnosticLabel["REASONING_WEAK"] = "REASONING_WEAK";
})(DiagnosticLabel || (exports.DiagnosticLabel = DiagnosticLabel = {}));
let LlmJudgeClientService = LlmJudgeClientService_1 = class LlmJudgeClientService {
    constructor(configService, httpService) {
        this.configService = configService;
        this.httpService = httpService;
        this.logger = new common_1.Logger(LlmJudgeClientService_1.name);
        this.isHealthy = false;
        this.baseUrl = this.configService.get('LLM_JUDGE_URL', 'http://localhost:8003');
        this.timeout = this.configService.get('LLM_JUDGE_TIMEOUT', 30000);
    }
    async onModuleInit() {
        await this.checkHealth();
    }
    async checkHealth() {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.baseUrl}/health`, {
                timeout: 5000,
            }));
            this.isHealthy = response.data.status === 'healthy';
            this.logger.log(`LLM Judge 服务健康检查: ${this.isHealthy ? '✅ 健康' : '❌ 不健康'}`);
            return response.data;
        }
        catch (error) {
            this.isHealthy = false;
            this.logger.warn(`LLM Judge 服务不可用: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return null;
        }
    }
    isServiceHealthy() {
        return this.isHealthy;
    }
    async scorePlan(request) {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.baseUrl}/score`, request, { timeout: this.timeout }));
            return response.data;
        }
        catch (error) {
            this.logger.error(`评分失败: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            throw error;
        }
    }
    async batchScore(requests) {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.baseUrl}/batch-score`, { requests }, { timeout: this.timeout * 2 }));
            return response.data;
        }
        catch (error) {
            this.logger.error(`批量评分失败: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            throw error;
        }
    }
    async comparePlans(request) {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.baseUrl}/compare`, request, { timeout: this.timeout }));
            return response.data;
        }
        catch (error) {
            this.logger.error(`计划比较失败: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            throw error;
        }
    }
    async evaluateLora(request) {
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.baseUrl}/evaluate-lora`, request, { timeout: this.timeout }));
            return response.data;
        }
        catch (error) {
            this.logger.error(`LoRA 评估失败: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            throw error;
        }
    }
    async batchEvaluateLora(requests) {
        const results = [];
        for (const request of requests) {
            try {
                const result = await this.evaluateLora(request);
                results.push(result);
            }
            catch (error) {
                this.logger.error(`LoRA 评估失败 (request_id=${request.request_id}): ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            }
        }
        return results;
    }
    async generateLoraEvalReport(evalResults) {
        if (evalResults.length === 0) {
            return {
                total_evaluations: 0,
                lora_wins: 0,
                baseline_wins: 0,
                ties: 0,
                average_lora_score: 0,
                average_baseline_score: 0,
                win_rate: 0,
                dimension_comparison: {},
                recommendations: ['需要更多评估数据'],
            };
        }
        const loraWins = evalResults.filter((r) => r.winner === 'lora').length;
        const baselineWins = evalResults.filter((r) => r.winner === 'baseline').length;
        const ties = evalResults.filter((r) => r.winner === 'tie').length;
        const avgLoraScore = evalResults.reduce((sum, r) => sum + r.lora_score, 0) / evalResults.length;
        const avgBaselineScore = evalResults.reduce((sum, r) => sum + r.baseline_score, 0) / evalResults.length;
        const dimensionSums = {};
        for (const result of evalResults) {
            if (result.dimension_comparison) {
                for (const [dim, scores] of Object.entries(result.dimension_comparison)) {
                    if (!dimensionSums[dim]) {
                        dimensionSums[dim] = { baseline: 0, lora: 0, count: 0 };
                    }
                    dimensionSums[dim].baseline += scores.baseline;
                    dimensionSums[dim].lora += scores.lora;
                    dimensionSums[dim].count++;
                }
            }
        }
        const dimensionComparison = {};
        for (const [dim, sums] of Object.entries(dimensionSums)) {
            dimensionComparison[dim] = {
                avg_baseline: sums.baseline / sums.count,
                avg_lora: sums.lora / sums.count,
            };
        }
        const allRecommendations = new Set();
        for (const result of evalResults) {
            for (const rec of result.recommendations || []) {
                allRecommendations.add(rec);
            }
        }
        return {
            total_evaluations: evalResults.length,
            lora_wins: loraWins,
            baseline_wins: baselineWins,
            ties,
            average_lora_score: avgLoraScore,
            average_baseline_score: avgBaselineScore,
            win_rate: loraWins / evalResults.length,
            dimension_comparison: dimensionComparison,
            recommendations: Array.from(allRecommendations),
        };
    }
};
exports.LlmJudgeClientService = LlmJudgeClientService;
exports.LlmJudgeClientService = LlmJudgeClientService = LlmJudgeClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService])
], LlmJudgeClientService);
//# sourceMappingURL=llm-judge-client.service.js.map