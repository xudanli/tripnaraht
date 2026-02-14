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
exports.HotelRecommendationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const hotel_strategy_interface_1 = require("../interfaces/hotel-strategy.interface");
const hotel_cost_calculator_util_1 = require("../../common/utils/hotel-cost-calculator.util");
const client_1 = require("@prisma/client");
const hotel_price_service_1 = require("../../hotels/services/hotel-price.service");
const time_value_calculator_util_1 = require("../../common/utils/time-value-calculator.util");
let HotelRecommendationService = class HotelRecommendationService {
    constructor(prisma, hotelPriceService) {
        this.prisma = prisma;
        this.hotelPriceService = hotelPriceService;
    }
    async recommendHotels(request) {
        const attractions = await this.getAttractions(request);
        if (attractions.length === 0) {
            throw new common_1.NotFoundException('未找到景点信息，无法推荐酒店');
        }
        let strategy = request.strategy;
        let autoSelected = false;
        let densityAnalysis = null;
        let timeValue = request.timeValuePerHour;
        if (!timeValue && request.tripId) {
            try {
                timeValue = await time_value_calculator_util_1.TimeValueCalculator.calculateFromTrip(request.tripId, this.prisma);
            }
            catch (error) {
                timeValue = 50;
            }
        }
        if (!strategy && request.tripId) {
            const analysis = await this.calculateTripDensity(request.tripId);
            const autoSelection = await this.autoSelectStrategy(analysis);
            strategy = autoSelection.strategy;
            autoSelected = true;
            densityAnalysis = {
                density: analysis.density,
                avgPlacesPerDay: analysis.avgPlacesPerDay,
                totalDays: analysis.totalDays,
                totalAttractions: analysis.totalAttractions,
                reason: autoSelection.reason,
            };
        }
        const updatedRequest = {
            ...request,
            timeValuePerHour: timeValue || request.timeValuePerHour || 50,
        };
        let recommendations;
        switch (strategy) {
            case hotel_strategy_interface_1.HotelRecommendationStrategy.CENTROID:
                recommendations = await this.recommendByCentroid(attractions, updatedRequest);
                break;
            case hotel_strategy_interface_1.HotelRecommendationStrategy.HUB:
                recommendations = await this.recommendByHub(attractions, updatedRequest);
                break;
            case hotel_strategy_interface_1.HotelRecommendationStrategy.RESORT:
                recommendations = await this.recommendByResort(attractions, updatedRequest);
                break;
            default:
                recommendations = await this.recommendByCentroid(attractions, updatedRequest);
        }
        if (autoSelected && densityAnalysis && recommendations.length > 0) {
            recommendations[0].recommendationReason =
                `${recommendations[0].recommendationReason}（${densityAnalysis.reason}）`;
        }
        return recommendations;
    }
    async calculateTripDensity(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: {
                                Place: true,
                            },
                        },
                    },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        const totalDays = trip.TripDay.length;
        const seenAttractionIds = new Set();
        for (const day of trip.TripDay) {
            for (const item of day.ItineraryItem) {
                if (item.Place && item.Place.category === client_1.PlaceCategory.ATTRACTION) {
                    seenAttractionIds.add(item.Place.id);
                }
            }
        }
        const totalAttractions = seenAttractionIds.size;
        const avgPlacesPerDay = totalDays > 0 ? totalAttractions / totalDays : 0;
        let density;
        if (avgPlacesPerDay >= 4) {
            density = 'HIGH';
        }
        else if (avgPlacesPerDay >= 2) {
            density = 'MEDIUM';
        }
        else {
            density = 'LOW';
        }
        return {
            totalDays,
            totalAttractions,
            avgPlacesPerDay: Math.round(avgPlacesPerDay * 10) / 10,
            density,
        };
    }
    async autoSelectStrategy(densityAnalysis) {
        switch (densityAnalysis.density) {
            case 'HIGH':
                return {
                    strategy: hotel_strategy_interface_1.HotelRecommendationStrategy.CENTROID,
                    reason: `检测到高密度行程（每天 ${densityAnalysis.avgPlacesPerDay} 个景点）。建议牺牲档次，换取位置。推荐住在市中心 3 星级，以减少奔波。`,
                };
            case 'MEDIUM':
                return {
                    strategy: hotel_strategy_interface_1.HotelRecommendationStrategy.HUB,
                    reason: `检测到中等密度行程（每天 ${densityAnalysis.avgPlacesPerDay} 个景点）。推荐住在交通枢纽附近，平衡位置和体验。`,
                };
            case 'LOW':
                return {
                    strategy: hotel_strategy_interface_1.HotelRecommendationStrategy.RESORT,
                    reason: `检测到低密度行程（每天 ${densityAnalysis.avgPlacesPerDay} 个景点）。建议牺牲位置，换取体验。推荐住在稍微偏远的 4-5 星级酒店/度假村。`,
                };
            default:
                return {
                    strategy: hotel_strategy_interface_1.HotelRecommendationStrategy.HUB,
                    reason: '推荐住在交通枢纽附近，平衡位置和体验。',
                };
        }
    }
    async getAttractions(request) {
        if (request.attractionIds && request.attractionIds.length > 0) {
            const places = await this.prisma.place.findMany({
                where: {
                    id: { in: request.attractionIds },
                    category: client_1.PlaceCategory.ATTRACTION,
                },
            });
            return places.map((p) => ({
                id: p.id,
                location: p.location,
                name: p.nameEN || p.nameCN,
            }));
        }
        else if (request.tripId) {
            const trip = await this.prisma.trip.findUnique({
                where: { id: request.tripId },
                include: {
                    TripDay: {
                        include: {
                            ItineraryItem: {
                                include: {
                                    Place: {
                                        where: {
                                            category: client_1.PlaceCategory.ATTRACTION,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });
            if (!trip) {
                throw new common_1.NotFoundException(`行程 ${request.tripId} 不存在`);
            }
            const attractions = [];
            const seenIds = new Set();
            for (const day of trip.TripDay) {
                for (const item of day.ItineraryItem) {
                    if (item.Place && !seenIds.has(item.Place.id)) {
                        attractions.push({
                            id: item.Place.id,
                            location: item.Place.location,
                            name: item.Place.nameEN || item.Place.nameCN,
                        });
                        seenIds.add(item.Place.id);
                    }
                }
            }
            return attractions;
        }
        else {
            throw new common_1.NotFoundException('请提供 tripId 或 attractionIds');
        }
    }
    async recommendByCentroid(attractions, request) {
        const hotels = await this.prisma.place.findMany({
            where: {
                category: client_1.PlaceCategory.HOTEL,
            },
            include: {
                City: true,
            },
            take: 50,
        });
        const hotelsWithDistance = await Promise.all(hotels.map(async (hotel) => {
            const avgDistance = await this.calculateAvgDistanceToAttractions(hotel, attractions);
            return {
                id: hotel.id,
                nameCN: hotel.nameCN,
                nameEN: hotel.nameEN,
                metadata: hotel.metadata,
                city: hotel.City ? { name: hotel.City.name } : null,
                distance_meters: avgDistance,
            };
        }));
        return await this.formatRecommendations(hotelsWithDistance, request, attractions, '重心法：位于所有景点的地理中心，通勤总和最小');
    }
    async recommendByHub(attractions, request) {
        const hotels = await this.prisma.place.findMany({
            where: {
                category: client_1.PlaceCategory.HOTEL,
            },
            include: {
                City: true,
            },
            take: 20,
        });
        const sortedHotels = hotels
            .map((h) => {
            const metadata = h.metadata;
            const locationScore = metadata === null || metadata === void 0 ? void 0 : metadata.location_score;
            return {
                hotel: h,
                walkMin: (locationScore === null || locationScore === void 0 ? void 0 : locationScore.nearest_station_walk_min) || 999,
            };
        })
            .sort((a, b) => a.walkMin - b.walkMin)
            .slice(0, 20);
        const hotelsWithDistance = await Promise.all(sortedHotels.map(async (item) => {
            const avgDistance = await this.calculateAvgDistanceToAttractions(item.hotel, attractions);
            return {
                id: item.hotel.id,
                nameCN: item.hotel.nameCN,
                nameEN: item.hotel.nameEN,
                metadata: item.hotel.metadata,
                city: item.hotel.City ? { name: item.hotel.City.name } : null,
                distance_meters: avgDistance,
            };
        }));
        return await this.formatRecommendations(hotelsWithDistance, request, attractions, '交通枢纽法：距离地铁站/车站近，交通便利');
    }
    async recommendByResort(attractions, request) {
        const hotels = await this.prisma.place.findMany({
            where: {
                category: client_1.PlaceCategory.HOTEL,
            },
            include: {
                City: true,
            },
            take: 50,
        });
        const resortHotels = hotels
            .map((h) => {
            const metadata = h.metadata;
            const locationScore = metadata === null || metadata === void 0 ? void 0 : metadata.location_score;
            const tier = (metadata === null || metadata === void 0 ? void 0 : metadata.hotel_tier) || 0;
            const centerDistance = (locationScore === null || locationScore === void 0 ? void 0 : locationScore.center_distance_km) || 0;
            return {
                hotel: h,
                centerDistance,
                tier,
                score: tier * 10 + (centerDistance >= 3 && centerDistance <= 10 ? 5 : 0),
            };
        })
            .filter((item) => {
            return item.tier >= 4 || (item.tier >= 3 && item.centerDistance > 3);
        })
            .sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            return b.tier - a.tier;
        })
            .slice(0, 20);
        const hotelsWithDistance = await Promise.all(resortHotels.map(async (item) => {
            const avgDistance = await this.calculateAvgDistanceToAttractions(item.hotel, attractions);
            return {
                id: item.hotel.id,
                nameCN: item.hotel.nameCN,
                nameEN: item.hotel.nameEN,
                metadata: item.hotel.metadata,
                city: item.hotel.City ? { name: item.hotel.City.name } : null,
                distance_meters: avgDistance,
            };
        }));
        return await this.formatRecommendations(hotelsWithDistance, request, attractions, '度假模式：位于城市边缘，房间大、档次高，适合休闲游');
    }
    async calculateAvgDistanceToAttractions(hotel, attractions) {
        if (attractions.length === 0) {
            return 0;
        }
        try {
            const distances = await Promise.all(attractions.map(async (attraction) => {
                var _a;
                try {
                    if (hotel.id && attraction.id) {
                        const result = await this.prisma.$queryRaw `
                SELECT 
                  ST_Distance(
                    h.location::geography,
                    a.location::geography
                  ) as distance_meters
                FROM "Place" h
                CROSS JOIN "Place" a
                WHERE h.id = ${hotel.id}
                  AND a.id = ${attraction.id}
                  AND h.location IS NOT NULL
                  AND a.location IS NOT NULL
              `;
                        const distance = (_a = result[0]) === null || _a === void 0 ? void 0 : _a.distance_meters;
                        if (distance && distance > 0) {
                            return distance;
                        }
                    }
                    const coords1 = this.extractCoordinatesSync(hotel.location);
                    const coords2 = this.extractCoordinatesSync(attraction.location);
                    if (coords1 && coords2) {
                        return this.calculateHaversineDistance({ lat: coords1.lat, lng: coords1.lng }, { lat: coords2.lat, lng: coords2.lng });
                    }
                    return 0;
                }
                catch (error) {
                    return this.calculateHaversineDistance(hotel.location, attraction.location);
                }
            }));
            const validDistances = distances.filter((d) => d > 0);
            if (validDistances.length === 0) {
                return 0;
            }
            const sum = validDistances.reduce((acc, dist) => acc + dist, 0);
            return Math.round(sum / validDistances.length);
        }
        catch (error) {
            const distances = attractions.map((attraction) => this.calculateHaversineDistance(hotel.location, attraction.location));
            const validDistances = distances.filter((d) => d > 0);
            if (validDistances.length === 0) {
                return 0;
            }
            const sum = validDistances.reduce((acc, dist) => acc + dist, 0);
            return Math.round(sum / validDistances.length);
        }
    }
    calculateHaversineDistance(location1, location2) {
        try {
            let coords1;
            let coords2;
            if (location1 && typeof location1 === 'object' && 'lat' in location1 && 'lng' in location1) {
                coords1 = location1;
            }
            else {
                coords1 = this.extractCoordinatesSync(location1);
            }
            if (location2 && typeof location2 === 'object' && 'lat' in location2 && 'lng' in location2) {
                coords2 = location2;
            }
            else {
                coords2 = this.extractCoordinatesSync(location2);
            }
            if (!coords1 || !coords2) {
                return 0;
            }
            const R = 6371000;
            const dLat = this.toRadians(coords2.lat - coords1.lat);
            const dLng = this.toRadians(coords2.lng - coords1.lng);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(this.toRadians(coords1.lat)) *
                    Math.cos(this.toRadians(coords2.lat)) *
                    Math.sin(dLng / 2) *
                    Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }
        catch (error) {
            return 0;
        }
    }
    extractCoordinatesSync(location) {
        if (!location) {
            return null;
        }
        if (typeof location === 'string') {
            const match = location.match(/POINT\(([^)]+)\)/);
            if (match) {
                const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
                return { lat, lng };
            }
        }
        if (typeof location === 'object') {
            if (location.coordinates) {
                return { lng: location.coordinates[0], lat: location.coordinates[1] };
            }
            if (location.lat && location.lng) {
                return { lat: location.lat, lng: location.lng };
            }
        }
        return null;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    async formatRecommendations(hotels, request, attractions, defaultReason) {
        const recommendations = [];
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentQuarter = Math.floor((now.getMonth() + 3) / 3);
        for (const hotel of hotels) {
            const metadata = hotel.metadata || {};
            const locationScore = metadata.location_score || {};
            let roomRate = metadata.room_rate || metadata.price || 0;
            const tier = metadata.hotel_tier || 0;
            if ((roomRate === null || roomRate === 0) && hotel.city) {
                try {
                    const cityName = hotel.city.name;
                    const effectiveTier = tier > 0 ? tier : 3;
                    const priceEstimate = await this.hotelPriceService.estimatePrice(cityName, effectiveTier, currentYear, currentQuarter);
                    roomRate = priceEstimate.estimatedPrice;
                }
                catch (error) {
                }
            }
            if (request.minTier !== undefined && tier < request.minTier) {
                continue;
            }
            if (request.maxTier !== undefined && tier > request.maxTier) {
                continue;
            }
            let totalCost;
            let costBreakdown;
            if (request.includeHiddenCost && hotel.distance_meters > 0) {
                const distanceKm = hotel.distance_meters / 1000;
                const transportCost = hotel_cost_calculator_util_1.HotelCostCalculator.estimateTransportCost(distanceKm);
                const commuteTime = hotel_cost_calculator_util_1.HotelCostCalculator.estimateCommuteTime(distanceKm, 'metro');
                const timeValue = request.timeValuePerHour || 50;
                costBreakdown = hotel_cost_calculator_util_1.HotelCostCalculator.calculateCostBreakdown(roomRate, transportCost, commuteTime, timeValue);
                totalCost = costBreakdown.totalCost;
            }
            const recommendation = {
                hotelId: hotel.id,
                name: hotel.nameEN || hotel.nameCN,
                roomRate,
                tier,
                locationScore: locationScore,
                totalCost,
                costBreakdown,
                recommendationReason: defaultReason,
                distanceToCenter: hotel.distance_meters,
            };
            recommendations.push(recommendation);
        }
        if (request.includeHiddenCost) {
            recommendations.sort((a, b) => {
                var _a, _b, _c, _d;
                const costA = (_b = (_a = a.totalCost) !== null && _a !== void 0 ? _a : a.roomRate) !== null && _b !== void 0 ? _b : Infinity;
                const costB = (_d = (_c = b.totalCost) !== null && _c !== void 0 ? _c : b.roomRate) !== null && _d !== void 0 ? _d : Infinity;
                return costA - costB;
            });
        }
        return recommendations;
    }
    async recommendHotelOptions(request) {
        const attractions = await this.getAttractions(request);
        if (attractions.length === 0) {
            throw new common_1.NotFoundException('未找到景点信息，无法推荐酒店');
        }
        let densityAnalysis = null;
        let recommendation = null;
        let timeValue = request.timeValuePerHour;
        if (!timeValue && request.tripId) {
            try {
                timeValue = await time_value_calculator_util_1.TimeValueCalculator.calculateFromTrip(request.tripId, this.prisma);
            }
            catch (error) {
                timeValue = 50;
            }
        }
        if (request.tripId) {
            densityAnalysis = await this.calculateTripDensity(request.tripId);
            const autoSelection = await this.autoSelectStrategy(densityAnalysis);
            recommendation = autoSelection.reason;
        }
        const updatedRequest = {
            ...request,
            timeValuePerHour: timeValue || request.timeValuePerHour || 50,
        };
        const convenientRequest = {
            ...updatedRequest,
            strategy: hotel_strategy_interface_1.HotelRecommendationStrategy.CENTROID,
            minTier: 3,
            maxTier: 3,
        };
        const convenientHotels = await this.recommendByCentroid(attractions, convenientRequest);
        const comfortableRequest = {
            ...updatedRequest,
            strategy: hotel_strategy_interface_1.HotelRecommendationStrategy.RESORT,
            minTier: 4,
        };
        const comfortableHotels = await this.recommendByResort(attractions, comfortableRequest);
        const budgetRequest = {
            ...updatedRequest,
            strategy: hotel_strategy_interface_1.HotelRecommendationStrategy.CENTROID,
            minTier: 2,
            maxTier: 3,
        };
        const budgetHotels = await this.recommendByCentroid(attractions, budgetRequest);
        const sortedBudgetHotels = [...budgetHotels].sort((a, b) => {
            var _a, _b, _c, _d;
            const costA = (_b = (_a = a.totalCost) !== null && _a !== void 0 ? _a : a.roomRate) !== null && _b !== void 0 ? _b : Infinity;
            const costB = (_d = (_c = b.totalCost) !== null && _c !== void 0 ? _c : b.roomRate) !== null && _d !== void 0 ? _d : Infinity;
            return costA - costB;
        });
        const options = [
            {
                id: 'CONVENIENT',
                name: '核心方便区',
                description: '住在市中心，出门就是地铁，交通便利',
                pros: [
                    '交通便利，节省通勤时间',
                    '距离景点近，减少奔波',
                    '周边设施完善，购物餐饮方便',
                ],
                cons: [
                    '房间可能较小',
                    '预算内可能只能住 3 星级',
                    '价格相对较高',
                ],
                hotels: convenientHotels.slice(0, 10),
            },
            {
                id: 'COMFORTABLE',
                name: '舒适享受区',
                description: '房间大，档次高，适合休闲度假',
                pros: [
                    '房间宽敞，设施完善',
                    '星级高，服务好',
                    '环境优美，适合放松',
                ],
                cons: [
                    '距离市区较远',
                    '每天去市区需坐车 40 分钟以上',
                    '价格较高',
                ],
                hotels: comfortableHotels.slice(0, 10),
            },
            {
                id: 'BUDGET',
                name: '极限省钱区',
                description: '价格极低，适合预算有限的旅行者',
                pros: [
                    '价格最低',
                    '性价比高',
                    '节省预算用于其他消费',
                ],
                cons: [
                    '可能距离景点较远',
                    '每天通勤 1 小时以上',
                    '设施和服务可能一般',
                ],
                hotels: sortedBudgetHotels.slice(0, 10),
            },
        ];
        return {
            options,
            recommendation: recommendation || undefined,
            densityAnalysis: densityAnalysis || undefined,
        };
    }
};
exports.HotelRecommendationService = HotelRecommendationService;
exports.HotelRecommendationService = HotelRecommendationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        hotel_price_service_1.HotelPriceService])
], HotelRecommendationService);
//# sourceMappingURL=hotel-recommendation.service.js.map