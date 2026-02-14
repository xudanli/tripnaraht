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
var RouteOptimizerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteOptimizerService = void 0;
const common_1 = require("@nestjs/common");
const luxon_1 = require("luxon");
const spatial_clustering_service_1 = require("./spatial-clustering.service");
const happiness_scorer_service_1 = require("./happiness-scorer.service");
const smart_routes_service_1 = require("../../transport/services/smart-routes.service");
const route_cache_service_1 = require("../../transport/services/route-cache.service");
const vrptw_optimizer_service_1 = require("./vrptw-optimizer.service");
let RouteOptimizerService = RouteOptimizerService_1 = class RouteOptimizerService {
    constructor(clusteringService, scorerService, smartRoutesService, routeCacheService, vrptwOptimizer) {
        this.clusteringService = clusteringService;
        this.scorerService = scorerService;
        this.smartRoutesService = smartRoutesService;
        this.routeCacheService = routeCacheService;
        this.vrptwOptimizer = vrptwOptimizer;
        this.logger = new common_1.Logger(RouteOptimizerService_1.name);
        this.timeMatrix = new Map();
    }
    async optimizeRoute(places, config) {
        var _a, _b;
        if (places.length === 0) {
            throw new Error('地点列表不能为空');
        }
        const zones = await this.clusteringService.clusterPlaces(places, ((_a = config.clustering) === null || _a === void 0 ? void 0 : _a.epsilon) || 2000, ((_b = config.clustering) === null || _b === void 0 ? void 0 : _b.minPoints) || 2);
        this.logger.debug(`聚类完成：${zones.length} 个 Zone`);
        await this.precomputeTimeMatrix(places, config);
        let optimizedRoute;
        if (config.useVRPTW) {
            optimizedRoute = await this.optimizeWithVRPTW(places, config, zones);
        }
        else {
            let currentRoute = this.generateInitialRoute(places, config);
            let currentScore = this.calculateTotalScore(currentRoute, config, zones);
            this.logger.debug(`初始解分数：${currentScore}`);
            optimizedRoute = this.simulatedAnnealing(currentRoute, currentScore, config, zones);
        }
        const schedule = this.generateSchedule(optimizedRoute, config, config.useVRPTW);
        const scoreBreakdown = this.scorerService.calculateHappinessScore(optimizedRoute.nodes, schedule, config, zones);
        const totalScore = scoreBreakdown.interestScore -
            scoreBreakdown.distancePenalty -
            scoreBreakdown.tiredPenalty -
            scoreBreakdown.boredPenalty -
            scoreBreakdown.starvePenalty +
            scoreBreakdown.clusteringBonus +
            scoreBreakdown.bufferBonus;
        this.timeMatrix.clear();
        return {
            nodes: optimizedRoute.nodes,
            schedule,
            happinessScore: totalScore,
            scoreBreakdown,
            zones,
        };
    }
    async precomputeTimeMatrix(places, config) {
        this.logger.debug(`开始预计算时间矩阵：${places.length} 个地点`);
        const travelMode = 'TRANSIT';
        const promises = [];
        const batchSize = 10;
        for (let i = 0; i < places.length; i++) {
            for (let j = i + 1; j < places.length; j++) {
                const from = places[i];
                const to = places[j];
                const distance = this.calculateDistance(from.location, to.location);
                if (distance < 1000) {
                    const walkTime = await this.routeCacheService.calculateShortDistanceWalkTime(from.location.lat, from.location.lng, to.location.lat, to.location.lng);
                    this.setTimeInMatrix(String(from.id), String(to.id), walkTime);
                    continue;
                }
                const promise = this.fetchAndCacheTransportTime(from.location, to.location, String(from.id), String(to.id), travelMode);
                promises.push(promise);
                if (promises.length >= batchSize) {
                    await Promise.all(promises);
                    promises.length = 0;
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }
        if (promises.length > 0) {
            await Promise.all(promises);
        }
        this.logger.debug(`时间矩阵预计算完成：${this.timeMatrix.size} 个点对`);
    }
    async fetchAndCacheTransportTime(from, to, fromId, toId, travelMode) {
        try {
            const cached = await this.routeCacheService.getCachedRoute(from.lat, from.lng, to.lat, to.lng, travelMode);
            if (cached) {
                this.setTimeInMatrix(fromId, toId, cached.durationMinutes);
                return;
            }
            const options = await this.smartRoutesService.getRoutes(from.lat, from.lng, to.lat, to.lng, travelMode);
            if (options.length > 0) {
                const duration = options[0].durationMinutes;
                this.setTimeInMatrix(fromId, toId, duration);
                await this.routeCacheService.saveCachedRoute(from.lat, from.lng, to.lat, to.lng, travelMode, options[0]);
            }
            else {
                const fallbackTime = this.fallbackEstimateTransportTime(from, to, travelMode);
                this.setTimeInMatrix(fromId, toId, fallbackTime);
            }
        }
        catch (error) {
            this.logger.warn(`获取交通时间失败 (${fromId} -> ${toId}): ${error}`, error instanceof Error ? error.stack : undefined);
            const fallbackTime = this.fallbackEstimateTransportTime(from, to, travelMode);
            this.setTimeInMatrix(fromId, toId, fallbackTime);
        }
    }
    setTimeInMatrix(fromId, toId, time) {
        const key1 = `${fromId}->${toId}`;
        const key2 = `${toId}->${fromId}`;
        this.timeMatrix.set(key1, time);
        this.timeMatrix.set(key2, time);
    }
    getTimeFromMatrix(fromId, toId) {
        var _a;
        const key = `${fromId}->${toId}`;
        return (_a = this.timeMatrix.get(key)) !== null && _a !== void 0 ? _a : null;
    }
    generateInitialRoute(places, config) {
        const restaurants = places.filter((p) => p.isRestaurant);
        const otherPlaces = places.filter((p) => !p.isRestaurant);
        const shuffled = [...otherPlaces].sort(() => Math.random() - 0.5);
        const nodes = [];
        let restaurantIndex = 0;
        for (let i = 0; i < shuffled.length; i++) {
            nodes.push(shuffled[i]);
            if (config.lunchWindow &&
                restaurantIndex < restaurants.length &&
                i === Math.floor(shuffled.length / 2)) {
                nodes.push(restaurants[restaurantIndex++]);
            }
        }
        while (restaurantIndex < restaurants.length) {
            nodes.push(restaurants[restaurantIndex++]);
        }
        return {
            nodes,
            schedule: [],
            happinessScore: 0,
            scoreBreakdown: {
                interestScore: 0,
                distancePenalty: 0,
                tiredPenalty: 0,
                boredPenalty: 0,
                starvePenalty: 0,
                clusteringBonus: 0,
                bufferBonus: 0,
            },
        };
    }
    simulatedAnnealing(initialRoute, initialScore, config, zones) {
        let currentRoute = { ...initialRoute, nodes: [...initialRoute.nodes] };
        let currentScore = initialScore;
        let bestRoute = { ...currentRoute, nodes: [...currentRoute.nodes] };
        let bestScore = currentScore;
        let temperature = 1000;
        const coolingRate = 0.99;
        const minTemperature = 1;
        let iterations = 0;
        const maxIterations = 10000;
        while (temperature > minTemperature && iterations < maxIterations) {
            iterations++;
            const newRoute = this.swapTwoNodes(currentRoute);
            const newScore = this.calculateTotalScore(newRoute, config, zones);
            if (newScore > currentScore) {
                currentRoute = newRoute;
                currentScore = newScore;
                if (newScore > bestScore) {
                    bestRoute = { ...newRoute, nodes: [...newRoute.nodes] };
                    bestScore = newScore;
                }
            }
            else {
                const acceptanceProbability = Math.exp((newScore - currentScore) / temperature);
                if (Math.random() < acceptanceProbability) {
                    currentRoute = newRoute;
                    currentScore = newScore;
                }
            }
            temperature *= coolingRate;
        }
        this.logger.debug(`模拟退火完成：迭代 ${iterations} 次，最优分数：${bestScore}`);
        return bestRoute;
    }
    swapTwoNodes(route) {
        const newNodes = [...route.nodes];
        const i = Math.floor(Math.random() * newNodes.length);
        let j = Math.floor(Math.random() * newNodes.length);
        while (j === i) {
            j = Math.floor(Math.random() * newNodes.length);
        }
        [newNodes[i], newNodes[j]] = [newNodes[j], newNodes[i]];
        return {
            ...route,
            nodes: newNodes,
        };
    }
    calculateTotalScore(route, config, zones) {
        const schedule = this.generateSchedule(route, config);
        const breakdown = this.scorerService.calculateHappinessScore(route.nodes, schedule, config, zones);
        return (breakdown.interestScore -
            breakdown.distancePenalty -
            breakdown.tiredPenalty -
            breakdown.boredPenalty -
            breakdown.starvePenalty +
            breakdown.clusteringBonus +
            breakdown.bufferBonus);
    }
    async optimizeWithVRPTW(places, config, zones) {
        var _a;
        this.logger.debug('使用 VRPTW 算法优化路线');
        const n = places.length;
        const timeMatrix = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    row.push(0);
                }
                else {
                    const time = this.getTimeFromMatrix(String(places[i].id), String(places[j].id));
                    row.push(time !== null && time !== void 0 ? time : this.fallbackEstimateTransportTime(places[i].location, places[j].location, 'TRANSIT'));
                }
            }
            timeMatrix.push(row);
        }
        const vrptwInput = this.vrptwOptimizer.buildVRPTWInput(places, timeMatrix, config.startTime, config.date);
        const vrptwResult = await this.vrptwOptimizer.solveVRPTW(vrptwInput);
        const optimizedNodes = vrptwResult.route.map((index) => places[index]);
        const schedule = [];
        for (let i = 0; i < optimizedNodes.length; i++) {
            const arrivalTime = vrptwResult.arrivalTimes[i];
            const departureTime = vrptwResult.departureTimes[i];
            schedule.push({
                nodeIndex: i,
                startTime: arrivalTime,
                endTime: departureTime,
                transportTime: i < optimizedNodes.length - 1
                    ? (_a = this.getTimeFromMatrix(String(optimizedNodes[i].id), String(optimizedNodes[i + 1].id))) !== null && _a !== void 0 ? _a : undefined
                    : undefined,
            });
        }
        const scoreBreakdown = this.scorerService.calculateHappinessScore(optimizedNodes, schedule, config, zones);
        const totalScore = scoreBreakdown.interestScore -
            scoreBreakdown.distancePenalty -
            scoreBreakdown.tiredPenalty -
            scoreBreakdown.boredPenalty -
            scoreBreakdown.starvePenalty +
            scoreBreakdown.clusteringBonus +
            scoreBreakdown.bufferBonus;
        if (!vrptwResult.feasible && vrptwResult.violations) {
            const violationPenalty = vrptwResult.violations.length * 100;
            this.logger.warn(`VRPTW 时间窗违反惩罚：-${violationPenalty}`);
        }
        return {
            nodes: optimizedNodes,
            schedule,
            happinessScore: totalScore,
            scoreBreakdown,
            zones,
        };
    }
    generateSchedule(route, config, validateTimeWindows = false) {
        var _a;
        const schedule = [];
        let currentTime = luxon_1.DateTime.fromISO(config.startTime);
        const endTime = luxon_1.DateTime.fromISO(config.endTime);
        for (let i = 0; i < route.nodes.length; i++) {
            const node = route.nodes[i];
            let duration = node.serviceTime || node.estimatedDuration || 60;
            if ((_a = node.trailData) === null || _a === void 0 ? void 0 : _a.estimatedDurationHours) {
                duration = node.trailData.estimatedDurationHours * 60;
            }
            if (validateTimeWindows && node.timeWindow) {
                const earliest = luxon_1.DateTime.fromISO(node.timeWindow.earliest);
                const latest = luxon_1.DateTime.fromISO(node.timeWindow.latest);
                if (currentTime < earliest) {
                    currentTime = earliest;
                }
                if (currentTime > latest) {
                    this.logger.warn(`时间窗违反：${node.name} 应在 ${node.timeWindow.earliest} - ${node.timeWindow.latest} 访问，实际到达 ${currentTime.toISO()}`);
                }
            }
            if (currentTime.plus({ minutes: duration }) > endTime) {
                break;
            }
            const startTime = currentTime.toISO();
            const endTimeForNode = currentTime.plus({ minutes: duration }).toISO();
            schedule.push({
                nodeIndex: i,
                startTime: startTime,
                endTime: endTimeForNode,
                transportTime: i < route.nodes.length - 1
                    ? this.estimateTransportTime({ ...node.location, id: String(node.id) }, { ...route.nodes[i + 1].location, id: String(route.nodes[i + 1].id) })
                    : undefined,
            });
            const transportTime = i < route.nodes.length - 1
                ? this.estimateTransportTime({ ...node.location, id: String(node.id) }, { ...route.nodes[i + 1].location, id: String(route.nodes[i + 1].id) })
                : 0;
            const bufferTime = transportTime * config.pacingFactor + 15;
            currentTime = currentTime.plus({ minutes: duration + bufferTime });
        }
        return schedule;
    }
    estimateTransportTime(from, to) {
        if (from.id && to.id) {
            const cachedTime = this.getTimeFromMatrix(from.id, to.id);
            if (cachedTime !== null) {
                return cachedTime;
            }
        }
        return this.fallbackEstimateTransportTime(from, to, 'TRANSIT');
    }
    fallbackEstimateTransportTime(from, to, travelMode) {
        const distance = this.calculateDistance(from, to);
        switch (travelMode) {
            case 'WALKING':
                return Math.round((distance / 1000 / 5) * 60);
            case 'DRIVING':
                return Math.round((distance / 1000 / 25) * 60);
            case 'TRANSIT':
            default:
                if (distance < 5000) {
                    return Math.round((distance / 1000 / 30) * 60);
                }
                else {
                    return Math.round((distance / 1000 / 40) * 60);
                }
        }
    }
    calculateDistance(point1, point2) {
        const R = 6371000;
        const dLat = this.toRadians(point2.lat - point1.lat);
        const dLng = this.toRadians(point2.lng - point1.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(point1.lat)) *
                Math.cos(this.toRadians(point2.lat)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
};
exports.RouteOptimizerService = RouteOptimizerService;
exports.RouteOptimizerService = RouteOptimizerService = RouteOptimizerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [spatial_clustering_service_1.SpatialClusteringService,
        happiness_scorer_service_1.HappinessScorerService,
        smart_routes_service_1.SmartRoutesService,
        route_cache_service_1.RouteCacheService,
        vrptw_optimizer_service_1.VRPTWOptimizerService])
], RouteOptimizerService);
//# sourceMappingURL=route-optimizer.service.js.map