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
var QualityScorerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QualityScorerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const diagnostic_label_system_service_1 = require("./diagnostic-label-system.service");
const judge_prompt_designer_service_1 = require("./judge-prompt-designer.service");
const roll_reward_adapter_service_1 = require("./roll-reward-adapter.service");
const llm_service_1 = require("../../../llm/services/llm.service");
let QualityScorerService = QualityScorerService_1 = class QualityScorerService {
    constructor(configService, diagnosticLabelSystem, judgePromptDesigner, llmService, rollRewardAdapter) {
        this.configService = configService;
        this.diagnosticLabelSystem = diagnosticLabelSystem;
        this.judgePromptDesigner = judgePromptDesigner;
        this.llmService = llmService;
        this.rollRewardAdapter = rollRewardAdapter;
        this.logger = new common_1.Logger(QualityScorerService_1.name);
        this.useExternalJudge =
            this.configService.get('USE_EXTERNAL_LLM_JUDGE') === true;
        this.llmJudgeUrl =
            this.configService.get('LLM_JUDGE_URL') ||
                'http://localhost:8003';
    }
    async score(plan, userRequest, evidence, decisionLog, useRM = false) {
        this.logger.debug(`[QualityScorer] 开始评分`);
        const diagnosticLabels = await this.diagnosticLabelSystem.detectLabels(plan, evidence, decisionLog);
        const llmJudgeScore = await this.scoreWithLLMJudge(plan, userRequest, evidence);
        let rmScore;
        if (useRM) {
            if (this.rollRewardAdapter) {
                try {
                    const rollRewardResult = await this.rollRewardAdapter.computeReward(plan, userRequest, evidence, decisionLog);
                    if (rollRewardResult.success && rollRewardResult.reward !== undefined) {
                        rmScore = rollRewardResult.reward;
                        this.logger.debug(`[QualityScorer] 使用 ROLL Reward-Worker 评分: ${rmScore}`);
                    }
                    else {
                        rmScore = await this.scoreWithRM(plan, userRequest);
                    }
                }
                catch (error) {
                    this.logger.warn(`[QualityScorer] ROLL Reward-Worker 调用失败，回退到本地 RM: ${error === null || error === void 0 ? void 0 : error.message}`);
                    rmScore = await this.scoreWithRM(plan, userRequest);
                }
            }
            else {
                rmScore = await this.scoreWithRM(plan, userRequest);
            }
        }
        let finalScore;
        if (rmScore !== undefined) {
            finalScore = llmJudgeScore * 0.6 + rmScore * 0.4;
        }
        else {
            finalScore = llmJudgeScore;
        }
        const labelImpact = diagnosticLabels.reduce((sum, label) => sum + label.impact_on_score, 0);
        finalScore = Math.max(0, Math.min(1, finalScore + labelImpact));
        const explanation = this.generateExplanation(finalScore, llmJudgeScore, rmScore, diagnosticLabels);
        const confidence = this.calculateConfidence(llmJudgeScore, rmScore, diagnosticLabels);
        const result = {
            score: finalScore,
            llm_judge_score: llmJudgeScore,
            rm_score: rmScore,
            diagnostic_labels: diagnosticLabels,
            explanation,
            confidence,
        };
        this.logger.log(`[QualityScorer] 评分完成: score=${finalScore.toFixed(3)}, confidence=${confidence.toFixed(2)}`);
        return result;
    }
    async scoreWithLLMJudge(plan, userRequest, evidence) {
        if (this.useExternalJudge && this.llmJudgeUrl) {
            return await this.scoreWithExternalJudge(plan, userRequest, evidence);
        }
        if (this.llmService) {
            return await this.scoreWithLlmService(plan, userRequest, evidence);
        }
        this.logger.warn('[QualityScorer] LLM服务不可用，使用默认评分');
        return 0.5;
    }
    async scoreWithExternalJudge(plan, userRequest, evidence) {
        try {
            const template = this.judgePromptDesigner.getTemplate();
            if (!template) {
                this.logger.warn('[QualityScorer] 未找到Judge Prompt模板，使用默认评分');
                return 0.5;
            }
            const response = await fetch(`${this.llmJudgeUrl}/judge/score`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    plan,
                    user_request: userRequest,
                    evidence,
                    prompt_template: template.prompt_template,
                }),
            });
            if (!response.ok) {
                throw new Error(`LLM Judge error: ${response.statusText}`);
            }
            const result = (await response.json());
            return result.score;
        }
        catch (error) {
            this.logger.warn(`[QualityScorer] 外部LLM Judge评分失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return 0.5;
        }
    }
    async scoreWithLlmService(plan, userRequest, evidence) {
        try {
            const template = this.judgePromptDesigner.getTemplate();
            if (!template) {
                this.logger.warn('[QualityScorer] 未找到Judge Prompt模板，使用默认评分');
                return 0.5;
            }
            const prompt = this.buildJudgePrompt(template.prompt_template, plan, userRequest, evidence);
            const scoreSchema = {
                type: 'object',
                properties: {
                    overall_score: {
                        type: 'number',
                        description: 'Overall quality score from 0 to 1',
                        minimum: 0,
                        maximum: 1,
                    },
                    dimension_scores: {
                        type: 'object',
                        properties: {
                            executability: { type: 'number', minimum: 0, maximum: 1 },
                            safety: { type: 'number', minimum: 0, maximum: 1 },
                            user_satisfaction: { type: 'number', minimum: 0, maximum: 1 },
                            evidence_quality: { type: 'number', minimum: 0, maximum: 1 },
                        },
                    },
                    reasoning: {
                        type: 'string',
                        description: 'Brief reasoning for the score',
                    },
                    diagnostic_labels: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Any issues detected (EVIDENCE_MISSING, HALLUCINATION_RISK, etc.)',
                    },
                },
                required: ['overall_score', 'reasoning'],
            };
            if (!this.llmService) {
                throw new Error('LlmService 未注入，无法进行质量评分');
            }
            const provider = this.llmService.getDefaultProvider();
            const response = await this.llmService.callLlmWithSchema(provider, prompt, scoreSchema);
            const result = this.parseJudgeResponse(response);
            return result.overall_score;
        }
        catch (error) {
            this.logger.warn(`[QualityScorer] LlmService评分失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return 0.5;
        }
    }
    buildJudgePrompt(template, plan, userRequest, evidence) {
        return template
            .replace('{plan}', JSON.stringify(plan, null, 2))
            .replace('{user_request}', userRequest)
            .replace('{evidence}', JSON.stringify(evidence, null, 2));
    }
    parseJudgeResponse(response) {
        var _a;
        try {
            let cleaned = response.trim();
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
            cleaned = cleaned.replace(/\s*```$/i, '');
            cleaned = cleaned.trim();
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                cleaned = jsonMatch[0];
            }
            const parsed = JSON.parse(cleaned);
            return {
                overall_score: (_a = parsed.overall_score) !== null && _a !== void 0 ? _a : 0.5,
                dimension_scores: parsed.dimension_scores,
                reasoning: parsed.reasoning,
                diagnostic_labels: parsed.diagnostic_labels,
            };
        }
        catch (error) {
            this.logger.warn(`[QualityScorer] 解析Judge响应失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return { overall_score: 0.5 };
        }
    }
    async scoreWithRM(plan, userRequest) {
        try {
            const response = await fetch(`${this.llmJudgeUrl}/rm/score`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    plan,
                    user_request: userRequest,
                }),
            });
            if (!response.ok) {
                throw new Error(`RM scoring error: ${response.statusText}`);
            }
            const result = (await response.json());
            return result.score;
        }
        catch (error) {
            this.logger.warn(`[QualityScorer] RM评分失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return undefined;
        }
    }
    generateExplanation(finalScore, llmJudgeScore, rmScore, diagnosticLabels) {
        const parts = [];
        parts.push(`Overall quality score: ${(finalScore * 100).toFixed(0)}%`);
        if (rmScore !== undefined) {
            parts.push(`LLM Judge score: ${(llmJudgeScore * 100).toFixed(0)}%, RM score: ${(rmScore * 100).toFixed(0)}%`);
        }
        else {
            parts.push(`LLM Judge score: ${(llmJudgeScore * 100).toFixed(0)}%`);
        }
        if (diagnosticLabels.length > 0) {
            parts.push(`Diagnostic labels: ${diagnosticLabels.map((l) => l.label_type).join(', ')}`);
        }
        return parts.join('. ');
    }
    calculateConfidence(llmJudgeScore, rmScore, diagnosticLabels) {
        if (rmScore !== undefined) {
            const scoreDiff = Math.abs(llmJudgeScore - rmScore);
            if (scoreDiff < 0.1) {
                return 0.9;
            }
            else if (scoreDiff < 0.2) {
                return 0.7;
            }
            else {
                return 0.5;
            }
        }
        if (diagnosticLabels.length === 0) {
            return 0.8;
        }
        else {
            return Math.max(0.3, 0.8 - diagnosticLabels.length * 0.1);
        }
    }
};
exports.QualityScorerService = QualityScorerService;
exports.QualityScorerService = QualityScorerService = QualityScorerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        diagnostic_label_system_service_1.DiagnosticLabelSystemService,
        judge_prompt_designer_service_1.JudgePromptDesignerService,
        llm_service_1.LlmService,
        roll_reward_adapter_service_1.RollRewardAdapterService])
], QualityScorerService);
//# sourceMappingURL=quality-scorer.service.js.map