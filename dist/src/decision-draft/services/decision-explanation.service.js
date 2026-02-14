"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DecisionExplanationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionExplanationService = void 0;
const common_1 = require("@nestjs/common");
let DecisionExplanationService = DecisionExplanationService_1 = class DecisionExplanationService {
    constructor() {
        this.logger = new common_1.Logger(DecisionExplanationService_1.name);
    }
    async generateExplanation(decisionDraft, mode = 'toc') {
        this.logger.log(`[DecisionExplanation] 生成决策解释: mode=${mode}`);
        if (mode === 'toc') {
            return this.generateTocExplanation(decisionDraft);
        }
        else if (mode === 'expert') {
            return this.generateExpertExplanation(decisionDraft);
        }
        else {
            return await this.generateStudioExplanation(decisionDraft);
        }
    }
    generateTocExplanation(decisionDraft) {
        const decisionCount = decisionDraft.decision_steps.length;
        const summary = `我们为你做了 ${decisionCount} 个关键判断`;
        const keyDecisions = decisionDraft.decision_steps
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, Math.min(5, decisionCount))
            .map((step) => ({
            title: step.title,
            conclusion: this.extractConclusion(step),
            confidence: step.confidence,
            expandable: true,
        }));
        return {
            summary,
            decision_count: decisionCount,
            key_decisions: keyDecisions,
        };
    }
    generateExpertExplanation(decisionDraft) {
        var _a;
        const stepDrafts = ((_a = decisionDraft.step_draft) === null || _a === void 0 ? void 0 : _a.steps) || [];
        const evidenceChain = [];
        decisionDraft.decision_steps.forEach((step) => {
            step.evidence.forEach((ev) => {
                evidenceChain.push(ev);
            });
        });
        const decisionLog = [];
        decisionDraft.decision_steps.forEach((step) => {
            step.decision_log.forEach((entry) => {
                decisionLog.push(entry);
            });
        });
        const threeGuardiansReview = {};
        decisionDraft.decision_steps.forEach((step) => {
            if (step.guardian_review) {
                if (step.guardian_review.abu) {
                    threeGuardiansReview.abu = step.guardian_review.abu;
                }
                if (step.guardian_review.dr_dre) {
                    threeGuardiansReview.dr_dre = step.guardian_review.dr_dre;
                }
                if (step.guardian_review.neptune) {
                    threeGuardiansReview.neptune = step.guardian_review.neptune;
                }
            }
        });
        const qualityMetrics = this.calculateQualityMetrics(decisionDraft);
        return {
            decision_steps: decisionDraft.decision_steps,
            step_drafts: stepDrafts,
            evidence_chain: evidenceChain,
            decision_log: decisionLog,
            three_guardians_review: Object.keys(threeGuardiansReview).length > 0
                ? threeGuardiansReview
                : undefined,
            quality_metrics: qualityMetrics,
        };
    }
    extractConclusion(decisionStep) {
        if (decisionStep.outputs.length === 0) {
            return '待生成';
        }
        const firstOutput = decisionStep.outputs[0];
        if (typeof firstOutput.value === 'boolean') {
            return firstOutput.value ? '是' : '否';
        }
        if (typeof firstOutput.value === 'string') {
            return firstOutput.value;
        }
        if (typeof firstOutput.value === 'number') {
            return firstOutput.value.toString();
        }
        return JSON.stringify(firstOutput.value);
    }
    calculateQualityMetrics(decisionDraft) {
        const stepsWithEvidence = decisionDraft.decision_steps.filter((step) => step.evidence.length > 0).length;
        const evidenceCompleteness = decisionDraft.decision_steps.length > 0
            ? stepsWithEvidence / decisionDraft.decision_steps.length
            : 0;
        const avgConfidence = decisionDraft.decision_steps.length > 0
            ? decisionDraft.decision_steps.reduce((sum, step) => sum + step.confidence, 0) / decisionDraft.decision_steps.length
            : 0;
        const userSatisfaction = 0.85;
        const explanationClickRate = 0.4;
        const regenerationCount = 0;
        return {
            evidence_completeness: evidenceCompleteness,
            decision_consistency: avgConfidence,
            user_satisfaction: userSatisfaction,
            explanation_click_rate: explanationClickRate,
            regeneration_count: regenerationCount,
        };
    }
    async generateStepExplanation(decisionDraft, decisionStepId) {
        var _a;
        const decisionStep = decisionDraft.decision_steps.find((step) => step.id === decisionStepId);
        if (!decisionStep) {
            return null;
        }
        const stepDrafts = ((_a = decisionDraft.step_draft) === null || _a === void 0 ? void 0 : _a.steps.filter((step) => decisionStep.step_draft_ids.includes(step.id))) || [];
        const evidenceChain = decisionStep.evidence.map((ev) => ({
            ...ev,
            evidence_id: ev.evidence_id,
            source: ev.source || ev.source_title || 'unknown',
            last_verified_at: ev.last_verified_at || ev.retrieved_at || new Date().toISOString(),
            confidence: ev.confidence,
        }));
        return {
            decision_step: decisionStep,
            step_drafts: stepDrafts,
            evidence_chain: evidenceChain,
            decision_log: decisionStep.decision_log,
            three_guardians_review: decisionStep.guardian_review,
        };
    }
    async generateStudioExplanation(decisionDraft) {
        const firstStep = decisionDraft.decision_steps[0];
        if (!firstStep) {
            throw new Error('决策草案中没有决策步骤');
        }
        const stepExplanation = await this.generateStepExplanation(decisionDraft, firstStep.id);
        if (!stepExplanation) {
            throw new Error('无法生成决策步骤解释');
        }
        const debugInfo = decisionDraft.debug_info || {};
        const optimizationSuggestions = this.generateOptimizationSuggestions(decisionDraft);
        const studioExplanation = {
            decision_step: stepExplanation.decision_step,
            step_drafts: stepExplanation.step_drafts,
            evidence_chain: stepExplanation.evidence_chain,
            decision_log: stepExplanation.decision_log,
            three_guardians_review: stepExplanation.three_guardians_review,
            llm_calls: debugInfo.llm_calls,
            skill_calls: debugInfo.skill_calls,
            performance_metrics: debugInfo.performance_metrics,
            optimization_suggestions: optimizationSuggestions,
        };
        return studioExplanation;
    }
    generateOptimizationSuggestions(decisionDraft) {
        const suggestions = [];
        const qualityMetrics = this.calculateQualityMetrics(decisionDraft);
        if (qualityMetrics.evidence_completeness < 0.8) {
            suggestions.push('建议增加更多证据支持，提高决策的可信度');
        }
        if (qualityMetrics.decision_consistency < 0.85) {
            suggestions.push('部分决策的置信度较低，建议重新评估相关决策');
        }
        if (qualityMetrics.user_satisfaction < 0.75) {
            suggestions.push('用户满意度较低，建议收集用户反馈并优化决策逻辑');
        }
        if (qualityMetrics.explanation_click_rate < 0.4) {
            suggestions.push('解释点击率较低，建议优化解释的可读性和相关性');
        }
        if (qualityMetrics.regeneration_count > 3) {
            suggestions.push('重生成次数较多，建议优化决策生成逻辑，减少不必要的重生成');
        }
        return suggestions;
    }
};
exports.DecisionExplanationService = DecisionExplanationService;
exports.DecisionExplanationService = DecisionExplanationService = DecisionExplanationService_1 = __decorate([
    (0, common_1.Injectable)()
], DecisionExplanationService);
//# sourceMappingURL=decision-explanation.service.js.map