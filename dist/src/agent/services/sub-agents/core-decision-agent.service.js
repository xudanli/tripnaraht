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
var ClaudeCoreDecisionAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeCoreDecisionAgentService = void 0;
const common_1 = require("@nestjs/common");
const tot_evaluator_service_1 = require("../../../trips/decision/tot/tot-evaluator.service");
const ranking_service_1 = require("../../../planning-policy/services/ranking.service");
let ClaudeCoreDecisionAgentService = ClaudeCoreDecisionAgentService_1 = class ClaudeCoreDecisionAgentService {
    constructor(totEvaluator, rankingService) {
        this.totEvaluator = totEvaluator;
        this.rankingService = rankingService;
        this.logger = new common_1.Logger(ClaudeCoreDecisionAgentService_1.name);
        this.DEFAULT_WEIGHTS = {
            TIME: 0.25,
            COST: 0.25,
            EXPERIENCE: 0.30,
            RISK: 0.20,
        };
        this.logger.log(`[CoreDecision/Dr.Dre] Initialized`);
    }
    async makeDecision(candidates, request, context) {
        this.logger.debug(`[ClaudeCoreDecisionAgent] 权衡候选方案: request_id=${request.request_id}, 候选数量=${candidates.length}`);
        try {
            if (candidates.length === 0) {
                throw new Error('没有候选方案可供选择');
            }
            const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);
            const selected = sortedCandidates[0];
            const decision_reasoning = this.generateDecisionReasoning(selected, sortedCandidates, request);
            const rejected_candidates = sortedCandidates.slice(1).map((candidate, index) => ({
                itinerary_id: candidate.itinerary.request_id || `candidate_${index + 1}`,
                reason: `得分较低（${candidate.score.toFixed(2)} vs ${selected.score.toFixed(2)}）`,
            }));
            this.logger.log(`[ClaudeCoreDecisionAgent] 选择方案: request_id=${selected.itinerary.request_id}, 得分=${selected.score.toFixed(2)}`);
            return {
                selected_itinerary: selected.itinerary,
                decision_reasoning,
                rejected_candidates,
            };
        }
        catch (error) {
            this.logger.error(`[ClaudeCoreDecisionAgent] 决策失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    generateDecisionReasoning(selected, allCandidates, request) {
        const parts = [];
        parts.push(`选择得分最高的方案（${selected.score.toFixed(2)}分）`);
        if (selected.pros.length > 0) {
            parts.push(`优点：${selected.pros.slice(0, 3).join('、')}`);
        }
        if (allCandidates.length > 1) {
            const secondBest = allCandidates[1];
            parts.push(`相比第二方案（${secondBest.score.toFixed(2)}分），优势在于：${selected.pros.filter(p => !secondBest.pros.includes(p)).slice(0, 2).join('、') || '综合评分更高'}`);
        }
        return parts.join('。');
    }
    async analyzeDecision(candidates, request, context, userPreferences) {
        this.logger.debug(`[CoreDecision/Dr.Dre] Analyzing ${candidates.length} candidates`);
        const weights = { ...this.DEFAULT_WEIGHTS, ...userPreferences === null || userPreferences === void 0 ? void 0 : userPreferences.weights };
        if (userPreferences === null || userPreferences === void 0 ? void 0 : userPreferences.priority) {
            weights[userPreferences.priority] = Math.min(0.5, weights[userPreferences.priority] + 0.15);
            this.normalizeWeights(weights);
        }
        const analyzedOptions = candidates.map((candidate, index) => this.analyzeCandidate(candidate, index, weights, (userPreferences === null || userPreferences === void 0 ? void 0 : userPreferences.risk_tolerance) || 'MEDIUM'));
        const rankedOptions = this.rankOptions(analyzedOptions, weights);
        const comparison = this.buildComparisonMatrix(rankedOptions);
        const userJudgmentRequired = this.identifyUserJudgmentPoints(rankedOptions, comparison);
        const decisionNode = this.buildDecisionNode(request, rankedOptions, userPreferences);
        const output = {
            decision_node: decisionNode,
            ranked_plans: rankedOptions.map((opt, idx) => ({
                plan: opt,
                rank: idx + 1,
                uncertainty: opt.uncertainty,
                tradeoffs: {
                    TIME: { value: opt.tradeoffs.time.value, impact: opt.tradeoffs.time.impact },
                    COST: { value: opt.tradeoffs.cost.value, impact: opt.tradeoffs.cost.impact },
                    EXPERIENCE: { value: opt.tradeoffs.experience.value, impact: opt.tradeoffs.experience.description },
                    RISK: { value: opt.tradeoffs.risk.value, impact: opt.tradeoffs.risk.factors.join(', ') },
                },
                what_you_pay_for: this.generateWhatYouPayFor(opt),
                what_you_get: this.generateWhatYouGet(opt),
            })),
            comparison,
            user_judgment_required: userJudgmentRequired,
            evidence_summary: this.summarizeEvidence(rankedOptions),
        };
        this.logger.debug(`[CoreDecision/Dr.Dre] Analysis complete: ${rankedOptions.length} plans ranked`);
        return output;
    }
    analyzeCandidate(candidate, index, weights, riskTolerance) {
        const itinerary = candidate.itinerary;
        const timeValue = this.calculateTimeScore(itinerary);
        const costValue = this.calculateCostScore(itinerary);
        const experienceValue = this.calculateExperienceScore(itinerary, candidate.pros);
        const riskValue = this.calculateRiskScore(itinerary, candidate.cons, riskTolerance);
        const uncertainty = this.calculateUncertainty(candidate, riskTolerance);
        const weightedScore = timeValue * weights.TIME +
            costValue * weights.COST +
            experienceValue * weights.EXPERIENCE +
            (100 - riskValue) * weights.RISK;
        return {
            id: itinerary.request_id || `plan_${index + 1}`,
            name: this.generatePlanName(itinerary, index),
            description: this.generatePlanDescription(itinerary, candidate.pros),
            tradeoffs: {
                time: {
                    value: timeValue,
                    unit: 'score',
                    impact: timeValue > 70 ? 'Efficient use of time' : timeValue > 40 ? 'Balanced pace' : 'Relaxed pace',
                },
                cost: {
                    value: costValue,
                    currency: 'USD',
                    impact: costValue > 70 ? 'Budget-friendly' : costValue > 40 ? 'Moderate expense' : 'Premium experience',
                },
                experience: {
                    value: experienceValue,
                    description: experienceValue > 70 ? 'Rich and diverse' : experienceValue > 40 ? 'Good coverage' : 'Focused experience',
                },
                risk: {
                    value: riskValue,
                    factors: candidate.cons.slice(0, 3),
                },
            },
            uncertainty,
            evidence_refs: candidate.evidence_refs,
            constraint_satisfaction: [],
            score: weightedScore,
        };
    }
    rankOptions(options, weights) {
        return [...options]
            .sort((a, b) => b.score - a.score)
            .map((opt, idx) => ({ ...opt, ranking: idx + 1 }));
    }
    buildComparisonMatrix(options) {
        const dimensions = ['TIME', 'COST', 'EXPERIENCE', 'RISK'];
        const matrix = dimensions.map(dim => {
            const values = options.map(opt => {
                const value = dim === 'TIME' ? opt.tradeoffs.time.value :
                    dim === 'COST' ? opt.tradeoffs.cost.value :
                        dim === 'EXPERIENCE' ? opt.tradeoffs.experience.value :
                            opt.tradeoffs.risk.value;
                return {
                    plan_id: opt.id,
                    value,
                    display: `${Math.round(value)}`,
                    is_best: false,
                };
            });
            const bestValue = dim === 'RISK'
                ? Math.min(...values.map(v => v.value))
                : Math.max(...values.map(v => v.value));
            values.forEach(v => { v.is_best = v.value === bestValue; });
            return { dimension: dim, values };
        });
        const recommendation = options.length > 0 ? {
            plan_id: options[0].id,
            confidence: options[0].uncertainty.confidence,
            reasoning: `Based on weighted analysis: ${this.generateWhatYouGet(options[0])}`,
        } : {
            plan_id: '',
            confidence: 0,
            reasoning: 'No candidates available',
        };
        return {
            plans: options.map(opt => ({
                plan_id: opt.id,
                name: opt.name,
                summary: opt.description,
            })),
            dimensions,
            matrix,
            recommendation,
        };
    }
    identifyUserJudgmentPoints(options, comparison) {
        const points = [];
        if (options.length < 2)
            return points;
        const top2 = options.slice(0, 2);
        const scoreDiff = Math.abs(top2[0].score - top2[1].score);
        if (scoreDiff < 10) {
            points.push({
                question: 'Two plans have similar scores. Which aspect is more important to you?',
                context: `Plan A (${top2[0].name}) vs Plan B (${top2[1].name}) differ by only ${scoreDiff.toFixed(1)} points`,
                options: [
                    { id: 'time', label: 'Optimize for time efficiency', impact: `May favor ${top2[0].tradeoffs.time.value > top2[1].tradeoffs.time.value ? 'Plan A' : 'Plan B'}` },
                    { id: 'cost', label: 'Optimize for budget', impact: `May favor ${top2[0].tradeoffs.cost.value > top2[1].tradeoffs.cost.value ? 'Plan A' : 'Plan B'}` },
                    { id: 'experience', label: 'Optimize for experience', impact: `May favor ${top2[0].tradeoffs.experience.value > top2[1].tradeoffs.experience.value ? 'Plan A' : 'Plan B'}` },
                ],
            });
        }
        const highRiskPlans = options.filter(opt => opt.tradeoffs.risk.value > 60);
        if (highRiskPlans.length > 0) {
            points.push({
                question: 'Some plans have elevated risk. Are you comfortable with higher risk for better rewards?',
                context: `${highRiskPlans.length} plan(s) have risk scores above 60`,
                options: [
                    { id: 'accept', label: 'Accept higher risk for better experience', impact: 'Keep all plans in consideration' },
                    { id: 'avoid', label: 'Prefer safer options', impact: 'Filter out high-risk plans' },
                ],
                recommendation: 'avoid',
            });
        }
        return points;
    }
    buildDecisionNode(request, options, preferences) {
        const now = new Date().toISOString();
        return {
            id: `decision_${request.request_id || Date.now()}`,
            type: 'ROOT',
            name: 'Trip Plan Selection',
            description: `Select optimal plan for ${request.destination || 'destination'}`,
            context: {
                destination: typeof request.destination === 'string' ? request.destination : undefined,
                date_range: request.date_range ? { start: request.date_range.start_date, end: request.date_range.end_date } : undefined,
                travelers: request.party ? { count: request.party.count, profile: request.party.fitness_level || 'medium' } : undefined,
                current_phase: 'PLAN_SELECTION',
            },
            constraints: {
                hard: [],
                soft: [],
            },
            preferences: {
                pace: 'BALANCED',
                priority: (preferences === null || preferences === void 0 ? void 0 : preferences.priority) || 'EXPERIENCE',
                risk_tolerance: (preferences === null || preferences === void 0 ? void 0 : preferences.risk_tolerance) || 'MEDIUM',
            },
            options,
            tradeoff_model: this.buildTradeoffModels(options),
            overall_uncertainty: this.calculateOverallUncertainty(options),
            decision: options.length > 0 ? {
                selected_option_id: options[0].id,
                reasoning: this.generateWhatYouGet(options[0]),
                alternatives_considered: options.slice(1).map(o => o.id),
            } : undefined,
            metadata: {
                created_at: now,
                updated_at: now,
                version: 1,
            },
        };
    }
    normalizeWeights(weights) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);
        if (sum > 0) {
            for (const key of Object.keys(weights)) {
                weights[key] /= sum;
            }
        }
    }
    calculateTimeScore(itinerary) {
        var _a, _b;
        const days = ((_a = itinerary.days) === null || _a === void 0 ? void 0 : _a.length) || 1;
        const avgItemsPerDay = (((_b = itinerary.days) === null || _b === void 0 ? void 0 : _b.reduce((sum, d) => { var _a; return sum + (((_a = d.items) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0)) || 0) / days;
        return Math.min(100, Math.max(0, 50 + avgItemsPerDay * 10 - days * 2));
    }
    calculateCostScore(itinerary) {
        return 60;
    }
    calculateExperienceScore(itinerary, pros) {
        var _a;
        const baseScore = 50;
        const prosBonus = Math.min(30, pros.length * 10);
        const diversityBonus = ((_a = itinerary.days) === null || _a === void 0 ? void 0 : _a.length) ? Math.min(20, itinerary.days.length * 3) : 0;
        return Math.min(100, baseScore + prosBonus + diversityBonus);
    }
    calculateRiskScore(itinerary, cons, tolerance) {
        const baseRisk = 20;
        const consRisk = Math.min(40, cons.length * 15);
        const toleranceFactor = tolerance === 'LOW' ? 1.3 : tolerance === 'HIGH' ? 0.7 : 1;
        return Math.min(100, (baseRisk + consRisk) * toleranceFactor);
    }
    calculateUncertainty(candidate, tolerance) {
        const evidenceCount = candidate.evidence_refs.length;
        const confidence = Math.min(0.95, 0.5 + evidenceCount * 0.1);
        return {
            confidence,
            data_quality: evidenceCount > 5 ? 'HIGH' : evidenceCount > 2 ? 'MEDIUM' : 'LOW',
            uncertainty_sources: candidate.cons.slice(0, 3).map(con => ({
                source: con,
                impact: 'MEDIUM',
            })),
            risk_distribution: {
                optimistic: confidence + 0.1,
                expected: confidence,
                pessimistic: confidence - 0.15,
            },
        };
    }
    calculateOverallUncertainty(options) {
        if (options.length === 0) {
            return { confidence: 0, data_quality: 'UNKNOWN', uncertainty_sources: [] };
        }
        const avgConfidence = options.reduce((sum, o) => sum + o.uncertainty.confidence, 0) / options.length;
        return {
            confidence: avgConfidence,
            data_quality: avgConfidence > 0.7 ? 'HIGH' : avgConfidence > 0.4 ? 'MEDIUM' : 'LOW',
            uncertainty_sources: [],
        };
    }
    buildTradeoffModels(options) {
        if (options.length === 0)
            return [];
        const dimensions = ['TIME', 'COST', 'EXPERIENCE', 'RISK'];
        return dimensions.map(dim => {
            const values = options.map(o => dim === 'TIME' ? o.tradeoffs.time.value :
                dim === 'COST' ? o.tradeoffs.cost.value :
                    dim === 'EXPERIENCE' ? o.tradeoffs.experience.value :
                        o.tradeoffs.risk.value);
            const min = Math.min(...values);
            const max = Math.max(...values);
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            return {
                dimension: dim,
                weight: this.DEFAULT_WEIGHTS[dim],
                current_value: avg,
                optimal_value: dim === 'RISK' ? min : max,
                acceptable_range: { min, max },
                loss_function: dim === 'RISK' ? 'minimize' : 'maximize',
            };
        });
    }
    generatePlanName(itinerary, index) {
        var _a;
        const days = ((_a = itinerary.days) === null || _a === void 0 ? void 0 : _a.length) || 0;
        const prefix = ['Optimal', 'Alternative', 'Budget', 'Premium'][Math.min(index, 3)];
        return `${prefix} ${days}-Day Plan`;
    }
    generatePlanDescription(itinerary, pros) {
        return pros.length > 0 ? pros.slice(0, 2).join('. ') : 'A balanced itinerary option.';
    }
    generateWhatYouPayFor(option) {
        const costs = [];
        if (option.tradeoffs.time.value < 50)
            costs.push('More travel time');
        if (option.tradeoffs.cost.value < 50)
            costs.push('Higher budget');
        if (option.tradeoffs.risk.value > 50)
            costs.push('Some uncertainty');
        return costs.length > 0 ? costs.join(', ') : 'Minimal trade-offs';
    }
    generateWhatYouGet(option) {
        const benefits = [];
        if (option.tradeoffs.experience.value > 60)
            benefits.push('Rich experiences');
        if (option.tradeoffs.time.value > 60)
            benefits.push('Efficient scheduling');
        if (option.tradeoffs.cost.value > 60)
            benefits.push('Value for money');
        if (option.tradeoffs.risk.value < 40)
            benefits.push('Low risk');
        return benefits.length > 0 ? benefits.join(', ') : 'Balanced experience';
    }
    summarizeEvidence(options) {
        const allRefs = options.flatMap(o => o.evidence_refs);
        return {
            total_evidence: allRefs.length,
            verified: Math.floor(allRefs.length * 0.6),
            unverified: Math.floor(allRefs.length * 0.3),
            assumptions: Math.floor(allRefs.length * 0.1),
        };
    }
};
exports.ClaudeCoreDecisionAgentService = ClaudeCoreDecisionAgentService;
exports.ClaudeCoreDecisionAgentService = ClaudeCoreDecisionAgentService = ClaudeCoreDecisionAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [tot_evaluator_service_1.ToTEvaluatorService,
        ranking_service_1.RankingService])
], ClaudeCoreDecisionAgentService);
//# sourceMappingURL=core-decision-agent.service.js.map