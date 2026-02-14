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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TravelTimeValidator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelTimeValidator = void 0;
const common_1 = require("@nestjs/common");
const base_validator_1 = require("./base.validator");
const validation_interface_1 = require("../interfaces/validation.interface");
const smart_routes_service_1 = require("../../transport/services/smart-routes.service");
const travel_time_cache_service_1 = require("../services/travel-time-cache.service");
const luxon_1 = require("luxon");
let TravelTimeValidator = TravelTimeValidator_1 = class TravelTimeValidator extends base_validator_1.BaseValidator {
    constructor(smartRoutesService, cacheService) {
        super();
        this.smartRoutesService = smartRoutesService;
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(TravelTimeValidator_1.name);
        this.MIN_BUFFER_MINUTES = 15;
    }
    getCode() {
        return validation_interface_1.ValidationCode.INSUFFICIENT_TRAVEL_TIME;
    }
    getSeverity() {
        return validation_interface_1.ValidationSeverity.WARNING;
    }
    async validate(context) {
        var _a;
        const { newItem, previousItem, newItemPlace } = context;
        if (!previousItem) {
            return this.pass();
        }
        if (!(newItemPlace === null || newItemPlace === void 0 ? void 0 : newItemPlace.coordinates) || !((_a = previousItem.place) === null || _a === void 0 ? void 0 : _a.coordinates)) {
            return this.pass();
        }
        const fromCoords = previousItem.place.coordinates;
        const toCoords = newItemPlace.coordinates;
        const prevEnd = luxon_1.DateTime.fromJSDate(previousItem.endTime);
        const newStart = luxon_1.DateTime.fromJSDate(newItem.startTime);
        const availableMinutes = newStart.diff(prevEnd, 'minutes').minutes;
        if (availableMinutes < 0) {
            return this.pass();
        }
        const travelInfo = await this.calculateTravelTime(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng, previousItem.place.name || '前一地点', newItemPlace.name || '新地点');
        travelInfo.availableTime = availableMinutes;
        const requiredMinutes = travelInfo.estimatedDuration + this.MIN_BUFFER_MINUTES;
        if (availableMinutes < requiredMinutes) {
            const shortfall = requiredMinutes - availableMinutes;
            const suggestedStart = prevEnd.plus({ minutes: requiredMinutes });
            const duration = luxon_1.DateTime.fromJSDate(newItem.endTime).diff(newStart, 'minutes').minutes;
            const suggestedEnd = suggestedStart.plus({ minutes: duration });
            return this.fail(`交通时间不足：从「${travelInfo.fromPlace}」到「${travelInfo.toPlace}」需要约 ${travelInfo.estimatedDuration} 分钟，但仅预留了 ${availableMinutes} 分钟（差 ${Math.ceil(shortfall)} 分钟）`, {
                fromPlace: {
                    name: travelInfo.fromPlace,
                    coordinates: [fromCoords.lat, fromCoords.lng],
                },
                toPlace: {
                    name: travelInfo.toPlace,
                    coordinates: [toCoords.lat, toCoords.lng],
                },
                distance: {
                    straight: travelInfo.straightDistance,
                    road: travelInfo.roadDistance,
                    unit: 'km',
                },
                travelTime: {
                    estimated: travelInfo.estimatedDuration,
                    withBuffer: requiredMinutes,
                    unit: 'minutes',
                },
                recommendedTransport: travelInfo.recommendedTransport,
                availableTime: availableMinutes,
                shortfall: Math.ceil(shortfall),
                suggestedStartTime: suggestedStart.toISO(),
            }, [
                {
                    action: 'ADJUST_TIME',
                    description: `将开始时间调整为 ${suggestedStart.toFormat('HH:mm')}`,
                    suggestedValue: {
                        startTime: suggestedStart.toISO() || undefined,
                        endTime: suggestedEnd.toISO() || undefined,
                    },
                    estimatedImprovement: `确保有 ${requiredMinutes} 分钟的交通和缓冲时间`,
                },
                {
                    action: 'CHANGE_TRANSPORT',
                    description: this.getTransportSuggestion(travelInfo.recommendedTransport),
                    suggestedValue: {
                        transportMode: travelInfo.recommendedTransport,
                    },
                },
            ]);
        }
        return this.pass();
    }
    getTransportSuggestion(mode) {
        switch (mode) {
            case 'WALKING':
                return '当前距离适合步行';
            case 'DRIVING':
                return '建议打车或自驾以节省时间';
            case 'TRANSIT':
                return '建议使用公共交通';
            default:
                return '请根据实际情况选择交通方式';
        }
    }
    async calculateTravelTime(fromLat, fromLng, toLat, toLng, fromName, toName) {
        var _a, _b;
        const straightDistance = this.calculateHaversineDistance(fromLat, fromLng, toLat, toLng);
        const recommendedTransport = straightDistance < 2 ? 'WALKING' :
            straightDistance < 50 ? 'DRIVING' :
                'TRANSIT';
        const cacheKey = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}-${toLat.toFixed(4)},${toLng.toFixed(4)}-${recommendedTransport}`;
        const cached = (_a = this.cacheService) === null || _a === void 0 ? void 0 : _a.get(cacheKey);
        if (cached) {
            return {
                ...cached,
                fromPlace: fromName,
                toPlace: toName,
                availableTime: 0,
            };
        }
        let estimatedDuration;
        let roadDistance;
        if (this.smartRoutesService) {
            try {
                const routes = await this.smartRoutesService.getRoutes(fromLat, fromLng, toLat, toLng, recommendedTransport);
                if (routes.length > 0) {
                    estimatedDuration = routes[0].durationMinutes;
                    roadDistance = Math.round(straightDistance * 1.3 * 10) / 10;
                    (_b = this.cacheService) === null || _b === void 0 ? void 0 : _b.set(cacheKey, {
                        straightDistance,
                        roadDistance,
                        estimatedDuration,
                        recommendedTransport,
                    });
                    return {
                        fromPlace: fromName,
                        toPlace: toName,
                        straightDistance,
                        roadDistance,
                        estimatedDuration,
                        recommendedTransport,
                        availableTime: 0,
                    };
                }
            }
            catch (error) {
                this.logger.warn(`SmartRoutesService 调用失败，使用估算值: ${error}`);
            }
        }
        estimatedDuration = this.estimateTravelTime(straightDistance, recommendedTransport);
        return {
            fromPlace: fromName,
            toPlace: toName,
            straightDistance,
            estimatedDuration,
            recommendedTransport,
            availableTime: 0,
        };
    }
    calculateHaversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) *
                Math.cos(this.toRadians(lat2)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(R * c * 10) / 10;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    estimateTravelTime(distanceKm, mode) {
        switch (mode) {
            case 'WALKING':
                return Math.ceil(distanceKm / 5 * 60);
            case 'DRIVING':
                return Math.ceil(distanceKm / 40 * 60);
            case 'TRANSIT':
                return Math.ceil(distanceKm / 30 * 60) + 15;
            default:
                return Math.ceil(distanceKm / 30 * 60);
        }
    }
};
exports.TravelTimeValidator = TravelTimeValidator;
exports.TravelTimeValidator = TravelTimeValidator = TravelTimeValidator_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [smart_routes_service_1.SmartRoutesService,
        travel_time_cache_service_1.TravelTimeCacheService])
], TravelTimeValidator);
//# sourceMappingURL=travel-time.validator.js.map