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
var AirbnbIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirbnbIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const airbnb_service_1 = require("./airbnb.service");
const redis_service_1 = require("../redis/redis.service");
const airbnb_monitoring_service_1 = require("./airbnb-monitoring.service");
let AirbnbIntegrationService = AirbnbIntegrationService_1 = class AirbnbIntegrationService {
    constructor(airbnbService, redisService, monitoring) {
        this.airbnbService = airbnbService;
        this.redisService = redisService;
        this.monitoring = monitoring;
        this.logger = new common_1.Logger(AirbnbIntegrationService_1.name);
        if (!airbnbService) {
            this.logger.warn('AirbnbService not available, Airbnb integration will be disabled');
        }
    }
    async checkCriticalNodeAvailability(location, checkin, checkout, partySize) {
        var _a, _b, _c, _d, _e, _f;
        if (!this.airbnbService) {
            this.logger.debug('AirbnbService not available, skipping accommodation check');
            return { available: true, listingsCount: 0 };
        }
        const locationStr = typeof location === 'string'
            ? location
            : `${location.lat},${location.lng}`;
        const cacheKey = `airbnb:availability:${locationStr}:${checkin}:${checkout}:${partySize}`;
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`Using cached accommodation availability for ${locationStr}`);
                    return JSON.parse(cached);
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cached accommodation availability:', error);
            }
        }
        const startTime = Date.now();
        try {
            const searchResult = await this.airbnbService.searchListings({
                location: locationStr,
                checkin,
                checkout,
                adults: partySize,
                page: 1,
            });
            const responseTime = Date.now() - startTime;
            await ((_a = this.monitoring) === null || _a === void 0 ? void 0 : _a.recordCall({
                timestamp: Date.now(),
                toolName: 'airbnb_search',
                success: true,
                responseTime,
                resultCount: ((_b = searchResult.results) === null || _b === void 0 ? void 0 : _b.length) || 0,
            }));
            const availability = {
                available: (((_c = searchResult.results) === null || _c === void 0 ? void 0 : _c.length) || 0) > 0,
                listingsCount: ((_d = searchResult.results) === null || _d === void 0 ? void 0 : _d.length) || 0,
                listings: (_e = searchResult.results) === null || _e === void 0 ? void 0 : _e.slice(0, 5).map((listing) => {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
                    return ({
                        id: listing.id || listing.listingId,
                        name: ((_c = (_b = (_a = listing.demandStayListing) === null || _a === void 0 ? void 0 : _a.description) === null || _b === void 0 ? void 0 : _b.name) === null || _c === void 0 ? void 0 : _c.localizedStringWithTranslationPreference) ||
                            listing.name ||
                            'Unknown',
                        location: {
                            lat: ((_f = (_e = (_d = listing.demandStayListing) === null || _d === void 0 ? void 0 : _d.location) === null || _e === void 0 ? void 0 : _e.coordinate) === null || _f === void 0 ? void 0 : _f.latitude) ||
                                ((_g = listing.location) === null || _g === void 0 ? void 0 : _g.lat) ||
                                0,
                            lng: ((_k = (_j = (_h = listing.demandStayListing) === null || _h === void 0 ? void 0 : _h.location) === null || _j === void 0 ? void 0 : _j.coordinate) === null || _k === void 0 ? void 0 : _k.longitude) ||
                                ((_l = listing.location) === null || _l === void 0 ? void 0 : _l.lng) ||
                                0,
                        },
                        price: listing.structuredDisplayPrice ? {
                            amount: this.extractPriceAmount(listing.structuredDisplayPrice),
                            currency: 'USD',
                        } : undefined,
                    });
                }),
                source: 'AIRBNB',
            };
            if (this.redisService && availability.available) {
                try {
                    await this.redisService.set(cacheKey, JSON.stringify(availability), 21600);
                }
                catch (error) {
                    this.logger.warn('Failed to cache accommodation availability:', error);
                }
            }
            return availability;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            await ((_f = this.monitoring) === null || _f === void 0 ? void 0 : _f.recordCall({
                timestamp: Date.now(),
                toolName: 'airbnb_search',
                success: false,
                responseTime,
                error: error.message,
            }));
            this.logger.warn(`Airbnb availability check failed: ${error.message}, falling back to available`);
            return { available: true, listingsCount: 0 };
        }
    }
    async searchAccommodationsInCorridor(centerPoint, radiusKm = 5, checkin, checkout, partySize) {
        var _a, _b, _c;
        if (!this.airbnbService) {
            this.logger.debug('AirbnbService not available, skipping corridor search');
            return { available: false, listingsCount: 0 };
        }
        const cacheKey = `airbnb:corridor:${centerPoint.lat},${centerPoint.lng}:${radiusKm}:${checkin}:${checkout}:${partySize}`;
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`Using cached corridor accommodations`);
                    return JSON.parse(cached);
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cached corridor accommodations:', error);
            }
        }
        const startTime = Date.now();
        try {
            const locationStr = `${centerPoint.lat},${centerPoint.lng}`;
            const searchResult = await this.airbnbService.searchListings({
                location: locationStr,
                checkin,
                checkout,
                adults: partySize,
                page: 1,
            });
            const responseTime = Date.now() - startTime;
            await ((_a = this.monitoring) === null || _a === void 0 ? void 0 : _a.recordCall({
                timestamp: Date.now(),
                toolName: 'airbnb_search',
                success: true,
                responseTime,
                resultCount: ((_b = searchResult.results) === null || _b === void 0 ? void 0 : _b.length) || 0,
            }));
            const listings = (searchResult.results || []).slice(0, 10).map((listing) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
                const listingLat = ((_c = (_b = (_a = listing.demandStayListing) === null || _a === void 0 ? void 0 : _a.location) === null || _b === void 0 ? void 0 : _b.coordinate) === null || _c === void 0 ? void 0 : _c.latitude) ||
                    ((_d = listing.location) === null || _d === void 0 ? void 0 : _d.lat) || 0;
                const listingLng = ((_g = (_f = (_e = listing.demandStayListing) === null || _e === void 0 ? void 0 : _e.location) === null || _f === void 0 ? void 0 : _f.coordinate) === null || _g === void 0 ? void 0 : _g.longitude) ||
                    ((_h = listing.location) === null || _h === void 0 ? void 0 : _h.lng) || 0;
                const distance = this.calculateDistance(centerPoint.lat, centerPoint.lng, listingLat, listingLng);
                return {
                    id: listing.id || listing.listingId,
                    name: ((_l = (_k = (_j = listing.demandStayListing) === null || _j === void 0 ? void 0 : _j.description) === null || _k === void 0 ? void 0 : _k.name) === null || _l === void 0 ? void 0 : _l.localizedStringWithTranslationPreference) ||
                        listing.name ||
                        'Unknown',
                    location: {
                        lat: listingLat,
                        lng: listingLng,
                    },
                    distanceFromPoint: distance,
                    price: listing.structuredDisplayPrice ? {
                        amount: this.extractPriceAmount(listing.structuredDisplayPrice),
                        currency: 'USD',
                    } : undefined,
                };
            }).filter((listing) => listing.distanceFromPoint <= radiusKm * 1000);
            const availability = {
                available: listings.length > 0,
                listingsCount: listings.length,
                listings,
                source: 'AIRBNB',
            };
            if (this.redisService && availability.available) {
                try {
                    await this.redisService.set(cacheKey, JSON.stringify(availability), 43200);
                }
                catch (error) {
                    this.logger.warn('Failed to cache corridor accommodations:', error);
                }
            }
            return availability;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            await ((_c = this.monitoring) === null || _c === void 0 ? void 0 : _c.recordCall({
                timestamp: Date.now(),
                toolName: 'airbnb_search',
                success: false,
                responseTime,
                error: error.message,
            }));
            this.logger.warn(`Airbnb corridor search failed: ${error.message}`);
            return { available: false, listingsCount: 0 };
        }
    }
    async checkAccommodationImpactOnPace(routeEndPoint, checkin, checkout, partySize) {
        if (!this.airbnbService) {
            this.logger.debug('AirbnbService not available, skipping pace impact check');
            return {
                distanceToNearestAccommodation: 0,
                impact: 'LOW',
            };
        }
        try {
            const availability = await this.searchAccommodationsInCorridor(routeEndPoint, 10, checkin, checkout, partySize);
            if (!availability.available || !availability.listings || availability.listings.length === 0) {
                return {
                    distanceToNearestAccommodation: Infinity,
                    impact: 'HIGH',
                };
            }
            const nearest = availability.listings.reduce((prev, curr) => {
                const prevDist = prev.distanceFromPoint || Infinity;
                const currDist = curr.distanceFromPoint || Infinity;
                return currDist < prevDist ? curr : prev;
            });
            const distance = nearest.distanceFromPoint || 0;
            let impact;
            if (distance <= 5000) {
                impact = 'LOW';
            }
            else if (distance <= 10000) {
                impact = 'MEDIUM';
            }
            else {
                impact = 'HIGH';
            }
            return {
                distanceToNearestAccommodation: distance,
                nearestAccommodation: {
                    id: nearest.id,
                    name: nearest.name,
                    location: nearest.location,
                    distance,
                },
                impact,
            };
        }
        catch (error) {
            this.logger.warn(`Airbnb pace impact check failed: ${error.message}`);
            return {
                distanceToNearestAccommodation: 0,
                impact: 'LOW',
            };
        }
    }
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(degrees) {
        return degrees * (Math.PI / 180);
    }
    async estimateAccommodationCost(plan, world) {
        var _a, _b, _c, _d, _e;
        if (!this.airbnbService || plan.segments.length === 0) {
            return {
                totalCost: 0,
                currency: 'USD',
                costPerNight: 0,
                nights: 0,
                breakdown: [],
            };
        }
        try {
            const segmentsByDay = new Map();
            for (const segment of plan.segments) {
                const dayIndex = segment.dayIndex || 0;
                if (!segmentsByDay.has(dayIndex)) {
                    segmentsByDay.set(dayIndex, []);
                }
                segmentsByDay.get(dayIndex).push(segment);
            }
            const breakdown = [];
            const currentYear = new Date().getFullYear();
            const month = world.physical.month;
            const partySize = ((_a = world.human) === null || _a === void 0 ? void 0 : _a.partySize) || 2;
            for (const [dayIndex, daySegments] of segmentsByDay.entries()) {
                const lastSegment = daySegments[daySegments.length - 1];
                const endPointLocation = ((_b = lastSegment.metadata) === null || _b === void 0 ? void 0 : _b.endLocation) ||
                    ((_c = lastSegment.metadata) === null || _c === void 0 ? void 0 : _c.toLocation) ||
                    ((_d = lastSegment.metadata) === null || _d === void 0 ? void 0 : _d.coordinates);
                if (endPointLocation && endPointLocation.lat && endPointLocation.lng) {
                    const dayDate = new Date(currentYear, month - 1, dayIndex + 1);
                    const checkinDate = dayDate.toISOString().split('T')[0];
                    const checkoutDate = new Date(dayDate.getTime() + 86400000).toISOString().split('T')[0];
                    const availability = await this.checkCriticalNodeAvailability({ lat: endPointLocation.lat, lng: endPointLocation.lng }, checkinDate, checkoutDate, partySize);
                    if (availability.available && availability.listings && availability.listings.length > 0) {
                        const listing = availability.listings[0];
                        const cost = ((_e = listing.price) === null || _e === void 0 ? void 0 : _e.amount) || 0;
                        breakdown.push({
                            dayIndex,
                            date: checkinDate,
                            cost,
                            accommodationName: listing.name,
                        });
                    }
                }
            }
            const totalCost = breakdown.reduce((sum, item) => sum + item.cost, 0);
            const nights = breakdown.length;
            const costPerNight = nights > 0 ? totalCost / nights : 0;
            return {
                totalCost,
                currency: 'USD',
                costPerNight,
                nights,
                breakdown,
            };
        }
        catch (error) {
            this.logger.warn(`Airbnb cost estimation failed: ${error.message}`);
            return {
                totalCost: 0,
                currency: 'USD',
                costPerNight: 0,
                nights: 0,
                breakdown: [],
            };
        }
    }
    async searchAccommodationsWithPreferences(location, checkin, checkout, partySize, preferences) {
        var _a, _b, _c, _d, _e, _f;
        if (!this.airbnbService) {
            this.logger.debug('AirbnbService not available, skipping preference search');
            return { available: false, listingsCount: 0 };
        }
        const locationStr = typeof location === 'string'
            ? location
            : `${location.lat},${location.lng}`;
        const cacheKey = `airbnb:preferences:${locationStr}:${checkin}:${checkout}:${partySize}:${JSON.stringify(preferences)}`;
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`Using cached preference accommodations`);
                    return JSON.parse(cached);
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cached preference accommodations:', error);
            }
        }
        const startTime = Date.now();
        try {
            const searchResult = await this.airbnbService.searchListings({
                location: locationStr,
                checkin,
                checkout,
                adults: partySize,
                pets: (preferences === null || preferences === void 0 ? void 0 : preferences.pets) || 0,
                page: 1,
            });
            const responseTime = Date.now() - startTime;
            await ((_a = this.monitoring) === null || _a === void 0 ? void 0 : _a.recordCall({
                timestamp: Date.now(),
                toolName: 'airbnb_search',
                success: true,
                responseTime,
                resultCount: ((_b = searchResult.results) === null || _b === void 0 ? void 0 : _b.length) || 0,
            }));
            const availability = {
                available: (((_c = searchResult.results) === null || _c === void 0 ? void 0 : _c.length) || 0) > 0,
                listingsCount: ((_d = searchResult.results) === null || _d === void 0 ? void 0 : _d.length) || 0,
                listings: (_e = searchResult.results) === null || _e === void 0 ? void 0 : _e.slice(0, 10).map((listing) => {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
                    return ({
                        id: listing.id || listing.listingId,
                        name: ((_c = (_b = (_a = listing.demandStayListing) === null || _a === void 0 ? void 0 : _a.description) === null || _b === void 0 ? void 0 : _b.name) === null || _c === void 0 ? void 0 : _c.localizedStringWithTranslationPreference) ||
                            listing.name ||
                            'Unknown',
                        location: {
                            lat: ((_f = (_e = (_d = listing.demandStayListing) === null || _d === void 0 ? void 0 : _d.location) === null || _e === void 0 ? void 0 : _e.coordinate) === null || _f === void 0 ? void 0 : _f.latitude) ||
                                ((_g = listing.location) === null || _g === void 0 ? void 0 : _g.lat) ||
                                0,
                            lng: ((_k = (_j = (_h = listing.demandStayListing) === null || _h === void 0 ? void 0 : _h.location) === null || _j === void 0 ? void 0 : _j.coordinate) === null || _k === void 0 ? void 0 : _k.longitude) ||
                                ((_l = listing.location) === null || _l === void 0 ? void 0 : _l.lng) ||
                                0,
                        },
                        price: listing.structuredDisplayPrice ? {
                            amount: this.extractPriceAmount(listing.structuredDisplayPrice),
                            currency: 'USD',
                        } : undefined,
                    });
                }),
                source: 'AIRBNB',
            };
            if (this.redisService && availability.available) {
                try {
                    await this.redisService.set(cacheKey, JSON.stringify(availability), 43200);
                }
                catch (error) {
                    this.logger.warn('Failed to cache preference accommodations:', error);
                }
            }
            return availability;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            await ((_f = this.monitoring) === null || _f === void 0 ? void 0 : _f.recordCall({
                timestamp: Date.now(),
                toolName: 'airbnb_search',
                success: false,
                responseTime,
                error: error.message,
            }));
            this.logger.warn(`Airbnb preference search failed: ${error.message}`);
            return { available: false, listingsCount: 0 };
        }
    }
    async validateAccommodationInCorridor(accommodationLocation, routeCorridorGeom, bufferMeters = 5000) {
        if (!routeCorridorGeom) {
            return {
                valid: true,
                explanation: '路线走廊几何不可用，跳过验证',
            };
        }
        this.logger.debug(`验证住宿位置 (${accommodationLocation.lat}, ${accommodationLocation.lng}) 是否在路线走廊内`);
        return {
            valid: true,
            explanation: '位置验证（简化处理：假设有效）',
        };
    }
    extractPriceAmount(priceDisplay) {
        var _a, _b;
        if (!priceDisplay) {
            return 0;
        }
        const primaryLine = ((_a = priceDisplay.primaryLine) === null || _a === void 0 ? void 0 : _a.accessibilityLabel) ||
            ((_b = priceDisplay.primaryLine) === null || _b === void 0 ? void 0 : _b.string) ||
            '';
        const match = primaryLine.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
        if (match) {
            return parseFloat(match[1].replace(/,/g, ''));
        }
        return 0;
    }
};
exports.AirbnbIntegrationService = AirbnbIntegrationService;
exports.AirbnbIntegrationService = AirbnbIntegrationService = AirbnbIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [airbnb_service_1.AirbnbService,
        redis_service_1.RedisService,
        airbnb_monitoring_service_1.AirbnbMonitoringService])
], AirbnbIntegrationService);
//# sourceMappingURL=airbnb-integration.service.js.map