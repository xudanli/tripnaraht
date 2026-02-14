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
var ResultPresentationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultPresentationService = void 0;
const common_1 = require("@nestjs/common");
const route_judgment_service_1 = require("./route-judgment.service");
const enhanced_risk_assessment_service_1 = require("./enhanced-risk-assessment.service");
const rhythm_matching_service_1 = require("../../trips/decision/services/rhythm-matching.service");
const three_layer_explanation_service_1 = require("../../trips/decision/services/three-layer-explanation.service");
const route_directions_service_1 = require("../route-directions.service");
let ResultPresentationService = ResultPresentationService_1 = class ResultPresentationService {
    constructor(routeJudgmentService, enhancedRiskAssessmentService, rhythmMatchingService, threeLayerExplanationService, routeDirectionsService) {
        this.routeJudgmentService = routeJudgmentService;
        this.enhancedRiskAssessmentService = enhancedRiskAssessmentService;
        this.rhythmMatchingService = rhythmMatchingService;
        this.threeLayerExplanationService = threeLayerExplanationService;
        this.routeDirectionsService = routeDirectionsService;
        this.logger = new common_1.Logger(ResultPresentationService_1.name);
    }
    async generateIntegratedJudgmentResult(route, user, context) {
        const existenceJudgment = await this.routeJudgmentService.judgeRouteExistence(route, context, user);
        if (existenceJudgment.existence.status === 'NOT_EXISTS') {
            return this.buildRejectionResult(existenceJudgment, route);
        }
        const riskAssessment = await this.enhancedRiskAssessmentService.assessComprehensiveRisk(route, context);
        if (riskAssessment.safety.level === 'CRITICAL' || riskAssessment.safety.level === 'HIGH') {
            return this.buildRejectionResult(existenceJudgment, route, riskAssessment);
        }
        const rhythmMatching = await this.rhythmMatchingService.calculateRhythmMatch(route, user.persona || user, context);
        const overallRecommendation = this.generateOverallRecommendation(existenceJudgment, riskAssessment, rhythmMatching);
        const explanation = await this.generateEnhancedExplanation(route, existenceJudgment, riskAssessment, rhythmMatching);
        const alternatives = await this.generateAlternatives(route, user, context);
        const formattedOutput = this.formatResultOutput(route, existenceJudgment, riskAssessment, rhythmMatching, overallRecommendation, alternatives);
        return {
            existenceJudgment,
            riskAssessment,
            rhythmMatching,
            overallRecommendation,
            explanation,
            alternatives,
            formattedOutput,
        };
    }
    async generateAlternatives(originalRoute, user, context) {
        const alternatives = [];
        try {
            const similarRoutes = await this.findSimilarRoutes(originalRoute, user, context);
            for (const similarRoute of similarRoutes.slice(0, 3)) {
                alternatives.push(await this.createAlternativeOption(originalRoute, similarRoute, user, context, 'SIMILAR'));
            }
            const differentRhythmRoutes = await this.findDifferentRhythmRoutes(originalRoute, user, context);
            for (const diffRoute of differentRhythmRoutes.slice(0, 2)) {
                alternatives.push(await this.createAlternativeOption(originalRoute, diffRoute, user, context, 'DIFFERENT_RHYTHM'));
            }
            const lowerRiskRoutes = await this.findLowerRiskRoutes(originalRoute, user, context);
            for (const lowRiskRoute of lowerRiskRoutes.slice(0, 2)) {
                alternatives.push(await this.createAlternativeOption(originalRoute, lowRiskRoute, user, context, 'LOWER_RISK'));
            }
        }
        catch (error) {
            this.logger.warn(`Failed to generate alternatives: ${error}`);
        }
        return alternatives.sort((a, b) => b.matchScore - a.matchScore);
    }
    formatResultOutput(route, existenceJudgment, riskAssessment, rhythmMatching, overallRecommendation, alternatives) {
        const existenceSection = this.formatExistenceSection(existenceJudgment);
        const riskSection = this.formatRiskSection(riskAssessment);
        const rhythmSection = this.formatRhythmSection(rhythmMatching);
        const recommendationSection = this.formatRecommendationSection(overallRecommendation);
        const alternativesSection = this.formatAlternativesSection(alternatives);
        const fullFormatted = this.generateFullFormattedOutput(route, existenceSection, riskSection, rhythmSection, recommendationSection, alternativesSection);
        return {
            title: `路线评估结果：${route.name || route.id}`,
            existenceSection,
            riskSection,
            rhythmSection,
            recommendationSection,
            alternativesSection,
            fullFormatted,
        };
    }
    formatExistenceSection(existenceJudgment) {
        const statusMap = {
            EXISTS: '✅ 路线存在',
            CONDITIONAL_EXISTS: '⚠️ 条件存在',
            NOT_EXISTS: '❌ 路线不存在',
        };
        const status = statusMap[existenceJudgment.existence.status] || '❓ 未知状态';
        const details = [
            `可行性：${existenceJudgment.feasibility.level}`,
            `适时性：${existenceJudgment.timeliness.level}`,
            `匹配性：${existenceJudgment.matching.overallMatch}`,
        ];
        const formatted = [
            '## 📍 存在性判断',
            status,
            '',
            ...details.map(d => `- ${d}`),
            '',
            `**解释**：${existenceJudgment.explanation}`,
        ].join('\n');
        return {
            title: '存在性判断',
            status,
            details,
            formatted,
        };
    }
    formatRiskSection(riskAssessment) {
        const emojiMap = {
            LOW: '🟢',
            MEDIUM: '🟡',
            HIGH: '🟠',
            CRITICAL: '🔴',
        };
        const levelTextMap = {
            LOW: '低',
            MEDIUM: '中',
            HIGH: '高',
            CRITICAL: '极高',
        };
        const details = [
            {
                category: '安全风险',
                level: levelTextMap[riskAssessment.safety.level],
                emoji: emojiMap[riskAssessment.safety.level],
                description: riskAssessment.safety.details.join('；'),
            },
            {
                category: '体力风险',
                level: levelTextMap[riskAssessment.physical.level],
                emoji: emojiMap[riskAssessment.physical.level],
                description: riskAssessment.physical.details.join('；'),
            },
            {
                category: '时间风险',
                level: levelTextMap[riskAssessment.time.level],
                emoji: emojiMap[riskAssessment.time.level],
                description: riskAssessment.time.details.join('；'),
            },
            {
                category: '体验风险',
                level: levelTextMap[riskAssessment.experience.overallLevel],
                emoji: emojiMap[riskAssessment.experience.overallLevel],
                description: riskAssessment.experience.summary,
            },
            {
                category: '成本风险',
                level: levelTextMap[riskAssessment.cost.overallLevel],
                emoji: emojiMap[riskAssessment.cost.overallLevel],
                description: riskAssessment.cost.summary,
            },
        ];
        const formatted = [
            '## ⚠️ 风险评估',
            riskAssessment.formattedSummary,
            '',
            ...details.map(d => `${d.emoji} **${d.category}**：${d.level} - ${d.description}`),
        ].join('\n');
        return {
            title: '风险评估',
            summary: riskAssessment.formattedSummary,
            details,
            formatted,
        };
    }
    formatRhythmSection(rhythmMatching) {
        const rhythmNameMap = {
            INTENSIVE: '紧凑型',
            RELAXED: '舒缓型',
            FLEXIBLE: '弹性型',
            THEMED: '主题型',
            HYBRID: '混合型',
        };
        const recommendedRhythm = rhythmNameMap[rhythmMatching.recommendedRhythm] || rhythmMatching.recommendedRhythm;
        const adjustments = rhythmMatching.adjustments.map(a => a.description);
        const formatted = [
            '## 🎯 节奏建议',
            `**推荐节奏类型**：${recommendedRhythm}`,
            '',
            `**推荐理由**：${rhythmMatching.recommendationReason}`,
            '',
            ...(adjustments.length > 0
                ? ['**调整建议**：', ...adjustments.map(a => `- ${a}`)]
                : ['**调整建议**：无']),
        ].join('\n');
        return {
            title: '节奏建议',
            recommendedRhythm,
            reason: rhythmMatching.recommendationReason,
            adjustments,
            formatted,
        };
    }
    formatRecommendationSection(overallRecommendation) {
        const conclusionMap = {
            RECOMMEND: '✅ 推荐',
            CONDITIONAL_RECOMMEND: '⚠️ 条件推荐',
            NOT_RECOMMEND: '❌ 不推荐',
        };
        const conclusion = conclusionMap[overallRecommendation.conclusion] || '❓ 未知';
        const formatted = [
            '## 💡 综合建议',
            conclusion,
            '',
            `**评分**：${Math.round(overallRecommendation.score * 100)}/100`,
            '',
            `**摘要**：${overallRecommendation.summary}`,
        ].join('\n');
        return {
            title: '综合建议',
            conclusion,
            score: overallRecommendation.score,
            summary: overallRecommendation.summary,
            formatted,
        };
    }
    formatAlternativesSection(alternatives) {
        const alternativesList = alternatives.map(a => ({
            name: a.routeName,
            reason: a.reason,
            matchScore: a.matchScore,
        }));
        const formatted = alternatives.length > 0
            ? [
                '## 🔄 替代方案',
                '',
                ...alternativesList.map((a, i) => `${i + 1}. **${a.name}**（匹配度：${Math.round(a.matchScore * 100)}%）\n   - ${a.reason}`),
            ].join('\n')
            : '## 🔄 替代方案\n\n暂无替代方案';
        return {
            title: '替代方案',
            alternatives: alternativesList,
            formatted,
        };
    }
    generateFullFormattedOutput(route, existenceSection, riskSection, rhythmSection, recommendationSection, alternativesSection) {
        return [
            `# 路线评估结果：${route.name || route.id}`,
            '',
            existenceSection.formatted,
            '',
            riskSection.formatted,
            '',
            rhythmSection.formatted,
            '',
            recommendationSection.formatted,
            '',
            alternativesSection.formatted,
        ].join('\n');
    }
    async findSimilarRoutes(originalRoute, user, context) {
        try {
            if (!this.routeDirectionsService) {
                this.logger.warn('RouteDirectionsService not available, skipping alternative route search');
                return [];
            }
            const tags = originalRoute.tags || [];
            const countryCode = originalRoute.countryCode;
            const queryDto = {
                countryCode,
                tags: tags.slice(0, 3),
                limit: 10,
            };
            const routes = await this.routeDirectionsService.findAll(queryDto);
            return routes.filter((r) => r.id !== originalRoute.id).slice(0, 5);
        }
        catch (error) {
            this.logger.warn(`Failed to find similar routes: ${error}`);
            return [];
        }
    }
    async findDifferentRhythmRoutes(originalRoute, user, context) {
        try {
            const routes = await this.findSimilarRoutes(originalRoute, user, context);
            return routes.filter(route => {
                const originalIntensity = this.inferRouteIntensity(originalRoute);
                const routeIntensity = this.inferRouteIntensity(route);
                return Math.abs(originalIntensity - routeIntensity) > 0.3;
            });
        }
        catch (error) {
            this.logger.warn(`Failed to find different rhythm routes: ${error}`);
            return [];
        }
    }
    async findLowerRiskRoutes(originalRoute, user, context) {
        try {
            const routes = await this.findSimilarRoutes(originalRoute, user, context);
            const routesWithRisk = await Promise.all(routes.map(async (route) => {
                const risk = await this.enhancedRiskAssessmentService.assessComprehensiveRisk(route, context);
                return { route, risk };
            }));
            const originalRisk = await this.enhancedRiskAssessmentService.assessComprehensiveRisk(originalRoute, context);
            return routesWithRisk
                .filter(({ risk }) => risk.overallScore < originalRisk.overallScore)
                .map(({ route }) => route);
        }
        catch (error) {
            this.logger.warn(`Failed to find lower risk routes: ${error}`);
            return [];
        }
    }
    async createAlternativeOption(originalRoute, alternativeRoute, user, context, reasonType) {
        const rhythmMatching = await this.rhythmMatchingService.calculateRhythmMatch(alternativeRoute, user.persona || user, context);
        const reason = this.generateAlternativeReason(originalRoute, alternativeRoute, reasonType);
        const differences = await this.analyzeDifferences(originalRoute, alternativeRoute);
        const suitableFor = this.generateSuitableFor(alternativeRoute, rhythmMatching);
        return {
            routeId: String(alternativeRoute.id || ''),
            routeName: alternativeRoute.name || String(alternativeRoute.id || '') || '未知路线',
            route: alternativeRoute,
            reason,
            differences,
            suitableFor,
            matchScore: rhythmMatching.scores.overallMatch,
        };
    }
    generateAlternativeReason(originalRoute, alternativeRoute, reasonType) {
        const reasonMap = {
            SIMILAR: '与原始路线相似，但可能有不同的体验',
            DIFFERENT_RHYTHM: '节奏不同，适合不同的旅行偏好',
            LOWER_RISK: '风险更低，更适合保守型旅行者',
        };
        return reasonMap[reasonType] || '替代路线选项';
    }
    async analyzeDifferences(originalRoute, alternativeRoute) {
        var _a, _b, _c, _d;
        const advantages = [];
        const disadvantages = [];
        const originalDuration = ((_a = originalRoute.metadata) === null || _a === void 0 ? void 0 : _a.estimatedDuration) || 0;
        const altDuration = ((_b = alternativeRoute.metadata) === null || _b === void 0 ? void 0 : _b.estimatedDuration) || 0;
        if (altDuration < originalDuration) {
            advantages.push('行程更短');
        }
        else if (altDuration > originalDuration) {
            disadvantages.push('行程更长');
        }
        const originalCost = ((_c = originalRoute.metadata) === null || _c === void 0 ? void 0 : _c.estimatedCost) || 0;
        const altCost = ((_d = alternativeRoute.metadata) === null || _d === void 0 ? void 0 : _d.estimatedCost) || 0;
        if (altCost < originalCost) {
            advantages.push('成本更低');
        }
        else if (altCost > originalCost) {
            disadvantages.push('成本更高');
        }
        const originalRisk = originalRoute.riskProfile || {};
        const altRisk = alternativeRoute.riskProfile || {};
        if (!altRisk.altitudeSickness && originalRisk.altitudeSickness) {
            advantages.push('无高反风险');
        }
        if (!altRisk.weatherWindow && originalRisk.weatherWindow) {
            advantages.push('不受天气窗口限制');
        }
        return { advantages, disadvantages };
    }
    generateSuitableFor(route, rhythmMatching) {
        var _a, _b, _c, _d;
        const suitableFor = [];
        const rhythmNameMap = {
            INTENSIVE: '体力充沛、时间紧张',
            RELAXED: '想要放松、时间充足',
            FLEXIBLE: '喜欢灵活、不确定偏好',
            THEMED: '有明确主题、深度体验',
            HYBRID: '多样化需求、平衡体验',
        };
        suitableFor.push(rhythmNameMap[rhythmMatching.recommendedRhythm] || '一般旅行者');
        if (((_a = route.tags) === null || _a === void 0 ? void 0 : _a.includes('文化')) || ((_b = route.tags) === null || _b === void 0 ? void 0 : _b.includes('culture'))) {
            suitableFor.push('文化爱好者');
        }
        if (((_c = route.tags) === null || _c === void 0 ? void 0 : _c.includes('自然')) || ((_d = route.tags) === null || _d === void 0 ? void 0 : _d.includes('nature'))) {
            suitableFor.push('自然爱好者');
        }
        return suitableFor;
    }
    generateOverallRecommendation(existenceJudgment, riskAssessment, rhythmMatching) {
        if (existenceJudgment.existence.status === 'NOT_EXISTS') {
            return {
                conclusion: 'NOT_RECOMMEND',
                score: 0,
                summary: '路线不存在，不建议选择',
            };
        }
        if (riskAssessment.safety.level === 'CRITICAL' || riskAssessment.safety.level === 'HIGH') {
            return {
                conclusion: 'NOT_RECOMMEND',
                score: 0.2,
                summary: '安全风险过高，不建议选择',
            };
        }
        const existenceScore = existenceJudgment.existence.score;
        const riskScore = 1 - riskAssessment.overallScore;
        const rhythmScore = rhythmMatching.scores.overallMatch;
        const overallScore = existenceScore * 0.4 + riskScore * 0.3 + rhythmScore * 0.3;
        let conclusion;
        if (overallScore >= 0.7) {
            conclusion = 'RECOMMEND';
        }
        else if (overallScore >= 0.4) {
            conclusion = 'CONDITIONAL_RECOMMEND';
        }
        else {
            conclusion = 'NOT_RECOMMEND';
        }
        const summaryParts = [];
        if (existenceJudgment.existence.status === 'EXISTS') {
            summaryParts.push('路线可行');
        }
        else {
            summaryParts.push('路线条件可行');
        }
        if (riskAssessment.overallLevel === 'LOW' || riskAssessment.overallLevel === 'MEDIUM') {
            summaryParts.push('风险可控');
        }
        else {
            summaryParts.push('需要注意风险');
        }
        summaryParts.push(`推荐${this.getRhythmName(rhythmMatching.recommendedRhythm)}节奏`);
        return {
            conclusion,
            score: overallScore,
            summary: summaryParts.join('，'),
        };
    }
    async generateEnhancedExplanation(route, existenceJudgment, riskAssessment, rhythmMatching) {
        return {
            layer1_conclusion: {
                statement: this.generateConclusionStatement(existenceJudgment, riskAssessment, rhythmMatching),
                confidence: this.calculateConfidence(existenceJudgment, riskAssessment, rhythmMatching),
            },
            layer2_reason: {
                primaryFactors: [
                    `存在性：${existenceJudgment.existence.status}`,
                    `风险等级：${riskAssessment.overallLevel}`,
                    `推荐节奏：${this.getRhythmName(rhythmMatching.recommendedRhythm)}`,
                ],
                contributingFactors: [
                    `可行性：${existenceJudgment.feasibility.level}`,
                    `适时性：${existenceJudgment.timeliness.level}`,
                    `匹配性：${existenceJudgment.matching.overallMatch}`,
                ],
                explanation: this.generateReasonExplanation(existenceJudgment, riskAssessment, rhythmMatching),
            },
            layer3_evidence: {
                dataSources: [],
                calculationMethod: '综合评估（存在性判断 + 风险评估 + 节奏匹配）',
                assumptions: [
                    '用户提供的信息准确',
                    '环境条件在预测范围内',
                    '路线数据可靠',
                ],
                limitations: [
                    '预测基于历史数据和当前信息，实际结果可能有所不同',
                    '天气和交通状况可能实时变化',
                ],
                evidenceChain: [
                    {
                        step: 1,
                        operation: '路线存在性判断',
                        input: '路线数据、用户信息、上下文',
                        output: existenceJudgment.existence.status,
                        method: 'RouteJudgmentService',
                    },
                    {
                        step: 2,
                        operation: '综合风险评估',
                        input: '路线数据、上下文',
                        output: riskAssessment.overallLevel,
                        method: 'EnhancedRiskAssessmentService',
                    },
                    {
                        step: 3,
                        operation: '节奏匹配计算',
                        input: '路线数据、用户画像',
                        output: rhythmMatching.recommendedRhythm,
                        method: 'RhythmMatchingService',
                    },
                ],
            },
        };
    }
    generateConclusionStatement(existenceJudgment, riskAssessment, rhythmMatching) {
        if (existenceJudgment.existence.status === 'NOT_EXISTS') {
            return '这条路线目前不建议';
        }
        if (riskAssessment.overallLevel === 'CRITICAL' || riskAssessment.overallLevel === 'HIGH') {
            return '这条路线存在较高风险，需要谨慎考虑';
        }
        return `这条路线可行，推荐${this.getRhythmName(rhythmMatching.recommendedRhythm)}节奏`;
    }
    calculateConfidence(existenceJudgment, riskAssessment, rhythmMatching) {
        const existenceConfidence = existenceJudgment.existence.score;
        const riskConfidence = 1 - riskAssessment.overallScore;
        const rhythmConfidence = rhythmMatching.scores.overallMatch;
        return (existenceConfidence + riskConfidence + rhythmConfidence) / 3;
    }
    generateReasonExplanation(existenceJudgment, riskAssessment, rhythmMatching) {
        const parts = [];
        parts.push(`路线${existenceJudgment.existence.status === 'EXISTS' ? '存在' : '条件存在'}`);
        parts.push(`风险等级为${riskAssessment.overallLevel}`);
        parts.push(`推荐${this.getRhythmName(rhythmMatching.recommendedRhythm)}节奏`);
        return parts.join('，');
    }
    buildRejectionResult(existenceJudgment, route, riskAssessment) {
        const overallRecommendation = {
            conclusion: 'NOT_RECOMMEND',
            score: 0,
            summary: existenceJudgment.existence.reason || '路线不可行',
        };
        const explanation = {
            layer1_conclusion: {
                statement: '这条路线不建议',
                confidence: 0.9,
            },
            layer2_reason: {
                primaryFactors: [existenceJudgment.existence.reason],
                explanation: existenceJudgment.explanation,
            },
            layer3_evidence: {
                dataSources: [],
                assumptions: [],
                limitations: [],
                evidenceChain: [],
            },
        };
        const formattedOutput = this.formatResultOutput(route, existenceJudgment, riskAssessment || {}, {}, overallRecommendation, []);
        return {
            existenceJudgment,
            riskAssessment: riskAssessment || {},
            rhythmMatching: {},
            overallRecommendation,
            explanation,
            alternatives: [],
            formattedOutput,
        };
    }
    inferRouteIntensity(route) {
        var _a, _b;
        const constraints = route.constraints || {};
        let intensity = 0.5;
        if (((_a = constraints.hard) === null || _a === void 0 ? void 0 : _a.maxElevationM) && constraints.hard.maxElevationM > 3000) {
            intensity += 0.2;
        }
        if (((_b = constraints.hard) === null || _b === void 0 ? void 0 : _b.maxSlopePct) && constraints.hard.maxSlopePct > 20) {
            intensity += 0.2;
        }
        return Math.min(1.0, intensity);
    }
    getRhythmName(rhythm) {
        const rhythmNameMap = {
            INTENSIVE: '紧凑型',
            RELAXED: '舒缓型',
            FLEXIBLE: '弹性型',
            THEMED: '主题型',
            HYBRID: '混合型',
        };
        return rhythmNameMap[rhythm] || rhythm;
    }
};
exports.ResultPresentationService = ResultPresentationService;
exports.ResultPresentationService = ResultPresentationService = ResultPresentationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [route_judgment_service_1.RouteJudgmentService,
        enhanced_risk_assessment_service_1.EnhancedRiskAssessmentService,
        rhythm_matching_service_1.RhythmMatchingService,
        three_layer_explanation_service_1.ThreeLayerExplanationService,
        route_directions_service_1.RouteDirectionsService])
], ResultPresentationService);
//# sourceMappingURL=result-presentation.service.js.map