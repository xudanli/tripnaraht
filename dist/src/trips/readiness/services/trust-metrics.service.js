"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TrustMetricsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustMetricsService = void 0;
const common_1 = require("@nestjs/common");
let TrustMetricsService = TrustMetricsService_1 = class TrustMetricsService {
    constructor() {
        this.logger = new common_1.Logger(TrustMetricsService_1.name);
    }
    calculateTrustMetrics(result, lang = 'zh') {
        const capability = this.calculateCapabilityTrust(result, lang);
        const benevolence = this.calculateBenevolenceTrust(result, lang);
        const predictability = this.calculatePredictabilityTrust(result, lang);
        const overall = (capability.score * 0.4 +
            benevolence.score * 0.35 +
            predictability.score * 0.25);
        return {
            capability,
            benevolence,
            predictability,
            overall,
        };
    }
    calculateCapabilityTrust(result, lang) {
        const factors = [];
        let score = 0.5;
        const dataSourceScore = this.evaluateDataSourceReliability(result);
        score += dataSourceScore * 0.3;
        factors.push({
            type: 'DATA_SOURCE',
            description: lang === 'zh'
                ? '数据来源于权威机构（旅游局、政府网站等）'
                : 'Data from authoritative sources (tourism boards, government websites)',
            score: dataSourceScore,
        });
        const geoFeaturesScore = this.evaluateGeoFeaturesQuality(result);
        score += geoFeaturesScore * 0.25;
        factors.push({
            type: 'GEO_FEATURES',
            description: lang === 'zh'
                ? '使用精确的地理特征数据（DEM、河流、道路等）'
                : 'Using precise geo-feature data (DEM, rivers, roads, etc.)',
            score: geoFeaturesScore,
        });
        const ruleAccuracyScore = this.evaluateRuleAccuracy(result);
        score += ruleAccuracyScore * 0.25;
        factors.push({
            type: 'RULE_ACCURACY',
            description: lang === 'zh'
                ? '规则基于详细证据和专业知识'
                : 'Rules based on detailed evidence and expertise',
            score: ruleAccuracyScore,
        });
        const evidenceQualityScore = this.evaluateEvidenceQuality(result);
        score += evidenceQualityScore * 0.2;
        factors.push({
            type: 'EVIDENCE_QUALITY',
            description: lang === 'zh'
                ? '每个建议都有明确的证据支持'
                : 'Each recommendation has clear evidence support',
            score: evidenceQualityScore,
        });
        score = Math.max(0, Math.min(1, score));
        const explanation = lang === 'zh'
            ? `我们的建议基于权威数据源、精确的地理特征分析和专业的风险评估。每个规则都有明确的证据支持，确保建议的准确性和可靠性。`
            : `Our recommendations are based on authoritative data sources, precise geo-feature analysis, and professional risk assessment. Each rule has clear evidence support, ensuring accuracy and reliability.`;
        return {
            score,
            factors,
            explanation,
        };
    }
    calculateBenevolenceTrust(result, lang) {
        const factors = [];
        let score = 0.7;
        const safetyFocusScore = this.evaluateSafetyFocus(result);
        score += safetyFocusScore * 0.3;
        factors.push({
            type: 'SAFETY_FOCUS',
            description: lang === 'zh'
                ? '所有建议都以您的安全为首要考虑'
                : 'All recommendations prioritize your safety',
            score: safetyFocusScore,
        });
        const userBenefitScore = this.evaluateUserBenefit(result);
        score += userBenefitScore * 0.25;
        factors.push({
            type: 'USER_BENEFIT',
            description: lang === 'zh'
                ? '帮助您做出明智的旅行决策'
                : 'Helping you make informed travel decisions',
            score: userBenefitScore,
        });
        const transparencyScore = this.evaluateTransparency(result);
        score += transparencyScore * 0.25;
        factors.push({
            type: 'TRANSPARENCY',
            description: lang === 'zh'
                ? '明确说明每个建议的原因和依据'
                : 'Clearly explaining the reason and basis for each recommendation',
            score: transparencyScore,
        });
        const limitationsDisclosedScore = result.disclaimer ? 0.9 : 0.5;
        score += limitationsDisclosedScore * 0.2;
        factors.push({
            type: 'LIMITATIONS_DISCLOSED',
            description: lang === 'zh'
                ? '诚实说明系统局限性和免责声明'
                : 'Honestly disclosing system limitations and disclaimers',
            score: limitationsDisclosedScore,
        });
        score = Math.max(0, Math.min(1, score));
        const explanation = lang === 'zh'
            ? `我们的目标是确保您的旅行安全。所有建议都是为了帮助您做出明智的决策，而不是阻止您的旅行。我们明确说明每个建议的原因，并诚实披露系统的局限性。`
            : `Our goal is to ensure your travel safety. All recommendations are designed to help you make informed decisions, not to prevent your travel. We clearly explain the reason for each recommendation and honestly disclose system limitations.`;
        return {
            score,
            factors,
            explanation,
        };
    }
    calculatePredictabilityTrust(result, lang) {
        const factors = [];
        let score = 0.6;
        const ruleTransparencyScore = this.evaluateRuleTransparency(result);
        score += ruleTransparencyScore * 0.4;
        factors.push({
            type: 'RULE_TRANSPARENCY',
            description: lang === 'zh'
                ? '规则触发原因清晰可理解'
                : 'Rule trigger reasons are clear and understandable',
            score: ruleTransparencyScore,
        });
        const consistencyScore = this.evaluateConsistency(result);
        score += consistencyScore * 0.3;
        factors.push({
            type: 'CONSISTENCY',
            description: lang === 'zh'
                ? '相同条件会产生一致的结果'
                : 'Same conditions produce consistent results',
            score: consistencyScore,
        });
        const explainabilityScore = this.evaluateExplainability(result);
        score += explainabilityScore * 0.3;
        factors.push({
            type: 'EXPLAINABILITY',
            description: lang === 'zh'
                ? '每个决策都有明确的证据和解释'
                : 'Each decision has clear evidence and explanation',
            score: explainabilityScore,
        });
        score = Math.max(0, Math.min(1, score));
        const explanation = lang === 'zh'
            ? `我们的系统行为是可预测和一致的。每个规则都有明确的触发条件，相同的情况会产生相同的结果。所有决策都有明确的证据和解释，您可以追溯每个建议的来源。`
            : `Our system behavior is predictable and consistent. Each rule has clear trigger conditions, and the same situation produces the same results. All decisions have clear evidence and explanations, and you can trace the source of each recommendation.`;
        return {
            score,
            factors,
            explanation,
        };
    }
    evaluateDataSourceReliability(result) {
        let totalEvidence = 0;
        let authoritativeSources = 0;
        for (const finding of result.findings) {
            for (const item of [...finding.blockers, ...finding.must, ...finding.should, ...finding.optional]) {
                if (item.evidence && item.evidence.length > 0) {
                    totalEvidence += item.evidence.length;
                    const hasAuthoritativeSource = item.evidence.some(e => {
                        const sourceId = e.sourceId.toLowerCase();
                        return sourceId.includes('tourism') ||
                            sourceId.includes('government') ||
                            sourceId.includes('official') ||
                            sourceId.includes('parques') ||
                            sourceId.includes('smn');
                    });
                    if (hasAuthoritativeSource) {
                        authoritativeSources += item.evidence.length;
                    }
                }
            }
        }
        if (totalEvidence === 0) {
            return 0.5;
        }
        return Math.min(1, authoritativeSources / totalEvidence + 0.2);
    }
    evaluateGeoFeaturesQuality(result) {
        return 0.8;
    }
    evaluateRuleAccuracy(result) {
        let totalRules = 0;
        let rulesWithEvidence = 0;
        for (const finding of result.findings) {
            const allItems = [...finding.blockers, ...finding.must, ...finding.should, ...finding.optional];
            totalRules += allItems.length;
            rulesWithEvidence += allItems.filter(item => item.evidence && item.evidence.length > 0).length;
        }
        if (totalRules === 0) {
            return 0.5;
        }
        return Math.min(1, rulesWithEvidence / totalRules + 0.3);
    }
    evaluateEvidenceQuality(result) {
        let totalItems = 0;
        let itemsWithEvidence = 0;
        let itemsWithMultipleEvidence = 0;
        for (const finding of result.findings) {
            const allItems = [...finding.blockers, ...finding.must, ...finding.should, ...finding.optional];
            totalItems += allItems.length;
            for (const item of allItems) {
                if (item.evidence && item.evidence.length > 0) {
                    itemsWithEvidence++;
                    if (item.evidence.length >= 2) {
                        itemsWithMultipleEvidence++;
                    }
                }
            }
        }
        if (totalItems === 0) {
            return 0.5;
        }
        const evidenceCoverage = itemsWithEvidence / totalItems;
        const multiSourceRate = itemsWithEvidence > 0 ? itemsWithMultipleEvidence / itemsWithEvidence : 0;
        return evidenceCoverage * 0.6 + multiSourceRate * 0.4;
    }
    evaluateSafetyFocus(result) {
        const blockerCount = result.summary.totalBlockers;
        const mustCount = result.summary.totalMust;
        const safetyFocusScore = Math.min(1, (blockerCount * 0.5 + mustCount * 0.3) / 5 + 0.5);
        return safetyFocusScore;
    }
    evaluateUserBenefit(result) {
        let itemsWithTasks = 0;
        let totalItems = 0;
        for (const finding of result.findings) {
            const allItems = [...finding.blockers, ...finding.must, ...finding.should];
            totalItems += allItems.length;
            itemsWithTasks += allItems.filter(item => item.tasks && item.tasks.length > 0).length;
        }
        if (totalItems === 0) {
            return 0.6;
        }
        return Math.min(1, itemsWithTasks / totalItems + 0.4);
    }
    evaluateTransparency(result) {
        let itemsWithExplanation = 0;
        let totalItems = 0;
        for (const finding of result.findings) {
            const allItems = [...finding.blockers, ...finding.must, ...finding.should];
            totalItems += allItems.length;
            itemsWithExplanation += allItems.filter(item => item.message && item.message.length > 0 &&
                (item.evidence && item.evidence.length > 0)).length;
        }
        if (totalItems === 0) {
            return 0.6;
        }
        return Math.min(1, itemsWithExplanation / totalItems + 0.3);
    }
    evaluateRuleTransparency(result) {
        let clearMessages = 0;
        let totalItems = 0;
        for (const finding of result.findings) {
            const allItems = [...finding.blockers, ...finding.must, ...finding.should];
            totalItems += allItems.length;
            for (const item of allItems) {
                if (item.message && item.message.length > 20) {
                    clearMessages++;
                }
            }
        }
        if (totalItems === 0) {
            return 0.6;
        }
        return Math.min(1, clearMessages / totalItems + 0.4);
    }
    evaluateConsistency(result) {
        let consistentRules = 0;
        let totalRules = 0;
        for (const finding of result.findings) {
            const allItems = [...finding.blockers, ...finding.must, ...finding.should, ...finding.optional];
            totalRules += allItems.length;
            for (const item of allItems) {
                if (item.id && item.category && item.severity && item.level && item.message) {
                    consistentRules++;
                }
            }
        }
        if (totalRules === 0) {
            return 0.7;
        }
        return Math.min(1, consistentRules / totalRules + 0.2);
    }
    evaluateExplainability(result) {
        let explainableItems = 0;
        let totalItems = 0;
        for (const finding of result.findings) {
            const allItems = [...finding.blockers, ...finding.must, ...finding.should];
            totalItems += allItems.length;
            for (const item of allItems) {
                if (item.evidence && item.evidence.length > 0) {
                    explainableItems++;
                }
            }
        }
        if (totalItems === 0) {
            return 0.6;
        }
        return Math.min(1, explainableItems / totalItems + 0.3);
    }
};
exports.TrustMetricsService = TrustMetricsService;
exports.TrustMetricsService = TrustMetricsService = TrustMetricsService_1 = __decorate([
    (0, common_1.Injectable)()
], TrustMetricsService);
//# sourceMappingURL=trust-metrics.service.js.map