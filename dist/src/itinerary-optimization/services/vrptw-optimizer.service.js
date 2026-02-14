"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var VRPTWOptimizerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VRPTWOptimizerService = void 0;
const common_1 = require("@nestjs/common");
const luxon_1 = require("luxon");
let VRPTWOptimizerService = VRPTWOptimizerService_1 = class VRPTWOptimizerService {
    constructor() {
        this.logger = new common_1.Logger(VRPTWOptimizerService_1.name);
    }
    async solveVRPTW(input) {
        var _a;
        this.logger.debug(`开始求解 VRPTW：${input.locations.length} 个地点`);
        this.validateInput(input);
        const initialRoute = this.greedyConstruction(input);
        const optimizedRoute = this.localSearch(initialRoute, input);
        const result = this.calculateSchedule(optimizedRoute, input);
        if (!result.feasible) {
            this.logger.warn(`VRPTW 求解结果不可行，存在 ${((_a = result.violations) === null || _a === void 0 ? void 0 : _a.length) || 0} 个时间窗违反`);
        }
        else {
            this.logger.debug(`VRPTW 求解成功，路线长度：${optimizedRoute.length}`);
        }
        return result;
    }
    validateInput(input) {
        if (input.locations.length === 0) {
            throw new Error('地点列表不能为空');
        }
        if (input.timeMatrix.length !== input.locations.length) {
            throw new Error('时间矩阵维度不匹配');
        }
        for (let i = 0; i < input.timeMatrix.length; i++) {
            if (input.timeMatrix[i].length !== input.locations.length) {
                throw new Error(`时间矩阵第 ${i} 行维度不匹配`);
            }
        }
    }
    greedyConstruction(input) {
        var _a;
        const n = input.locations.length;
        const startIndex = (_a = input.startIndex) !== null && _a !== void 0 ? _a : 0;
        const route = [startIndex];
        const visited = new Set([startIndex]);
        let currentTime = luxon_1.DateTime.now();
        if (input.locations[startIndex].window) {
            const windowStart = luxon_1.DateTime.fromISO(input.locations[startIndex].window[0]);
            if (windowStart.isValid) {
                currentTime = windowStart;
            }
        }
        while (visited.size < n) {
            let bestNext = null;
            let bestArrivalTime = null;
            let minEarliestWindow = null;
            for (let i = 0; i < n; i++) {
                if (visited.has(i))
                    continue;
                const location = input.locations[i];
                if (!location.window) {
                    bestNext = i;
                    break;
                }
                const [earliestStr, latestStr] = location.window;
                const earliest = luxon_1.DateTime.fromISO(earliestStr);
                const latest = luxon_1.DateTime.fromISO(latestStr);
                const currentIndex = route[route.length - 1];
                const travelTime = input.timeMatrix[currentIndex][i];
                const arrivalTime = currentTime.plus({ minutes: travelTime });
                if (arrivalTime <= latest) {
                    const actualArrival = arrivalTime < earliest ? earliest : arrivalTime;
                    if (bestNext === null || earliest < (minEarliestWindow || luxon_1.DateTime.fromMillis(0))) {
                        bestNext = i;
                        bestArrivalTime = actualArrival;
                        minEarliestWindow = earliest;
                    }
                }
            }
            if (bestNext === null) {
                this.logger.warn(`贪心构造：无法找到满足约束的下一个地点，已访问 ${visited.size}/${n} 个地点`);
                break;
            }
            route.push(bestNext);
            visited.add(bestNext);
            if (bestArrivalTime) {
                const serviceTime = input.locations[bestNext].duration;
                currentTime = bestArrivalTime.plus({ minutes: serviceTime });
            }
        }
        return route;
    }
    localSearch(route, input) {
        let bestRoute = [...route];
        let improved = true;
        const maxIterations = 100;
        let iterations = 0;
        while (improved && iterations < maxIterations) {
            improved = false;
            iterations++;
            for (let i = 1; i < bestRoute.length - 1; i++) {
                for (let j = i + 1; j < bestRoute.length; j++) {
                    const newRoute = [
                        ...bestRoute.slice(0, i),
                        ...bestRoute.slice(i, j + 1).reverse(),
                        ...bestRoute.slice(j + 1),
                    ];
                    const schedule = this.calculateSchedule(newRoute, input);
                    const currentSchedule = this.calculateSchedule(bestRoute, input);
                    if (schedule.feasible && (!currentSchedule.feasible || this.isBetterRoute(newRoute, bestRoute, input))) {
                        bestRoute = newRoute;
                        improved = true;
                        break;
                    }
                }
                if (improved)
                    break;
            }
        }
        return bestRoute;
    }
    isBetterRoute(route1, route2, input) {
        const totalTime1 = this.calculateTotalTravelTime(route1, input);
        const totalTime2 = this.calculateTotalTravelTime(route2, input);
        return totalTime1 < totalTime2;
    }
    calculateTotalTravelTime(route, input) {
        let total = 0;
        for (let i = 0; i < route.length - 1; i++) {
            total += input.timeMatrix[route[i]][route[i + 1]];
        }
        return total;
    }
    calculateSchedule(route, input) {
        const arrivalTimes = [];
        const departureTimes = [];
        const violations = [];
        let currentTime;
        const startIndex = route[0];
        if (input.locations[startIndex].window) {
            currentTime = luxon_1.DateTime.fromISO(input.locations[startIndex].window[0]);
        }
        else {
            currentTime = luxon_1.DateTime.now();
        }
        arrivalTimes.push(currentTime.toISO());
        for (let i = 0; i < route.length; i++) {
            const locationIndex = route[i];
            const location = input.locations[locationIndex];
            if (i > 0) {
                const prevIndex = route[i - 1];
                const travelTime = input.timeMatrix[prevIndex][locationIndex];
                currentTime = currentTime.plus({ minutes: travelTime });
                if (location.window) {
                    const [earliestStr, latestStr] = location.window;
                    const earliest = luxon_1.DateTime.fromISO(earliestStr);
                    const latest = luxon_1.DateTime.fromISO(latestStr);
                    if (currentTime < earliest) {
                        currentTime = earliest;
                    }
                    else if (currentTime > latest) {
                        violations.push({
                            locationId: locationIndex,
                            locationName: location.name,
                            expectedWindow: [earliestStr, latestStr],
                            actualArrival: currentTime.toISO(),
                            violationType: 'LATE',
                        });
                    }
                }
                arrivalTimes.push(currentTime.toISO());
            }
            const serviceTime = location.duration;
            currentTime = currentTime.plus({ minutes: serviceTime });
            departureTimes.push(currentTime.toISO());
        }
        return {
            route,
            arrivalTimes,
            departureTimes,
            feasible: violations.length === 0,
            violations: violations.length > 0 ? violations : undefined,
        };
    }
    buildVRPTWInput(places, timeMatrix, startTime, date) {
        const locations = places.map((place, index) => {
            var _a;
            let window;
            if (place.timeWindow) {
                window = [place.timeWindow.earliest, place.timeWindow.latest];
            }
            else if (place.openingHours) {
                const dateObj = luxon_1.DateTime.fromISO(date);
                if (place.openingHours.start && place.openingHours.end) {
                    const startDateTime = dateObj.set({
                        hour: parseInt(place.openingHours.start.split(':')[0]),
                        minute: parseInt(place.openingHours.start.split(':')[1]),
                    });
                    const endDateTime = dateObj.set({
                        hour: parseInt(place.openingHours.end.split(':')[0]),
                        minute: parseInt(place.openingHours.end.split(':')[1]),
                    });
                    window = [startDateTime.toISO(), endDateTime.toISO()];
                }
            }
            let duration = place.serviceTime || place.estimatedDuration || 60;
            if ((_a = place.trailData) === null || _a === void 0 ? void 0 : _a.estimatedDurationHours) {
                duration = place.trailData.estimatedDurationHours * 60;
            }
            return {
                id: index,
                name: place.name,
                window,
                duration,
            };
        });
        return {
            locations,
            timeMatrix,
            startIndex: 0,
        };
    }
};
exports.VRPTWOptimizerService = VRPTWOptimizerService;
exports.VRPTWOptimizerService = VRPTWOptimizerService = VRPTWOptimizerService_1 = __decorate([
    (0, common_1.Injectable)()
], VRPTWOptimizerService);
//# sourceMappingURL=vrptw-optimizer.service.js.map