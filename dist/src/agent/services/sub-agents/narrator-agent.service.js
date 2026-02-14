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
var ClaudeNarratorAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeNarratorAgentService = void 0;
const common_1 = require("@nestjs/common");
const narrator_agent_service_1 = require("../../../trips/decision/orchestration/narrator-agent.service");
const decision_explain_for_human_skill_1 = require("../../../skills/decision/decision-explain-for-human.skill");
const llm_service_1 = require("../../../llm/services/llm.service");
let ClaudeNarratorAgentService = ClaudeNarratorAgentService_1 = class ClaudeNarratorAgentService {
    constructor(langGraphNarrator, decisionExplainSkill, llmService) {
        this.langGraphNarrator = langGraphNarrator;
        this.decisionExplainSkill = decisionExplainSkill;
        this.llmService = llmService;
        this.logger = new common_1.Logger(ClaudeNarratorAgentService_1.name);
        this.logger.log(`[ClaudeNarratorAgent] 已初始化`);
        this.logger.log(`[ClaudeNarratorAgent] LangGraphNarrator: ${!!this.langGraphNarrator}, DecisionExplainSkill: ${!!this.decisionExplainSkill}, LlmService: ${!!this.llmService}`);
    }
    async narrate(itinerary, gateResult, decisionLog, context) {
        this.logger.debug(`[ClaudeNarratorAgent] 生成叙述: request_id=${itinerary.request_id}`);
        try {
            const user_friendly_summary = this.generateSummary(itinerary, gateResult);
            const day_by_day_narrative = itinerary.days.map((day, index) => ({
                day: index + 1,
                date: day.date,
                narrative: this.generateDayNarrative(day, index + 1),
            }));
            const highlights = this.extractHighlights(itinerary);
            const tips = this.generateTips(itinerary, gateResult);
            const warnings = this.generateWarnings(gateResult, decisionLog);
            return {
                user_friendly_summary,
                day_by_day_narrative,
                highlights,
                tips,
                warnings,
            };
        }
        catch (error) {
            this.logger.error(`[ClaudeNarratorAgent] 生成叙述失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            return {
                user_friendly_summary: `已为您生成 ${itinerary.days.length} 天的行程安排。`,
                day_by_day_narrative: itinerary.days.map((day, index) => ({
                    day: index + 1,
                    date: day.date,
                    narrative: `第 ${index + 1} 天行程，包含 ${day.items.length} 个活动。`,
                })),
                highlights: [],
                tips: ['请以官方信息为准，出行前再次确认'],
                warnings: gateResult.violations.length > 0 ? ['请注意行程中的风险提示'] : undefined,
            };
        }
    }
    generateSimplifiedDecisionLog(decisionLog, gateResult) {
        const keyDecisions = [];
        if (gateResult) {
            keyDecisions.push({
                step: 'GATE_EVAL',
                decision: this.translateGateResult(gateResult.gate_result),
                impact: 'HIGH',
            });
        }
        for (const entry of decisionLog) {
            if (this.isKeyDecision(entry)) {
                keyDecisions.push({
                    step: entry.step,
                    decision: this.simplifyDecisionMessage(entry),
                    impact: this.assessDecisionImpact(entry),
                });
            }
        }
        const filteredDecisions = keyDecisions.filter(d => d.impact === 'HIGH' || d.impact === 'MEDIUM');
        const summary = this.generateDecisionSummary(gateResult, filteredDecisions);
        return {
            summary,
            key_decisions: filteredDecisions.slice(0, 5),
            evidence_count: decisionLog.reduce((sum, entry) => { var _a; return sum + (((_a = entry.evidence_refs) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0),
            has_details: true,
        };
    }
    isKeyDecision(entry) {
        const keySteps = ['GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR'];
        return keySteps.includes(entry.step);
    }
    simplifyDecisionMessage(entry) {
        let message = entry.outputs_summary || entry.inputs_summary || '';
        message = message.replace(/GATE_EVAL/g, '可行性评估');
        message = message.replace(/PLAN_GEN/g, '行程生成');
        message = message.replace(/VERIFY/g, '验证');
        message = message.replace(/REPAIR/g, '修复');
        message = message.replace(/INTAKE/g, '需求解析');
        message = message.replace(/RESEARCH/g, '数据收集');
        message = message.replace(/NARRATE/g, '说明生成');
        if (message.length > 100) {
            message = message.substring(0, 97) + '...';
        }
        return message;
    }
    assessDecisionImpact(entry) {
        if (entry.step === 'GATE_EVAL') {
            return 'HIGH';
        }
        if (entry.step === 'PLAN_GEN' || entry.step === 'REPAIR') {
            return 'HIGH';
        }
        if (entry.step === 'VERIFY') {
            return 'MEDIUM';
        }
        return 'LOW';
    }
    generateDecisionSummary(gateResult, keyDecisions) {
        const parts = [];
        if (gateResult) {
            parts.push(`行程${this.translateGateResult(gateResult.gate_result)}`);
        }
        if (keyDecisions.length > 0) {
            parts.push(`进行了${keyDecisions.length}项关键检查`);
        }
        return parts.join('，') + '。';
    }
    translateGateResult(status) {
        const translations = {
            'ALLOW': '已通过',
            'BLOCK': '被拒绝',
            'ADJUST_REQUIRED': '需要调整',
            'NEED_USER_CONFIRM': '需要您确认',
        };
        return translations[status] || status;
    }
    generateSummary(itinerary, gateResult) {
        const parts = [];
        if (gateResult.gate_result === 'ALLOW') {
            parts.push(`为您规划了${itinerary.days.length}天的行程`);
            parts.push('行程已通过安全检查');
        }
        else if (gateResult.gate_result === 'ADJUST_REQUIRED') {
            parts.push(`为您规划了${itinerary.days.length}天的行程`);
            parts.push('行程需要一些调整');
        }
        else if (gateResult.gate_result === 'NEED_USER_CONFIRM') {
            parts.push(`为您规划了${itinerary.days.length}天的行程`);
            parts.push('部分内容需要您的确认');
        }
        else if (gateResult.gate_result === 'BLOCK') {
            parts.push(`行程存在安全风险，建议修改`);
        }
        const totalItems = itinerary.days.reduce((sum, day) => sum + day.items.length, 0);
        if (totalItems > 0) {
            parts.push(`包含${totalItems}个精选地点`);
        }
        return parts.join('，') + '。';
    }
    generateDayNarrative(day, dayNumber) {
        const itemCount = day.items.length;
        if (itemCount === 0) {
            return `第 ${dayNumber} 天暂无安排，您可以自由探索或休息。`;
        }
        const poiItems = day.items.filter(item => item.type === 'POI');
        const transitItems = day.items.filter(item => item.type === 'TRANSIT');
        const mealItems = day.items.filter(item => item.type === 'MEAL');
        const parts = [];
        if (poiItems.length > 0) {
            const poiNames = poiItems
                .slice(0, 3)
                .map(item => item.location_ref.name)
                .filter(Boolean);
            if (poiNames.length > 0) {
                parts.push(`将游览${poiNames.join('、')}${poiItems.length > 3 ? '等' : ''}`);
            }
        }
        if (transitItems.length > 0) {
            parts.push(`包含${transitItems.length}段交通安排`);
        }
        if (mealItems.length > 0) {
            parts.push(`安排了${mealItems.length}次用餐`);
        }
        return parts.length > 0
            ? `第 ${dayNumber} 天：${parts.join('，')}。`
            : `第 ${dayNumber} 天行程，包含 ${itemCount} 个活动。`;
    }
    extractHighlights(itinerary) {
        const highlights = [];
        for (const day of itinerary.days) {
            for (const item of day.items) {
                if (item.type === 'POI' && item.location_ref.name) {
                    const poiName = item.location_ref.name;
                    highlights.push(poiName);
                    if (highlights.length >= 5)
                        break;
                }
            }
            if (highlights.length >= 5)
                break;
        }
        return highlights;
    }
    generateTips(itinerary, gateResult) {
        const tips = [];
        const hasUnverified = itinerary.days.some(day => day.items.some(item => !item.verified || item.verification_status === 'UNVERIFIED'));
        if (hasUnverified) {
            tips.push('部分信息可能尚未完全核验，建议您出行前以官方信息为准');
        }
        if (gateResult.gate_result === 'ADJUST_REQUIRED') {
            tips.push('行程已根据您的需求进行了优化调整，请查看是否符合您的期望');
        }
        tips.push('出行前建议再次确认交通班次、开放时间和票价，避免临时变更');
        tips.push('请关注天气预报，根据实际情况灵活调整行程安排');
        return tips;
    }
    generateWarnings(gateResult, decisionLog) {
        const warnings = [];
        if (gateResult.violations) {
            for (const violation of gateResult.violations) {
                if (violation.severity === 'HARD' || violation.type === 'SAFETY') {
                    warnings.push(violation.detail);
                }
            }
        }
        return warnings.length > 0 ? warnings : undefined;
    }
    generateDecisionStory(decisionOutput) {
        const { ranked_plans, comparison, user_judgment_required } = decisionOutput;
        const eliminatedOptions = ranked_plans.slice(2).map(plan => ({
            name: plan.plan.name,
            reason: this.generateEliminationReason(plan, ranked_plans[0]),
            what_you_would_lose: plan.what_you_get,
        }));
        const eliminationNarrative = {
            title: 'Why we narrowed it down',
            eliminated_options: eliminatedOptions,
            summary: eliminatedOptions.length > 0
                ? `We evaluated ${ranked_plans.length} options and narrowed down to ${Math.min(2, ranked_plans.length)} finalists based on your preferences.`
                : 'All options passed initial screening.',
        };
        const finalists = ranked_plans.slice(0, 2).map(plan => ({
            name: plan.plan.name,
            strengths: this.extractStrengths(plan),
            weaknesses: this.extractWeaknesses(plan),
            best_for: this.generateBestForStatement(plan),
        }));
        const finalistNarrative = {
            title: 'Your top choices',
            finalists,
            comparison_summary: this.generateComparisonSummary(ranked_plans.slice(0, 2)),
        };
        const recommended = ranked_plans[0];
        const recommendationNarrative = {
            title: 'Our recommendation',
            recommended: (recommended === null || recommended === void 0 ? void 0 : recommended.plan.name) || 'No recommendation',
            confidence: this.getConfidenceLabel((recommended === null || recommended === void 0 ? void 0 : recommended.uncertainty.confidence) || 0),
            reasoning: recommended ? this.generateRecommendationReasoning(recommended, ranked_plans) : 'No candidates available',
            what_you_pay_for: (recommended === null || recommended === void 0 ? void 0 : recommended.what_you_pay_for) || 'N/A',
            what_you_get: (recommended === null || recommended === void 0 ? void 0 : recommended.what_you_get) || 'N/A',
        };
        return {
            elimination_narrative: eliminationNarrative,
            finalist_narrative: finalistNarrative,
            recommendation_narrative: recommendationNarrative,
        };
    }
    generateDecisionVisualization(decisionOutput) {
        const { ranked_plans, comparison } = decisionOutput;
        const highlights = this.extractComparisonHighlights(comparison);
        const comparisonVisualization = {
            type: 'radar',
            data: comparison,
            highlights,
        };
        const overallRisk = ranked_plans.length > 0
            ? ranked_plans[0].tradeoffs.RISK.value
            : 0;
        const riskBreakdown = this.generateRiskBreakdown(ranked_plans[0]);
        const riskVisualization = {
            type: 'gauge',
            overall_risk: overallRisk,
            risk_breakdown: riskBreakdown,
        };
        const confidence = ranked_plans.length > 0
            ? ranked_plans[0].uncertainty.confidence
            : 0;
        const uncertaintyVisualization = {
            type: 'range',
            confidence_level: confidence,
            confidence_label: this.getConfidenceLabel(confidence),
            uncertainty_factors: ranked_plans.length > 0
                ? ranked_plans[0].uncertainty.uncertainty_sources.map(s => ({
                    factor: s.source,
                    impact: s.impact,
                }))
                : [],
        };
        return {
            comparison_visualization: comparisonVisualization,
            risk_visualization: riskVisualization,
            uncertainty_visualization: uncertaintyVisualization,
        };
    }
    generateFullDecisionPresentation(decisionOutput, itinerary, gateResult) {
        const story = this.generateDecisionStory(decisionOutput);
        const visualization = this.generateDecisionVisualization(decisionOutput);
        const userActions = this.generateUserActions(decisionOutput, gateResult);
        return {
            story,
            visualization,
            narrative: {
                user_friendly_summary: story.recommendation_narrative.reasoning,
                day_by_day_narrative: [],
                highlights: story.finalist_narrative.finalists.flatMap(f => f.strengths),
                tips: [],
                warnings: visualization.risk_visualization.overall_risk > 60
                    ? ['This plan has elevated risk factors']
                    : undefined,
            },
            user_actions: userActions,
        };
    }
    generateEliminationReason(eliminated, winner) {
        const scoreDiff = winner.plan.score - eliminated.plan.score;
        if (scoreDiff > 20)
            return 'Significantly lower overall score';
        if (eliminated.tradeoffs.RISK.value > 70)
            return 'Higher risk profile';
        if (eliminated.tradeoffs.COST.value < 40)
            return 'Less cost-effective';
        return 'Lower match with your preferences';
    }
    extractStrengths(plan) {
        const strengths = [];
        if (plan.tradeoffs.TIME.value > 60)
            strengths.push('Efficient time management');
        if (plan.tradeoffs.COST.value > 60)
            strengths.push('Good value for money');
        if (plan.tradeoffs.EXPERIENCE.value > 60)
            strengths.push('Rich experience variety');
        if (plan.tradeoffs.RISK.value < 40)
            strengths.push('Low risk profile');
        return strengths.length > 0 ? strengths : ['Balanced overall approach'];
    }
    extractWeaknesses(plan) {
        const weaknesses = [];
        if (plan.tradeoffs.TIME.value < 40)
            weaknesses.push('May feel rushed');
        if (plan.tradeoffs.COST.value < 40)
            weaknesses.push('Higher budget required');
        if (plan.tradeoffs.EXPERIENCE.value < 40)
            weaknesses.push('Limited variety');
        if (plan.tradeoffs.RISK.value > 60)
            weaknesses.push('Some uncertainties');
        return weaknesses;
    }
    generateBestForStatement(plan) {
        const scores = plan.tradeoffs;
        if (scores.EXPERIENCE.value > scores.COST.value && scores.EXPERIENCE.value > scores.TIME.value) {
            return 'Travelers prioritizing unique experiences';
        }
        if (scores.COST.value > scores.EXPERIENCE.value) {
            return 'Budget-conscious travelers';
        }
        if (scores.TIME.value > 60) {
            return 'Travelers with limited time';
        }
        return 'Travelers seeking balance';
    }
    generateComparisonSummary(finalists) {
        if (finalists.length < 2)
            return 'Single option available';
        const [first, second] = finalists;
        const scoreDiff = Math.abs(first.plan.score - second.plan.score);
        if (scoreDiff < 5) {
            return 'Both options are very close in overall score. Your personal preference should guide the final choice.';
        }
        return `${first.plan.name} scores ${scoreDiff.toFixed(0)} points higher overall, but ${second.plan.name} may better suit specific needs.`;
    }
    generateRecommendationReasoning(recommended, allPlans) {
        const parts = [];
        parts.push(`${recommended.plan.name} offers ${recommended.what_you_get}`);
        if (allPlans.length > 1) {
            parts.push(`compared to ${allPlans.length - 1} other option(s)`);
        }
        const confidence = recommended.uncertainty.confidence;
        if (confidence > 0.7) {
            parts.push('with high confidence');
        }
        else if (confidence > 0.4) {
            parts.push('with moderate confidence');
        }
        else {
            parts.push('though some aspects remain uncertain');
        }
        return parts.join(' ') + '.';
    }
    getConfidenceLabel(confidence) {
        if (confidence > 0.8)
            return 'Very High';
        if (confidence > 0.6)
            return 'High';
        if (confidence > 0.4)
            return 'Moderate';
        if (confidence > 0.2)
            return 'Low';
        return 'Very Low';
    }
    extractComparisonHighlights(comparison) {
        return comparison.matrix.map(row => {
            const best = row.values.find(v => v.is_best);
            const others = row.values.filter(v => !v.is_best);
            const maxOther = others.length > 0 ? Math.max(...others.map(v => v.value)) : 0;
            const margin = best ? Math.abs(best.value - maxOther) : 0;
            return {
                dimension: row.dimension,
                winner: (best === null || best === void 0 ? void 0 : best.plan_id) || 'N/A',
                margin: margin > 20 ? 'Significant' : margin > 10 ? 'Moderate' : 'Slight',
            };
        });
    }
    generateRiskBreakdown(plan) {
        if (!plan)
            return [];
        const factors = plan.plan.tradeoffs.risk.factors;
        return factors.slice(0, 3).map((factor, idx) => ({
            category: `Risk Factor ${idx + 1}`,
            level: Math.min(100, 30 + idx * 20),
            description: factor,
        }));
    }
    generateUserActions(decisionOutput, gateResult) {
        const actions = [];
        if (decisionOutput.ranked_plans.length > 0) {
            actions.push({
                action_id: 'accept_recommendation',
                label: 'Accept Recommendation',
                description: `Proceed with ${decisionOutput.ranked_plans[0].plan.name}`,
                impact: 'Confirms the suggested plan',
            });
        }
        if (decisionOutput.ranked_plans.length > 1) {
            actions.push({
                action_id: 'view_alternatives',
                label: 'View Alternatives',
                description: 'Compare with other options',
                impact: 'Shows detailed comparison',
            });
        }
        actions.push({
            action_id: 'adjust_preferences',
            label: 'Adjust Preferences',
            description: 'Change priority weights',
            impact: 'Recalculates recommendations',
        });
        if (decisionOutput.user_judgment_required.length > 0) {
            actions.push({
                action_id: 'answer_questions',
                label: 'Answer Questions',
                description: `${decisionOutput.user_judgment_required.length} question(s) need your input`,
                impact: 'Improves recommendation accuracy',
            });
        }
        return actions;
    }
};
exports.ClaudeNarratorAgentService = ClaudeNarratorAgentService;
exports.ClaudeNarratorAgentService = ClaudeNarratorAgentService = ClaudeNarratorAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [narrator_agent_service_1.NarratorAgentService,
        decision_explain_for_human_skill_1.DecisionExplainForHumanSkill,
        llm_service_1.LlmService])
], ClaudeNarratorAgentService);
//# sourceMappingURL=narrator-agent.service.js.map