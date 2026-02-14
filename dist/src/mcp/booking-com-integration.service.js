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
var BookingComIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingComIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const booking_com_service_1 = require("./booking-com.service");
const redis_service_1 = require("../redis/redis.service");
const booking_com_monitoring_service_1 = require("./booking-com-monitoring.service");
let BookingComIntegrationService = BookingComIntegrationService_1 = class BookingComIntegrationService {
    constructor(bookingComService, redisService, monitoring) {
        this.bookingComService = bookingComService;
        this.redisService = redisService;
        this.monitoring = monitoring;
        this.logger = new common_1.Logger(BookingComIntegrationService_1.name);
    }
    async checkCriticalNodeCarRentalAvailability(pickupLocation, dropoffLocation, pickupTime, dropoffTime, driverAge) {
        if (!this.bookingComService) {
            this.logger.debug('BookingComService not available, skipping car rental check');
            return { available: false, rentalsCount: 0, rentals: [], source: 'BOOKING_COM' };
        }
        const cacheKey = `booking-com:availability:${pickupLocation.lat},${pickupLocation.lng}:${dropoffLocation.lat},${dropoffLocation.lng}:${pickupTime}:${dropoffTime}:${driverAge}`;
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`Using cached car rental availability`);
                    return JSON.parse(cached);
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cached car rental availability:', error);
            }
        }
        const startTime = Date.now();
        try {
            const searchResult = await this.bookingComService.searchCarRentals({
                pick_up_latitude: pickupLocation.lat,
                pick_up_longitude: pickupLocation.lng,
                drop_off_latitude: dropoffLocation.lat,
                drop_off_longitude: dropoffLocation.lng,
                pick_up_time: pickupTime,
                drop_off_time: dropoffTime,
                driver_age: driverAge,
                currency_code: 'USD',
                location: 'US',
            });
            const rentals = (searchResult.data || []).slice(0, 10).map((rental) => {
                var _a, _b;
                return ({
                    id: rental.id || `rental-${Date.now()}-${Math.random()}`,
                    company: rental.company || 'Unknown',
                    vehicleType: rental.vehicle_type || 'Standard',
                    price: rental.price || { amount: 0, currency: 'USD' },
                    pickupLocation: {
                        lat: pickupLocation.lat,
                        lng: pickupLocation.lng,
                        address: (_a = rental.pickup_location) === null || _a === void 0 ? void 0 : _a.address,
                    },
                    dropoffLocation: {
                        lat: dropoffLocation.lat,
                        lng: dropoffLocation.lng,
                        address: (_b = rental.dropoff_location) === null || _b === void 0 ? void 0 : _b.address,
                    },
                    pickupTime,
                    dropoffTime,
                });
            });
            const availability = {
                available: rentals.length > 0,
                rentalsCount: rentals.length,
                rentals,
                source: 'BOOKING_COM',
            };
            if (this.redisService && availability.available) {
                try {
                    await this.redisService.set(cacheKey, JSON.stringify(availability), 21600);
                }
                catch (error) {
                    this.logger.warn('Failed to cache car rental availability:', error);
                }
            }
            const responseTime = Date.now() - startTime;
            if (this.monitoring) {
                await this.monitoring.recordCall({
                    timestamp: Date.now(),
                    toolName: 'checkCriticalNodeCarRentalAvailability',
                    success: true,
                    responseTime,
                    resultCount: rentals.length,
                });
            }
            return availability;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            if (this.monitoring) {
                await this.monitoring.recordCall({
                    timestamp: Date.now(),
                    toolName: 'checkCriticalNodeCarRentalAvailability',
                    success: false,
                    responseTime,
                    error: error.message,
                });
            }
            this.logger.warn(`Car rental availability check failed: ${error.message}`);
            return { available: false, rentalsCount: 0, rentals: [], source: 'BOOKING_COM' };
        }
    }
    async checkCarRentalImpactOnPace(pickupLocation, dropoffLocation, pickupTime, dropoffTime, driverAge) {
        if (!this.bookingComService) {
            this.logger.debug('BookingComService not available, skipping pace impact check');
            return {
                impactLevel: 'LOW',
                distanceToPickupLocation: 0,
                distanceToDropoffLocation: 0,
                explanation: 'Booking.com service not available',
            };
        }
        const startTime = Date.now();
        try {
            const searchResult = await this.bookingComService.searchCarRentals({
                pick_up_latitude: pickupLocation.lat,
                pick_up_longitude: pickupLocation.lng,
                drop_off_latitude: dropoffLocation.lat,
                drop_off_longitude: dropoffLocation.lng,
                pick_up_time: pickupTime,
                drop_off_time: dropoffTime,
                driver_age: driverAge,
                currency_code: 'USD',
                location: 'US',
            });
            const rentals = searchResult.data || [];
            if (rentals.length === 0) {
                return {
                    impactLevel: 'HIGH',
                    distanceToPickupLocation: Infinity,
                    distanceToDropoffLocation: Infinity,
                    explanation: 'No car rentals available',
                };
            }
            const distanceToPickup = 0;
            const distanceToDropoff = 0;
            let impactLevel = 'LOW';
            if (distanceToPickup > 5000 || distanceToDropoff > 5000) {
                impactLevel = 'HIGH';
            }
            else if (distanceToPickup > 2000 || distanceToDropoff > 2000) {
                impactLevel = 'MEDIUM';
            }
            const result = {
                impactLevel,
                distanceToPickupLocation: distanceToPickup,
                distanceToDropoffLocation: distanceToDropoff,
                explanation: `Car rental available: ${rentals.length} options, impact level: ${impactLevel}`,
            };
            const responseTime = Date.now() - startTime;
            if (this.monitoring) {
                await this.monitoring.recordCall({
                    timestamp: Date.now(),
                    toolName: 'checkCarRentalImpactOnPace',
                    success: true,
                    responseTime,
                    resultCount: rentals.length,
                });
            }
            return result;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            if (this.monitoring) {
                await this.monitoring.recordCall({
                    timestamp: Date.now(),
                    toolName: 'checkCarRentalImpactOnPace',
                    success: false,
                    responseTime,
                    error: error.message,
                });
            }
            this.logger.warn(`Car rental pace impact check failed: ${error.message}`);
            return {
                impactLevel: 'LOW',
                distanceToPickupLocation: 0,
                distanceToDropoffLocation: 0,
                explanation: `Check failed: ${error.message}`,
            };
        }
    }
    async searchCarRentalsInCorridor(centerPoint, radiusKm = 5, pickupTime, dropoffTime, driverAge) {
        if (!this.bookingComService) {
            this.logger.debug('BookingComService not available, skipping corridor search');
            return { available: false, rentalsCount: 0, rentals: [], source: 'BOOKING_COM' };
        }
        const cacheKey = `booking-com:corridor:${centerPoint.lat},${centerPoint.lng}:${radiusKm}:${pickupTime}:${dropoffTime}:${driverAge}`;
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`Using cached corridor car rentals`);
                    return JSON.parse(cached);
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cached corridor car rentals:', error);
            }
        }
        const startTime = Date.now();
        try {
            const searchResult = await this.bookingComService.searchCarRentals({
                pick_up_latitude: centerPoint.lat,
                pick_up_longitude: centerPoint.lng,
                drop_off_latitude: centerPoint.lat,
                drop_off_longitude: centerPoint.lng,
                pick_up_time: pickupTime,
                drop_off_time: dropoffTime,
                driver_age: driverAge,
                currency_code: 'USD',
                location: 'US',
            });
            const rentals = (searchResult.data || []).slice(0, 10).map((rental) => {
                var _a, _b, _c, _d, _e, _f;
                const rentalLat = ((_a = rental.pickup_location) === null || _a === void 0 ? void 0 : _a.lat) || centerPoint.lat;
                const rentalLng = ((_b = rental.pickup_location) === null || _b === void 0 ? void 0 : _b.lng) || centerPoint.lng;
                const distance = this.calculateDistance(centerPoint.lat, centerPoint.lng, rentalLat, rentalLng);
                return {
                    id: rental.id || `rental-${Date.now()}-${Math.random()}`,
                    company: rental.company || 'Unknown',
                    vehicleType: rental.vehicle_type || 'Standard',
                    price: rental.price || { amount: 0, currency: 'USD' },
                    pickupLocation: {
                        lat: rentalLat,
                        lng: rentalLng,
                        address: (_c = rental.pickup_location) === null || _c === void 0 ? void 0 : _c.address,
                    },
                    dropoffLocation: {
                        lat: ((_d = rental.dropoff_location) === null || _d === void 0 ? void 0 : _d.lat) || rentalLat,
                        lng: ((_e = rental.dropoff_location) === null || _e === void 0 ? void 0 : _e.lng) || rentalLng,
                        address: (_f = rental.dropoff_location) === null || _f === void 0 ? void 0 : _f.address,
                    },
                    pickupTime,
                    dropoffTime,
                    distanceFromPoint: distance,
                };
            }).filter((rental) => rental.distanceFromPoint <= radiusKm * 1000);
            const availability = {
                available: rentals.length > 0,
                rentalsCount: rentals.length,
                rentals,
                source: 'BOOKING_COM',
            };
            if (this.redisService && availability.available) {
                try {
                    await this.redisService.set(cacheKey, JSON.stringify(availability), 43200);
                }
                catch (error) {
                    this.logger.warn('Failed to cache corridor car rentals:', error);
                }
            }
            const responseTime = Date.now() - startTime;
            if (this.monitoring) {
                await this.monitoring.recordCall({
                    timestamp: Date.now(),
                    toolName: 'searchCarRentalsInCorridor',
                    success: true,
                    responseTime,
                    resultCount: rentals.length,
                });
            }
            return availability;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            if (this.monitoring) {
                await this.monitoring.recordCall({
                    timestamp: Date.now(),
                    toolName: 'searchCarRentalsInCorridor',
                    success: false,
                    responseTime,
                    error: error.message,
                });
            }
            this.logger.warn(`Corridor car rental search failed: ${error.message}`);
            return { available: false, rentalsCount: 0, rentals: [], source: 'BOOKING_COM' };
        }
    }
    async estimateCarRentalCost(plan, world) {
        var _a, _b, _c, _d, _e, _f, _g;
        if (!this.bookingComService) {
            this.logger.debug('BookingComService not available, skipping cost estimation');
            return {
                totalCost: 0,
                currency: 'USD',
                costPerDay: 0,
                days: 0,
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
            const days = segmentsByDay.size;
            if (days === 0) {
                return {
                    totalCost: 0,
                    currency: 'USD',
                    costPerDay: 0,
                    days: 0,
                    breakdown: [],
                };
            }
            const firstDaySegments = segmentsByDay.get(0) || [];
            const lastDaySegments = segmentsByDay.get(days - 1) || [];
            const firstSegment = firstDaySegments[0];
            const lastSegment = lastDaySegments[lastDaySegments.length - 1];
            const pickupLocation = ((_a = firstSegment === null || firstSegment === void 0 ? void 0 : firstSegment.metadata) === null || _a === void 0 ? void 0 : _a.startLocation) ||
                ((_b = firstSegment === null || firstSegment === void 0 ? void 0 : firstSegment.metadata) === null || _b === void 0 ? void 0 : _b.fromLocation);
            const dropoffLocation = ((_c = lastSegment === null || lastSegment === void 0 ? void 0 : lastSegment.metadata) === null || _c === void 0 ? void 0 : _c.endLocation) ||
                ((_d = lastSegment === null || lastSegment === void 0 ? void 0 : lastSegment.metadata) === null || _d === void 0 ? void 0 : _d.toLocation);
            if (!pickupLocation || !dropoffLocation) {
                return {
                    totalCost: 0,
                    currency: 'USD',
                    costPerDay: 0,
                    days: 0,
                    breakdown: [],
                };
            }
            const currentYear = new Date().getFullYear();
            const month = world.physical.month;
            const firstDayDate = new Date(currentYear, month - 1, 1);
            const lastDayDate = new Date(currentYear, month - 1, days);
            const pickupTime = '10:00';
            const dropoffTime = '10:00';
            const driverAge = ((_e = world.human) === null || _e === void 0 ? void 0 : _e.driverAge) || 25;
            const searchResult = await this.bookingComService.searchCarRentals({
                pick_up_latitude: pickupLocation.lat,
                pick_up_longitude: pickupLocation.lng,
                drop_off_latitude: dropoffLocation.lat,
                drop_off_longitude: dropoffLocation.lng,
                pick_up_time: pickupTime,
                drop_off_time: dropoffTime,
                driver_age: driverAge,
                currency_code: 'USD',
                location: 'US',
                pick_up_date: firstDayDate.toISOString().split('T')[0],
                drop_off_date: lastDayDate.toISOString().split('T')[0],
            });
            const rentals = searchResult.data || [];
            if (rentals.length === 0) {
                return {
                    totalCost: 0,
                    currency: 'USD',
                    costPerDay: 0,
                    days,
                    breakdown: [],
                };
            }
            const cheapestRental = rentals.reduce((prev, curr) => {
                var _a, _b;
                const prevPrice = ((_a = prev.price) === null || _a === void 0 ? void 0 : _a.amount) || Infinity;
                const currPrice = ((_b = curr.price) === null || _b === void 0 ? void 0 : _b.amount) || Infinity;
                return currPrice < prevPrice ? curr : prev;
            });
            const totalCost = ((_f = cheapestRental.price) === null || _f === void 0 ? void 0 : _f.amount) || 0;
            const costPerDay = totalCost / days;
            const breakdown = Array.from({ length: days }, (_, i) => {
                const dayDate = new Date(currentYear, month - 1, i + 1);
                return {
                    dayIndex: i,
                    date: dayDate.toISOString().split('T')[0],
                    cost: costPerDay,
                    rentalCompany: cheapestRental.company,
                };
            });
            return {
                totalCost,
                currency: ((_g = cheapestRental.price) === null || _g === void 0 ? void 0 : _g.currency) || 'USD',
                costPerDay,
                days,
                breakdown,
            };
        }
        catch (error) {
            this.logger.warn(`Car rental cost estimation failed: ${error.message}`);
            return {
                totalCost: 0,
                currency: 'USD',
                costPerDay: 0,
                days: 0,
                breakdown: [],
            };
        }
    }
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) *
                Math.cos(this.toRadians(lat2)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
};
exports.BookingComIntegrationService = BookingComIntegrationService;
exports.BookingComIntegrationService = BookingComIntegrationService = BookingComIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [booking_com_service_1.BookingComService,
        redis_service_1.RedisService,
        booking_com_monitoring_service_1.BookingComMonitoringService])
], BookingComIntegrationService);
//# sourceMappingURL=booking-com-integration.service.js.map