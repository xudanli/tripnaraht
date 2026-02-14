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
exports.SenseToolsAdapter = void 0;
const common_1 = require("@nestjs/common");
const smart_routes_service_1 = require("../../../transport/services/smart-routes.service");
let SenseToolsAdapter = class SenseToolsAdapter {
    constructor(smartRoutesService) {
        this.smartRoutesService = smartRoutesService;
    }
    async getHotelPointForDate(date) {
        return undefined;
    }
    async getTravelLeg(from, to) {
        try {
            const options = await this.smartRoutesService.getRoutes(from.lat, from.lng, to.lat, to.lng, 'DRIVING');
            if (options.length > 0) {
                const bestOption = options[0];
                return {
                    mode: this.mapTransportMode(bestOption.mode),
                    from,
                    to,
                    durationMin: bestOption.durationMinutes,
                    distanceKm: bestOption.walkDistance
                        ? bestOption.walkDistance / 1000
                        : undefined,
                    reliability: 0.9,
                    source: 'smart_routes',
                };
            }
            return this.fallbackEstimate(from, to);
        }
        catch (error) {
            return this.fallbackEstimate(from, to);
        }
    }
    mapTransportMode(mode) {
        const modeStr = String(mode).toUpperCase();
        switch (modeStr) {
            case 'WALKING':
                return 'walk';
            case 'DRIVING':
            case 'TAXI':
                return 'drive';
            case 'TRANSIT':
                return 'transit';
            default:
                return 'unknown';
        }
    }
    fallbackEstimate(from, to) {
        const distanceKm = this.calculateDistance(from, to);
        const durationMin = Math.round((distanceKm / 50) * 60);
        return {
            mode: 'drive',
            from,
            to,
            durationMin: Math.max(durationMin, 5),
            distanceKm,
            reliability: 0.5,
            source: 'heuristic',
        };
    }
    calculateDistance(from, to) {
        const R = 6371;
        const dLat = this.toRad(to.lat - from.lat);
        const dLon = this.toRad(to.lng - from.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(from.lat)) *
                Math.cos(this.toRad(to.lat)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(degrees) {
        return (degrees * Math.PI) / 180;
    }
};
exports.SenseToolsAdapter = SenseToolsAdapter;
exports.SenseToolsAdapter = SenseToolsAdapter = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [smart_routes_service_1.SmartRoutesService])
], SenseToolsAdapter);
//# sourceMappingURL=sense-tools.adapter.js.map