"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var NaturePoiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NaturePoiService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const geojson_validator_util_1 = require("../utils/geojson-validator.util");
let NaturePoiService = NaturePoiService_1 = class NaturePoiService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(NaturePoiService_1.name);
    }
    async importFromGeoJSON(geojson, source, countryCode, cityId, validate = true) {
        var _a, _b;
        let validationResult;
        if (validate) {
            validationResult = (0, geojson_validator_util_1.validateGeoJSON)(geojson);
            if (!validationResult.valid) {
                this.logger.warn('GeoJSON 验证失败:', validationResult.errors);
            }
            if (validationResult.warnings.length > 0) {
                this.logger.warn('GeoJSON 验证警告:', validationResult.warnings);
            }
        }
        const results = [];
        let created = 0;
        let skipped = 0;
        let errors = 0;
        for (const feature of geojson.features) {
            try {
                if (validate) {
                    const propValidation = (0, geojson_validator_util_1.validateNaturePoiProperties)(feature.properties);
                    if (!propValidation.valid && propValidation.errors.length > 0) {
                        this.logger.warn(`Feature ${results.length}: Properties 验证失败`, propValidation.errors);
                    }
                }
                const coordinates = this.extractCoordinates(feature.geometry);
                if (!coordinates) {
                    errors++;
                    results.push({
                        name: feature.properties.name || 'Unknown',
                        status: 'error',
                        error: '无法解析坐标',
                    });
                    continue;
                }
                const name = this.extractName(feature.properties);
                const poiName = {
                    primary: name.primary,
                    en: name.en,
                    zh: name.zh,
                    local: name.local,
                };
                const naturePoi = {
                    id: (0, crypto_1.randomUUID)(),
                    externalId: ((_a = feature.properties.id) === null || _a === void 0 ? void 0 : _a.toString()) || ((_b = feature.properties.OBJECTID) === null || _b === void 0 ? void 0 : _b.toString()),
                    externalSource: source,
                    geometryType: this.mapGeometryType(feature.geometry.type),
                    coordinates,
                    name: poiName,
                    countryCode,
                    mainCategory: 'nature',
                    subCategory: this.mapSubCategory(feature.properties),
                    tags: this.extractTags(feature.properties),
                    rawProperties: feature.properties,
                    elevationMeters: feature.properties.elevation || feature.properties.ELEVATION,
                    bestSeasons: this.extractBestSeasons(feature.properties),
                    accessType: this.extractAccessType(feature.properties),
                    trailDifficulty: this.extractTrailDifficulty(feature.properties),
                    requiresGuide: feature.properties.requiresGuide || feature.properties.REQUIRES_GUIDE === 'Y',
                    hazardLevel: this.extractHazardLevel(feature.properties),
                    safetyNotes: this.extractSafetyNotes(feature.properties),
                    lastEruptionYear: feature.properties.lastEruptionYear || feature.properties.LAST_ERUPT,
                    isActiveVolcano: feature.properties.isActiveVolcano || feature.properties.STATUS === 'active',
                    protectedAreaName: feature.properties.protectedAreaName || feature.properties.PROTECTED_AREA,
                };
                const existing = await this.findExistingPoi(naturePoi);
                if (existing) {
                    skipped++;
                    results.push({
                        name: poiName.primary,
                        status: 'skipped',
                    });
                    continue;
                }
                await this.saveNaturePoiAsPlace(naturePoi, cityId);
                created++;
                results.push({
                    name: poiName.primary,
                    status: 'created',
                });
            }
            catch (error) {
                errors++;
                results.push({
                    name: feature.properties.name || 'Unknown',
                    status: 'error',
                    error: error.message,
                });
                this.logger.error(`导入 POI 失败: ${error.message}`, error.stack);
            }
        }
        return {
            total: geojson.features.length,
            created,
            skipped,
            errors,
            results,
            validation: validationResult,
        };
    }
    async findNaturePoisByArea(center, radiusMeters = 5000, subCategory) {
        const categoryFilter = subCategory
            ? client_1.Prisma.sql `AND metadata->>'subCategory' = ${subCategory}`
            : client_1.Prisma.sql ``;
        const places = await this.prisma.$queryRaw `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        metadata,
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
      FROM "Place"
      WHERE 
        category = 'ATTRACTION'
        AND metadata->>'mainCategory' = 'nature'
        AND location IS NOT NULL
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${center.lng}, ${center.lat}), 4326)::geography,
          ${radiusMeters}
        )
        ${categoryFilter}
      ORDER BY ST_Distance(
        location,
        ST_SetSRID(ST_MakePoint(${center.lng}, ${center.lat}), 4326)::geography
      ) ASC
      LIMIT 100;
    `;
        return places.map(place => this.placeToNaturePoi(place));
    }
    async findNaturePoisByCategory(subCategory, countryCode, limit = 100) {
        const countryFilter = countryCode
            ? client_1.Prisma.sql `AND metadata->>'countryCode' = ${countryCode}`
            : client_1.Prisma.sql ``;
        const places = await this.prisma.$queryRaw `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        metadata,
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
      FROM "Place"
      WHERE 
        category = 'ATTRACTION'
        AND metadata->>'mainCategory' = 'nature'
        AND metadata->>'subCategory' = ${subCategory}
        AND location IS NOT NULL
        ${countryFilter}
      LIMIT ${limit};
    `;
        return places.map(place => this.placeToNaturePoi(place));
    }
    extractCoordinates(geometry) {
        if (geometry.type === 'Point') {
            const [lng, lat] = geometry.coordinates;
            return { lat, lng };
        }
        if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
            const coords = geometry.type === 'Polygon'
                ? geometry.coordinates[0]
                : geometry.coordinates[0][0];
            if (coords && coords.length > 0) {
                const [lng, lat] = coords[0];
                return { lat, lng };
            }
        }
        return null;
    }
    extractName(properties) {
        return {
            primary: properties.name || properties.NAME || properties.name_en || 'Unnamed',
            en: properties.name_en || properties.NAME_EN || properties.name,
            zh: properties.name_zh || properties.NAME_ZH,
            local: properties.name_local || properties.NAME_LOCAL || properties.name_is,
        };
    }
    mapGeometryType(type) {
        if (type === 'Point')
            return 'point';
        if (type === 'Polygon' || type === 'MultiPolygon')
            return 'polygon';
        if (type === 'LineString' || type === 'MultiLineString')
            return 'line';
        return 'point';
    }
    mapSubCategory(properties) {
        const category = properties.subCategory
            || properties.SUB_CATEGORY
            || properties.type
            || properties.TYPE
            || properties.category
            || properties.CATEGORY
            || 'other';
        const normalized = category.toLowerCase().replace(/[_\s]/g, '_');
        const mapping = {
            'volcano': 'volcano',
            'volcanic': 'volcano',
            'lava_field': 'lava_field',
            'lava': 'lava_field',
            'geothermal': 'geothermal_area',
            'geothermal_area': 'geothermal_area',
            'hot_spring': 'hot_spring',
            'hotspring': 'hot_spring',
            'glacier': 'glacier',
            'glacier_lagoon': 'glacier_lagoon',
            'waterfall': 'waterfall',
            'canyon': 'canyon',
            'crater_lake': 'crater_lake',
            'black_sand_beach': 'black_sand_beach',
            'sea_cliff': 'sea_cliff',
            'national_park': 'national_park',
            'nature_reserve': 'nature_reserve',
            'viewpoint': 'viewpoint',
            'cave': 'cave',
            'coastline': 'coastline',
        };
        return mapping[normalized] || 'other';
    }
    extractTags(properties) {
        if (Array.isArray(properties.tags)) {
            return properties.tags;
        }
        if (typeof properties.tags === 'string') {
            return properties.tags.split(',').map((t) => t.trim());
        }
        return [];
    }
    extractBestSeasons(properties) {
        const seasons = properties.bestSeasons || properties.BEST_SEASONS;
        if (Array.isArray(seasons)) {
            return seasons.filter((s) => ['spring', 'summer', 'autumn', 'winter'].includes(s.toLowerCase()));
        }
        return undefined;
    }
    extractAccessType(properties) {
        const accessType = properties.accessType || properties.ACCESS_TYPE;
        if (!accessType)
            return undefined;
        const normalized = accessType.toLowerCase().replace(/[_\s]/g, '_');
        const validTypes = ['drive', 'hike', '4x4', 'guided_only', 'boat', 'unknown'];
        if (validTypes.includes(normalized)) {
            return normalized;
        }
        return 'unknown';
    }
    extractTrailDifficulty(properties) {
        const difficulty = properties.trailDifficulty || properties.TRAIL_DIFFICULTY;
        if (!difficulty)
            return undefined;
        const normalized = difficulty.toLowerCase();
        const validTypes = ['easy', 'moderate', 'hard', 'expert', 'unknown'];
        if (validTypes.includes(normalized)) {
            return normalized;
        }
        return 'unknown';
    }
    extractHazardLevel(properties) {
        const level = properties.hazardLevel || properties.HAZARD_LEVEL;
        if (!level)
            return undefined;
        const normalized = level.toLowerCase();
        const validTypes = ['low', 'medium', 'high', 'extreme', 'unknown'];
        if (validTypes.includes(normalized)) {
            return normalized;
        }
        return 'unknown';
    }
    extractSafetyNotes(properties) {
        if (Array.isArray(properties.safetyNotes)) {
            return properties.safetyNotes;
        }
        if (typeof properties.safetyNotes === 'string') {
            return [properties.safetyNotes];
        }
        return undefined;
    }
    async findExistingPoi(poi) {
        if (poi.externalId) {
            const existing = await this.prisma.$queryRaw `
        SELECT id FROM "Place"
        WHERE metadata->>'externalId' = ${poi.externalId}
          AND metadata->>'externalSource' = ${poi.externalSource}
        LIMIT 1
      `;
            if (existing.length > 0) {
                return existing[0];
            }
        }
        const existing = await this.prisma.$queryRaw `
      SELECT id FROM "Place"
      WHERE "nameEN" = ${poi.name.en || poi.name.primary}
        AND location IS NOT NULL
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${poi.coordinates.lng}, ${poi.coordinates.lat}), 4326)::geography,
          100
        )
      LIMIT 1
    `;
        return existing.length > 0 ? existing[0] : null;
    }
    async saveNaturePoiAsPlace(poi, cityId) {
        var _a;
        const metadata = {
            mainCategory: poi.mainCategory,
            subCategory: poi.subCategory,
            externalSource: poi.externalSource,
            externalId: poi.externalId,
            countryCode: poi.countryCode,
            region: poi.region,
            tags: poi.tags,
            elevationMeters: poi.elevationMeters,
            typicalStay: poi.typicalStay,
            bestSeasons: poi.bestSeasons,
            bestTimeOfDay: poi.bestTimeOfDay,
            accessType: poi.accessType,
            trailDifficulty: poi.trailDifficulty,
            requiresGuide: poi.requiresGuide,
            hazardLevel: poi.hazardLevel,
            safetyNotes: poi.safetyNotes,
            lastEruptionYear: poi.lastEruptionYear,
            isActiveVolcano: poi.isActiveVolcano,
            protectedAreaName: poi.protectedAreaName,
            rawProperties: poi.rawProperties,
        };
        const { PhysicalMetadataGenerator } = await Promise.resolve().then(() => __importStar(require('../utils/physical-metadata-generator.util')));
        const physicalMetadata = PhysicalMetadataGenerator.generateFromNaturePoi(metadata);
        const place = await this.prisma.place.create({
            data: {
                uuid: (0, crypto_1.randomUUID)(),
                nameCN: poi.name.zh || poi.name.primary,
                nameEN: poi.name.en || poi.name.primary,
                category: 'ATTRACTION',
                cityId: cityId || null,
                address: ((_a = poi.rawProperties) === null || _a === void 0 ? void 0 : _a.address) || null,
                metadata: metadata,
                physicalMetadata: physicalMetadata,
                updatedAt: new Date(),
            },
        });
        await this.prisma.$executeRaw `
      UPDATE "Place"
      SET location = ST_SetSRID(ST_MakePoint(${poi.coordinates.lng}, ${poi.coordinates.lat}), 4326)
      WHERE id = ${place.id}
    `;
    }
    placeToNaturePoi(place) {
        const metadata = place.metadata || {};
        const coordinates = { lat: place.lat, lng: place.lng };
        return {
            id: place.id.toString(),
            externalId: metadata.externalId,
            externalSource: metadata.externalSource,
            geometryType: 'point',
            coordinates,
            name: {
                primary: place.nameEN || place.nameCN,
                en: place.nameEN || undefined,
                zh: place.nameCN || undefined,
            },
            countryCode: metadata.countryCode || 'IS',
            region: metadata.region,
            mainCategory: 'nature',
            subCategory: metadata.subCategory || 'other',
            tags: metadata.tags || [],
            rawProperties: metadata.rawProperties,
            elevationMeters: metadata.elevationMeters,
            typicalStay: metadata.typicalStay,
            bestSeasons: metadata.bestSeasons,
            bestTimeOfDay: metadata.bestTimeOfDay,
            accessType: metadata.accessType,
            trailDifficulty: metadata.trailDifficulty,
            requiresGuide: metadata.requiresGuide,
            hazardLevel: metadata.hazardLevel,
            safetyNotes: metadata.safetyNotes,
            lastEruptionYear: metadata.lastEruptionYear,
            isActiveVolcano: metadata.isActiveVolcano,
            protectedAreaName: metadata.protectedAreaName,
        };
    }
};
exports.NaturePoiService = NaturePoiService;
exports.NaturePoiService = NaturePoiService = NaturePoiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NaturePoiService);
//# sourceMappingURL=nature-poi.service.js.map