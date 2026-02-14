"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AlternativeComparisonService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlternativeComparisonService = void 0;
const common_1 = require("@nestjs/common");
let AlternativeComparisonService = AlternativeComparisonService_1 = class AlternativeComparisonService {
    constructor() {
        this.logger = new common_1.Logger(AlternativeComparisonService_1.name);
    }
    async compareRoutes(original, alternative, context) {
        const originalScore = this.calculateOverallScore(original, context);
        const alternativeScore = this.calculateOverallScore(alternative, context);
        const scoreDelta = alternativeScore - originalScore;
        const improvements = this.identifyImprovements(original, alternative, context);
        const tradeoffs = this.identifyTradeoffs(original, alternative, context);
        const recommendation = this.generateRecommendation(scoreDelta, improvements, tradeoffs, context);
        const explanation = this.generateExplanation(scoreDelta, improvements, tradeoffs, recommendation);
        return {
            original: {
                route: original,
                score: originalScore,
            },
            alternative: {
                route: alternative,
                score: alternativeScore,
            },
            improvements,
            tradeoffs,
            overall_score_delta: scoreDelta,
            recommendation,
            explanation,
        };
    }
    async compareMultipleAlternatives(original, alternatives, context) {
        return Promise.all(alternatives.map(alt => this.compareRoutes(original, alt, context)));
    }
    calculateOverallScore(result, context) {
        if (result.status === 'INFEASIBLE') {
            return -1000;
        }
        const weights = (context === null || context === void 0 ? void 0 : context.weights) || {
            cost: 0.2,
            risk: 0.3,
            time: 0.2,
            comfort: 0.15,
            safety: 0.15,
        };
        const costScore = this.calculateCostScore(result);
        const riskScore = this.calculateRiskScore(result);
        const timeScore = this.calculateTimeScore(result);
        const comfortScore = this.calculateComfortScore(result);
        const safetyScore = this.calculateSafetyScore(result);
        const totalScore = weights.cost * costScore +
            weights.risk * riskScore +
            weights.time * timeScore +
            weights.comfort * comfortScore +
            weights.safety * safetyScore;
        return totalScore;
    }
    calculateCostScore(result) {
        const totalTime = result.summary.total_travel_min + result.summary.total_wait_min;
        const normalizedTime = Math.max(0, 1 - totalTime / 480);
        return normalizedTime;
    }
    calculateRiskScore(result) {
        var _a;
        const riskLevel = (_a = result.robustness) === null || _a === void 0 ? void 0 : _a.risk_level;
        if (riskLevel === 'low')
            return 1.0;
        if (riskLevel === 'medium')
            return 0.6;
        if (riskLevel === 'high')
            return 0.3;
        return 0.5;
    }
    calculateTimeScore(result) {
        const travelTime = result.summary.total_travel_min;
        const waitTime = result.summary.total_wait_min;
        const totalTime = travelTime + waitTime;
        const normalizedTime = Math.max(0, 1 - totalTime / 240);
        return normalizedTime;
    }
    calculateComfortScore(result) {
        const waitTime = result.summary.total_wait_min;
        const droppedCount = result.summary.dropped_count;
        const waitScore = Math.max(0, 1 - waitTime / 120);
        const droppedScore = Math.max(0, 1 - droppedCount / 5);
        return (waitScore * 0.6 + droppedScore * 0.4);
    }
    calculateSafetyScore(result) {
        var _a, _b;
        const robustness = (_a = result.robustness) === null || _a === void 0 ? void 0 : _a.risk_level;
        let robustnessScore = 0.5;
        if (robustness === 'low')
            robustnessScore = 1.0;
        else if (robustness === 'medium')
            robustnessScore = 0.7;
        else if (robustness === 'high')
            robustnessScore = 0.4;
        const criticalWindows = ((_b = result.diagnostics) === null || _b === void 0 ? void 0 : _b.critical_windows) || [];
        const minSlack = criticalWindows.length > 0
            ? Math.min(...criticalWindows.map(w => w.slack_to_close_min))
            : 60;
        const slackScore = Math.min(1, minSlack / 30);
        return (robustnessScore * 0.7 + slackScore * 0.3);
    }
    identifyImprovements(original, alternative, context) {
        const improvements = [];
        const costOriginal = this.calculateCostScore(original);
        const costAlternative = this.calculateCostScore(alternative);
        if (costAlternative > costOriginal) {
            const improvement = ((costAlternative - costOriginal) / costOriginal) * 100;
            improvements.push({
                dimension: 'COST',
                improvement,
                evidence: [],
                explanation: `成本效率提升 ${improvement.toFixed(1)}%（旅行时间和等待时间减少）`,
                impact_score: Math.min(1, improvement / 20),
            });
        }
        const riskOriginal = this.calculateRiskScore(original);
        const riskAlternative = this.calculateRiskScore(alternative);
        if (riskAlternative > riskOriginal) {
            const improvement = ((riskAlternative - riskOriginal) / riskOriginal) * 100;
            improvements.push({
                dimension: 'RISK',
                improvement,
                evidence: [],
                explanation: `风险降低 ${improvement.toFixed(1)}%（稳健度提升）`,
                impact_score: Math.min(1, improvement / 30),
            });
        }
        const timeOriginal = this.calculateTimeScore(original);
        const timeAlternative = this.calculateTimeScore(alternative);
        if (timeAlternative > timeOriginal) {
            const improvement = ((timeAlternative - timeOriginal) / timeOriginal) * 100;
            improvements.push({
                dimension: 'TIME',
                improvement,
                evidence: [],
                explanation: `时间效率提升 ${improvement.toFixed(1)}%（总时间减少）`,
                impact_score: Math.min(1, improvement / 25),
            });
        }
        const comfortOriginal = this.calculateComfortScore(original);
        const comfortAlternative = this.calculateComfortScore(alternative);
        if (comfortAlternative > comfortOriginal) {
            const improvement = ((comfortAlternative - comfortOriginal) / comfortOriginal) * 100;
            improvements.push({
                dimension: 'COMFORT',
                improvement,
                evidence: [],
                explanation: `舒适度提升 ${improvement.toFixed(1)}%（等待时间减少，丢弃节点减少）`,
                impact_score: Math.min(1, improvement / 20),
            });
        }
        const safetyOriginal = this.calculateSafetyScore(original);
        const safetyAlternative = this.calculateSafetyScore(alternative);
        if (safetyAlternative > safetyOriginal) {
            const improvement = ((safetyAlternative - safetyOriginal) / safetyOriginal) * 100;
            improvements.push({
                dimension: 'SAFETY',
                improvement,
                evidence: [],
                explanation: `安全性提升 ${improvement.toFixed(1)}%（稳健度和时间窗松弛度提升）`,
                impact_score: Math.min(1, improvement / 25),
            });
        }
        return improvements;
    }
    identifyTradeoffs(original, alternative, context) {
        const tradeoffs = [];
        const dimensions = [
            { name: 'COST', score: this.calculateCostScore.bind(this) },
            { name: 'RISK', score: this.calculateRiskScore.bind(this) },
            { name: 'TIME', score: this.calculateTimeScore.bind(this) },
            { name: 'COMFORT', score: this.calculateComfortScore.bind(this) },
            { name: 'SAFETY', score: this.calculateSafetyScore.bind(this) },
        ];
        dimensions.forEach(dim => {
            const originalScore = dim.score(original);
            const alternativeScore = dim.score(alternative);
            if (alternativeScore < originalScore) {
                const loss = ((originalScore - alternativeScore) / originalScore) * 100;
                const severity = loss < 10 ? 'LOW' : loss < 30 ? 'MEDIUM' : 'HIGH';
                tradeoffs.push({
                    dimension: dim.name,
                    loss,
                    explanation: `${this.getDimensionName(dim.name)}下降 ${loss.toFixed(1)}%`,
                    severity,
                });
            }
        });
        return tradeoffs;
    }
    generateRecommendation(scoreDelta, improvements, tradeoffs, context) {
        if (scoreDelta > 0.1 && tradeoffs.filter(t => t.severity === 'HIGH').length === 0) {
            return 'ACCEPT';
        }
        const hasHighSeverityTradeoff = tradeoffs.some(t => t.severity === 'HIGH');
        if (hasHighSeverityTradeoff) {
            return 'NEED_USER_CONFIRM';
        }
        const significantImprovements = improvements.filter(i => i.improvement > 20);
        const mediumTradeoffs = tradeoffs.filter(t => t.severity === 'MEDIUM');
        if (significantImprovements.length > 0 && mediumTradeoffs.length > 0) {
            return 'NEED_USER_CONFIRM';
        }
        if (scoreDelta < -0.05) {
            return 'REJECT';
        }
        return 'NEED_USER_CONFIRM';
    }
    generateExplanation(scoreDelta, improvements, tradeoffs, recommendation) {
        if (improvements.length === 0 && tradeoffs.length === 0) {
            return '替代方案与原始方案相似';
        }
        const parts = [];
        if (improvements.length > 0) {
            parts.push(`替代方案在以下方面有改善：${improvements.map(i => `${this.getDimensionName(i.dimension)} +${i.improvement.toFixed(1)}%`).join('、')}`);
        }
        if (tradeoffs.length > 0) {
            parts.push(`但在以下方面有所权衡：${tradeoffs.map(t => `${this.getDimensionName(t.dimension)} -${t.loss.toFixed(1)}%`).join('、')}`);
        }
        if (scoreDelta > 0) {
            parts.push(`总体评分提升 ${(scoreDelta * 100).toFixed(1)}%`);
        }
        else if (scoreDelta < 0) {
            parts.push(`总体评分下降 ${Math.abs(scoreDelta * 100).toFixed(1)}%`);
        }
        return parts.join('。') + '。';
    }
    getDimensionName(dimension) {
        const names = {
            COST: '成本效率',
            RISK: '风险控制',
            TIME: '时间效率',
            COMFORT: '舒适度',
            SAFETY: '安全性',
        };
        return names[dimension] || dimension;
    }
};
exports.AlternativeComparisonService = AlternativeComparisonService;
exports.AlternativeComparisonService = AlternativeComparisonService = AlternativeComparisonService_1 = __decorate([
    (0, common_1.Injectable)()
], AlternativeComparisonService);
//# sourceMappingURL=alternative-comparison.service.js.map