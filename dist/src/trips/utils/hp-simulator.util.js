"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HPSimulator = void 0;
class HPSimulator {
    static simulateRoute(route, config) {
        let currentHP = config.max_daily_hp;
        let timeSinceLastRest = 0;
        const finalRoute = [];
        let previousNode = null;
        for (let i = 0; i < route.length; i++) {
            const spot = route[i];
            if (previousNode && previousNode.location && spot.location) {
                const transitTime = this.calculateWalkTime(previousNode, spot, config.walk_speed_factor);
                const transitCost = this.calculateTransitCost(transitTime, config);
                currentHP -= transitCost;
                timeSinceLastRest += transitTime;
                const transitNode = {
                    ...spot,
                    type: 'TRANSIT',
                    duration: transitTime,
                    currentHP,
                    hpCost: transitCost,
                    transitTime,
                };
                finalRoute.push(transitNode);
            }
            const shouldRest = this.shouldForceRest(currentHP, timeSinceLastRest, config);
            if (shouldRest) {
                const restNode = this.createRestNode(currentHP, config);
                currentHP = Math.min(config.max_daily_hp, currentHP + restNode.hpRecovery);
                timeSinceLastRest = 0;
                finalRoute.push({
                    ...restNode,
                    currentHP,
                    hpCost: 0,
                    forcedRest: true,
                });
            }
            const activityCost = this.calculateActivityCost(spot, config);
            currentHP = Math.max(0, currentHP - activityCost);
            timeSinceLastRest += spot.duration;
            if (spot.type === 'REST' || spot.type === 'MEAL') {
                const recovery = config.max_daily_hp * config.hp_recovery_rate;
                currentHP = Math.min(config.max_daily_hp, currentHP + recovery);
                timeSinceLastRest = 0;
            }
            finalRoute.push({
                ...spot,
                currentHP,
                hpCost: activityCost,
                transitTime: previousNode && previousNode.location && spot.location
                    ? this.calculateWalkTime(previousNode, spot, config.walk_speed_factor)
                    : undefined,
            });
            previousNode = spot;
        }
        return finalRoute;
    }
    static shouldForceRest(currentHP, timeSinceLastRest, config) {
        const minThreshold = config.min_hp_threshold || 20;
        if (currentHP < minThreshold) {
            return true;
        }
        if (timeSinceLastRest >= config.forced_rest_interval_min) {
            return true;
        }
        return false;
    }
    static createRestNode(currentHP, config) {
        return {
            name: 'Coffee Break',
            duration: 45,
            type: 'REST',
            hpRecovery: config.max_daily_hp * config.hp_recovery_rate,
        };
    }
    static calculateWalkTime(from, to, walkSpeedFactor) {
        if (!from.location || !to.location) {
            return 0;
        }
        const distance = this.haversineDistance(from.location.lat, from.location.lng, to.location.lat, to.location.lng);
        const baseSpeed = 0.083;
        const actualSpeed = baseSpeed / walkSpeedFactor;
        const timeMinutes = distance / actualSpeed;
        return Math.ceil(timeMinutes);
    }
    static haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) *
                Math.cos(this.toRadians(lat2)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance;
    }
    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    static calculateTransitCost(transitTime, config) {
        const baseCost = transitTime * 0.5;
        let terrainFactor = 1.0;
        if (config.terrain_filter === 'NO_STAIRS' || config.terrain_filter === 'WHEELCHAIR_ONLY') {
            terrainFactor = 1.5;
        }
        return baseCost * terrainFactor;
    }
    static calculateActivityCost(spot, config) {
        var _a, _b, _c, _d;
        const baseFatigueScore = ((_a = spot.physicalMetadata) === null || _a === void 0 ? void 0 : _a.base_fatigue_score) || 5;
        const baseCostPer10Min = baseFatigueScore;
        const duration10Min = spot.duration / 10;
        let cost = duration10Min * baseCostPer10Min;
        const seatedRatio = ((_b = spot.physicalMetadata) === null || _b === void 0 ? void 0 : _b.seated_ratio) || 0;
        cost = cost * (1 - seatedRatio);
        const intensityFactor = ((_c = spot.physicalMetadata) === null || _c === void 0 ? void 0 : _c.intensity_factor) || 1.0;
        cost = cost * intensityFactor;
        const terrain = spot.terrain || ((_d = spot.physicalMetadata) === null || _d === void 0 ? void 0 : _d.terrain_type);
        if (terrain === 'STAIRS_ONLY' && config.stairs_penalty_factor >= 999) {
            return 9999;
        }
        else if (terrain === 'STAIRS_ONLY' || terrain === 'HILLY') {
            cost = cost * config.stairs_penalty_factor;
        }
        return Math.ceil(cost);
    }
}
exports.HPSimulator = HPSimulator;
//# sourceMappingURL=hp-simulator.util.js.map