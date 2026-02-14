"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ScenarioOptimizationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScenarioOptimizationService = void 0;
const common_1 = require("@nestjs/common");
let ScenarioOptimizationService = ScenarioOptimizationService_1 = class ScenarioOptimizationService {
    constructor() {
        this.logger = new common_1.Logger(ScenarioOptimizationService_1.name);
    }
    applyScenarioConfig(request, config) {
        const modified = { ...request };
        switch (config.scenario) {
            case 'walking':
                return this.applyWalkingConfig(modified, config);
            case 'driving':
                return this.applyDrivingConfig(modified, config);
            case 'transit':
                return this.applyTransitConfig(modified, config);
            default:
                this.logger.warn(`未知场景类型: ${config.scenario}`);
                return modified;
        }
    }
    applyWalkingConfig(request, config) {
        var _a, _b, _c, _d;
        if (!config.walking) {
            return request;
        }
        const modified = { ...request };
        const fitness = config.walking.fitness_constraints;
        modified.transport_policy = {
            ...modified.transport_policy,
            buffer_factor: ((_a = modified.transport_policy) === null || _a === void 0 ? void 0 : _a.buffer_factor) || 1.3,
            fixed_buffer_min: ((_b = modified.transport_policy) === null || _b === void 0 ? void 0 : _b.fixed_buffer_min) || 20,
        };
        modified.objective_weights = {
            ...modified.objective_weights,
            travel: (((_c = modified.objective_weights) === null || _c === void 0 ? void 0 : _c.travel) || 1.0) * 1.2,
            wait: (((_d = modified.objective_weights) === null || _d === void 0 ? void 0 : _d.wait) || 1.5) * 0.8,
        };
        if (config.walking.pacing_adjustment) {
        }
        this.logger.debug(`应用徒步场景配置: DEM=${config.walking.dem_required}, 地形分析=${config.walking.terrain_analysis}`);
        return modified;
    }
    applyDrivingConfig(request, config) {
        if (!config.driving) {
            return request;
        }
        const modified = { ...request };
        modified.transport_policy = {
            ...modified.transport_policy,
            buffer_factor: config.driving.traffic_aware ? 1.25 : 1.1,
            fixed_buffer_min: config.driving.traffic_aware ? 20 : 10,
        };
        modified.objective_weights = {
            ...modified.objective_weights,
            travel: config.driving.route_optimization === 'TIME' ? 1.5 : 1.0,
        };
        if (config.driving.parking_consideration) {
        }
        this.logger.debug(`应用自驾场景配置: 优化目标=${config.driving.route_optimization}, ` +
            `交通感知=${config.driving.traffic_aware}`);
        return modified;
    }
    applyTransitConfig(request, config) {
        var _a, _b;
        if (!config.transit) {
            return request;
        }
        const modified = { ...request };
        modified.transport_policy = {
            ...modified.transport_policy,
            buffer_factor: config.transit.schedule_aware ? 1.4 : 1.2,
            fixed_buffer_min: config.transit.schedule_aware ? 30 : 15,
            switch_cost_min: {
                ...(_a = modified.transport_policy) === null || _a === void 0 ? void 0 : _a.switch_cost_min,
            },
        };
        modified.objective_weights = {
            ...modified.objective_weights,
            wait: (((_b = modified.objective_weights) === null || _b === void 0 ? void 0 : _b.wait) || 1.5) * (1 + config.transit.transfer_penalty / 60),
        };
        this.logger.debug(`应用公共交通场景配置: 班次感知=${config.transit.schedule_aware}, ` +
            `换乘惩罚=${config.transit.transfer_penalty}分钟, ` +
            `最大换乘=${config.transit.max_transfers || 'unlimited'}`);
        return modified;
    }
    generateScenarioConstraints(scenario, config) {
        const baseConstraints = {
            scenario,
            hard_constraints: {},
            soft_preferences: {},
        };
        switch (scenario) {
            case 'walking':
                if (config === null || config === void 0 ? void 0 : config.walking) {
                    const fitness = config.walking.fitness_constraints;
                    baseConstraints.hard_constraints = {
                        max_travel_time_min: fitness.max_total_walk_min,
                        required_features: fitness.require_rescue_access ? ['rescue_access'] : undefined,
                    };
                    baseConstraints.soft_preferences = {
                        preferred_features: ['restroom', 'water'],
                        avoid_features: ['steep_slope'],
                    };
                }
                break;
            case 'driving':
                if (config === null || config === void 0 ? void 0 : config.driving) {
                    baseConstraints.hard_constraints = {
                        required_features: config.driving.parking_consideration ? ['parking'] : undefined,
                    };
                    baseConstraints.soft_preferences = {
                        preferred_features: config.driving.route_optimization === 'SCENIC' ? ['scenic_view'] : [],
                    };
                }
                break;
            case 'transit':
                if (config === null || config === void 0 ? void 0 : config.transit) {
                    baseConstraints.hard_constraints = {
                        required_features: ['transit_station_nearby'],
                    };
                    baseConstraints.soft_preferences = {
                        preferred_features: config.transit.prefer_direct_routes ? ['direct_route'] : [],
                        avoid_features: config.transit.max_transfers
                            ? [`transfers > ${config.transit.max_transfers}`]
                            : [],
                    };
                }
                break;
        }
        return baseConstraints;
    }
    getDefaultScenarioConfig(scenario) {
        switch (scenario) {
            case 'walking':
                return {
                    scenario: 'walking',
                    walking: {
                        dem_required: true,
                        fitness_constraints: {
                            max_walk_min: 30,
                            max_total_walk_min: 240,
                            max_ascent_m: 500,
                            max_slope_pct: 20,
                            require_rescue_access: false,
                        },
                        terrain_analysis: true,
                        pacing_adjustment: {
                            ascent_factor: 1.2,
                            slope_factor: 1.15,
                        },
                    },
                };
            case 'driving':
                return {
                    scenario: 'driving',
                    driving: {
                        route_optimization: 'TIME',
                        traffic_aware: true,
                        parking_consideration: true,
                        fuel_stops: {
                            required: false,
                            max_distance_between_stops_km: 300,
                        },
                    },
                };
            case 'transit':
                return {
                    scenario: 'transit',
                    transit: {
                        schedule_aware: true,
                        transfer_penalty: 15,
                        walking_to_station_max_min: 10,
                        max_transfers: 2,
                        prefer_direct_routes: true,
                        time_window_aware: true,
                    },
                };
            default:
                throw new Error(`未知场景类型: ${scenario}`);
        }
    }
};
exports.ScenarioOptimizationService = ScenarioOptimizationService;
exports.ScenarioOptimizationService = ScenarioOptimizationService = ScenarioOptimizationService_1 = __decorate([
    (0, common_1.Injectable)()
], ScenarioOptimizationService);
//# sourceMappingURL=scenario-optimization.service.js.map