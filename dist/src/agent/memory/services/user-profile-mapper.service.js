"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var UserProfileMapperService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserProfileMapperService = void 0;
const common_1 = require("@nestjs/common");
const decision_params_interface_1 = require("../interfaces/decision-params.interface");
let UserProfileMapperService = UserProfileMapperService_1 = class UserProfileMapperService {
    constructor() {
        this.logger = new common_1.Logger(UserProfileMapperService_1.name);
    }
    mapUserProfileToDecisionParams(profile) {
        const params = (0, decision_params_interface_1.createDefaultDecisionParams)();
        const confidenceMultiplier = profile.confidence < 0.5 ? 0.5 : 1.0;
        this.applyPacePreference(params, profile.pacePreference, confidenceMultiplier);
        this.applyAltitudeTolerance(params, profile.altitudeTolerance, confidenceMultiplier);
        this.applyRiskTolerance(params, profile.riskTolerance, confidenceMultiplier);
        this.applyTravelPhilosophy(params, profile.travelPhilosophy, confidenceMultiplier);
        return (0, decision_params_interface_1.normalizeDecisionParams)(params);
    }
    applyPacePreference(params, pace, multiplier = 1.0) {
        if (!pace)
            return;
        switch (pace) {
            case 'SLOW':
                params.constraints.bufferTimeMin = (params.constraints.bufferTimeMin || 15) + 60 * multiplier;
                params.strategyPreference.abuWeight += 0.2 * multiplier;
                params.repairPolicy.preferRestDay = true;
                params.repairPolicy.preferSplitDays = true;
                break;
            case 'FAST':
                params.constraints.bufferTimeMin = Math.max(5, (params.constraints.bufferTimeMin || 15) - 10 * multiplier);
                params.strategyPreference.drDreWeight += 0.15 * multiplier;
                params.routeDirectionBias.difficultyWeight += 0.2 * multiplier;
                break;
            case 'MODERATE':
            default:
                break;
        }
    }
    applyAltitudeTolerance(params, altitude, multiplier = 1.0) {
        if (!altitude)
            return;
        switch (altitude) {
            case 'LOW':
                params.constraints.maxElevationM = 3500;
                params.constraints.avoidRapidAscent = true;
                params.constraints.maxDailyAscentM = 500 * multiplier;
                break;
            case 'MEDIUM':
                params.constraints.maxElevationM = 4500;
                params.constraints.maxDailyAscentM = 800 * multiplier;
                break;
            case 'HIGH':
                params.constraints.maxElevationM = 6000;
                params.constraints.maxDailyAscentM = 1200 * multiplier;
                break;
        }
    }
    applyRiskTolerance(params, risk, multiplier = 1.0) {
        if (!risk)
            return;
        switch (risk) {
            case 'LOW':
                params.routeDirectionBias.stabilityWeight += 0.3 * multiplier;
                params.strategyPreference.abuWeight += 0.3 * multiplier;
                params.repairPolicy.preferAltRoute = true;
                break;
            case 'MEDIUM':
                break;
            case 'HIGH':
                params.routeDirectionBias.adventureWeight += 0.3 * multiplier;
                params.routeDirectionBias.difficultyWeight += 0.2 * multiplier;
                params.strategyPreference.neptuneWeight += 0.2 * multiplier;
                break;
        }
    }
    applyTravelPhilosophy(params, philosophy, multiplier = 1.0) {
        if (!philosophy)
            return;
        switch (philosophy) {
            case 'SCENIC':
                params.routeDirectionBias.sceneryWeight += 0.4 * multiplier;
                params.routeDirectionBias.difficultyWeight -= 0.2 * multiplier;
                break;
            case 'ADVENTURE':
                params.routeDirectionBias.adventureWeight += 0.4 * multiplier;
                params.routeDirectionBias.difficultyWeight += 0.3 * multiplier;
                params.routeDirectionBias.stabilityWeight -= 0.2 * multiplier;
                break;
            case 'RELAXED':
                params.routeDirectionBias.stabilityWeight += 0.3 * multiplier;
                params.routeDirectionBias.difficultyWeight -= 0.3 * multiplier;
                params.repairPolicy.preferRestDay = true;
                break;
        }
    }
    mergeDecisionParams(paramsList) {
        if (paramsList.length === 0) {
            return (0, decision_params_interface_1.createDefaultDecisionParams)();
        }
        if (paramsList.length === 1) {
            return paramsList[0];
        }
        const merged = (0, decision_params_interface_1.createDefaultDecisionParams)();
        paramsList.forEach(params => {
            merged.routeDirectionBias.difficultyWeight += params.routeDirectionBias.difficultyWeight;
            merged.routeDirectionBias.sceneryWeight += params.routeDirectionBias.sceneryWeight;
            merged.routeDirectionBias.adventureWeight += params.routeDirectionBias.adventureWeight;
            merged.routeDirectionBias.stabilityWeight += params.routeDirectionBias.stabilityWeight;
        });
        const count = paramsList.length;
        merged.routeDirectionBias.difficultyWeight /= count;
        merged.routeDirectionBias.sceneryWeight /= count;
        merged.routeDirectionBias.adventureWeight /= count;
        merged.routeDirectionBias.stabilityWeight /= count;
        paramsList.forEach(params => {
            merged.strategyPreference.abuWeight += params.strategyPreference.abuWeight;
            merged.strategyPreference.drDreWeight += params.strategyPreference.drDreWeight;
            merged.strategyPreference.neptuneWeight += params.strategyPreference.neptuneWeight;
        });
        merged.strategyPreference.abuWeight /= count;
        merged.strategyPreference.drDreWeight /= count;
        merged.strategyPreference.neptuneWeight /= count;
        paramsList.forEach(params => {
            if (params.constraints.maxElevationM) {
                if (!merged.constraints.maxElevationM || params.constraints.maxElevationM < merged.constraints.maxElevationM) {
                    merged.constraints.maxElevationM = params.constraints.maxElevationM;
                }
            }
            if (params.constraints.maxDailyAscentM) {
                if (!merged.constraints.maxDailyAscentM || params.constraints.maxDailyAscentM < merged.constraints.maxDailyAscentM) {
                    merged.constraints.maxDailyAscentM = params.constraints.maxDailyAscentM;
                }
            }
            if (params.constraints.bufferTimeMin) {
                if (!merged.constraints.bufferTimeMin || params.constraints.bufferTimeMin > merged.constraints.bufferTimeMin) {
                    merged.constraints.bufferTimeMin = params.constraints.bufferTimeMin;
                }
            }
            if (params.constraints.avoidRapidAscent) {
                merged.constraints.avoidRapidAscent = true;
            }
        });
        merged.repairPolicy.preferSplitDays = paramsList.some(p => p.repairPolicy.preferSplitDays);
        merged.repairPolicy.preferAltRoute = paramsList.some(p => p.repairPolicy.preferAltRoute);
        merged.repairPolicy.preferRestDay = paramsList.some(p => p.repairPolicy.preferRestDay);
        return (0, decision_params_interface_1.normalizeDecisionParams)(merged);
    }
};
exports.UserProfileMapperService = UserProfileMapperService;
exports.UserProfileMapperService = UserProfileMapperService = UserProfileMapperService_1 = __decorate([
    (0, common_1.Injectable)()
], UserProfileMapperService);
//# sourceMappingURL=user-profile-mapper.service.js.map