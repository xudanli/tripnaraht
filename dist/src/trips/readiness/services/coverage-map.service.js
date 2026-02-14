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
var CoverageMapService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoverageMapService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const readiness_service_1 = require("./readiness.service");
let CoverageMapService = CoverageMapService_1 = class CoverageMapService {
    constructor(prisma, readinessService) {
        this.prisma = prisma;
        this.readinessService = readinessService;
        this.logger = new common_1.Logger(CoverageMapService_1.name);
    }
    async getCoverageMap(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: { Place: true },
                            orderBy: { startTime: 'asc' },
                        },
                    },
                    orderBy: { date: 'asc' },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const placeIds = [];
        for (const day of trip.TripDay) {
            for (const item of day.ItineraryItem) {
                if (item.placeId) {
                    placeIds.push(item.placeId);
                }
            }
        }
        const placeCoordinatesMap = new Map();
        if (placeIds.length > 0) {
            const placeCoordsResult = await this.prisma.$queryRaw `
        SELECT id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
      `;
            for (const row of placeCoordsResult) {
                placeCoordinatesMap.set(row.id, { lat: row.lat, lng: row.lng });
            }
        }
        let readinessResult;
        try {
            readinessResult = await this.readinessService.checkFromDestination(trip.destination, {
                traveler: {},
                trip: {
                    startDate: trip.startDate.toISOString().split('T')[0],
                    endDate: trip.endDate.toISOString().split('T')[0],
                },
                itinerary: { countries: [trip.destination] },
            });
        }
        catch (error) {
            this.logger.warn(`获取准备度数据失败: ${error.message}`);
            readinessResult = { findings: [], summary: {} };
        }
        const pois = [];
        const coordinates = [];
        let poiIndex = 0;
        const tripStartDate = trip.startDate.toISOString().split('T')[0];
        for (let dayIndex = 0; dayIndex < trip.TripDay.length; dayIndex++) {
            const day = trip.TripDay[dayIndex];
            let orderInDay = 0;
            for (const item of day.ItineraryItem) {
                if (item.Place) {
                    let coords = item.placeId ? placeCoordinatesMap.get(item.placeId) : null;
                    if (!coords) {
                        coords = this.extractPlaceCoordinates(item.Place);
                    }
                    if (coords) {
                        coordinates.push(coords);
                        poiIndex++;
                        const poiCoverage = this.evaluatePoiCoverage(`poi-${poiIndex}`, dayIndex + 1, ++orderInDay, item.Place, coords, readinessResult, tripStartDate);
                        pois.push(poiCoverage);
                    }
                }
            }
        }
        const isWinter = this.isWinterSeason(tripStartDate);
        const segments = this.generateSegments(pois, isWinter);
        const gaps = this.identifyGaps(pois, segments);
        const bounds = this.calculateBounds(coordinates);
        const center = this.calculateCenter(coordinates);
        const zoom = this.calculateZoom(bounds);
        const summary = this.calculateSummary(pois, segments, gaps);
        const { deduplicatedWarnings, warningsBySeverity } = this.deduplicateAndSortWarnings(gaps, pois, segments);
        const evidenceStatusSummary = this.calculateEvidenceStatusSummary(pois);
        const dataFreshness = this.getDataFreshness(pois);
        return {
            tripId,
            bounds,
            center,
            zoom,
            pois,
            segments,
            gaps,
            summary,
            deduplicatedWarnings,
            warningsBySeverity,
            evidenceStatusSummary,
            calculatedAt: new Date().toISOString(),
            dataFreshness,
        };
    }
    extractPlaceCoordinates(place) {
        const metadata = place.metadata || {};
        if (metadata.lat && metadata.lng) {
            return { lat: metadata.lat, lng: metadata.lng };
        }
        if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
            return { lat: metadata.coordinates[1], lng: metadata.coordinates[0] };
        }
        const location = place.location;
        if (location) {
            if (typeof location === 'string') {
                const match = location.match(/POINT\(([^)]+)\)/);
                if (match) {
                    const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
                    return { lat, lng };
                }
            }
            if (typeof location === 'object') {
                if (location.coordinates && Array.isArray(location.coordinates)) {
                    return { lng: location.coordinates[0], lat: location.coordinates[1] };
                }
                if (location.lat && location.lng) {
                    return { lat: location.lat, lng: location.lng };
                }
            }
        }
        return null;
    }
    evaluatePoiCoverage(id, day, order, place, coordinates, readinessResult, tripStartDate) {
        var _a;
        const name = place.nameCN || place.nameEN || 'Unknown';
        const type = this.mapPlaceCategoryWithCanonical(place.category, (_a = place.metadata) === null || _a === void 0 ? void 0 : _a.canonicalType);
        const { status, evidenceTypes, missingEvidence, evidenceCount } = this.evaluateCoverageFromReadiness(place, readinessResult, tripStartDate);
        return {
            id, day, order, name, type, coordinates, coverageStatus: status, evidenceCount,
            evidenceTypes: evidenceTypes.length > 0 ? evidenceTypes : undefined,
            missingEvidence: missingEvidence.length > 0 ? missingEvidence : undefined,
            metadata: place.metadata,
        };
    }
    evaluateCoverageFromReadiness(place, readinessResult, tripStartDate) {
        var _a, _b, _c, _d;
        const evidenceTypes = [];
        const missingEvidence = [];
        const category = ((_a = place.category) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
        const metadata = place.metadata || {};
        const canonicalType = metadata.canonicalType || '';
        const isWinter = this.isWinterSeason(tripStartDate);
        const needsOpeningHours = this.needsOpeningHoursEvidence(canonicalType, category);
        if (metadata.openingHours || metadata.opening_hours || ((_b = metadata.visit_info) === null || _b === void 0 ? void 0 : _b.fees)) {
            evidenceTypes.push('opening_hours');
        }
        else if (needsOpeningHours) {
            missingEvidence.push('opening_hours');
        }
        const needsWeather = this.needsWeatherEvidence(canonicalType, category, isWinter);
        if (metadata.weatherInfo || metadata.weather) {
            evidenceTypes.push('weather');
        }
        else if (needsWeather) {
            missingEvidence.push('weather');
        }
        const needsBooking = this.needsBookingEvidence(canonicalType, category);
        if (metadata.bookingConfirmation || metadata.reservation || ((_c = metadata.activities) === null || _c === void 0 ? void 0 : _c.some((a) => a.cost_usd))) {
            evidenceTypes.push('booking_confirmation');
        }
        else if (needsBooking) {
        }
        const hasRoadClosureRisk = (_d = readinessResult === null || readinessResult === void 0 ? void 0 : readinessResult.findings) === null || _d === void 0 ? void 0 : _d.some((f) => { var _a; return (_a = f.risks) === null || _a === void 0 ? void 0 : _a.some((r) => r.type === 'road_closure' || r.type === 'logistics_remote'); });
        const needsRoadInfo = this.needsRoadClosureEvidence(canonicalType, category, isWinter);
        if (!hasRoadClosureRisk && !needsRoadInfo) {
            evidenceTypes.push('road_closure');
        }
        else if (needsRoadInfo || hasRoadClosureRisk) {
            missingEvidence.push('road_closure');
        }
        const needsPermit = this.needsPermitEvidence(canonicalType, category);
        if (metadata.permit || metadata.permitRequired === false) {
            evidenceTypes.push('permit');
        }
        else if (needsPermit) {
            missingEvidence.push('permit');
        }
        let status;
        const evidenceCount = evidenceTypes.length;
        const criticalMissing = missingEvidence.filter(e => e === 'road_closure' || e === 'weather' || e === 'permit').length;
        if (missingEvidence.length === 0 && evidenceCount > 0) {
            status = 'covered';
        }
        else if (criticalMissing > 0) {
            status = evidenceCount > 0 ? 'partial' : 'uncovered';
        }
        else if (evidenceCount > 0) {
            status = 'partial';
        }
        else {
            status = 'uncovered';
        }
        return { status, evidenceTypes, missingEvidence, evidenceCount };
    }
    isWinterSeason(dateStr) {
        if (!dateStr)
            return false;
        const month = new Date(dateStr + 'T00:00:00Z').getUTCMonth() + 1;
        return month >= 11 || month <= 3;
    }
    needsOpeningHoursEvidence(canonicalType, category) {
        const typesNeedingHours = [
            'MUSEUM', 'SHOP', 'RESTAURANT', 'CAFE', 'SPA_POOL', 'HOT_SPRING',
            'VISITOR_CENTER', 'GAS_STATION', 'FUEL_STATION', 'SUPERMARKET',
        ];
        if (typesNeedingHours.some(t => canonicalType.includes(t)))
            return true;
        if (category.includes('attraction') || category.includes('shop') || category.includes('restaurant'))
            return true;
        return false;
    }
    needsWeatherEvidence(canonicalType, category, isWinter) {
        const outdoorTypes = [
            'GLACIER', 'VOLCANO', 'WATERFALL', 'GEYSER', 'HOT_SPRING', 'BEACH',
            'TRAILHEAD', 'NATIONAL_PARK', 'NATURE', 'CAMPING', 'VIEWPOINT',
            'CANYON', 'LAVA_FIELD', 'CRATER', 'HIGHLAND',
        ];
        if (outdoorTypes.some(t => canonicalType.includes(t)))
            return true;
        if (category.includes('nature') || category.includes('outdoor') || category.includes('trail'))
            return true;
        if (isWinter && (category.includes('attraction') || canonicalType))
            return true;
        return false;
    }
    needsBookingEvidence(canonicalType, category) {
        const typesNeedingBooking = [
            'TOUR', 'ACTIVITY', 'GLACIER_WALK', 'ICE_CAVE', 'WHALE_WATCHING',
            'NORTHERN_LIGHTS_TOUR', 'SNOWMOBILE', 'HORSE_RIDING',
        ];
        return typesNeedingBooking.some(t => canonicalType.includes(t));
    }
    needsRoadClosureEvidence(canonicalType, category, isWinter) {
        const remoteTypes = [
            'HIGHLAND', 'F_ROAD', 'GLACIER', 'TRAILHEAD', 'CAMPING',
            'REMOTE', 'MOUNTAIN_PASS',
        ];
        if (remoteTypes.some(t => canonicalType.includes(t)))
            return true;
        if (isWinter && canonicalType.includes('NATIONAL_PARK'))
            return true;
        return false;
    }
    needsPermitEvidence(canonicalType, category) {
        const typesNeedingPermit = [
            'HIGHLAND', 'RESTRICTED_AREA', 'DRONE_ZONE', 'PROTECTED_AREA',
        ];
        return typesNeedingPermit.some(t => canonicalType.includes(t));
    }
    mapPlaceCategoryWithCanonical(category, canonicalType) {
        if (canonicalType) {
            const ct = canonicalType.toUpperCase();
            if (ct.includes('CITY') || ct.includes('TOWN') || ct.includes('VILLAGE'))
                return 'city';
            if (ct.includes('HOTEL') || ct.includes('ACCOMMODATION') || ct.includes('HOSTEL') || ct.includes('GUESTHOUSE'))
                return 'accommodation';
            if (ct.includes('RESTAURANT') || ct.includes('CAFE') || ct.includes('FOOD'))
                return 'restaurant';
            if (ct.includes('GLACIER') || ct.includes('VOLCANO') || ct.includes('WATERFALL') || ct.includes('GEYSER'))
                return 'nature';
            if (ct.includes('HOT_SPRING') || ct.includes('SPA') || ct.includes('POOL'))
                return 'hot_spring';
            if (ct.includes('NATIONAL_PARK') || ct.includes('NATURE') || ct.includes('TRAILHEAD'))
                return 'nature';
            if (ct.includes('MUSEUM') || ct.includes('CULTURE') || ct.includes('CHURCH'))
                return 'culture';
            if (ct.includes('SHOP') || ct.includes('SUPERMARKET'))
                return 'shopping';
            if (ct.includes('FUEL') || ct.includes('GAS_STATION'))
                return 'service';
            if (ct.includes('VIEWPOINT') || ct.includes('SCENIC'))
                return 'viewpoint';
            if (ct.includes('BEACH') || ct.includes('COASTAL'))
                return 'beach';
            if (ct.includes('CAMPING'))
                return 'camping';
        }
        const categoryLower = (category || '').toLowerCase();
        if (categoryLower.includes('city') || categoryLower.includes('town'))
            return 'city';
        if (categoryLower.includes('hotel') || categoryLower.includes('accommodation'))
            return 'accommodation';
        if (categoryLower.includes('restaurant') || categoryLower.includes('food'))
            return 'restaurant';
        if (categoryLower.includes('nature') || categoryLower.includes('outdoor'))
            return 'nature';
        if (categoryLower.includes('museum') || categoryLower.includes('culture'))
            return 'culture';
        if (categoryLower.includes('shop') || categoryLower.includes('shopping'))
            return 'shopping';
        return 'attraction';
    }
    generateSegments(pois, isWinter = false) {
        const segments = [];
        if (pois.length < 2)
            return segments;
        for (let i = 0; i < pois.length - 1; i++) {
            const fromPoi = pois[i];
            const toPoi = pois[i + 1];
            const distance = this.calculateDistance(fromPoi.coordinates, toPoi.coordinates);
            const avgSpeed = isWinter ? 50 : 60;
            const duration = Math.round((distance / avgSpeed) * 60);
            const { status, hazards } = this.evaluateSegmentRisk(fromPoi, toPoi, distance, isWinter);
            const polyline = this.encodePolyline([fromPoi.coordinates, toPoi.coordinates]);
            segments.push({
                id: `seg-${i + 1}`, fromPoiId: fromPoi.id, toPoiId: toPoi.id, day: fromPoi.day,
                distance: Math.round(distance), duration, routeType: 'driving',
                coverageStatus: status, polyline, hazards,
            });
        }
        return segments;
    }
    evaluateSegmentRisk(fromPoi, toPoi, distance, isWinter = false) {
        var _a, _b;
        const hazards = [];
        let status = 'covered';
        if (distance > 300) {
            hazards.push({ type: 'long_distance', severity: 'high', message: '超长距离行驶(>300km)，强烈建议分段或中途住宿' });
            status = 'warning';
        }
        else if (distance > 200) {
            hazards.push({ type: 'long_distance', severity: 'medium', message: '长距离行驶(>200km)，建议中途休息' });
            status = 'warning';
        }
        if (fromPoi.coverageStatus === 'uncovered' || toPoi.coverageStatus === 'uncovered') {
            hazards.push({ type: 'endpoint_uncovered', severity: 'medium', message: '端点缺少证据覆盖，请确认路线可行性' });
            status = 'warning';
        }
        if (((_a = fromPoi.missingEvidence) === null || _a === void 0 ? void 0 : _a.includes('road_closure')) || ((_b = toPoi.missingEvidence) === null || _b === void 0 ? void 0 : _b.includes('road_closure'))) {
            hazards.push({ type: 'road_closure', severity: 'high', message: '可能存在道路封闭风险，请出发前查询路况' });
            status = 'warning';
        }
        if (isWinter) {
            if (distance > 150 && !hazards.some(h => h.type === 'long_distance')) {
                hazards.push({ type: 'winter_driving', severity: 'medium', message: '冬季行驶，日照时间短，建议早出发' });
                status = 'warning';
            }
            const natureTypes = ['nature', 'viewpoint', 'camping', 'hot_spring'];
            if (natureTypes.includes(fromPoi.type) || natureTypes.includes(toPoi.type)) {
                if (!hazards.some(h => h.type === 'road_closure')) {
                    hazards.push({ type: 'winter_road_condition', severity: 'medium', message: '冬季前往自然景点，请注意道路状况' });
                    status = 'warning';
                }
            }
        }
        if (fromPoi.day !== toPoi.day) {
            hazards.push({ type: 'cross_day', severity: 'low', message: '跨天行程，请合理安排出发时间' });
        }
        return { status, hazards };
    }
    identifyGaps(pois, segments) {
        const gaps = [];
        let gapIndex = 0;
        for (const poi of pois) {
            if (poi.coverageStatus === 'uncovered' || poi.coverageStatus === 'partial') {
                gapIndex++;
                const evidenceStatus = this.getEvidenceStatus(poi);
                gaps.push({
                    id: `gap-${gapIndex}`,
                    type: 'poi',
                    relatedId: poi.id,
                    coordinates: poi.coordinates,
                    severity: poi.coverageStatus === 'uncovered' ? 'high' : 'medium',
                    message: `${poi.name}缺少证据覆盖`,
                    missingEvidence: poi.missingEvidence,
                    evidenceStatus,
                    affectedDays: [poi.day],
                    affectedPois: [poi.id],
                });
            }
        }
        for (const segment of segments) {
            if (segment.coverageStatus === 'warning' || segment.coverageStatus === 'blocked') {
                gapIndex++;
                const fromPoi = pois.find(p => p.id === segment.fromPoiId);
                const toPoi = pois.find(p => p.id === segment.toPoiId);
                if (fromPoi && toPoi) {
                    const midpoint = {
                        lat: (fromPoi.coordinates.lat + toPoi.coordinates.lat) / 2,
                        lng: (fromPoi.coordinates.lng + toPoi.coordinates.lng) / 2,
                    };
                    for (const hazard of segment.hazards) {
                        gaps.push({
                            id: `gap-${gapIndex}-${hazard.type}`,
                            type: 'segment',
                            relatedId: segment.id,
                            coordinates: midpoint,
                            severity: segment.coverageStatus === 'blocked' ? 'high' : hazard.severity,
                            message: hazard.message,
                            hazards: [hazard.type],
                            hazardType: hazard.type,
                            affectedDays: [segment.day],
                            affectedPois: [segment.fromPoiId, segment.toPoiId],
                        });
                    }
                }
            }
        }
        return gaps;
    }
    getEvidenceStatus(poi) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const status = [];
        const metadata = poi.metadata || {};
        const evidenceTypes = ['weather', 'road_closure', 'opening_hours', 'booking_confirmation', 'permit'];
        for (const type of evidenceTypes) {
            let evidenceStatus = 'missing';
            let lastUpdated;
            let source;
            if ((_a = poi.evidenceTypes) === null || _a === void 0 ? void 0 : _a.includes(type)) {
                evidenceStatus = 'fetched';
                if (type === 'weather') {
                    lastUpdated = metadata.weatherFetchedAt || ((_b = metadata.weatherInfo) === null || _b === void 0 ? void 0 : _b.lastUpdated) || ((_c = metadata.weather) === null || _c === void 0 ? void 0 : _c.lastUpdated);
                    source = ((_d = metadata.weatherInfo) === null || _d === void 0 ? void 0 : _d.source) || ((_e = metadata.weather) === null || _e === void 0 ? void 0 : _e.source);
                }
                else if (type === 'road_closure') {
                    lastUpdated = metadata.roadStatusFetchedAt || ((_f = metadata.roadStatus) === null || _f === void 0 ? void 0 : _f.lastUpdated);
                    source = (_g = metadata.roadStatus) === null || _g === void 0 ? void 0 : _g.source;
                }
                else if (type === 'opening_hours') {
                    lastUpdated = metadata.openingHoursFetchedAt;
                }
            }
            else if ((_h = poi.missingEvidence) === null || _h === void 0 ? void 0 : _h.includes(type)) {
                evidenceStatus = 'missing';
            }
            status.push({
                type,
                status: evidenceStatus,
                lastUpdated,
                source,
            });
        }
        return status;
    }
    calculateDistance(from, to) {
        const R = 6371;
        const dLat = this.toRad(to.lat - from.lat);
        const dLng = this.toRad(to.lng - from.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(from.lat)) * Math.cos(this.toRad(to.lat)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(deg) {
        return deg * (Math.PI / 180);
    }
    calculateBounds(coordinates) {
        if (coordinates.length === 0) {
            return { northeast: { lat: 66.5, lng: -13.5 }, southwest: { lat: 63.4, lng: -24.5 } };
        }
        const lats = coordinates.map(c => c.lat);
        const lngs = coordinates.map(c => c.lng);
        return { northeast: { lat: Math.max(...lats), lng: Math.max(...lngs) }, southwest: { lat: Math.min(...lats), lng: Math.min(...lngs) } };
    }
    calculateCenter(coordinates) {
        if (coordinates.length === 0)
            return { lat: 64.9631, lng: -19.0208 };
        const sumLat = coordinates.reduce((sum, c) => sum + c.lat, 0);
        const sumLng = coordinates.reduce((sum, c) => sum + c.lng, 0);
        return { lat: sumLat / coordinates.length, lng: sumLng / coordinates.length };
    }
    calculateZoom(bounds) {
        const latDiff = bounds.northeast.lat - bounds.southwest.lat;
        const lngDiff = bounds.northeast.lng - bounds.southwest.lng;
        const maxDiff = Math.max(latDiff, lngDiff);
        if (maxDiff > 10)
            return 5;
        if (maxDiff > 5)
            return 6;
        if (maxDiff > 2)
            return 7;
        if (maxDiff > 1)
            return 8;
        if (maxDiff > 0.5)
            return 9;
        return 10;
    }
    calculateSummary(pois, segments, gaps) {
        const coveredPois = pois.filter(p => p.coverageStatus === 'covered').length;
        const partialPois = pois.filter(p => p.coverageStatus === 'partial').length;
        const uncoveredPois = pois.filter(p => p.coverageStatus === 'uncovered').length;
        const coveredSegments = segments.filter(s => s.coverageStatus === 'covered').length;
        const warningSegments = segments.filter(s => s.coverageStatus === 'warning').length;
        const blockedSegments = segments.filter(s => s.coverageStatus === 'blocked').length;
        const totalItems = pois.length + segments.length;
        const coveredScore = coveredPois + partialPois * 0.5 + coveredSegments + warningSegments * 0.5;
        const coverageRate = totalItems > 0 ? coveredScore / totalItems : 0;
        return {
            totalPois: pois.length, coveredPois, partialPois, uncoveredPois,
            totalSegments: segments.length, coveredSegments, warningSegments, blockedSegments,
            totalGaps: gaps.length, coverageRate: Math.round(coverageRate * 100) / 100,
        };
    }
    encodePolyline(coordinates) {
        let encoded = '';
        let prevLat = 0;
        let prevLng = 0;
        for (const coord of coordinates) {
            const lat = Math.round(coord.lat * 1e5);
            const lng = Math.round(coord.lng * 1e5);
            encoded += this.encodeSignedNumber(lat - prevLat);
            encoded += this.encodeSignedNumber(lng - prevLng);
            prevLat = lat;
            prevLng = lng;
        }
        return encoded;
    }
    encodeSignedNumber(num) {
        let sgn_num = num << 1;
        if (num < 0)
            sgn_num = ~sgn_num;
        return this.encodeNumber(sgn_num);
    }
    encodeNumber(num) {
        let encoded = '';
        while (num >= 0x20) {
            encoded += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
            num >>= 5;
        }
        encoded += String.fromCharCode(num + 63);
        return encoded;
    }
    async getReadinessScore(tripId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            include: {
                TripDay: {
                    include: {
                        ItineraryItem: {
                            include: { Place: true },
                            orderBy: { startTime: 'asc' },
                        },
                    },
                    orderBy: { date: 'asc' },
                },
            },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const coverageData = await this.getCoverageMap(tripId);
        let readinessResult;
        try {
            readinessResult = await this.readinessService.checkFromDestination(trip.destination, {
                traveler: {},
                trip: {
                    startDate: trip.startDate.toISOString().split('T')[0],
                    endDate: trip.endDate.toISOString().split('T')[0],
                },
                itinerary: { countries: [trip.destination] },
            });
        }
        catch (error) {
            this.logger.warn(`获取准备度数据失败: ${error.message}`);
            readinessResult = { findings: [], summary: {} };
        }
        const score = this.calculateScoreBreakdown(trip, coverageData, readinessResult);
        const findings = this.extractFindings(trip, coverageData, readinessResult);
        const risks = this.extractRisks(coverageData, readinessResult);
        const blockers = findings.filter(f => f.type === 'blocker').length;
        const must = findings.filter(f => f.type === 'must' || f.type === 'warning').length;
        const should = findings.filter(f => f.type === 'should' || f.type === 'suggestion').length;
        const summary = {
            totalFindings: findings.length,
            blockers,
            must,
            should,
            warnings: must,
            suggestions: should,
            highRisks: risks.filter(r => r.severity === 'high').length,
            mediumRisks: risks.filter(r => r.severity === 'medium').length,
            lowRisks: risks.filter(r => r.severity === 'low').length,
        };
        return {
            tripId,
            score,
            findings,
            risks,
            summary,
            calculatedAt: new Date().toISOString(),
        };
    }
    calculateScoreBreakdown(trip, coverageData, readinessResult) {
        const evidenceCoverage = this.calculateEvidenceCoverageScore(coverageData);
        const scheduleFeasibility = this.calculateScheduleFeasibilityScore(trip, coverageData);
        const transportCertainty = this.calculateTransportCertaintyScore(trip, coverageData);
        const safetyRisk = this.calculateSafetyRiskScore(coverageData, readinessResult);
        const buffers = this.calculateBuffersScore(trip, coverageData);
        const overall = Math.round(evidenceCoverage * 0.25 +
            scheduleFeasibility * 0.25 +
            transportCertainty * 0.20 +
            safetyRisk * 0.15 +
            buffers * 0.15);
        return {
            overall,
            evidenceCoverage,
            scheduleFeasibility,
            transportCertainty,
            safetyRisk,
            buffers,
        };
    }
    calculateEvidenceCoverageScore(coverageData) {
        var _a, _b;
        const { pois, summary } = coverageData;
        if (pois.length === 0)
            return 100;
        const baseScore = summary.coverageRate * 100;
        const uncoveredPenalty = summary.uncoveredPois * 10;
        let criticalMissingPenalty = 0;
        for (const poi of pois) {
            if ((_a = poi.missingEvidence) === null || _a === void 0 ? void 0 : _a.includes('road_closure'))
                criticalMissingPenalty += 5;
            if ((_b = poi.missingEvidence) === null || _b === void 0 ? void 0 : _b.includes('weather'))
                criticalMissingPenalty += 3;
        }
        return Math.max(0, Math.min(100, Math.round(baseScore - uncoveredPenalty - criticalMissingPenalty)));
    }
    calculateScheduleFeasibilityScore(trip, coverageData) {
        let score = 100;
        const poisPerDay = new Map();
        for (const poi of coverageData.pois) {
            poisPerDay.set(poi.day, (poisPerDay.get(poi.day) || 0) + 1);
        }
        for (const [day, count] of poisPerDay) {
            if (count > 7)
                score -= 15;
            else if (count > 5)
                score -= 8;
        }
        for (const segment of coverageData.segments) {
            if (segment.duration > 300)
                score -= 10;
            else if (segment.duration > 180)
                score -= 5;
        }
        const crossDaySegments = coverageData.segments.filter(s => {
            const fromPoi = coverageData.pois.find(p => p.id === s.fromPoiId);
            const toPoi = coverageData.pois.find(p => p.id === s.toPoiId);
            return fromPoi && toPoi && fromPoi.day !== toPoi.day;
        });
        score -= crossDaySegments.length * 5;
        return Math.max(0, Math.min(100, score));
    }
    calculateTransportCertaintyScore(trip, coverageData) {
        let score = 100;
        for (const segment of coverageData.segments) {
            if (segment.coverageStatus === 'blocked')
                score -= 20;
            else if (segment.coverageStatus === 'warning')
                score -= 10;
        }
        for (const segment of coverageData.segments) {
            for (const hazard of segment.hazards) {
                if (hazard.severity === 'high')
                    score -= 8;
                else if (hazard.severity === 'medium')
                    score -= 4;
            }
        }
        if (coverageData.segments.length === 0 && coverageData.pois.length > 1) {
            score = 70;
        }
        return Math.max(0, Math.min(100, score));
    }
    calculateSafetyRiskScore(coverageData, readinessResult) {
        var _a;
        let score = 100;
        for (const gap of coverageData.gaps) {
            if (gap.severity === 'high')
                score -= 15;
            else if (gap.severity === 'medium')
                score -= 8;
            else
                score -= 3;
        }
        const risks = ((_a = readinessResult === null || readinessResult === void 0 ? void 0 : readinessResult.findings) === null || _a === void 0 ? void 0 : _a.flatMap((f) => f.risks || [])) || [];
        for (const risk of risks) {
            if (risk.severity === 'high')
                score -= 12;
            else if (risk.severity === 'medium')
                score -= 6;
            else
                score -= 2;
        }
        for (const segment of coverageData.segments) {
            if (segment.hazards.some(h => h.type === 'road_closure'))
                score -= 10;
        }
        return Math.max(0, Math.min(100, score));
    }
    calculateBuffersScore(trip, coverageData) {
        var _a;
        let score = 85;
        const totalDays = ((_a = trip.TripDay) === null || _a === void 0 ? void 0 : _a.length) || 1;
        const poisPerDay = coverageData.pois.length / totalDays;
        if (poisPerDay > 6)
            score -= 25;
        else if (poisPerDay > 4)
            score -= 15;
        else if (poisPerDay > 3)
            score -= 5;
        const longSegments = coverageData.segments.filter(s => s.distance > 150);
        score -= longSegments.length * 10;
        const totalDrivingTime = coverageData.segments.reduce((sum, s) => sum + s.duration, 0);
        const avgDrivingPerDay = totalDrivingTime / totalDays;
        if (avgDrivingPerDay > 240)
            score -= 20;
        else if (avgDrivingPerDay > 180)
            score -= 10;
        return Math.max(0, Math.min(100, score));
    }
    extractFindings(trip, coverageData, readinessResult) {
        var _a, _b, _c, _d;
        const findings = [];
        let findingIndex = 0;
        for (const gap of coverageData.gaps) {
            findingIndex++;
            const findingType = gap.severity === 'high' ? 'blocker' : 'must';
            findings.push({
                id: `finding-${findingIndex}`,
                type: findingType,
                category: gap.type === 'poi' ? 'evidence' : 'transport',
                message: gap.message,
                severity: gap.severity,
                affectedDays: gap.type === 'poi'
                    ? [((_a = coverageData.pois.find(p => p.id === gap.relatedId)) === null || _a === void 0 ? void 0 : _a.day) || 1]
                    : undefined,
                actionRequired: gap.missingEvidence
                    ? `补充: ${gap.missingEvidence.join(', ')}`
                    : undefined,
            });
        }
        for (const finding of (readinessResult === null || readinessResult === void 0 ? void 0 : readinessResult.findings) || []) {
            for (const blocker of finding.blockers || []) {
                findingIndex++;
                findings.push({
                    id: `finding-${findingIndex}`,
                    type: 'blocker',
                    category: blocker.category || 'readiness',
                    message: blocker.message,
                    severity: 'high',
                    actionRequired: (_b = blocker.tasks) === null || _b === void 0 ? void 0 : _b.map((t) => t.action).join(', '),
                });
            }
            for (const must of finding.must || []) {
                findingIndex++;
                findings.push({
                    id: `finding-${findingIndex}`,
                    type: 'must',
                    category: must.category || 'readiness',
                    message: must.message,
                    severity: 'medium',
                    actionRequired: (_c = must.tasks) === null || _c === void 0 ? void 0 : _c.map((t) => t.action).join(', '),
                });
            }
            for (const should of finding.should || []) {
                findingIndex++;
                findings.push({
                    id: `finding-${findingIndex}`,
                    type: 'should',
                    category: should.category || 'readiness',
                    message: should.message,
                    severity: 'low',
                    actionRequired: (_d = should.tasks) === null || _d === void 0 ? void 0 : _d.map((t) => t.action).join(', '),
                });
            }
        }
        for (const segment of coverageData.segments) {
            for (const hazard of segment.hazards) {
                if (hazard.severity === 'high') {
                    findingIndex++;
                    findings.push({
                        id: `finding-${findingIndex}`,
                        type: 'must',
                        category: 'transport',
                        message: hazard.message,
                        severity: hazard.severity,
                        affectedDays: [segment.day],
                    });
                }
            }
        }
        return findings;
    }
    extractRisks(coverageData, readinessResult) {
        const risks = [];
        let riskIndex = 0;
        for (const finding of (readinessResult === null || readinessResult === void 0 ? void 0 : readinessResult.findings) || []) {
            for (const risk of finding.risks || []) {
                if (risk.summary || risk.message) {
                    riskIndex++;
                    risks.push({
                        id: `risk-${riskIndex}`,
                        type: risk.type || 'unknown',
                        severity: risk.severity || 'medium',
                        message: risk.summary || risk.message || `${risk.type} 风险`,
                        mitigation: risk.mitigations || [],
                    });
                }
            }
        }
        for (const segment of coverageData.segments) {
            for (const hazard of segment.hazards) {
                riskIndex++;
                const affectedPois = [segment.fromPoiId, segment.toPoiId];
                risks.push({
                    id: `risk-${riskIndex}`,
                    type: hazard.type,
                    severity: hazard.severity,
                    message: hazard.message,
                    affectedPois,
                });
            }
        }
        for (const gap of coverageData.gaps) {
            if (gap.severity === 'high') {
                riskIndex++;
                risks.push({
                    id: `risk-${riskIndex}`,
                    type: gap.type === 'poi' ? 'evidence_gap' : 'transport_gap',
                    severity: gap.severity,
                    message: gap.message,
                    affectedPois: gap.relatedId ? [gap.relatedId] : undefined,
                });
            }
        }
        return risks;
    }
    async getRepairOptions(tripId, blockerId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`Trip ${tripId} not found`);
        }
        const scoreData = await this.getReadinessScore(tripId);
        const blocker = scoreData.findings.find(f => f.id === blockerId);
        const options = this.generateRepairOptions(blocker);
        return {
            blockerId,
            blockerMessage: blocker === null || blocker === void 0 ? void 0 : blocker.message,
            options,
        };
    }
    generateRepairOptions(blocker) {
        const options = [];
        let optionIndex = 0;
        if (!blocker) {
            optionIndex++;
            options.push({
                id: `option-${optionIndex}`,
                title: '刷新准备度检查',
                description: '重新运行准备度检查以获取最新状态',
                impact: 'low',
                timeEstimate: '1分钟',
                actionType: 'refresh',
            });
            return options;
        }
        switch (blocker.category) {
            case 'evidence':
                options.push(...this.generateEvidenceRepairOptions(blocker, optionIndex));
                break;
            case 'schedule':
                options.push(...this.generateScheduleRepairOptions(blocker, optionIndex));
                break;
            case 'transport':
                options.push(...this.generateTransportRepairOptions(blocker, optionIndex));
                break;
            case 'accommodation':
                options.push(...this.generateAccommodationRepairOptions(blocker, optionIndex));
                break;
            case 'safety':
                options.push(...this.generateSafetyRepairOptions(blocker, optionIndex));
                break;
            default:
                options.push(...this.generateDefaultRepairOptions(blocker, optionIndex));
        }
        return options;
    }
    generateEvidenceRepairOptions(blocker, startIndex) {
        var _a;
        const options = [];
        let idx = startIndex;
        const missingTypes = ((_a = blocker.actionRequired) === null || _a === void 0 ? void 0 : _a.replace('补充: ', '').split(', ')) || [];
        if (missingTypes.includes('weather')) {
            idx++;
            options.push({
                id: `option-${idx}`,
                title: '查询天气预报',
                description: '获取该地点的天气信息，了解天气状况',
                impact: 'medium',
                timeEstimate: '2分钟',
                actionType: 'fetch_weather',
            });
        }
        if (missingTypes.includes('road_closure')) {
            idx++;
            options.push({
                id: `option-${idx}`,
                title: '查询道路状况',
                description: '检查前往该地点的道路是否开放',
                impact: 'high',
                timeEstimate: '5分钟',
                actionType: 'check_road',
            });
        }
        if (missingTypes.includes('opening_hours')) {
            idx++;
            options.push({
                id: `option-${idx}`,
                title: '确认营业时间',
                description: '查询该景点/地点的开放时间',
                impact: 'medium',
                timeEstimate: '3分钟',
                actionType: 'check_hours',
            });
        }
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '手动标记已确认',
            description: '如果您已自行确认相关信息，可以手动标记',
            impact: 'low',
            timeEstimate: '1分钟',
            actionType: 'manual_confirm',
        });
        return options;
    }
    generateScheduleRepairOptions(blocker, startIndex) {
        const options = [];
        let idx = startIndex;
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '调整行程顺序',
            description: '重新安排当天的景点顺序以优化时间',
            impact: 'medium',
            timeEstimate: '10分钟',
            actionType: 'reorder_pois',
        });
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '移动到其他天',
            description: '将部分景点移到行程较轻松的一天',
            impact: 'medium',
            timeEstimate: '5分钟',
            actionType: 'move_to_day',
        });
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '减少景点数量',
            description: '删除部分非必要景点以留出更多时间',
            impact: 'high',
            timeEstimate: '5分钟',
            actionType: 'remove_pois',
        });
        return options;
    }
    generateTransportRepairOptions(blocker, startIndex) {
        const options = [];
        let idx = startIndex;
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '预订交通',
            description: '提前预订租车或其他交通方式',
            cost: 100,
            impact: 'high',
            timeEstimate: '15分钟',
            actionType: 'book_transport',
        });
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '查看替代路线',
            description: '寻找其他可行的交通路线',
            impact: 'medium',
            timeEstimate: '10分钟',
            actionType: 'find_alternative_route',
        });
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '联系当地向导',
            description: '寻找当地向导或拼车服务',
            cost: 50,
            impact: 'medium',
            timeEstimate: '20分钟',
            actionType: 'contact_guide',
        });
        return options;
    }
    generateAccommodationRepairOptions(blocker, startIndex) {
        const options = [];
        let idx = startIndex;
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '更换酒店',
            description: '预订另一家有空房的酒店',
            cost: 200,
            impact: 'high',
            timeEstimate: '30分钟',
            actionType: 'change_hotel',
        });
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '联系酒店确认',
            description: '直接联系酒店确认预订状态',
            impact: 'medium',
            timeEstimate: '15分钟',
            actionType: 'confirm_booking',
        });
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '查看附近住宿',
            description: '搜索附近其他住宿选项',
            impact: 'medium',
            timeEstimate: '20分钟',
            actionType: 'search_nearby',
        });
        return options;
    }
    generateSafetyRepairOptions(blocker, startIndex) {
        const options = [];
        let idx = startIndex;
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '查看安全提示',
            description: '了解该地区的安全注意事项',
            impact: 'medium',
            timeEstimate: '5分钟',
            actionType: 'view_safety_tips',
        });
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '购买旅行保险',
            description: '为行程购买适当的旅行保险',
            cost: 100,
            impact: 'high',
            timeEstimate: '15分钟',
            actionType: 'buy_insurance',
        });
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '更换目的地',
            description: '考虑选择更安全的替代目的地',
            impact: 'high',
            timeEstimate: '30分钟',
            actionType: 'change_destination',
        });
        return options;
    }
    generateDefaultRepairOptions(blocker, startIndex) {
        const options = [];
        let idx = startIndex;
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '查看详情',
            description: '了解更多关于此问题的信息',
            impact: 'low',
            timeEstimate: '2分钟',
            actionType: 'view_details',
        });
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '手动标记已解决',
            description: '如果问题已解决，可以手动标记',
            impact: 'low',
            timeEstimate: '1分钟',
            actionType: 'mark_resolved',
        });
        idx++;
        options.push({
            id: `option-${idx}`,
            title: '忽略此问题',
            description: '暂时忽略此问题，稍后处理',
            impact: 'low',
            timeEstimate: '1分钟',
            actionType: 'ignore',
        });
        return options;
    }
    deduplicateAndSortWarnings(gaps, pois, segments) {
        const warningMap = new Map();
        for (const gap of gaps) {
            const key = `${gap.type}-${gap.hazardType || 'general'}-${gap.message}`;
            if (!warningMap.has(key)) {
                warningMap.set(key, { ...gap });
            }
            else {
                const existing = warningMap.get(key);
                const affectedDays = new Set([...(existing.affectedDays || []), ...(gap.affectedDays || [])]);
                const affectedPois = new Set([...(existing.affectedPois || []), ...(gap.affectedPois || [])]);
                if (this.compareSeverity(gap.severity, existing.severity) > 0) {
                    existing.severity = gap.severity;
                }
                existing.affectedDays = Array.from(affectedDays).sort((a, b) => a - b);
                existing.affectedPois = Array.from(affectedPois);
            }
        }
        const deduplicatedWarnings = Array.from(warningMap.values());
        deduplicatedWarnings.sort((a, b) => {
            var _a, _b;
            const severityCompare = this.compareSeverity(b.severity, a.severity);
            if (severityCompare !== 0)
                return severityCompare;
            return (((_a = a.affectedDays) === null || _a === void 0 ? void 0 : _a.length) || 0) - (((_b = b.affectedDays) === null || _b === void 0 ? void 0 : _b.length) || 0);
        });
        const warningsBySeverity = {
            high: deduplicatedWarnings.filter(w => w.severity === 'high'),
            medium: deduplicatedWarnings.filter(w => w.severity === 'medium'),
            low: deduplicatedWarnings.filter(w => w.severity === 'low'),
        };
        return { deduplicatedWarnings, warningsBySeverity };
    }
    compareSeverity(a, b) {
        const severityMap = { high: 3, medium: 2, low: 1 };
        return severityMap[a] - severityMap[b];
    }
    calculateEvidenceStatusSummary(pois) {
        let total = 0;
        let fetched = 0;
        let missing = 0;
        let fetching = 0;
        let failed = 0;
        for (const poi of pois) {
            const statuses = this.getEvidenceStatus(poi);
            for (const status of statuses) {
                total++;
                if (status.status === 'fetched')
                    fetched++;
                else if (status.status === 'missing')
                    missing++;
                else if (status.status === 'fetching')
                    fetching++;
                else if (status.status === 'failed')
                    failed++;
            }
        }
        return { total, fetched, missing, fetching, failed };
    }
    getDataFreshness(pois) {
        const freshness = {};
        const weatherDates = [];
        const roadClosureDates = [];
        const openingHoursDates = [];
        for (const poi of pois) {
            const statuses = this.getEvidenceStatus(poi);
            for (const status of statuses) {
                if (status.type === 'weather' && status.status === 'fetched' && status.lastUpdated) {
                    weatherDates.push(status.lastUpdated);
                }
                else if (status.type === 'road_closure' && status.status === 'fetched' && status.lastUpdated) {
                    roadClosureDates.push(status.lastUpdated);
                }
                else if (status.type === 'opening_hours' && status.status === 'fetched' && status.lastUpdated) {
                    openingHoursDates.push(status.lastUpdated);
                }
            }
        }
        if (weatherDates.length > 0) {
            freshness.weather = weatherDates.sort().reverse()[0];
        }
        if (roadClosureDates.length > 0) {
            freshness.roadClosure = roadClosureDates.sort().reverse()[0];
        }
        if (openingHoursDates.length > 0) {
            freshness.openingHours = openingHoursDates.sort().reverse()[0];
        }
        return freshness;
    }
};
exports.CoverageMapService = CoverageMapService;
exports.CoverageMapService = CoverageMapService = CoverageMapService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        readiness_service_1.ReadinessService])
], CoverageMapService);
//# sourceMappingURL=coverage-map.service.js.map