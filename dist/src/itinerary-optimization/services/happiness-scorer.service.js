"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HappinessScorerService = void 0;
const common_1 = require("@nestjs/common");
const luxon_1 = require("luxon");
let HappinessScorerService = class HappinessScorerService {
    calculateHappinessScore(nodes, schedule, config, zones) {
        const nodeMap = new Map();
        nodes.forEach((node, index) => {
            nodeMap.set(index, node);
        });
        const breakdown = {
            interestScore: 0,
            distancePenalty: 0,
            tiredPenalty: 0,
            boredPenalty: 0,
            starvePenalty: 0,
            clusteringBonus: 0,
            bufferBonus: 0,
        };
        breakdown.interestScore = nodes.length * 100;
        breakdown.distancePenalty = this.calculateDistancePenalty(nodes);
        breakdown.tiredPenalty = this.calculateTiredPenalty(nodes);
        breakdown.boredPenalty = this.calculateBoredPenalty(nodes);
        breakdown.starvePenalty = this.calculateStarvePenalty(schedule, config, nodeMap);
        if (zones) {
            breakdown.clusteringBonus = this.calculateClusteringBonus(schedule, zones, config);
        }
        breakdown.bufferBonus = this.calculateBufferBonus(schedule, config);
        return breakdown;
    }
    calculateDistancePenalty(nodes) {
        if (nodes.length < 2)
            return 0;
        let totalDistance = 0;
        let maxDistance = 0;
        for (let i = 0; i < nodes.length - 1; i++) {
            const distance = this.calculateDistance(nodes[i].location, nodes[i + 1].location);
            totalDistance += distance;
            maxDistance = Math.max(maxDistance, distance);
        }
        const avgDistance = totalDistance / (nodes.length - 1);
        if (maxDistance > avgDistance * 2) {
            return Math.round((maxDistance - avgDistance * 2) / 100);
        }
        return 0;
    }
    calculateTiredPenalty(nodes) {
        let penalty = 0;
        for (let i = 0; i < nodes.length - 1; i++) {
            const current = nodes[i];
            const next = nodes[i + 1];
            const currentIntensity = this.getIntensity(current);
            const nextIntensity = this.getIntensity(next);
            if (currentIntensity === 'HIGH' && nextIntensity === 'HIGH') {
                penalty += 50;
            }
            if (i < nodes.length - 2 &&
                currentIntensity === 'MEDIUM' &&
                nextIntensity === 'MEDIUM' &&
                this.getIntensity(nodes[i + 2]) === 'MEDIUM') {
                penalty += 30;
            }
            if (current.trailData) {
                const trailPenalty = this.calculateTrailFatiguePenalty(current.trailData);
                penalty += trailPenalty;
            }
        }
        const lastNode = nodes[nodes.length - 1];
        if (lastNode === null || lastNode === void 0 ? void 0 : lastNode.trailData) {
            const trailPenalty = this.calculateTrailFatiguePenalty(lastNode.trailData);
            penalty += trailPenalty;
        }
        return penalty;
    }
    calculateTrailFatiguePenalty(trailData) {
        if (!trailData)
            return 0;
        let penalty = trailData.distanceKm * 5 + trailData.elevationGainM / 100 * 3;
        switch (trailData.difficultyLevel) {
            case 'EASY':
                penalty *= 0.8;
                break;
            case 'MODERATE':
                break;
            case 'HARD':
                penalty *= 1.3;
                break;
            case 'EXTREME':
                penalty *= 1.8;
                break;
        }
        if (trailData.maxElevationM) {
            if (trailData.maxElevationM > 4000) {
                penalty *= 1.5;
            }
            else if (trailData.maxElevationM > 3000) {
                penalty *= 1.3;
            }
        }
        return Math.round(penalty);
    }
    calculateBoredPenalty(nodes) {
        let penalty = 0;
        for (let i = 0; i < nodes.length - 1; i++) {
            const current = nodes[i];
            const next = nodes[i + 1];
            if (current.isRest || next.isRest)
                continue;
            if (current.isRestaurant || next.isRestaurant)
                continue;
            if (current.category === next.category) {
                penalty += 30;
            }
        }
        return penalty;
    }
    calculateStarvePenalty(schedule, config, nodeMap) {
        if (!config.lunchWindow)
            return 0;
        const lunchStart = luxon_1.DateTime.fromISO(config.lunchWindow.start);
        const lunchEnd = luxon_1.DateTime.fromISO(config.lunchWindow.end);
        let hasRestaurant = false;
        for (const item of schedule) {
            const startTime = luxon_1.DateTime.fromISO(item.startTime);
            const endTime = luxon_1.DateTime.fromISO(item.endTime);
            const overlaps = (startTime >= lunchStart && startTime <= lunchEnd) ||
                (endTime >= lunchStart && endTime <= lunchEnd) ||
                (startTime <= lunchStart && endTime >= lunchEnd);
            if (overlaps) {
                const node = nodeMap.get(item.nodeIndex);
                if (node && node.isRestaurant) {
                    hasRestaurant = true;
                    break;
                }
            }
        }
        return hasRestaurant ? 0 : 100;
    }
    calculateClusteringBonus(schedule, zones, config) {
        const startTime = luxon_1.DateTime.fromISO(config.startTime);
        const endTime = luxon_1.DateTime.fromISO(config.endTime);
        const noon = startTime.set({ hour: 12, minute: 0 });
        const morningNodes = [];
        const afternoonNodes = [];
        for (const item of schedule) {
            const itemTime = luxon_1.DateTime.fromISO(item.startTime);
            if (itemTime < noon) {
                morningNodes.push(item.nodeIndex);
            }
            else {
                afternoonNodes.push(item.nodeIndex);
            }
        }
        let bonus = 0;
        if (morningNodes.length > 1) {
            const morningZones = this.getZonesForNodes(morningNodes, zones);
            if (morningZones.size === 1) {
                bonus += 50;
            }
        }
        if (afternoonNodes.length > 1) {
            const afternoonZones = this.getZonesForNodes(afternoonNodes, zones);
            if (afternoonZones.size === 1) {
                bonus += 50;
            }
        }
        return bonus;
    }
    getZonesForNodes(nodeIndices, zones) {
        const zoneSet = new Set();
        for (const zone of zones) {
            for (const nodeIndex of nodeIndices) {
                if (zone.places.some((p, i) => i === nodeIndex)) {
                    zoneSet.add(zone.id);
                }
            }
        }
        return zoneSet;
    }
    calculateBufferBonus(schedule, config) {
        let bonus = 0;
        for (let i = 0; i < schedule.length - 1; i++) {
            const current = schedule[i];
            const next = schedule[i + 1];
            const currentEnd = luxon_1.DateTime.fromISO(current.endTime);
            const nextStart = luxon_1.DateTime.fromISO(next.startTime);
            const bufferMinutes = nextStart.diff(currentEnd, 'minutes').minutes;
            const transportTime = current.transportTime || 0;
            const actualBuffer = bufferMinutes - transportTime;
            const requiredBuffer = transportTime * config.pacingFactor + 15;
            if (actualBuffer >= requiredBuffer) {
                bonus += 10;
            }
            else if (actualBuffer < requiredBuffer * 0.5) {
                bonus -= 20;
            }
        }
        return bonus;
    }
    getIntensity(node) {
        if (node.intensity) {
            return node.intensity;
        }
        if (node.physicalMetadata) {
            const intensityFactor = node.physicalMetadata.intensity_factor || 1.0;
            if (intensityFactor >= 1.5)
                return 'HIGH';
            if (intensityFactor <= 0.5)
                return 'LOW';
        }
        if (node.category === 'ATTRACTION') {
            return 'MEDIUM';
        }
        if (node.category === 'RESTAURANT' || node.isRest) {
            return 'LOW';
        }
        return 'MEDIUM';
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
exports.HappinessScorerService = HappinessScorerService;
exports.HappinessScorerService = HappinessScorerService = __decorate([
    (0, common_1.Injectable)()
], HappinessScorerService);
//# sourceMappingURL=happiness-scorer.service.js.map