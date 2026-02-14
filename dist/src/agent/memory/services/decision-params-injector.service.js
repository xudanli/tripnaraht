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
var DecisionParamsInjectorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionParamsInjectorService = void 0;
const common_1 = require("@nestjs/common");
const memory_service_1 = require("./memory.service");
const user_profile_mapper_service_1 = require("./user-profile-mapper.service");
const route_direction_health_interface_1 = require("../interfaces/route-direction-health.interface");
const user_travel_profile_interface_1 = require("../interfaces/user-travel-profile.interface");
let DecisionParamsInjectorService = DecisionParamsInjectorService_1 = class DecisionParamsInjectorService {
    constructor(memoryService, profileMapper) {
        this.memoryService = memoryService;
        this.profileMapper = profileMapper;
        this.logger = new common_1.Logger(DecisionParamsInjectorService_1.name);
    }
    async getDecisionParamsForUser(userId) {
        const profile = await this.memoryService.getUserTravelProfile(userId);
        if (!profile) {
            const defaultProfile = (0, user_travel_profile_interface_1.createDefaultUserTravelProfile)(userId);
            const params = this.profileMapper.mapUserProfileToDecisionParams(defaultProfile);
            this.logger.debug(`Generated default decision params for new user ${userId}`);
            return params;
        }
        const params = this.profileMapper.mapUserProfileToDecisionParams(profile);
        this.logger.debug(`Generated decision params for user ${userId}: ` +
            `pace=${profile.pacePreference}, confidence=${profile.confidence.toFixed(2)}`);
        return params;
    }
    async adjustRouteDirectionScore(routeDirectionId, countryCode, baseScore, decisionParams, routeDirection) {
        var _a;
        let adjustedScore = baseScore;
        if (routeDirection) {
            const routeTags = routeDirection.tags || [];
            const archetype = ((_a = routeDirection.metadata) === null || _a === void 0 ? void 0 : _a.archetype) || '';
            const isScenic = routeTags.includes('摄影') || routeTags.includes('风景') ||
                archetype.includes('SCENIC') || archetype.includes('FJORD');
            const isAdventure = routeTags.includes('挑战') || routeTags.includes('冒险') ||
                archetype.includes('ADVENTURE') || archetype.includes('CHALLENGE');
            const isStable = routeTags.includes('轻松') || routeTags.includes('稳定') ||
                archetype.includes('RELAXED') || archetype.includes('URBAN');
            if (isScenic) {
                adjustedScore *= (1 + decisionParams.routeDirectionBias.sceneryWeight * 0.2);
            }
            if (isAdventure) {
                adjustedScore *= (1 + decisionParams.routeDirectionBias.adventureWeight * 0.2);
            }
            if (isStable) {
                adjustedScore *= (1 + decisionParams.routeDirectionBias.stabilityWeight * 0.2);
            }
        }
        const health = await this.memoryService.getRouteDirectionHealth(routeDirectionId, countryCode);
        if (health) {
            const healthScore = (0, route_direction_health_interface_1.calculateRouteDirectionHealthScore)(health);
            adjustedScore *= (0.5 + healthScore * 0.5);
        }
        return Math.max(0, Math.min(100, adjustedScore));
    }
    injectConstraintsToWorldModel(worldModel, decisionParams) {
        if (!worldModel.policies) {
            worldModel.policies = {};
        }
        const policies = worldModel.policies;
        if (decisionParams.constraints.maxElevationM) {
            policies.hardConstraints = policies.hardConstraints || {};
            policies.hardConstraints.maxElevationM = decisionParams.constraints.maxElevationM;
        }
        if (decisionParams.constraints.avoidRapidAscent) {
            policies.hardConstraints = policies.hardConstraints || {};
            policies.hardConstraints.rapidAscentForbidden = decisionParams.constraints.avoidRapidAscent;
        }
        if (decisionParams.constraints.maxDailyAscentM) {
            policies.softConstraints = policies.softConstraints || {};
            policies.softConstraints.maxDailyAscentM = decisionParams.constraints.maxDailyAscentM;
        }
        if (decisionParams.constraints.bufferTimeMin) {
            policies.softConstraints = policies.softConstraints || {};
            policies.softConstraints.bufferTimeMin = decisionParams.constraints.bufferTimeMin;
        }
        if (decisionParams.constraints.maxSlopePct) {
            policies.softConstraints = policies.softConstraints || {};
            policies.softConstraints.maxSlopePct = decisionParams.constraints.maxSlopePct;
        }
        this.logger.debug(`Injected constraints: ` +
            `maxElevation=${decisionParams.constraints.maxElevationM}, ` +
            `maxAscent=${decisionParams.constraints.maxDailyAscentM}, ` +
            `buffer=${decisionParams.constraints.bufferTimeMin}`);
    }
    filterRouteDirectionByPreference(routeDirection, preferredRouteTypes) {
        var _a, _b;
        if (!preferredRouteTypes || preferredRouteTypes.length === 0) {
            return { shouldKeep: true, scoreMultiplier: 1.0 };
        }
        let routeType = ((_a = routeDirection.metadata) === null || _a === void 0 ? void 0 : _a.archetype) || ((_b = routeDirection.metadata) === null || _b === void 0 ? void 0 : _b.routeType);
        if (!routeType && routeDirection.tags) {
            const tags = routeDirection.tags;
            if (tags.includes('徒步') || tags.includes('hiking') || tags.includes('trekking')) {
                routeType = 'HIKING';
            }
            else if (tags.includes('自驾') || tags.includes('driving') || tags.includes('coastline')) {
                routeType = 'ROAD_TRIP';
            }
            else if (tags.includes('出海') || tags.includes('sea') || tags.includes('fjord')) {
                routeType = 'SEA';
            }
            else if (tags.includes('城市') || tags.includes('urban') || tags.includes('city')) {
                routeType = 'URBAN';
            }
            else if (tags.includes('文化') || tags.includes('cultural') || tags.includes('culture')) {
                routeType = 'CULTURAL';
            }
            else if (tags.includes('自然') || tags.includes('nature') || tags.includes('scenic')) {
                routeType = 'NATURE';
            }
        }
        if (routeType && typeof routeType === 'string') {
            const archetypeUpper = routeType.toUpperCase();
            if (archetypeUpper.includes('TREKKING') || archetypeUpper.includes('HIKING')) {
                routeType = 'HIKING';
            }
            else if (archetypeUpper.includes('DRIVING') || archetypeUpper.includes('COASTLINE')) {
                routeType = 'ROAD_TRIP';
            }
            else if (archetypeUpper.includes('SEA') || archetypeUpper.includes('FJORD')) {
                routeType = 'SEA';
            }
            else if (archetypeUpper.includes('URBAN') || archetypeUpper.includes('CITY')) {
                routeType = 'URBAN';
            }
            else if (archetypeUpper.includes('CULTURAL') || archetypeUpper.includes('CULTURE')) {
                routeType = 'CULTURAL';
            }
            else if (archetypeUpper.includes('NATURE') || archetypeUpper.includes('SCENIC')) {
                routeType = 'NATURE';
            }
        }
        if (!routeType) {
            return { shouldKeep: true, scoreMultiplier: 1.0 };
        }
        const routeTypeUpper = routeType.toUpperCase();
        const isPreferred = preferredRouteTypes.some(pref => {
            const prefUpper = pref.toUpperCase();
            return routeTypeUpper === prefUpper ||
                routeTypeUpper.includes(prefUpper) ||
                prefUpper.includes(routeTypeUpper);
        });
        if (!isPreferred) {
            return { shouldKeep: true, scoreMultiplier: 0.6 };
        }
        return { shouldKeep: true, scoreMultiplier: 1.0 };
    }
};
exports.DecisionParamsInjectorService = DecisionParamsInjectorService;
exports.DecisionParamsInjectorService = DecisionParamsInjectorService = DecisionParamsInjectorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [memory_service_1.MemoryService,
        user_profile_mapper_service_1.UserProfileMapperService])
], DecisionParamsInjectorService);
//# sourceMappingURL=decision-params-injector.service.js.map