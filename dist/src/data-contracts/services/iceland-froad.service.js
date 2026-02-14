"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var IcelandFRoadService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IcelandFRoadService = void 0;
const common_1 = require("@nestjs/common");
let IcelandFRoadService = IcelandFRoadService_1 = class IcelandFRoadService {
    constructor() {
        this.logger = new common_1.Logger(IcelandFRoadService_1.name);
        this.fRoadPattern = /^F\d+/i;
    }
    isFRoad(roadNumber) {
        if (!roadNumber) {
            return false;
        }
        return this.fRoadPattern.test(roadNumber.trim());
    }
    extractFRoadFromTags(tags) {
        const roadNumber = tags.ref || tags['ref:road'] || tags.name;
        if (!roadNumber || !this.isFRoad(roadNumber)) {
            return null;
        }
        return {
            roadNumber: roadNumber.toUpperCase(),
            isFRoad: true,
            status: tags.status === 'closed' ? 'closed' :
                tags.status === 'restricted' ? 'restricted' : 'open',
            restrictionReason: tags.restriction_reason || tags.restrictionReason,
            requires4WD: tags.requires_4wd !== false,
            difficultyLevel: this.parseDifficultyLevel(tags.difficulty || tags.difficulty_level),
            snowDepth: tags.snow_depth ? parseInt(tags.snow_depth) : undefined,
            isSlippery: tags.slippery === true || tags.slippery === 'yes',
            lastUpdated: new Date(),
        };
    }
    assessRouteRisk(routeSegments, vehicleType, insurance) {
        const totalSegments = routeSegments.length;
        let fRoadCount = 0;
        let gravelCount = 0;
        let containsFRoad = false;
        const segmentRisks = [];
        const riskReasons = [];
        const insuranceRecommendations = [];
        for (const segment of routeSegments) {
            const isFRoad = segment.roadNumber ? this.isFRoad(segment.roadNumber) : false;
            const isGravel = segment.isGravel || segment.roadType === 'gravel';
            if (isFRoad) {
                fRoadCount++;
                containsFRoad = true;
                if (vehicleType === '2WD') {
                    segmentRisks.push({
                        segmentId: segment.roadNumber || 'unknown',
                        riskLevel: 3,
                        riskReason: `F-Road ${segment.roadNumber} 需要 4WD 车辆`,
                        fRoadInfo: {
                            roadNumber: segment.roadNumber,
                            isFRoad: true,
                            status: 'restricted',
                            requires4WD: true,
                            lastUpdated: new Date(),
                        },
                    });
                    riskReasons.push(`F-Road ${segment.roadNumber} 需要 4WD`);
                }
                else {
                    segmentRisks.push({
                        segmentId: segment.roadNumber || 'unknown',
                        riskLevel: 2,
                        riskReason: `F-Road ${segment.roadNumber} 需要谨慎驾驶`,
                        fRoadInfo: {
                            roadNumber: segment.roadNumber,
                            isFRoad: true,
                            status: 'open',
                            requires4WD: true,
                            lastUpdated: new Date(),
                        },
                    });
                }
            }
            if (isGravel) {
                gravelCount++;
            }
        }
        const fRoadPercentage = totalSegments > 0 ? (fRoadCount / totalSegments) * 100 : 0;
        const gravelRoadPercentage = totalSegments > 0 ? (gravelCount / totalSegments) * 100 : 0;
        let overallRiskLevel = 0;
        if (vehicleType === '2WD' && containsFRoad) {
            overallRiskLevel = 3;
            riskReasons.push('2WD 车辆无法安全通过 F-Road');
        }
        else if (gravelRoadPercentage > 30) {
            overallRiskLevel = 2;
            riskReasons.push(`碎石路面占比 ${gravelRoadPercentage.toFixed(1)}%，建议购买 GP 碎石险`);
            const hasGPInsurance = insurance === null || insurance === void 0 ? void 0 : insurance.some(ins => ins.type === 'GP' && ins.isPurchased);
            if (!hasGPInsurance) {
                insuranceRecommendations.push('建议购买 GP（碎石险）');
            }
        }
        else if (fRoadPercentage > 50) {
            overallRiskLevel = 2;
            riskReasons.push(`F-Road 占比 ${fRoadPercentage.toFixed(1)}%，需要 4WD 车辆`);
        }
        return {
            routeId: 'route-' + Date.now(),
            overallRiskLevel,
            riskReasons,
            fRoadPercentage,
            gravelRoadPercentage,
            containsFRoad,
            containsRiverCrossing: false,
            insuranceRecommendations,
            segmentRisks,
        };
    }
    isVehicleSuitableForRoute(vehicleType, routeSegments) {
        const hasFRoad = routeSegments.some(segment => segment.roadNumber && this.isFRoad(segment.roadNumber));
        if (vehicleType === '2WD' && hasFRoad) {
            return {
                suitable: false,
                reason: '2WD 车辆无法安全通过 F-Road，请使用 4WD 车辆或修改路径',
            };
        }
        return { suitable: true };
    }
    parseDifficultyLevel(difficulty) {
        if (typeof difficulty === 'number') {
            return Math.max(1, Math.min(5, difficulty));
        }
        if (typeof difficulty === 'string') {
            const difficultyMap = {
                'easy': 1,
                'moderate': 2,
                'medium': 3,
                'hard': 4,
                'difficult': 4,
                'extreme': 5,
            };
            return difficultyMap[difficulty.toLowerCase()] || 3;
        }
        return 3;
    }
};
exports.IcelandFRoadService = IcelandFRoadService;
exports.IcelandFRoadService = IcelandFRoadService = IcelandFRoadService_1 = __decorate([
    (0, common_1.Injectable)()
], IcelandFRoadService);
//# sourceMappingURL=iceland-froad.service.js.map