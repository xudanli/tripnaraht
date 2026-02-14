"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DEMEvidenceChainService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMEvidenceChainService = void 0;
const common_1 = require("@nestjs/common");
let DEMEvidenceChainService = DEMEvidenceChainService_1 = class DEMEvidenceChainService {
    constructor() {
        this.logger = new common_1.Logger(DEMEvidenceChainService_1.name);
    }
    generateEvidenceChain(plan, routeSegmentation, planRiskScore, dailyEnergyBudgets, selectedRouteDirection) {
        var _a, _b;
        const dailyEvidences = [];
        const planEvidence = this.generatePlanEvidence(plan, routeSegmentation, planRiskScore, selectedRouteDirection);
        for (const day of plan.days) {
            const dayEnergyBudget = (_a = dailyEnergyBudgets === null || dailyEnergyBudgets === void 0 ? void 0 : dailyEnergyBudgets.find(d => d.day === day.day)) === null || _a === void 0 ? void 0 : _a.budget;
            const dayRiskScore = (_b = planRiskScore === null || planRiskScore === void 0 ? void 0 : planRiskScore.dailyRiskScores) === null || _b === void 0 ? void 0 : _b.find(d => d.day === day.day);
            const dayEvidence = this.generateDayEvidence(day, routeSegmentation, dayEnergyBudget, dayRiskScore);
            dailyEvidences.push(dayEvidence);
        }
        return {
            planEvidence,
            dailyEvidences,
        };
    }
    generatePlanEvidence(plan, routeSegmentation, planRiskScore, selectedRouteDirection) {
        const whyThisRoute = [];
        const whyThisItinerary = [];
        if (selectedRouteDirection) {
            const rd = selectedRouteDirection.routeDirection || selectedRouteDirection;
            if (rd.nameCN) {
                whyThisRoute.push(`选择了"${rd.nameCN}"路线方向`);
            }
            if (selectedRouteDirection.scoreBreakdown) {
                const topReason = Object.entries(selectedRouteDirection.scoreBreakdown)
                    .sort(([, a], [, b]) => b - a)[0];
                if (topReason) {
                    whyThisRoute.push(`匹配度最高：${topReason[0]}（得分：${topReason[1].toFixed(2)}）`);
                }
            }
        }
        let segmentationEvidence;
        if (routeSegmentation) {
            segmentationEvidence = {
                totalDistance: routeSegmentation.totalDistance,
                totalAscent: routeSegmentation.totalAscent,
                steepSections: routeSegmentation.steepSections.length,
                energyBreakpoints: routeSegmentation.energyBreakpoints.length,
                mandatoryRestPoints: routeSegmentation.mandatoryRestPoints.length,
            };
            whyThisItinerary.push(`路线总距离 ${(routeSegmentation.totalDistance / 1000).toFixed(1)} 公里，` +
                `总爬升 ${routeSegmentation.totalAscent.toFixed(0)} 米`);
            if (routeSegmentation.steepSections.length > 0) {
                whyThisItinerary.push(`识别到 ${routeSegmentation.steepSections.length} 个过陡段，` +
                    `已考虑在安排中避免或合理安排休息`);
            }
            if (routeSegmentation.mandatoryRestPoints.length > 0) {
                whyThisItinerary.push(`识别到 ${routeSegmentation.mandatoryRestPoints.length} 个强制休息点，` +
                    `已在这些位置安排休息或轻松活动`);
            }
        }
        let riskEvidence;
        if (planRiskScore) {
            riskEvidence = {
                consecutiveHighAltitudeDays: planRiskScore.consecutiveHighAltitudeDays,
                consecutiveAscent: planRiskScore.consecutiveAscent,
                steepConcentratedSections: planRiskScore.steepConcentratedSections,
                totalRiskScore: planRiskScore.totalRiskScore,
            };
            if (planRiskScore.consecutiveHighAltitudeDays >= 3) {
                whyThisItinerary.push(`连续 ${planRiskScore.consecutiveHighAltitudeDays} 天高海拔（>3000m），` +
                    `已安排适应时间和休息`);
            }
            if (planRiskScore.consecutiveAscent >= 1200) {
                whyThisItinerary.push(`连续上升 ${planRiskScore.consecutiveAscent.toFixed(0)} 米，` +
                    `已安排中间休息点避免过度疲劳`);
            }
        }
        return {
            whyThisRoute: whyThisRoute.length > 0 ? whyThisRoute : undefined,
            whyThisItinerary: whyThisItinerary.length > 0 ? whyThisItinerary : undefined,
            segmentationEvidence,
            riskEvidence,
        };
    }
    generateDayEvidence(day, routeSegmentation, dailyEnergyBudget, dayRiskScore) {
        const slotEvidences = [];
        const whyThisDay = [];
        for (const slot of day.timeSlots) {
            const slotEvidence = this.generateSlotEvidence(slot, day, routeSegmentation, dailyEnergyBudget);
            slotEvidences.push(slotEvidence);
        }
        const terrainFacts = day.terrainFacts;
        if (terrainFacts) {
            if (terrainFacts.maxElevation) {
                whyThisDay.push(`最高海拔 ${terrainFacts.maxElevation.toFixed(0)} 米`);
            }
            if (terrainFacts.totalAscent) {
                whyThisDay.push(`累计爬升 ${terrainFacts.totalAscent.toFixed(0)} 米`);
            }
            if (terrainFacts.effortLevel) {
                whyThisDay.push(`体力强度：${this.getEffortLevelText(terrainFacts.effortLevel)}`);
            }
        }
        let energyEvidence;
        if (dailyEnergyBudget) {
            const energyRatio = dailyEnergyBudget.totalEnergyCost / dailyEnergyBudget.maxEnergyCost;
            energyEvidence = {
                totalEnergyCost: dailyEnergyBudget.totalEnergyCost,
                maxEnergyBudget: dailyEnergyBudget.maxEnergyCost,
                energyRatio: Math.round(energyRatio * 100) / 100,
                exceeded: dailyEnergyBudget.totalEnergyCost > dailyEnergyBudget.maxEnergyCost,
            };
            if (energyRatio > 0.9) {
                whyThisDay.push(`体力消耗接近上限（${(energyRatio * 100).toFixed(0)}%），已安排充分休息`);
            }
            else if (energyRatio > 0.7) {
                whyThisDay.push(`体力消耗较高（${(energyRatio * 100).toFixed(0)}%），已考虑休息时间`);
            }
        }
        let riskEvidence;
        if (dayRiskScore) {
            riskEvidence = {
                riskScore: dayRiskScore.riskScore,
                riskFlags: dayRiskScore.riskFlags,
            };
            if (dayRiskScore.riskScore > 70) {
                whyThisDay.push(`风险评分较高（${dayRiskScore.riskScore.toFixed(1)}），已采取风险缓解措施`);
            }
        }
        let terrainEvidence;
        if (terrainFacts) {
            terrainEvidence = {
                maxElevation: terrainFacts.maxElevation || 0,
                totalAscent: terrainFacts.totalAscent || 0,
            };
            if (routeSegmentation) {
                terrainEvidence.steepSections = routeSegmentation.steepSections.length;
                terrainEvidence.mandatoryRestPoints = routeSegmentation.mandatoryRestPoints.length;
                terrainEvidence.energyBreakpoints = routeSegmentation.energyBreakpoints.length;
            }
        }
        return {
            date: day.date,
            day: day.day,
            slotEvidences,
            whyThisDay,
            terrainEvidence,
            energyEvidence,
            riskEvidence,
        };
    }
    generateSlotEvidence(slot, day, routeSegmentation, dailyEnergyBudget) {
        var _a;
        const evidence = [];
        const whySelected = [];
        const whyThisTime = [];
        const whyThisLocation = [];
        if (slot.reasons) {
            whySelected.push(...slot.reasons);
        }
        if (slot.priorityTag === 'core') {
            whySelected.push('核心体验活动，优先安排');
        }
        else if (slot.priorityTag === 'anchor') {
            whySelected.push('锚点活动，固定时间');
        }
        if (day.terrainFacts) {
            if (day.terrainFacts.maxElevation && day.terrainFacts.maxElevation > 3000) {
                evidence.push({
                    type: 'TERRAIN',
                    title: '高海拔活动',
                    description: `活动位于高海拔区域（${day.terrainFacts.maxElevation.toFixed(0)}米），已考虑适应时间`,
                    data: { elevation: day.terrainFacts.maxElevation },
                    severity: day.terrainFacts.maxElevation > 4000 ? 'HIGH' : 'MEDIUM',
                    impactsDecision: true,
                    decisionImpact: 'SELECTION',
                });
            }
            if (day.terrainFacts.totalAscent && day.terrainFacts.totalAscent > 500) {
                evidence.push({
                    type: 'TERRAIN',
                    title: '高爬升活动',
                    description: `当日累计爬升 ${day.terrainFacts.totalAscent.toFixed(0)} 米，已安排合理节奏`,
                    data: { ascent: day.terrainFacts.totalAscent },
                    severity: day.terrainFacts.totalAscent > 1000 ? 'HIGH' : 'MEDIUM',
                    impactsDecision: true,
                    decisionImpact: 'TIMING',
                });
            }
        }
        if (dailyEnergyBudget) {
            const energyRatio = dailyEnergyBudget.totalEnergyCost / dailyEnergyBudget.maxEnergyCost;
            if (energyRatio > 0.8) {
                evidence.push({
                    type: 'ENERGY',
                    title: '高体力消耗',
                    description: `当日体力消耗 ${(energyRatio * 100).toFixed(0)}%，已安排休息时间`,
                    data: {
                        energyCost: dailyEnergyBudget.totalEnergyCost,
                        maxBudget: dailyEnergyBudget.maxEnergyCost,
                        ratio: energyRatio,
                    },
                    severity: energyRatio > 0.95 ? 'HIGH' : 'MEDIUM',
                    impactsDecision: true,
                    decisionImpact: 'REST',
                });
            }
        }
        if ((_a = day.terrainFacts) === null || _a === void 0 ? void 0 : _a.riskFlags) {
            for (const riskFlag of day.terrainFacts.riskFlags) {
                evidence.push({
                    type: 'RISK',
                    title: riskFlag.type,
                    description: riskFlag.message,
                    severity: riskFlag.severity,
                    impactsDecision: riskFlag.severity === 'HIGH',
                    decisionImpact: 'SELECTION',
                });
            }
        }
        if (slot.time) {
            whyThisTime.push(`安排在 ${slot.time}，考虑开放时间和移动时间`);
        }
        if (slot.coordinates) {
            whyThisLocation.push(`位置：${slot.coordinates.lat.toFixed(4)}, ${slot.coordinates.lng.toFixed(4)}`);
        }
        return {
            slotId: slot.id,
            activityName: slot.title,
            evidence,
            whySelected,
            whyThisTime: whyThisTime.length > 0 ? whyThisTime : undefined,
            whyThisLocation: whyThisLocation.length > 0 ? whyThisLocation : undefined,
        };
    }
    getEffortLevelText(level) {
        const texts = {
            RELAX: '轻松',
            MODERATE: '中等',
            CHALLENGE: '挑战',
            EXTREME: '极限',
        };
        return texts[level] || level;
    }
};
exports.DEMEvidenceChainService = DEMEvidenceChainService;
exports.DEMEvidenceChainService = DEMEvidenceChainService = DEMEvidenceChainService_1 = __decorate([
    (0, common_1.Injectable)()
], DEMEvidenceChainService);
//# sourceMappingURL=dem-evidence-chain.service.js.map