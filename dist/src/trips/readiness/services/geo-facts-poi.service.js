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
var GeoFactsPOIService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoFactsPOIService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const poi_pickup_scorer_service_1 = require("./poi-pickup-scorer.service");
const poi_trailhead_service_1 = require("./poi-trailhead.service");
const dem_elevation_service_1 = require("../../dem/services/dem-elevation.service");
let GeoFactsPOIService = GeoFactsPOIService_1 = class GeoFactsPOIService {
    constructor(prisma, demElevationService) {
        this.prisma = prisma;
        this.demElevationService = demElevationService;
        this.logger = new common_1.Logger(GeoFactsPOIService_1.name);
        this.pickupScorer = new poi_pickup_scorer_service_1.POIPickupScorerService(prisma);
        this.trailheadService = new poi_trailhead_service_1.POITrailheadService(prisma);
    }
    async getPOIFeaturesForPoint(lat, lng, radiusKm = 25, pickupLimit = 3) {
        try {
            const [pickupPoints, trailAccessPoints, safety, supply, information, xizangFeatures,] = await Promise.all([
                this.pickupScorer.findTopPickupPoints(lat, lng, radiusKm, pickupLimit),
                this.trailheadService.findTrailAccessPoints(lat, lng, radiusKm),
                this.checkSafetyPoints(lat, lng, radiusKm),
                this.checkSupplyPoints(lat, lng, radiusKm),
                this.checkInformationPoints(lat, lng, radiusKm),
                this.checkXizangFeatures(lat, lng, radiusKm),
            ]);
            return {
                topPickupPoints: pickupPoints,
                hasHarbour: pickupPoints.length > 0,
                trailAccessPoints,
                safety,
                supply,
                information,
                xizang: xizangFeatures,
            };
        }
        catch (error) {
            this.logger.error(`获取点位 POI 特征失败 (${lat}, ${lng}):`, error);
            return {
                topPickupPoints: [],
                hasHarbour: false,
                trailAccessPoints: [],
                safety: {
                    hasHospital: false,
                    hasClinic: false,
                    hasPharmacy: false,
                    hasPolice: false,
                    hasFireStation: false,
                },
                supply: {
                    hasFuel: false,
                    hasSupermarket: false,
                    hasConvenience: false,
                    hasCarRepair: false,
                    hasEVCharger: false,
                },
                information: {
                    hasInformationPoint: false,
                    hasViewpoint: false,
                },
                xizang: {
                    oxygenStationCount: 0,
                    checkpointCount: 0,
                    mountainPassCount: 0,
                    avgAltitudeM: null,
                    fuelDensity: null,
                },
            };
        }
    }
    async getPOIFeaturesForRoute(route, radiusKm = 25, pickupLimit = 3) {
        try {
            const centerLat = route.points.reduce((sum, p) => sum + p.lat, 0) / route.points.length;
            const centerLng = route.points.reduce((sum, p) => sum + p.lng, 0) / route.points.length;
            return await this.getPOIFeaturesForPoint(centerLat, centerLng, radiusKm, pickupLimit);
        }
        catch (error) {
            this.logger.error(`获取路线 POI 特征失败:`, error);
            return {
                topPickupPoints: [],
                hasHarbour: false,
                trailAccessPoints: [],
                safety: {
                    hasHospital: false,
                    hasClinic: false,
                    hasPharmacy: false,
                    hasPolice: false,
                    hasFireStation: false,
                },
                supply: {
                    hasFuel: false,
                    hasSupermarket: false,
                    hasConvenience: false,
                    hasCarRepair: false,
                    hasEVCharger: false,
                },
                information: {
                    hasInformationPoint: false,
                    hasViewpoint: false,
                },
                xizang: {
                    oxygenStationCount: 0,
                    checkpointCount: 0,
                    mountainPassCount: 0,
                    avgAltitudeM: null,
                    fuelDensity: null,
                },
            };
        }
    }
    async checkSafetyPoints(lat, lng, radiusKm) {
        var _a, _b, _c, _d;
        try {
            const radiusM = radiusKm * 1000;
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT DISTINCT category
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category IN ('HOSPITAL', 'PHARMACY', 'SAFETY')
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const categories = new Set(result.map((r) => r.category));
            const hospitalResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'HOSPITAL'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const clinicResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND tags_slim->>'amenity' = 'clinic'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const policeResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND tags_slim->>'amenity' = 'police'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const fireResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND tags_slim->>'amenity' = 'fire_station'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            return {
                hasHospital: Number(((_a = hospitalResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0) > 0,
                hasClinic: Number(((_b = clinicResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0) > 0,
                hasPharmacy: categories.has('PHARMACY'),
                hasPolice: Number(((_c = policeResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0) > 0,
                hasFireStation: Number(((_d = fireResult[0]) === null || _d === void 0 ? void 0 : _d.count) || 0) > 0,
            };
        }
        catch (error) {
            this.logger.warn(`检查安全保障点失败:`, error);
            return {
                hasHospital: false,
                hasClinic: false,
                hasPharmacy: false,
                hasPolice: false,
                hasFireStation: false,
            };
        }
    }
    async checkSupplyPoints(lat, lng, radiusKm) {
        var _a, _b, _c, _d, _e;
        try {
            const radiusM = radiusKm * 1000;
            const fuelResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'FUEL'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const supermarketResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'SUPPLY'
          AND tags_slim->>'shop' = 'supermarket'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const convenienceResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'SUPPLY'
          AND tags_slim->>'shop' = 'convenience'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const carRepairResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'CAR_REPAIR'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const evChargerResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'EV_CHARGER'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            return {
                hasFuel: Number(((_a = fuelResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0) > 0,
                hasSupermarket: Number(((_b = supermarketResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0) > 0,
                hasConvenience: Number(((_c = convenienceResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0) > 0,
                hasCarRepair: Number(((_d = carRepairResult[0]) === null || _d === void 0 ? void 0 : _d.count) || 0) > 0,
                hasEVCharger: Number(((_e = evChargerResult[0]) === null || _e === void 0 ? void 0 : _e.count) || 0) > 0,
            };
        }
        catch (error) {
            this.logger.warn(`检查补给点失败:`, error);
            return {
                hasFuel: false,
                hasSupermarket: false,
                hasConvenience: false,
                hasCarRepair: false,
                hasEVCharger: false,
            };
        }
    }
    async checkInformationPoints(lat, lng, radiusKm) {
        var _a, _b;
        try {
            const radiusM = radiusKm * 1000;
            const infoResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'INFORMATION'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const viewpointResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'VIEWPOINT'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            return {
                hasInformationPoint: Number(((_a = infoResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0) > 0,
                hasViewpoint: Number(((_b = viewpointResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0) > 0,
            };
        }
        catch (error) {
            this.logger.warn(`检查信息点失败:`, error);
            return {
                hasInformationPoint: false,
                hasViewpoint: false,
            };
        }
    }
    async checkXizangFeatures(lat, lng, radiusKm) {
        var _a, _b, _c, _d, _e;
        try {
            const radiusM = radiusKm * 1000;
            const oxygenResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'OXYGEN_STATION'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const checkpointResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'CHECKPOINT'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const mountainPassResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'MOUNTAIN_PASS'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const altitudeResult = await this.prisma.$queryRawUnsafe(`
        SELECT AVG(altitude_hint) as avg_altitude
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND altitude_hint IS NOT NULL
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            let avgAltitudeM = ((_a = altitudeResult[0]) === null || _a === void 0 ? void 0 : _a.avg_altitude)
                ? Math.round(altitudeResult[0].avg_altitude)
                : null;
            if (avgAltitudeM === null && this.demElevationService) {
                try {
                    const demElevation = await this.demElevationService.getElevation(lat, lng);
                    if (demElevation !== null) {
                        avgAltitudeM = demElevation;
                        this.logger.debug(`使用 DEM 数据获取海拔: ${lat}, ${lng} -> ${avgAltitudeM}m`);
                    }
                }
                catch (error) {
                    this.logger.debug(`DEM 查询失败，使用 POI 海拔: ${error instanceof Error ? error.message : error}`);
                }
            }
            const fuelCountResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'FUEL'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            const fuelCount = Number(((_b = fuelCountResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0);
            const fuelDensity = radiusKm > 0 ? fuelCount / (radiusKm / 100) : null;
            return {
                oxygenStationCount: Number(((_c = oxygenResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0),
                checkpointCount: Number(((_d = checkpointResult[0]) === null || _d === void 0 ? void 0 : _d.count) || 0),
                mountainPassCount: Number(((_e = mountainPassResult[0]) === null || _e === void 0 ? void 0 : _e.count) || 0),
                avgAltitudeM,
                fuelDensity: fuelDensity !== null ? Math.round(fuelDensity * 100) / 100 : null,
            };
        }
        catch (error) {
            this.logger.warn(`检查西藏特征失败:`, error);
            return {
                oxygenStationCount: 0,
                checkpointCount: 0,
                mountainPassCount: 0,
                avgAltitudeM: null,
                fuelDensity: null,
            };
        }
    }
};
exports.GeoFactsPOIService = GeoFactsPOIService;
exports.GeoFactsPOIService = GeoFactsPOIService = GeoFactsPOIService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        dem_elevation_service_1.DEMElevationService])
], GeoFactsPOIService);
//# sourceMappingURL=geo-facts-poi.service.js.map