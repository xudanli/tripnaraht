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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RankingService = void 0;
const common_1 = require("@nestjs/common");
const feasibility_service_1 = require("./feasibility.service");
const time_utils_1 = require("../utils/time-utils");
let RankingService = class RankingService {
    constructor(feasibilityService) {
        this.feasibilityService = feasibilityService;
    }
    rankPois(req) {
        const features = req.pois.map((poi) => {
            var _a, _b, _c, _d;
            const feasibility = this.feasibilityService.isPoiFeasible(poi, req.currentTimeMin, req.policy, req.dayOfWeek, req.dateISO);
            const waitEstimate = this.feasibilityService.estimateWait(poi, req.currentTimeMin, req.dayOfWeek, req.dateISO);
            const accessibilityOK = !req.policy.constraints.requireWheelchairAccess ||
                poi.wheelchairAccess !== false;
            const stairsOK = !req.policy.constraints.forbidStairs || poi.stairsRequired !== true;
            let expectedWalkPain = 0;
            if (req.currentLocation) {
                const distanceM = (0, time_utils_1.calculateDistance)(req.currentLocation.lat, req.currentLocation.lng, poi.lat, poi.lng);
                const walkMin = distanceM / 1000 / 5 * 60;
                expectedWalkPain = walkMin * req.policy.weights.walkPainPerMin;
            }
            let restSupportDensity = 0;
            if (req.restStops && req.restStops.length > 0) {
                const nearby = req.restStops.filter((rest) => {
                    const distanceM = (0, time_utils_1.calculateDistance)(poi.lat, poi.lng, rest.lat, rest.lng);
                    return distanceM <= 1000;
                });
                restSupportDensity = nearby.length;
            }
            const baseInterestScore = (_b = (_a = req.baseInterestScores) === null || _a === void 0 ? void 0 : _a.get(poi.id)) !== null && _b !== void 0 ? _b : 1.0;
            let finalScore = baseInterestScore;
            if (!feasibility.feasible) {
                finalScore *= 0.1;
            }
            else {
                if (feasibility.inOpenWindow) {
                    finalScore *= 1.2;
                }
                else if (waitEstimate.waitMin > 0 && waitEstimate.waitMin < 60) {
                    finalScore *= 1.1;
                }
                else if (waitEstimate.waitMin >= 180) {
                    finalScore *= 0.7;
                }
            }
            if (!accessibilityOK || !stairsOK) {
                finalScore *= 0.05;
            }
            const mobilityWorst = req.policy.derived.groupMobilityWorst;
            if (mobilityWorst === 'CITY_POTATO' || mobilityWorst === 'LIMITED') {
                finalScore -= expectedWalkPain * 0.1;
            }
            if (mobilityWorst === 'CITY_POTATO' || mobilityWorst === 'LIMITED') {
                finalScore += restSupportDensity * 0.05;
            }
            return {
                poiId: poi.id,
                baseInterestScore,
                feasibleNow: feasibility.feasible,
                openWindowNextMin: (_c = waitEstimate.waitMin) !== null && _c !== void 0 ? _c : 0,
                lastEntrySlack: feasibility.pastLastEntry
                    ? -999
                    : ((_d = poi.openingHours) === null || _d === void 0 ? void 0 : _d.lastEntry)
                        ? this.calculateLastEntrySlack(poi.openingHours.lastEntry, req.currentTimeMin)
                        : 999,
                accessibilityOK: accessibilityOK && stairsOK,
                expectedWalkPain,
                restSupportDensity,
                finalScore,
                infeasibleReason: feasibility.feasible ? undefined : feasibility.reason,
            };
        });
        return features.sort((a, b) => b.finalScore - a.finalScore);
    }
    calculateLastEntrySlack(lastEntryStr, currentTimeMin) {
        const [h, m] = lastEntryStr.split(':').map(Number);
        const lastEntryMin = h * 60 + m;
        return lastEntryMin - currentTimeMin;
    }
};
exports.RankingService = RankingService;
exports.RankingService = RankingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [feasibility_service_1.FeasibilityService])
], RankingService);
//# sourceMappingURL=ranking.service.js.map