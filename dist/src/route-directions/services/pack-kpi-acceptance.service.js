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
var PackKPIAcceptanceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackKPIAcceptanceService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const route_direction_selector_service_1 = require("./route-direction-selector.service");
let PackKPIAcceptanceService = PackKPIAcceptanceService_1 = class PackKPIAcceptanceService {
    constructor(prisma, routeSelector) {
        this.prisma = prisma;
        this.routeSelector = routeSelector;
        this.logger = new common_1.Logger(PackKPIAcceptanceService_1.name);
    }
    async acceptPackKPI(countryCode) {
        this.logger.log(`开始验收 ${countryCode} 的 Pack KPI...`);
        const routeDirections = await this.prisma.routeDirection.findMany({
            where: {
                countryCode,
                isActive: true,
            },
        });
        if (routeDirections.length < 3) {
            return {
                countryCode,
                countryName: countryCode,
                acceptanceTime: new Date().toISOString(),
                passed: false,
                overallScore: 0,
                personalityKPI: {
                    averagePersonalityScore: 0,
                    minPersonalityScore: 0,
                    maxPersonalityScore: 0,
                    passed: false,
                    details: [],
                },
                constraintCombinationKPI: {
                    diversityScore: 0,
                    passed: false,
                    details: {
                        totalCombinations: 0,
                        uniqueCombinations: 0,
                        diversityScore: 0,
                        combinations: [],
                    },
                },
                userPreferenceDifferentiationKPI: {
                    differentiationScore: 0,
                    passed: false,
                    details: {
                        totalScenarios: 0,
                        differentiatedScenarios: 0,
                        differentiationScore: 0,
                        scenarios: [],
                    },
                },
                issues: [`至少需要3条RouteDirection，当前只有${routeDirections.length}条`],
                recommendations: ['增加RouteDirection数量'],
            };
        }
        const personalityKPI = await this.calculatePersonalityKPI(routeDirections);
        const constraintCombinationKPI = this.calculateConstraintCombinationKPI(routeDirections);
        const userPreferenceDifferentiationKPI = await this.calculateUserPreferenceDifferentiationKPI(countryCode, routeDirections);
        const overallScore = Math.round((personalityKPI.averagePersonalityScore * 0.4 +
            constraintCombinationKPI.diversityScore * 0.3 +
            userPreferenceDifferentiationKPI.differentiationScore * 0.3));
        const passed = personalityKPI.passed &&
            constraintCombinationKPI.diversityScore >= 70 &&
            userPreferenceDifferentiationKPI.differentiationScore >= 70 &&
            overallScore >= 70;
        const issues = [];
        const recommendations = [];
        if (!personalityKPI.passed) {
            issues.push('RouteDirection独特性不足（平均得分 < 60）');
            recommendations.push('增加RouteDirection的标签、约束、风险画像的差异性');
        }
        if (constraintCombinationKPI.diversityScore < 70) {
            issues.push('约束组合多样性不足（得分 < 70）');
            recommendations.push('增加不同约束组合的RouteDirection');
        }
        if (userPreferenceDifferentiationKPI.differentiationScore < 70) {
            issues.push('用户偏好差异化不足（得分 < 70）');
            recommendations.push('确保不同用户偏好在不同RouteDirection下产生不同结果');
        }
        return {
            countryCode,
            countryName: countryCode,
            acceptanceTime: new Date().toISOString(),
            passed,
            overallScore,
            personalityKPI,
            constraintCombinationKPI: {
                diversityScore: constraintCombinationKPI.diversityScore,
                passed: constraintCombinationKPI.diversityScore >= 70,
                details: constraintCombinationKPI,
            },
            userPreferenceDifferentiationKPI: {
                differentiationScore: userPreferenceDifferentiationKPI.differentiationScore,
                passed: userPreferenceDifferentiationKPI.differentiationScore >= 70,
                details: userPreferenceDifferentiationKPI,
            },
            issues,
            recommendations,
        };
    }
    async calculatePersonalityKPI(routeDirections) {
        const details = [];
        for (const rd of routeDirections) {
            const allTags = routeDirections.flatMap(r => r.tags || []);
            const tagCounts = new Map();
            allTags.forEach(tag => {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            });
            const rdTags = rd.tags || [];
            const uniqueTags = rdTags.filter((tag) => tagCounts.get(tag) === 1);
            const tagUniquenessScore = rdTags.length > 0
                ? Math.round((uniqueTags.length / rdTags.length) * 100)
                : 0;
            const constraintKeys = new Set();
            routeDirections.forEach(r => {
                if (r.constraints) {
                    if (r.constraints.hard) {
                        Object.keys(r.constraints.hard).forEach(k => constraintKeys.add(`hard.${k}`));
                    }
                    if (r.constraints.soft) {
                        Object.keys(r.constraints.soft).forEach(k => constraintKeys.add(`soft.${k}`));
                    }
                }
            });
            const rdConstraintKeys = new Set();
            if (rd.constraints) {
                if (rd.constraints.hard) {
                    Object.keys(rd.constraints.hard).forEach(k => rdConstraintKeys.add(`hard.${k}`));
                }
                if (rd.constraints.soft) {
                    Object.keys(rd.constraints.soft).forEach(k => rdConstraintKeys.add(`soft.${k}`));
                }
            }
            const constraintUniquenessScore = rdConstraintKeys.size > 0
                ? Math.round((rdConstraintKeys.size / constraintKeys.size) * 100)
                : 0;
            const riskProfileKeys = new Set();
            routeDirections.forEach(r => {
                if (r.riskProfile) {
                    Object.keys(r.riskProfile).forEach(k => riskProfileKeys.add(k));
                }
            });
            const rdRiskProfileKeys = new Set();
            if (rd.riskProfile) {
                Object.keys(rd.riskProfile).forEach(k => rdRiskProfileKeys.add(k));
            }
            const riskProfileUniquenessScore = rdRiskProfileKeys.size > 0
                ? Math.round((rdRiskProfileKeys.size / riskProfileKeys.size) * 100)
                : 0;
            const overallPersonalityScore = Math.round((tagUniquenessScore * 0.4 +
                constraintUniquenessScore * 0.3 +
                riskProfileUniquenessScore * 0.3));
            details.push({
                routeDirectionId: rd.id.toString(),
                name: rd.nameCN || rd.name,
                tagUniquenessScore,
                constraintUniquenessScore,
                riskProfileUniquenessScore,
                overallPersonalityScore,
                analysis: {
                    uniqueTags,
                    uniqueConstraints: Array.from(rdConstraintKeys),
                    uniqueRiskFeatures: Array.from(rdRiskProfileKeys),
                },
            });
        }
        const scores = details.map(d => d.overallPersonalityScore);
        const averagePersonalityScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
        const minPersonalityScore = Math.min(...scores);
        const maxPersonalityScore = Math.max(...scores);
        return {
            averagePersonalityScore,
            minPersonalityScore,
            maxPersonalityScore,
            passed: averagePersonalityScore >= 60,
            details,
        };
    }
    calculateConstraintCombinationKPI(routeDirections) {
        var _a, _b, _c, _d;
        const combinationMap = new Map();
        for (const rd of routeDirections) {
            const hardKeys = ((_a = rd.constraints) === null || _a === void 0 ? void 0 : _a.hard) ? Object.keys(rd.constraints.hard).sort() : [];
            const softKeys = ((_b = rd.constraints) === null || _b === void 0 ? void 0 : _b.soft) ? Object.keys(rd.constraints.soft).sort() : [];
            const combinationId = `${hardKeys.join(',')}|${softKeys.join(',')}`;
            if (!combinationMap.has(combinationId)) {
                combinationMap.set(combinationId, {
                    description: `硬约束: [${hardKeys.join(', ')}], 软约束: [${softKeys.join(', ')}]`,
                    routeDirectionCount: 0,
                    constraints: {
                        hard: ((_c = rd.constraints) === null || _c === void 0 ? void 0 : _c.hard) || {},
                        soft: ((_d = rd.constraints) === null || _d === void 0 ? void 0 : _d.soft) || {},
                    },
                });
            }
            const combination = combinationMap.get(combinationId);
            combination.routeDirectionCount++;
        }
        const totalCombinations = routeDirections.length;
        const uniqueCombinations = combinationMap.size;
        const diversityScore = totalCombinations > 0
            ? Math.round((uniqueCombinations / totalCombinations) * 100)
            : 0;
        return {
            totalCombinations,
            uniqueCombinations,
            diversityScore,
            combinations: Array.from(combinationMap.entries()).map(([id, data]) => ({
                id,
                description: data.description,
                routeDirectionCount: data.routeDirectionCount,
                constraints: data.constraints,
            })),
        };
    }
    async calculateUserPreferenceDifferentiationKPI(countryCode, routeDirections) {
        const testScenarios = [
            {
                scenarioId: 'SCENARIO_RELAXED',
                description: '轻松节奏 + 低风险',
                preferences: {
                    pace: 'relaxed',
                    riskTolerance: 'low',
                    intents: { 自然: 0.6, 文化: 0.4 },
                },
            },
            {
                scenarioId: 'SCENARIO_MODERATE',
                description: '中等节奏 + 中等风险',
                preferences: {
                    pace: 'moderate',
                    riskTolerance: 'medium',
                    intents: { 自然: 0.7, 摄影: 0.6 },
                },
            },
            {
                scenarioId: 'SCENARIO_INTENSE',
                description: '挑战节奏 + 高风险',
                preferences: {
                    pace: 'intense',
                    riskTolerance: 'high',
                    intents: { 挑战: 0.9, 徒步: 0.8 },
                },
            },
            {
                scenarioId: 'SCENARIO_CULTURE',
                description: '文化偏好',
                preferences: {
                    pace: 'moderate',
                    riskTolerance: 'medium',
                    intents: { 文化: 0.9, 历史: 0.8 },
                },
            },
            {
                scenarioId: 'SCENARIO_NATURE',
                description: '自然偏好',
                preferences: {
                    pace: 'moderate',
                    riskTolerance: 'medium',
                    intents: { 自然: 0.9, 摄影: 0.8 },
                },
            },
        ];
        const scenarios = [];
        for (const scenario of testScenarios) {
            try {
                const recommendations = await this.routeSelector.pickRouteDirections({
                    preferences: scenario.preferences,
                }, countryCode, new Date().getMonth() + 1);
                const results = recommendations.map(rec => ({
                    countryCode,
                    selectedRouteDirectionId: rec.routeDirection.id.toString(),
                    selectedRouteDirectionName: rec.routeDirection.nameCN || rec.routeDirection.name,
                    score: rec.score || 0,
                }));
                const selectedIds = new Set(results.map(r => r.selectedRouteDirectionId));
                const isDifferentiated = selectedIds.size > 1 || results.length > 0;
                scenarios.push({
                    scenarioId: scenario.scenarioId,
                    description: scenario.description,
                    preferences: {
                        ...scenario.preferences,
                        intents: scenario.preferences.intents
                            ? Object.fromEntries(Object.entries(scenario.preferences.intents).filter(([_, v]) => v !== undefined))
                            : undefined,
                    },
                    results,
                    isDifferentiated,
                    differentiationReason: isDifferentiated
                        ? `选择了${selectedIds.size}个不同的RouteDirection`
                        : '未产生差异化结果',
                });
            }
            catch (error) {
                this.logger.warn(`测试场景 ${scenario.scenarioId} 失败: ${error}`);
                scenarios.push({
                    scenarioId: scenario.scenarioId,
                    description: scenario.description,
                    preferences: {
                        ...scenario.preferences,
                        intents: scenario.preferences.intents
                            ? Object.fromEntries(Object.entries(scenario.preferences.intents).filter(([_, v]) => v !== undefined))
                            : undefined,
                    },
                    results: [],
                    isDifferentiated: false,
                    differentiationReason: `测试失败: ${error}`,
                });
            }
        }
        const totalScenarios = scenarios.length;
        const differentiatedScenarios = scenarios.filter(s => s.isDifferentiated).length;
        const differentiationScore = totalScenarios > 0
            ? Math.round((differentiatedScenarios / totalScenarios) * 100)
            : 0;
        return {
            totalScenarios,
            differentiatedScenarios,
            differentiationScore,
            scenarios,
        };
    }
};
exports.PackKPIAcceptanceService = PackKPIAcceptanceService;
exports.PackKPIAcceptanceService = PackKPIAcceptanceService = PackKPIAcceptanceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        route_direction_selector_service_1.RouteDirectionSelectorService])
], PackKPIAcceptanceService);
//# sourceMappingURL=pack-kpi-acceptance.service.js.map