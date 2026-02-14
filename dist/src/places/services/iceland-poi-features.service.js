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
var IcelandPoiFeaturesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IcelandPoiFeaturesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let IcelandPoiFeaturesService = IcelandPoiFeaturesService_1 = class IcelandPoiFeaturesService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(IcelandPoiFeaturesService_1.name);
    }
    async getIcelandFeatures(region = 'IS_REYKJAVIK') {
        this.logger.log(`获取 ${region} 的 POI Features...`);
        const transportPoints = await this.getTransportPoints(region);
        const attractions = await this.getAttractions(region);
        const safetyPoints = await this.getSafetyPoints(region);
        const supplyPoints = await this.getSupplyPoints(region);
        const servicePoints = await this.getServicePoints(region);
        return {
            transport: {
                airports: transportPoints.airports,
                ferryTerminals: transportPoints.ferryTerminals,
                parking: transportPoints.parking,
                hasAirport: transportPoints.airports.length > 0,
                hasFerryTerminal: transportPoints.ferryTerminals.length > 0,
                totalTransportPoints: transportPoints.total,
            },
            attractions: {
                waterfalls: attractions.waterfalls,
                hotSprings: attractions.hotSprings,
                geysers: attractions.geysers,
                glaciers: attractions.glaciers,
                volcanoes: attractions.volcanoes,
                beaches: attractions.beaches,
                viewpoints: attractions.viewpoints,
                totalAttractions: attractions.total,
            },
            safety: {
                hospitals: safetyPoints.hospitals,
                clinics: safetyPoints.clinics,
                pharmacies: safetyPoints.pharmacies,
                police: safetyPoints.police,
                fireStations: safetyPoints.fireStations,
                hasHospital: safetyPoints.hospitals.length > 0,
                hasClinic: safetyPoints.clinics.length > 0,
                hasPharmacy: safetyPoints.pharmacies.length > 0,
                totalSafetyPoints: safetyPoints.total,
            },
            supply: {
                fuelStations: supplyPoints.fuelStations,
                supermarkets: supplyPoints.supermarkets,
                convenienceStores: supplyPoints.convenienceStores,
                toilets: supplyPoints.toilets,
                hasFuel: supplyPoints.fuelStations.length > 0,
                hasSupermarket: supplyPoints.supermarkets.length > 0,
                hasConvenience: supplyPoints.convenienceStores.length > 0,
                totalSupplyPoints: supplyPoints.total,
            },
            services: {
                informationCenters: servicePoints.informationCenters,
                tourOperators: servicePoints.tourOperators,
                carRentals: servicePoints.carRentals,
                camping: servicePoints.camping,
                spaPools: servicePoints.spaPools,
                totalServicePoints: servicePoints.total,
            },
        };
    }
    async getTransportPoints(region) {
        const places = await this.prisma.$queryRaw `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'regionKey' = ${region}
        AND metadata->>'canonicalType' IN ('AIRPORT', 'PORT_FERRY_TERMINAL', 'PORT_PIER', 'PARKING')
    `;
        const airports = [];
        const ferryTerminals = [];
        const parking = [];
        places.forEach(p => {
            var _a, _b;
            const canonicalType = ((_a = p.metadata) === null || _a === void 0 ? void 0 : _a.canonicalType) || 'OTHER';
            const item = {
                placeId: p.id,
                name: p.nameCN,
                nameEN: p.nameEN || undefined,
                lat: p.lat,
                lng: p.lng,
                canonicalType,
                tags: ((_b = p.metadata) === null || _b === void 0 ? void 0 : _b.rawTags) || {},
            };
            if (canonicalType === 'AIRPORT') {
                airports.push(item);
            }
            else if (canonicalType === 'PORT_FERRY_TERMINAL' || canonicalType === 'PORT_PIER') {
                ferryTerminals.push(item);
            }
            else if (canonicalType === 'PARKING') {
                parking.push(item);
            }
        });
        return {
            airports,
            ferryTerminals,
            parking,
            total: places.length,
        };
    }
    async getAttractions(region) {
        const places = await this.prisma.$queryRaw `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'regionKey' = ${region}
        AND metadata->>'canonicalType' IN (
          'ATTRACTION_NATURE_WATERFALL',
          'ATTRACTION_NATURE_HOT_SPRING',
          'ATTRACTION_NATURE_GEYSER',
          'ATTRACTION_NATURE_GLACIER',
          'ATTRACTION_NATURE_VOLCANO',
          'ATTRACTION_NATURE_BEACH',
          'VIEWPOINT'
        )
    `;
        const waterfalls = [];
        const hotSprings = [];
        const geysers = [];
        const glaciers = [];
        const volcanoes = [];
        const beaches = [];
        const viewpoints = [];
        places.forEach(p => {
            var _a, _b;
            const canonicalType = ((_a = p.metadata) === null || _a === void 0 ? void 0 : _a.canonicalType) || 'OTHER';
            const item = {
                placeId: p.id,
                name: p.nameCN,
                nameEN: p.nameEN || undefined,
                lat: p.lat,
                lng: p.lng,
                canonicalType,
                tags: ((_b = p.metadata) === null || _b === void 0 ? void 0 : _b.rawTags) || {},
            };
            switch (canonicalType) {
                case 'ATTRACTION_NATURE_WATERFALL':
                    waterfalls.push(item);
                    break;
                case 'ATTRACTION_NATURE_HOT_SPRING':
                    hotSprings.push(item);
                    break;
                case 'ATTRACTION_NATURE_GEYSER':
                    geysers.push(item);
                    break;
                case 'ATTRACTION_NATURE_GLACIER':
                    glaciers.push(item);
                    break;
                case 'ATTRACTION_NATURE_VOLCANO':
                    volcanoes.push(item);
                    break;
                case 'ATTRACTION_NATURE_BEACH':
                    beaches.push(item);
                    break;
                case 'VIEWPOINT':
                    viewpoints.push(item);
                    break;
            }
        });
        return {
            waterfalls,
            hotSprings,
            geysers,
            glaciers,
            volcanoes,
            beaches,
            viewpoints,
            total: places.length,
        };
    }
    async getSafetyPoints(region) {
        const places = await this.prisma.$queryRaw `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'regionKey' = ${region}
        AND metadata->>'canonicalType' IN ('HOSPITAL', 'CLINIC', 'PHARMACY', 'POLICE', 'FIRE_STATION')
    `;
        const hospitals = [];
        const clinics = [];
        const pharmacies = [];
        const police = [];
        const fireStations = [];
        places.forEach(p => {
            var _a, _b;
            const canonicalType = ((_a = p.metadata) === null || _a === void 0 ? void 0 : _a.canonicalType) || 'OTHER';
            const item = {
                placeId: p.id,
                name: p.nameCN,
                nameEN: p.nameEN || undefined,
                lat: p.lat,
                lng: p.lng,
                canonicalType,
                tags: ((_b = p.metadata) === null || _b === void 0 ? void 0 : _b.rawTags) || {},
            };
            switch (canonicalType) {
                case 'HOSPITAL':
                    hospitals.push(item);
                    break;
                case 'CLINIC':
                    clinics.push(item);
                    break;
                case 'PHARMACY':
                    pharmacies.push(item);
                    break;
                case 'POLICE':
                    police.push(item);
                    break;
                case 'FIRE_STATION':
                    fireStations.push(item);
                    break;
            }
        });
        return {
            hospitals,
            clinics,
            pharmacies,
            police,
            fireStations,
            total: places.length,
        };
    }
    async getSupplyPoints(region) {
        const places = await this.prisma.$queryRaw `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'regionKey' = ${region}
        AND metadata->>'canonicalType' IN ('FUEL_STATION', 'SUPERMARKET', 'CONVENIENCE_STORE', 'TOILETS')
    `;
        const fuelStations = [];
        const supermarkets = [];
        const convenienceStores = [];
        const toilets = [];
        places.forEach(p => {
            var _a, _b;
            const canonicalType = ((_a = p.metadata) === null || _a === void 0 ? void 0 : _a.canonicalType) || 'OTHER';
            const item = {
                placeId: p.id,
                name: p.nameCN,
                nameEN: p.nameEN || undefined,
                lat: p.lat,
                lng: p.lng,
                canonicalType,
                tags: ((_b = p.metadata) === null || _b === void 0 ? void 0 : _b.rawTags) || {},
            };
            switch (canonicalType) {
                case 'FUEL_STATION':
                    fuelStations.push(item);
                    break;
                case 'SUPERMARKET':
                    supermarkets.push(item);
                    break;
                case 'CONVENIENCE_STORE':
                    convenienceStores.push(item);
                    break;
                case 'TOILETS':
                    toilets.push(item);
                    break;
            }
        });
        return {
            fuelStations,
            supermarkets,
            convenienceStores,
            toilets,
            total: places.length,
        };
    }
    async getServicePoints(region) {
        const places = await this.prisma.$queryRaw `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'regionKey' = ${region}
        AND metadata->>'canonicalType' IN (
          'INFORMATION_CENTER',
          'TOUR_OPERATOR',
          'CAR_RENTAL',
          'CAMPING',
          'SPA_POOL'
        )
    `;
        const informationCenters = [];
        const tourOperators = [];
        const carRentals = [];
        const camping = [];
        const spaPools = [];
        places.forEach(p => {
            var _a, _b;
            const canonicalType = ((_a = p.metadata) === null || _a === void 0 ? void 0 : _a.canonicalType) || 'OTHER';
            const item = {
                placeId: p.id,
                name: p.nameCN,
                nameEN: p.nameEN || undefined,
                lat: p.lat,
                lng: p.lng,
                canonicalType,
                tags: ((_b = p.metadata) === null || _b === void 0 ? void 0 : _b.rawTags) || {},
            };
            switch (canonicalType) {
                case 'INFORMATION_CENTER':
                    informationCenters.push(item);
                    break;
                case 'TOUR_OPERATOR':
                    tourOperators.push(item);
                    break;
                case 'CAR_RENTAL':
                    carRentals.push(item);
                    break;
                case 'CAMPING':
                    camping.push(item);
                    break;
                case 'SPA_POOL':
                    spaPools.push(item);
                    break;
            }
        });
        return {
            informationCenters,
            tourOperators,
            carRentals,
            camping,
            spaPools,
            total: places.length,
        };
    }
};
exports.IcelandPoiFeaturesService = IcelandPoiFeaturesService;
exports.IcelandPoiFeaturesService = IcelandPoiFeaturesService = IcelandPoiFeaturesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], IcelandPoiFeaturesService);
//# sourceMappingURL=iceland-poi-features.service.js.map