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
var ReadinessController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessController = exports.CheckReadinessDto = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
const readiness_service_1 = require("./services/readiness.service");
const capability_pack_evaluator_service_1 = require("./services/capability-pack-evaluator.service");
const packs_1 = require("./packs");
const standard_response_dto_1 = require("../../common/dto/standard-response.dto");
const api_response_dto_1 = require("../../common/dto/api-response.dto");
const prisma_service_1 = require("../../prisma/prisma.service");
const luxon_1 = require("luxon");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
const users_service_1 = require("../../users/users.service");
const current_user_decorator_1 = require("../../auth/decorators/current-user.decorator");
const checklist_status_service_1 = require("./services/checklist-status.service");
const finding_marks_service_1 = require("./services/finding-marks.service");
const packing_list_service_1 = require("./services/packing-list.service");
const packing_template_service_1 = require("./services/packing-template.service");
const solution_service_1 = require("./services/solution.service");
const readiness_ai_service_1 = require("./services/readiness-ai.service");
const readiness_feature_flags_service_1 = require("./services/readiness-feature-flags.service");
const capability_pack_checklist_service_1 = require("./services/capability-pack-checklist.service");
const risk_type_mapper_service_1 = require("./services/risk-type-mapper.service");
const coverage_map_service_1 = require("./services/coverage-map.service");
const checklist_status_dto_1 = require("./dto/checklist-status.dto");
const finding_mark_dto_1 = require("./dto/finding-mark.dto");
const packing_list_dto_1 = require("./dto/packing-list.dto");
const common_2 = require("@nestjs/common");
const trip_conflicts_service_1 = require("../services/trip-conflicts.service");
const trip_conflicts_dto_1 = require("../dto/trip-conflicts.dto");
const pack_storage_service_1 = require("./storage/pack-storage.service");
const admin_pack_dto_1 = require("./dto/admin-pack.dto");
const user_decision_service_1 = require("./services/user-decision.service");
const readiness_to_constraints_compiler_1 = require("./compilers/readiness-to-constraints.compiler");
const pack_serializer_util_1 = require("./utils/pack-serializer.util");
const pack_deserializer_util_1 = require("./utils/pack-deserializer.util");
class TravelerDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TravelerDto.prototype, "nationality", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TravelerDto.prototype, "residencyCountry", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], TravelerDto.prototype, "tags", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TravelerDto.prototype, "budgetLevel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TravelerDto.prototype, "riskTolerance", void 0);
class TripDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TripDto.prototype, "startDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TripDto.prototype, "endDate", void 0);
class ItineraryDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], ItineraryDto.prototype, "countries", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], ItineraryDto.prototype, "activities", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ItineraryDto.prototype, "season", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ItineraryDto.prototype, "region", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ItineraryDto.prototype, "hasSeaCrossing", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ItineraryDto.prototype, "hasAuroraActivity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ItineraryDto.prototype, "vehicleType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ItineraryDto.prototype, "routeLength", void 0);
class MountainsDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], MountainsDto.prototype, "inMountain", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MountainsDto.prototype, "mountainElevationAvg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MountainsDto.prototype, "terrainComplexity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], MountainsDto.prototype, "hasMountainPass", void 0);
class RoadsDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RoadsDto.prototype, "nearRoad", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RoadsDto.prototype, "roadDensityScore", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RoadsDto.prototype, "hasMountainPass", void 0);
class SafetyDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SafetyDto.prototype, "hasHospital", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SafetyDto.prototype, "hasPolice", void 0);
class SupplyDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SupplyDto.prototype, "hasFuel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SupplyDto.prototype, "hasSupermarket", void 0);
class PoisDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], PoisDto.prototype, "supplyDensity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PoisDto.prototype, "hasCheckpoint", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => SafetyDto),
    __metadata("design:type", SafetyDto)
], PoisDto.prototype, "safety", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => SupplyDto),
    __metadata("design:type", SupplyDto)
], PoisDto.prototype, "supply", void 0);
class GeoDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], GeoDto.prototype, "lat", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], GeoDto.prototype, "lng", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], GeoDto.prototype, "enhanceWithGeo", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MountainsDto),
    __metadata("design:type", MountainsDto)
], GeoDto.prototype, "mountains", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RoadsDto),
    __metadata("design:type", RoadsDto)
], GeoDto.prototype, "roads", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => PoisDto),
    __metadata("design:type", PoisDto)
], GeoDto.prototype, "pois", void 0);
class CheckReadinessDto {
}
exports.CheckReadinessDto = CheckReadinessDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CheckReadinessDto.prototype, "destinationId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TravelerDto),
    __metadata("design:type", TravelerDto)
], CheckReadinessDto.prototype, "traveler", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TripDto),
    __metadata("design:type", TripDto)
], CheckReadinessDto.prototype, "trip", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ItineraryDto),
    __metadata("design:type", ItineraryDto)
], CheckReadinessDto.prototype, "itinerary", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => GeoDto),
    __metadata("design:type", GeoDto)
], CheckReadinessDto.prototype, "geo", void 0);
let ReadinessController = ReadinessController_1 = class ReadinessController {
    constructor(readinessService, capabilityPackEvaluator, prisma, usersService, checklistStatusService, findingMarksService, packingListService, packingTemplateService, solutionService, packStorageService, readinessAIService, featureFlagsService, capabilityPackChecklistService, userDecisionService, constraintsCompiler, coverageMapService, riskTypeMapperService, moduleRef) {
        this.readinessService = readinessService;
        this.capabilityPackEvaluator = capabilityPackEvaluator;
        this.prisma = prisma;
        this.usersService = usersService;
        this.checklistStatusService = checklistStatusService;
        this.findingMarksService = findingMarksService;
        this.packingListService = packingListService;
        this.packingTemplateService = packingTemplateService;
        this.solutionService = solutionService;
        this.packStorageService = packStorageService;
        this.readinessAIService = readinessAIService;
        this.featureFlagsService = featureFlagsService;
        this.capabilityPackChecklistService = capabilityPackChecklistService;
        this.userDecisionService = userDecisionService;
        this.constraintsCompiler = constraintsCompiler;
        this.coverageMapService = coverageMapService;
        this.riskTypeMapperService = riskTypeMapperService;
        this.moduleRef = moduleRef;
        this.logger = new common_1.Logger(ReadinessController_1.name);
    }
    getTripConflictsService() {
        if (!this.tripConflictsService) {
            try {
                this.tripConflictsService = this.moduleRef.get(trip_conflicts_service_1.TripConflictsService, { strict: false });
            }
            catch (error) {
                this.logger.warn('无法获取 TripConflictsService，时间冲突检查功能将不可用');
                return null;
            }
        }
        return this.tripConflictsService || null;
    }
    async checkReadiness(dto) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        try {
            const context = {
                traveler: dto.traveler || {},
                trip: dto.trip || {},
                itinerary: {
                    countries: ((_a = dto.itinerary) === null || _a === void 0 ? void 0 : _a.countries) || [],
                    activities: ((_b = dto.itinerary) === null || _b === void 0 ? void 0 : _b.activities) || [],
                    season: (_c = dto.itinerary) === null || _c === void 0 ? void 0 : _c.season,
                },
                geo: ((_d = dto.geo) === null || _d === void 0 ? void 0 : _d.lat) && ((_e = dto.geo) === null || _e === void 0 ? void 0 : _e.lng) ? {
                    latitude: dto.geo.lat,
                } : undefined,
            };
            const result = await this.readinessService.checkFromDestination(dto.destinationId, context, {
                enhanceWithGeo: (_g = (_f = dto.geo) === null || _f === void 0 ? void 0 : _f.enhanceWithGeo) !== null && _g !== void 0 ? _g : true,
                geoLat: (_h = dto.geo) === null || _h === void 0 ? void 0 : _h.lat,
                geoLng: (_j = dto.geo) === null || _j === void 0 ? void 0 : _j.lng,
                lang: dto.lang || 'en',
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to check readiness: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)('READINESS_CHECK_FAILED', err.message);
        }
    }
    async getTripReadiness(tripId, lang, user) {
        var _a, _b, _c;
        try {
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
                        orderBy: { date: 'asc' },
                    },
                },
            });
            if (!trip) {
                throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
            }
            const startDate = luxon_1.DateTime.fromJSDate(trip.startDate).toISODate();
            const endDate = luxon_1.DateTime.fromJSDate(trip.endDate).toISODate();
            const activitySet = new Set();
            const poiCanonicalTypeSet = new Set();
            const coordinates = [];
            for (const day of trip.TripDay) {
                for (const item of day.ItineraryItem) {
                    if (item.Place) {
                        const coords = this.extractPlaceCoordinates(item.Place);
                        if (coords) {
                            coordinates.push(coords);
                        }
                        const placeMetadata = item.Place.metadata || {};
                        const canonicalType = placeMetadata.canonicalType;
                        if (canonicalType) {
                            poiCanonicalTypeSet.add(canonicalType);
                        }
                        if (canonicalType) {
                            if (canonicalType.includes('GLACIER') || canonicalType.includes('VOLCANO')) {
                                activitySet.add('hiking');
                                activitySet.add('outdoor');
                                activitySet.add('nature');
                            }
                            if (canonicalType.includes('VOLCANO')) {
                                activitySet.add('volcano');
                            }
                            if (canonicalType.includes('GEYSER') || canonicalType.includes('HOT_SPRING') || canonicalType === 'SPA_POOL') {
                                activitySet.add('geothermal');
                                activitySet.add('hot_springs');
                            }
                            if (canonicalType === 'TRAILHEAD') {
                                activitySet.add('hiking');
                                activitySet.add('outdoor');
                            }
                            if (canonicalType === 'ATTRACTION_NATURE_BEACH') {
                                activitySet.add('beach');
                                activitySet.add('coastal');
                            }
                            if (canonicalType === 'CAMPING') {
                                activitySet.add('camping');
                            }
                            if (canonicalType === 'FUEL_STATION') {
                                activitySet.add('driving');
                            }
                        }
                        const category = ((_a = item.Place.category) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
                        if (category.includes('hiking') || category.includes('trail')) {
                            activitySet.add('hiking');
                            activitySet.add('outdoor');
                        }
                        if (category.includes('tour') || category.includes('activity')) {
                            activitySet.add('tour');
                        }
                        if (category.includes('sightseeing') || category.includes('attraction')) {
                            activitySet.add('sightseeing');
                        }
                        if (category.includes('nature') || category.includes('natural')) {
                            activitySet.add('nature');
                            activitySet.add('outdoor');
                        }
                        const name = (item.Place.nameEN || item.Place.nameCN || '').toLowerCase();
                        if (name.includes('snowmobile') || name.includes('雪地摩托')) {
                            activitySet.add('snowmobile');
                        }
                        if (name.includes('dog') && (name.includes('sled') || name.includes('拉'))) {
                            activitySet.add('dog_sled');
                        }
                        if (name.includes('boat') || name.includes('船')) {
                            activitySet.add('boat_tour');
                        }
                        if (name.includes('wildlife') || name.includes('野生动物')) {
                            activitySet.add('wildlife');
                        }
                        if (name.includes('volcano') || name.includes('火山')) {
                            activitySet.add('volcano');
                        }
                        if (name.includes('glacier') || name.includes('冰川')) {
                            activitySet.add('hiking');
                            activitySet.add('outdoor');
                        }
                        if (name.includes('geothermal') || name.includes('地热') || name.includes('温泉')) {
                            activitySet.add('geothermal');
                            activitySet.add('hot_springs');
                        }
                    }
                }
            }
            let season;
            if (startDate) {
                const month = new Date(startDate + 'T00:00:00Z').getUTCMonth() + 1;
                if (month >= 12 || month <= 2) {
                    season = 'winter';
                }
                else if (month >= 6 && month <= 8) {
                    season = 'summer';
                }
                else {
                    season = 'shoulder';
                }
            }
            let userProfile = null;
            if (user === null || user === void 0 ? void 0 : user.userId) {
                try {
                    userProfile = await this.usersService.getProfile(user.userId);
                }
                catch (error) {
                    this.logger.warn(`Failed to get user profile for userId ${user.userId}: ${error}`);
                }
            }
            const metadata = trip.metadata || {};
            const preferences = metadata.preferences || {};
            const userPreferences = (userProfile === null || userProfile === void 0 ? void 0 : userProfile.preferences) || {};
            const context = {
                traveler: {
                    nationality: userPreferences.nationality || 'CN',
                    residencyCountry: userPreferences.residencyCountry || undefined,
                    tags: userPreferences.tags || undefined,
                    budgetLevel: preferences.budgetLevel || ((_c = (_b = userPreferences.travelPreferences) === null || _b === void 0 ? void 0 : _b.budget) === null || _c === void 0 ? void 0 : _c.toLowerCase()) || 'medium',
                    riskTolerance: preferences.riskTolerance || 'medium',
                },
                trip: {
                    startDate: startDate || undefined,
                    endDate: endDate || undefined,
                },
                itinerary: {
                    countries: [trip.destination],
                    activities: Array.from(activitySet).length > 0 ? Array.from(activitySet) : undefined,
                    season,
                    poiCanonicalTypes: Array.from(poiCanonicalTypeSet).length > 0 ? Array.from(poiCanonicalTypeSet) : undefined,
                    hasRemoteAreas: this.inferHasRemoteAreas(activitySet, poiCanonicalTypeSet),
                    requires4x4: this.inferRequires4x4(activitySet, poiCanonicalTypeSet),
                },
            };
            const geoLat = coordinates.length > 0 ? coordinates[0].lat : undefined;
            const geoLng = coordinates.length > 0 ? coordinates[0].lng : undefined;
            const result = await this.readinessService.checkFromDestination(trip.destination, context, {
                enhanceWithGeo: !!(geoLat && geoLng),
                geoLat,
                geoLng,
                lang: lang || 'en',
            });
            if (result.findings && result.findings.length > 0) {
                const poiMap = new Map();
                try {
                    if (trip.TripDay) {
                        trip.TripDay.forEach((day, dayIndex) => {
                            var _a;
                            (_a = day.ItineraryItem) === null || _a === void 0 ? void 0 : _a.forEach((item) => {
                                if (item.Place) {
                                    const placeId = item.Place.id;
                                    if (!poiMap.has(placeId)) {
                                        poiMap.set(placeId, {
                                            name: item.Place.nameEN || item.Place.nameCN || `POI ${placeId}`,
                                            nameCN: item.Place.nameCN,
                                            day: dayIndex + 1,
                                        });
                                    }
                                }
                            });
                        });
                    }
                }
                catch (poiError) {
                    this.logger.warn(`构建POI映射失败，风险信息将不包含POI详情: ${poiError.message}`);
                }
                result.findings = result.findings.map((finding) => {
                    if (finding.risks && finding.risks.length > 0) {
                        finding.risks = finding.risks.map((r) => {
                            const baseRisk = {
                                ...r,
                                sourceType: 'readiness',
                                severity: (r.severity || 'medium'),
                                affectedPois: (r.affectedPois || []).map((poiId) => {
                                    const poiIdNum = typeof poiId === 'string' ? parseInt(poiId, 10) : poiId;
                                    const poiInfo = poiMap.get(poiIdNum);
                                    if (poiInfo) {
                                        return {
                                            id: poiIdNum.toString(),
                                            name: poiInfo.name,
                                            nameCN: poiInfo.nameCN,
                                            day: poiInfo.day,
                                        };
                                    }
                                    return {
                                        id: poiIdNum.toString(),
                                        name: `POI ${poiIdNum}`,
                                        day: undefined,
                                    };
                                }),
                            };
                            return this.riskTypeMapperService.enhanceRisk(baseRisk, lang || 'zh');
                        });
                    }
                    return finding;
                });
            }
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            if (err instanceof common_1.NotFoundException) {
                this.logger.error(`Trip not found: ${tripId}`);
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, err.message);
            }
            this.logger.error(`Failed to check trip readiness: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)('READINESS_CHECK_FAILED', err.message);
        }
    }
    async getCapabilityPacks() {
        var _a, _b, _c, _d, _e;
        try {
            const packs = [
                {
                    type: packs_1.highAltitudePack.type,
                    displayName: packs_1.highAltitudePack.displayName,
                    description: (_a = packs_1.highAltitudePack.metadata) === null || _a === void 0 ? void 0 : _a.description,
                },
                {
                    type: packs_1.sparseSupplyPack.type,
                    displayName: packs_1.sparseSupplyPack.displayName,
                    description: (_b = packs_1.sparseSupplyPack.metadata) === null || _b === void 0 ? void 0 : _b.description,
                },
                {
                    type: packs_1.seasonalRoadPack.type,
                    displayName: packs_1.seasonalRoadPack.displayName,
                    description: (_c = packs_1.seasonalRoadPack.metadata) === null || _c === void 0 ? void 0 : _c.description,
                },
                {
                    type: packs_1.permitCheckpointPack.type,
                    displayName: packs_1.permitCheckpointPack.displayName,
                    description: (_d = packs_1.permitCheckpointPack.metadata) === null || _d === void 0 ? void 0 : _d.description,
                },
                {
                    type: packs_1.emergencyPack.type,
                    displayName: packs_1.emergencyPack.displayName,
                    description: (_e = packs_1.emergencyPack.metadata) === null || _e === void 0 ? void 0 : _e.description,
                },
            ];
            return (0, standard_response_dto_1.successResponse)({ packs });
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get capability packs: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)('GET_CAPABILITY_PACKS_FAILED', err.message);
        }
    }
    async evaluateCapabilityPacks(dto, autoEnhanceGeo) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
            let geoData = dto.geo ? {
                latitude: dto.geo.lat,
                longitude: dto.geo.lng,
                mountains: dto.geo.mountains,
                roads: dto.geo.roads,
                pois: dto.geo.pois,
            } : undefined;
            let geoEnhanced = false;
            if (autoEnhanceGeo === 'true' && dto.destinationId && (!dto.geo || dto.geo.enhanceWithGeo)) {
                try {
                    const geoFacts = await this.readinessService.getGeoFactsForDestination(dto.destinationId);
                    if (geoFacts) {
                        geoData = {
                            ...geoData,
                            latitude: geoFacts.latitude || (geoData === null || geoData === void 0 ? void 0 : geoData.latitude),
                            longitude: geoFacts.longitude || (geoData === null || geoData === void 0 ? void 0 : geoData.longitude),
                            mountains: geoFacts.mountains || (geoData === null || geoData === void 0 ? void 0 : geoData.mountains),
                            roads: geoFacts.roads || (geoData === null || geoData === void 0 ? void 0 : geoData.roads),
                            pois: geoFacts.pois || (geoData === null || geoData === void 0 ? void 0 : geoData.pois),
                        };
                        geoEnhanced = true;
                    }
                }
                catch (geoError) {
                    this.logger.warn(`Failed to auto-enhance geo for ${dto.destinationId}: ${geoError.message}`);
                }
            }
            let season = (_a = dto.itinerary) === null || _a === void 0 ? void 0 : _a.season;
            if (!season && ((_b = dto.trip) === null || _b === void 0 ? void 0 : _b.startDate)) {
                const startDate = new Date(dto.trip.startDate);
                const month = startDate.getMonth() + 1;
                if (month >= 12 || month <= 2) {
                    season = 'winter';
                }
                else if (month >= 3 && month <= 5) {
                    season = 'spring';
                }
                else if (month >= 6 && month <= 8) {
                    season = 'summer';
                }
                else {
                    season = 'autumn';
                }
                this.logger.debug(`Auto-calculated season from trip date: ${season}`);
            }
            if (dto.destinationId === 'IS' || ((_d = (_c = dto.itinerary) === null || _c === void 0 ? void 0 : _c.countries) === null || _d === void 0 ? void 0 : _d.includes('IS'))) {
                const icelandGeo = geoData || {};
                if (!icelandGeo.mountains) {
                    icelandGeo.mountains = {
                        inMountain: true,
                        hasMountainPass: true,
                    };
                }
                if (!icelandGeo.roads) {
                    icelandGeo.roads = {
                        hasMountainPass: true,
                        roadDensityScore: 0.15,
                    };
                }
                if (!icelandGeo.pois) {
                    icelandGeo.pois = {
                        supplyDensity: 0.15,
                        hasCheckpoint: false,
                    };
                }
                if (!icelandGeo.pois.safety) {
                    icelandGeo.pois.safety = {
                        hasHospital: false,
                        hasPolice: false,
                    };
                }
                geoData = icelandGeo;
                this.logger.debug(`Enhanced Iceland geo data: mountains=${JSON.stringify(icelandGeo.mountains)}, roads=${JSON.stringify(icelandGeo.roads)}, pois=${JSON.stringify(icelandGeo.pois)}`);
            }
            const context = {
                traveler: dto.traveler || {},
                trip: dto.trip || {},
                itinerary: {
                    countries: ((_e = dto.itinerary) === null || _e === void 0 ? void 0 : _e.countries) || [],
                    activities: ((_f = dto.itinerary) === null || _f === void 0 ? void 0 : _f.activities) || [],
                    season: season,
                    routeLength: (_g = dto.itinerary) === null || _g === void 0 ? void 0 : _g.routeLength,
                },
                geo: geoData,
            };
            const allPacks = [
                packs_1.highAltitudePack,
                packs_1.sparseSupplyPack,
                packs_1.seasonalRoadPack,
                packs_1.permitCheckpointPack,
                packs_1.emergencyPack,
            ];
            const results = allPacks.map(pack => {
                const result = this.capabilityPackEvaluator.evaluatePack(pack, context);
                let triggerReason;
                if (result.triggered) {
                    triggerReason = this.generateTriggerReason(pack, context);
                }
                return {
                    ...result,
                    triggerReason,
                };
            });
            const triggeredPacks = results.filter(r => r.triggered);
            return (0, standard_response_dto_1.successResponse)({
                total: allPacks.length,
                triggered: triggeredPacks.length,
                results: triggeredPacks,
                geoEnhanced,
                context: {
                    hasGeo: !!geoData,
                    hasTraveler: Object.keys(dto.traveler || {}).length > 0,
                    itinerary: {
                        countries: context.itinerary.countries,
                        activities: context.itinerary.activities,
                        season: context.itinerary.season,
                        routeLength: context.itinerary.routeLength,
                    },
                },
            });
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to evaluate capability packs: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)('EVALUATE_CAPABILITY_PACKS_FAILED', err.message);
        }
    }
    generateTriggerReason(pack, context) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        const reasons = [];
        switch (pack.type) {
            case 'high_altitude':
                if ((_b = (_a = context.geo) === null || _a === void 0 ? void 0 : _a.mountains) === null || _b === void 0 ? void 0 : _b.mountainElevationAvg) {
                    reasons.push(`平均海拔 ${context.geo.mountains.mountainElevationAvg}m`);
                }
                break;
            case 'sparse_supply':
                if (((_d = (_c = context.geo) === null || _c === void 0 ? void 0 : _c.roads) === null || _d === void 0 ? void 0 : _d.roadDensityScore) !== undefined) {
                    reasons.push(`道路密度 ${(context.geo.roads.roadDensityScore * 100).toFixed(0)}%`);
                }
                if (((_f = (_e = context.geo) === null || _e === void 0 ? void 0 : _e.pois) === null || _f === void 0 ? void 0 : _f.supplyDensity) !== undefined) {
                    reasons.push(`补给点密度 ${(context.geo.pois.supplyDensity * 100).toFixed(0)}%`);
                }
                if (context.itinerary.routeLength) {
                    reasons.push(`路线长度 ${context.itinerary.routeLength}km`);
                }
                break;
            case 'seasonal_road':
                if ((_h = (_g = context.geo) === null || _g === void 0 ? void 0 : _g.mountains) === null || _h === void 0 ? void 0 : _h.inMountain) {
                    reasons.push('山区路线');
                }
                if (context.itinerary.season === 'winter') {
                    reasons.push('冬季出行');
                }
                break;
            case 'permit_checkpoint':
                if ((_k = (_j = context.geo) === null || _j === void 0 ? void 0 : _j.pois) === null || _k === void 0 ? void 0 : _k.hasCheckpoint) {
                    reasons.push('存在检查站');
                }
                break;
            case 'emergency':
                if (((_m = (_l = context.geo) === null || _l === void 0 ? void 0 : _l.roads) === null || _m === void 0 ? void 0 : _m.roadDensityScore) !== undefined && context.geo.roads.roadDensityScore < 0.2) {
                    reasons.push('偏远地区');
                }
                if (((_q = (_p = (_o = context.geo) === null || _o === void 0 ? void 0 : _o.pois) === null || _p === void 0 ? void 0 : _p.safety) === null || _q === void 0 ? void 0 : _q.hasHospital) === false) {
                    reasons.push('附近无医院');
                }
                break;
        }
        return reasons.length > 0 ? reasons.join('、') : '满足触发条件';
    }
    async addFromCapabilityPack(tripId, dto) {
        try {
            const result = await this.capabilityPackChecklistService.addFromCapabilityPack(tripId, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to add from capability pack: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)('ADD_FROM_CAPABILITY_PACK_FAILED', err.message);
        }
    }
    async getCapabilityPackItems(tripId, packType) {
        try {
            const items = await this.capabilityPackChecklistService.getCapabilityPackItems(tripId, packType);
            const grouped = await this.capabilityPackChecklistService.getItemsGroupedByLevel(tripId);
            return (0, standard_response_dto_1.successResponse)({
                items,
                grouped,
                total: items.length,
            });
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get capability pack items: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)('GET_CAPABILITY_PACK_ITEMS_FAILED', err.message);
        }
    }
    async updateCapabilityPackItemStatus(tripId, itemId, dto) {
        try {
            const item = await this.capabilityPackChecklistService.updateItemStatus(tripId, itemId, dto.checked);
            return (0, standard_response_dto_1.successResponse)(item);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to update capability pack item status: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)('UPDATE_CAPABILITY_PACK_ITEM_STATUS_FAILED', err.message);
        }
    }
    async removeCapabilityPackItem(tripId, itemId) {
        try {
            const result = await this.capabilityPackChecklistService.removeItem(tripId, itemId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to remove capability pack item: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)('REMOVE_CAPABILITY_PACK_ITEM_FAILED', err.message);
        }
    }
    async getPersonalizedChecklist(tripId, lang, userId, currentUser) {
        try {
            const effectiveUserId = (currentUser === null || currentUser === void 0 ? void 0 : currentUser.userId) || userId;
            const baseResult = await this.readinessService.checkFromDestination(tripId, {
                traveler: {},
                trip: {},
                itinerary: {
                    countries: [],
                },
            }, {
                lang: lang || 'en',
            });
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
            });
            if (!trip) {
                throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
            }
            const startDate = new Date(trip.startDate);
            const endDate = new Date(trip.endDate);
            const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            let userProfileData = null;
            if (effectiveUserId) {
                userProfileData = await this.prisma.userProfile.findUnique({
                    where: { userId: effectiveUserId },
                });
            }
            const tripContext = this.readinessService.extractTripContext({
                context: {
                    destination: trip.destination || '',
                    startDate: trip.startDate.toISOString().split('T')[0],
                    durationDays,
                    preferences: {
                        intents: {},
                        pace: 'moderate',
                        riskTolerance: 'medium',
                    },
                },
                candidatesByDate: {},
                signals: {
                    lastUpdatedAt: new Date().toISOString(),
                },
            });
            const userProfile = effectiveUserId
                ? await this.extractUserProfile(effectiveUserId, userProfileData)
                : undefined;
            const aiEnabled = effectiveUserId &&
                (await this.featureFlagsService.isAIEnhancementEnabled(effectiveUserId, 'readiness_ai_enhancement'));
            let enhancedResult = baseResult;
            if (aiEnabled && userProfile) {
                try {
                    enhancedResult = await this.readinessAIService.enhancePersonalizedChecklist(baseResult, userProfile, tripContext, { enableAI: true });
                }
                catch (error) {
                    this.logger.warn('AI enhancement failed, using base result', error);
                }
            }
            const checklist = this.buildChecklistWithEnhancements(enhancedResult);
            return (0, standard_response_dto_1.successResponse)({
                tripId,
                checklist,
                summary: {
                    totalBlockers: checklist.blocker.length,
                    totalMust: checklist.must.length,
                    totalShould: checklist.should.length,
                    totalOptional: checklist.optional.length,
                },
                aiEnhanced: aiEnabled && !!enhancedResult.aiEnhancements,
                failedFeatures: enhancedResult.failedFeatures || [],
            });
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get personalized checklist: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async extractUserProfile(userId, userProfile) {
        const profile = {
            userId,
        };
        if (userProfile === null || userProfile === void 0 ? void 0 : userProfile.preferences) {
            const prefs = userProfile.preferences;
            profile.budgetLevel = prefs.budgetLevel;
            profile.riskTolerance = prefs.riskTolerance;
            profile.tags = prefs.tags;
            profile.nationality = prefs.nationality;
            profile.residencyCountry = prefs.residencyCountry;
        }
        return profile;
    }
    buildChecklistWithEnhancements(result) {
        var _a, _b, _c;
        const enhancements = result.aiEnhancements || {};
        const deadlinesMap = new Map();
        const channelsMap = new Map();
        const rankingsMap = new Map();
        (_a = enhancements.deadlines) === null || _a === void 0 ? void 0 : _a.forEach((d) => deadlinesMap.set(d.itemId, d));
        (_b = enhancements.channels) === null || _b === void 0 ? void 0 : _b.forEach((c) => channelsMap.set(c.itemId, c));
        (_c = enhancements.rankings) === null || _c === void 0 ? void 0 : _c.forEach((r) => rankingsMap.set(r.itemId, r));
        const buildItem = (item) => {
            var _a, _b, _c, _d;
            const deadline = deadlinesMap.get(item.id);
            const channel = channelsMap.get(item.id);
            const ranking = rankingsMap.get(item.id);
            return {
                id: item.id,
                message: item.message,
                tasks: item.tasks || [],
                deadline: deadline === null || deadline === void 0 ? void 0 : deadline.deadline,
                channel: ((_b = (_a = channel === null || channel === void 0 ? void 0 : channel.channels) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.name) || ((_d = (_c = channel === null || channel === void 0 ? void 0 : channel.channels) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.url),
                channelDetails: channel === null || channel === void 0 ? void 0 : channel.channels,
                personalizedRank: ranking === null || ranking === void 0 ? void 0 : ranking.personalizedRank,
                rankingReasoning: ranking === null || ranking === void 0 ? void 0 : ranking.reasoning,
            };
        };
        return {
            blocker: result.findings.flatMap((f) => f.blockers.map(buildItem)),
            must: result.findings.flatMap((f) => f.must.map(buildItem)),
            should: result.findings.flatMap((f) => f.should.map(buildItem)),
            optional: result.findings.flatMap((f) => f.optional.map(buildItem)),
        };
    }
    async getRiskWarnings(tripId, lang, userId, includeCapabilityPackHazards, currentUser) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            const effectiveUserId = (currentUser === null || currentUser === void 0 ? void 0 : currentUser.userId) || userId;
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
                include: {
                    TripDay: {
                        include: {
                            ItineraryItem: {
                                include: {
                                    Place: {
                                        select: {
                                            id: true,
                                            nameCN: true,
                                            nameEN: true,
                                            category: true,
                                        },
                                    },
                                },
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
            const startDate = new Date(trip.startDate);
            const endDate = new Date(trip.endDate);
            const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            let userProfileData = null;
            if (effectiveUserId) {
                userProfileData = await this.prisma.userProfile.findUnique({
                    where: { userId: effectiveUserId },
                });
            }
            let baseResult;
            try {
                baseResult = await this.readinessService.checkFromDestination(trip.destination, {
                    traveler: {},
                    trip: {},
                    itinerary: {
                        countries: [],
                    },
                }, {
                    lang: lang || 'en',
                });
            }
            catch (readinessError) {
                this.logger.error(`准备度检查失败: ${readinessError.message}`, readinessError.stack);
                baseResult = {
                    findings: [],
                    summary: {
                        totalBlockers: 0,
                        totalMust: 0,
                        totalShould: 0,
                        totalOptional: 0,
                        totalRisks: 0,
                    },
                };
            }
            const tripContext = this.readinessService.extractTripContext({
                context: {
                    destination: trip.destination || '',
                    startDate: trip.startDate.toISOString().split('T')[0],
                    durationDays,
                    preferences: {
                        intents: {},
                        pace: 'moderate',
                        riskTolerance: 'medium',
                    },
                },
                candidatesByDate: {},
                signals: {
                    lastUpdatedAt: new Date().toISOString(),
                },
            });
            const userProfile = effectiveUserId
                ? await this.extractUserProfile(effectiveUserId, userProfileData)
                : undefined;
            const aiEnabled = effectiveUserId &&
                (await this.featureFlagsService.isAIEnhancementEnabled(effectiveUserId, 'readiness_ai_enhancement'));
            let riskEnhancements = {};
            if (aiEnabled && userProfile) {
                try {
                    riskEnhancements = await this.readinessAIService.enhanceRiskWarnings(baseResult, userProfile, tripContext, { enableAI: true });
                }
                catch (error) {
                    this.logger.warn('Risk AI enhancement failed, using base result', error);
                }
            }
            const severityMap = new Map();
            const mitigationMap = new Map();
            const emergencyContactsMap = new Map();
            (_a = riskEnhancements.severityAssessments) === null || _a === void 0 ? void 0 : _a.forEach((s) => {
                severityMap.set(s.riskId, s.assessedSeverity);
            });
            (_b = riskEnhancements.mitigations) === null || _b === void 0 ? void 0 : _b.forEach((m) => {
                mitigationMap.set(m.riskId, m.personalizedMitigations);
            });
            (_c = riskEnhancements.emergencyContacts) === null || _c === void 0 ? void 0 : _c.forEach((e) => {
                emergencyContactsMap.set(e.riskId, e.contacts);
            });
            const packSourcesMap = new Map();
            let riskIndex = 0;
            const risks = (baseResult.findings || []).flatMap((f) => (f.risks || []).map((r) => {
                const riskId = `${f.destinationId || 'unknown'}-${f.packId || 'unknown'}-risk-${riskIndex++}`;
                const enhancedSeverity = severityMap.get(riskId) || r.severity || 'medium';
                const enhancedMitigations = mitigationMap.get(riskId) || r.mitigations || [];
                const enhancedContacts = emergencyContactsMap.get(riskId) || [];
                const riskSources = r.sources || [];
                riskSources.forEach((source) => {
                    if (source.sourceId && !packSourcesMap.has(source.sourceId)) {
                        packSourcesMap.set(source.sourceId, source);
                    }
                });
                return {
                    id: riskId,
                    type: r.type || 'unknown',
                    severity: enhancedSeverity,
                    originalSeverity: r.severity || 'medium',
                    message: r.summary || '',
                    summary: r.summary || '',
                    mitigation: enhancedMitigations.length > 0 ? enhancedMitigations : r.mitigations || [],
                    emergencyContacts: enhancedContacts,
                    affectedPois: [],
                    sources: riskSources.length > 0 ? riskSources : undefined,
                };
            }));
            try {
                const tripConflictsService = this.getTripConflictsService();
                if (!tripConflictsService) {
                    this.logger.warn('TripConflictsService 未注入，跳过时间冲突检查');
                }
                else {
                    const conflictsResult = await tripConflictsService.getConflicts(tripId);
                    const timeConflicts = conflictsResult.conflicts.filter((c) => c.type === trip_conflicts_dto_1.ConflictType.TIME_CONFLICT);
                    const conflictRisks = timeConflicts.map((conflict) => {
                        var _a;
                        return ({
                            id: `conflict-${conflict.id}`,
                            type: 'logistics_remote',
                            severity: conflict.severity.toLowerCase(),
                            originalSeverity: conflict.severity.toLowerCase(),
                            message: conflict.description,
                            summary: conflict.description,
                            mitigation: ((_a = conflict.suggestions) === null || _a === void 0 ? void 0 : _a.map((s) => s.description)) || [],
                            emergencyContacts: [],
                            affectedPois: [],
                            sources: {},
                        });
                    });
                    risks.push(...conflictRisks);
                }
            }
            catch (conflictError) {
                this.logger.warn(`Failed to get time conflicts for trip ${tripId}: ${conflictError.message}`);
            }
            if (includeCapabilityPackHazards === 'true') {
                try {
                    const capabilityPackItems = await this.capabilityPackChecklistService.getCapabilityPackItems(tripId);
                    const packTypes = [...new Set((capabilityPackItems || []).map(item => item.sourcePackType).filter(Boolean))];
                    const allPacks = [
                        packs_1.highAltitudePack,
                        packs_1.sparseSupplyPack,
                        packs_1.seasonalRoadPack,
                        packs_1.permitCheckpointPack,
                        packs_1.emergencyPack,
                    ];
                    for (const packType of packTypes) {
                        const pack = allPacks.find(p => p.type === packType);
                        if (pack === null || pack === void 0 ? void 0 : pack.hazards) {
                            const packHazards = pack.hazards.map((h, idx) => {
                                var _a;
                                return ({
                                    id: `capability-pack-${packType}-hazard-${idx}`,
                                    type: h.type,
                                    severity: h.severity,
                                    originalSeverity: h.severity,
                                    message: typeof h.summary === 'string' ? h.summary : ((_a = h.summary) === null || _a === void 0 ? void 0 : _a.en) || h.summary,
                                    mitigation: h.mitigations || [],
                                    emergencyContacts: [],
                                    sourceType: 'capability_pack',
                                    sourcePackType: packType,
                                });
                            });
                            risks.push(...packHazards);
                        }
                    }
                }
                catch (capabilityError) {
                    this.logger.warn(`Failed to get capability pack hazards for trip ${tripId}: ${capabilityError.message}`);
                }
            }
            const poiMap = new Map();
            try {
                if (trip.TripDay) {
                    trip.TripDay.forEach((day, dayIndex) => {
                        var _a;
                        (_a = day.ItineraryItem) === null || _a === void 0 ? void 0 : _a.forEach((item) => {
                            if (item.Place) {
                                const placeId = item.Place.id;
                                if (!poiMap.has(placeId)) {
                                    poiMap.set(placeId, {
                                        name: item.Place.nameEN || item.Place.nameCN || `POI ${placeId}`,
                                        nameCN: item.Place.nameCN,
                                        day: dayIndex + 1,
                                    });
                                }
                            }
                        });
                    });
                }
            }
            catch (poiError) {
                this.logger.warn(`构建POI映射失败，风险信息将不包含POI详情: ${poiError.message}`);
            }
            const enhancedRisks = risks.map(r => {
                const riskAny = r;
                const baseRisk = {
                    ...r,
                    sourceType: riskAny.sourceType || 'readiness',
                    severity: (riskAny.severity || r.severity),
                    affectedPois: (riskAny.affectedPois || []).map((poiId) => {
                        const poiIdNum = typeof poiId === 'string' ? parseInt(poiId, 10) : poiId;
                        const poiInfo = poiMap.get(poiIdNum);
                        if (poiInfo) {
                            return {
                                id: poiIdNum.toString(),
                                name: poiInfo.name,
                                nameCN: poiInfo.nameCN,
                                day: poiInfo.day,
                            };
                        }
                        return {
                            id: poiIdNum.toString(),
                            name: `POI ${poiIdNum}`,
                            day: undefined,
                        };
                    }),
                };
                return this.riskTypeMapperService.enhanceRisk(baseRisk, lang || 'zh');
            });
            const risksByCategory = this.riskTypeMapperService.groupRisksByCategory(enhancedRisks);
            const packSources = Array.from(packSourcesMap.values());
            return (0, standard_response_dto_1.successResponse)({
                tripId,
                risks: enhancedRisks,
                risksByCategory,
                packSources,
                summary: {
                    totalRisks: risks.length,
                    highSeverity: risks.filter((r) => r.severity === 'high').length,
                    mediumSeverity: risks.filter((r) => r.severity === 'medium').length,
                    lowSeverity: risks.filter((r) => r.severity === 'low').length,
                    byCategory: {
                        weather: ((_d = risksByCategory.weather) === null || _d === void 0 ? void 0 : _d.length) || 0,
                        terrain: ((_e = risksByCategory.terrain) === null || _e === void 0 ? void 0 : _e.length) || 0,
                        safety: ((_f = risksByCategory.safety) === null || _f === void 0 ? void 0 : _f.length) || 0,
                        logistics: ((_g = risksByCategory.logistics) === null || _g === void 0 ? void 0 : _g.length) || 0,
                        other: ((_h = risksByCategory.other) === null || _h === void 0 ? void 0 : _h.length) || 0,
                    },
                },
                aiEnhanced: aiEnabled && Object.keys(riskEnhancements).length > 0,
            });
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get risk warnings: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getCoverageMap(tripId) {
        try {
            const result = await this.coverageMapService.getCoverageMap(tripId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            if (err instanceof common_1.NotFoundException) {
                this.logger.error(`Trip not found for coverage map: ${tripId}`);
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, err.message);
            }
            this.logger.error(`Failed to get coverage map: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getReadinessScore(tripId) {
        try {
            const result = await this.coverageMapService.getReadinessScore(tripId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            if (err instanceof common_1.NotFoundException) {
                this.logger.error(`Trip not found for readiness score: ${tripId}`);
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, err.message);
            }
            this.logger.error(`Failed to get readiness score: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getRepairOptions(body) {
        try {
            const { tripId, blockerId } = body;
            const result = await this.coverageMapService.getRepairOptions(tripId, blockerId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            if (err instanceof common_1.NotFoundException) {
                this.logger.error(`Trip not found for repair options: ${body.tripId}`);
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, err.message);
            }
            this.logger.error(`Failed to get repair options: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async updateChecklistStatus(tripId, dto) {
        try {
            const result = await this.checklistStatusService.updateChecklistStatus(tripId, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to update checklist status: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getChecklistStatus(tripId) {
        try {
            const result = await this.checklistStatusService.getChecklistStatus(tripId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get checklist status: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getSolutions(tripId, blockerId) {
        try {
            const result = await this.solutionService.getSolutions(tripId, blockerId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get solutions: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async markNotApplicable(tripId, findingId, dto) {
        try {
            const result = await this.findingMarksService.markNotApplicable(tripId, findingId, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to mark not applicable: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async unmarkNotApplicable(tripId, findingId) {
        try {
            const result = await this.findingMarksService.unmarkNotApplicable(tripId, findingId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to unmark not applicable: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getNotApplicableItems(tripId) {
        try {
            const result = await this.findingMarksService.getNotApplicableItems(tripId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get not applicable items: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async addToLater(tripId, findingId, dto) {
        try {
            const result = await this.findingMarksService.addToLater(tripId, findingId, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to add to later: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async removeFromLater(tripId, findingId) {
        try {
            const result = await this.findingMarksService.removeFromLater(tripId, findingId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to remove from later: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getLaterItems(tripId) {
        try {
            const result = await this.findingMarksService.getLaterItems(tripId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get later items: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async generatePackingList(tripId, dto, userId, currentUser) {
        try {
            const effectiveUserId = (currentUser === null || currentUser === void 0 ? void 0 : currentUser.userId) || userId;
            const baseResult = await this.packingListService.generatePackingList(tripId, dto);
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
            });
            if (!trip) {
                throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
            }
            const startDate = new Date(trip.startDate);
            const endDate = new Date(trip.endDate);
            const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            let userProfileData = null;
            if (effectiveUserId) {
                userProfileData = await this.prisma.userProfile.findUnique({
                    where: { userId: effectiveUserId },
                });
            }
            const tripContext = this.readinessService.extractTripContext({
                context: {
                    destination: trip.destination || '',
                    startDate: trip.startDate.toISOString().split('T')[0],
                    durationDays,
                    preferences: {
                        intents: {},
                        pace: 'moderate',
                        riskTolerance: 'medium',
                    },
                },
                candidatesByDate: {},
                signals: {
                    lastUpdatedAt: new Date().toISOString(),
                },
            });
            const userProfile = effectiveUserId
                ? await this.extractUserProfile(effectiveUserId, userProfileData)
                : undefined;
            const aiEnabled = effectiveUserId &&
                (await this.featureFlagsService.isAIEnhancementEnabled(effectiveUserId, 'readiness_ai_enhancement'));
            let enhancedItems = baseResult.items;
            if (aiEnabled && userProfile && baseResult.items.length > 0) {
                try {
                    const enhancements = await this.readinessAIService.enhancePackingList(baseResult.items.map((item) => ({
                        id: item.id,
                        name: item.name,
                        category: item.category,
                        quantity: item.quantity,
                        priority: item.priority,
                    })), userProfile, tripContext, durationDays, { enableAI: true });
                    if (enhancements.itemEnhancements) {
                        const enhancementMap = new Map();
                        enhancements.itemEnhancements.forEach((enh) => {
                            enhancementMap.set(enh.itemId, enh);
                        });
                        enhancedItems = baseResult.items.map((item) => {
                            var _a, _b;
                            const enh = enhancementMap.get(item.id);
                            if (enh) {
                                return {
                                    ...item,
                                    quantity: (_a = enh.recommendedQuantity) !== null && _a !== void 0 ? _a : item.quantity,
                                    reason: (_b = enh.reason) !== null && _b !== void 0 ? _b : item.reason,
                                };
                            }
                            return item;
                        });
                        enhancements.itemEnhancements.forEach((enh) => {
                            if (enh.itemId.startsWith('recommended-')) {
                                enhancedItems.push({
                                    id: enh.itemId,
                                    name: enh.name || '推荐物品',
                                    category: enh.category || 'other',
                                    quantity: enh.recommendedQuantity || 1,
                                    unit: '件',
                                    priority: 'optional',
                                    reason: enh.reason,
                                    checked: false,
                                });
                            }
                        });
                    }
                }
                catch (error) {
                    this.logger.warn('Packing list AI enhancement failed, using base result', error);
                }
            }
            return (0, standard_response_dto_1.successResponse)({
                ...baseResult,
                items: enhancedItems,
                aiEnhanced: aiEnabled && enhancedItems !== baseResult.items,
            });
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to generate packing list: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getPackingList(tripId) {
        try {
            const result = await this.packingListService.getPackingList(tripId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get packing list: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async updatePackingListItem(tripId, itemId, dto) {
        try {
            const result = await this.packingListService.updatePackingListItem(tripId, itemId, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to update packing list item: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getPackingOrderSteps() {
        try {
            const steps = this.packingTemplateService.getPackingOrderSteps();
            return (0, standard_response_dto_1.successResponse)(steps);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get packing order steps: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getPreDepartureChecklist() {
        try {
            const checklist = this.packingTemplateService.getPreDepartureChecklist();
            return (0, standard_response_dto_1.successResponse)(checklist);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get pre-departure checklist: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
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
    inferHasRemoteAreas(activitySet, poiCanonicalTypeSet) {
        const remoteActivities = ['remote', 'highlands', 'f-roads', 'backcountry', 'wilderness'];
        for (const activity of activitySet) {
            if (remoteActivities.some(ra => activity.toLowerCase().includes(ra))) {
                return true;
            }
        }
        const remotePoiTypes = [
            'TRAILHEAD',
            'CAMPING',
            'ATTRACTION_NATURE_GLACIER',
            'ATTRACTION_NATURE_VOLCANO',
        ];
        for (const poiType of poiCanonicalTypeSet) {
            if (remotePoiTypes.some(rpt => poiType.includes(rpt))) {
                const hasHikingOrCamping = Array.from(activitySet).some(a => a.includes('hiking') || a.includes('camping') || a.includes('outdoor'));
                if (hasHikingOrCamping) {
                    return true;
                }
            }
        }
        return false;
    }
    inferRequires4x4(activitySet, poiCanonicalTypeSet) {
        const fourWheelDriveActivities = ['highlands', 'f-roads', 'off-road', '4x4'];
        for (const activity of activitySet) {
            if (fourWheelDriveActivities.some(fwda => activity.toLowerCase().includes(fwda))) {
                return true;
            }
        }
        const hasDriving = Array.from(activitySet).some(a => a.includes('driving'));
        if (hasDriving) {
            const hasRemotePoi = Array.from(poiCanonicalTypeSet).some(pt => pt.includes('TRAILHEAD') || pt.includes('CAMPING'));
            if (hasRemotePoi) {
                const hasOutdoorActivity = Array.from(activitySet).some(a => a.includes('hiking') || a.includes('outdoor') || a.includes('nature'));
                if (hasOutdoorActivity) {
                    return true;
                }
            }
        }
        return false;
    }
    async getReadinessPacks(query) {
        try {
            const page = query.page || 1;
            const limit = query.limit || 20;
            const skip = (page - 1) * limit;
            const where = {};
            if (query.countryCode) {
                where.countryCode = query.countryCode;
            }
            if (query.destinationId) {
                where.destinationId = query.destinationId;
            }
            if (query.isActive !== undefined) {
                where.isActive = query.isActive;
            }
            if (query.search) {
                where.OR = [
                    { packId: { contains: query.search, mode: 'insensitive' } },
                    { displayName: { contains: query.search, mode: 'insensitive' } },
                    { displayNameEN: { contains: query.search, mode: 'insensitive' } },
                    { displayNameCN: { contains: query.search, mode: 'insensitive' } },
                    { regionCN: { contains: query.search, mode: 'insensitive' } },
                    { cityCN: { contains: query.search, mode: 'insensitive' } },
                ];
            }
            const [packs, total] = await Promise.all([
                this.prisma.readinessPack.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { updatedAt: 'desc' },
                    select: {
                        id: true,
                        packId: true,
                        destinationId: true,
                        displayName: true,
                        displayNameEN: true,
                        displayNameCN: true,
                        version: true,
                        lastReviewedAt: true,
                        countryCode: true,
                        region: true,
                        regionEN: true,
                        regionCN: true,
                        city: true,
                        cityEN: true,
                        cityCN: true,
                        isActive: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                }),
                this.prisma.readinessPack.count({ where }),
            ]);
            const result = {
                packs: packs,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to get readiness packs: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getReadinessPackById(packId, includePacking) {
        try {
            const shouldIncludePacking = includePacking !== 'false';
            const pack = await this.packStorageService.loadPack(packId, shouldIncludePacking);
            if (!pack) {
                throw new common_1.NotFoundException(`Readiness pack not found: ${packId}`);
            }
            const record = await this.prisma.readinessPack.findUnique({
                where: { packId },
            });
            const serializedPack = (0, pack_serializer_util_1.serializePackForAdmin)(pack, 'zh');
            return (0, standard_response_dto_1.successResponse)({
                ...serializedPack,
                id: record === null || record === void 0 ? void 0 : record.id,
                isActive: record === null || record === void 0 ? void 0 : record.isActive,
                createdAt: record === null || record === void 0 ? void 0 : record.createdAt,
                updatedAt: record === null || record === void 0 ? void 0 : record.updatedAt,
                _raw: pack,
            });
        }
        catch (error) {
            const err = error;
            if (err instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, err.message);
            }
            this.logger.error(`Failed to get readiness pack: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async createReadinessPack(dto) {
        try {
            const deserializedPack = (0, pack_deserializer_util_1.deserializePackFromAdmin)(dto.pack);
            const saveSuccess = await this.packStorageService.savePack(deserializedPack);
            if (!saveSuccess) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to save pack');
            }
            const pack = await this.packStorageService.loadPack(deserializedPack.packId);
            if (!pack) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to load pack after creation');
            }
            const serializedPack = (0, pack_serializer_util_1.serializePackForAdmin)(pack, 'zh');
            const record = await this.prisma.readinessPack.findUnique({
                where: { packId: pack.packId },
            });
            return (0, standard_response_dto_1.successResponse)({
                ...serializedPack,
                id: record === null || record === void 0 ? void 0 : record.id,
                isActive: record === null || record === void 0 ? void 0 : record.isActive,
                createdAt: record === null || record === void 0 ? void 0 : record.createdAt,
                updatedAt: record === null || record === void 0 ? void 0 : record.updatedAt,
                _raw: pack,
            });
        }
        catch (error) {
            const err = error;
            this.logger.error(`Failed to create readiness pack: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async updateReadinessPack(packId, dto) {
        try {
            const existing = await this.prisma.readinessPack.findUnique({
                where: { packId },
            });
            if (!existing) {
                throw new common_1.NotFoundException(`Readiness pack not found: ${packId}`);
            }
            if (dto.pack) {
                const deserializedPack = (0, pack_deserializer_util_1.deserializePackFromAdmin)(dto.pack);
                const success = await this.packStorageService.savePack(deserializedPack);
                if (!success) {
                    return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to update pack');
                }
            }
            if (dto.isActive !== undefined) {
                await this.prisma.readinessPack.update({
                    where: { packId },
                    data: { isActive: dto.isActive },
                });
            }
            const pack = await this.packStorageService.loadPack(packId);
            if (!pack) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to load pack after update');
            }
            const serializedPack = (0, pack_serializer_util_1.serializePackForAdmin)(pack, 'zh');
            const record = await this.prisma.readinessPack.findUnique({
                where: { packId },
            });
            return (0, standard_response_dto_1.successResponse)({
                ...serializedPack,
                id: record === null || record === void 0 ? void 0 : record.id,
                isActive: record === null || record === void 0 ? void 0 : record.isActive,
                createdAt: record === null || record === void 0 ? void 0 : record.createdAt,
                updatedAt: record === null || record === void 0 ? void 0 : record.updatedAt,
                _raw: pack,
            });
        }
        catch (error) {
            const err = error;
            if (err instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, err.message);
            }
            this.logger.error(`Failed to update readiness pack: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async deleteReadinessPack(packId) {
        try {
            const existing = await this.prisma.readinessPack.findUnique({
                where: { packId },
            });
            if (!existing) {
                throw new common_1.NotFoundException(`Readiness pack not found: ${packId}`);
            }
            await this.prisma.readinessPack.update({
                where: { packId },
                data: { isActive: false },
            });
            return (0, standard_response_dto_1.successResponse)({ message: 'Pack deleted successfully' });
        }
        catch (error) {
            const err = error;
            if (err instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, err.message);
            }
            this.logger.error(`Failed to delete readiness pack: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
    async getUserDecisionQuestions(tripId, ruleId, answeredQuestionIds) {
        var _a;
        try {
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
                select: {
                    id: true,
                    destination: true,
                },
            });
            if (!trip) {
                throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
            }
            const pack = await this.packStorageService.findPackByDestination(trip.destination);
            if (!pack) {
                throw new common_1.NotFoundException(`未找到目的地 ${trip.destination} 的准备度 Pack`);
            }
            const rule = pack.rules.find(r => r.id === ruleId);
            if (!rule) {
                throw new common_1.NotFoundException(`规则 ${ruleId} 不存在`);
            }
            if (!this.userDecisionService.requiresUserDecision(rule)) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, `规则 ${ruleId} 不需要用户决策`);
            }
            const answeredIds = answeredQuestionIds
                ? answeredQuestionIds.split(',').map(id => id.trim()).filter(id => id.length > 0)
                : [];
            const questionGroups = this.userDecisionService.getQuestionGroups(rule, answeredIds);
            const nextQuestion = this.userDecisionService.getNextQuestion(rule, answeredIds);
            return (0, standard_response_dto_1.successResponse)({
                ruleId,
                questions: ((_a = rule.then.userDecision) === null || _a === void 0 ? void 0 : _a.questions) || [],
                groups: questionGroups.groups,
                progress: {
                    answered: questionGroups.answeredQuestions,
                    total: questionGroups.totalQuestions,
                    percentage: Math.round(questionGroups.overallProgress * 100),
                },
                currentGroupIndex: questionGroups.currentGroupIndex,
                nextQuestion: nextQuestion || undefined,
            });
        }
        catch (error) {
            this.logger.error(`获取用户决策问题失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取用户决策问题失败: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
    async answerUserDecision(tripId, ruleId, body) {
        var _a, _b;
        try {
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
                select: {
                    id: true,
                    destination: true,
                },
            });
            if (!trip) {
                throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
            }
            const pack = await this.packStorageService.findPackByDestination(trip.destination);
            if (!pack) {
                throw new common_1.NotFoundException(`未找到目的地 ${trip.destination} 的准备度 Pack`);
            }
            const rule = pack.rules.find(r => r.id === ruleId);
            if (!rule) {
                throw new common_1.NotFoundException(`规则 ${ruleId} 不存在`);
            }
            if (!this.userDecisionService.requiresUserDecision(rule)) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BUSINESS_ERROR, `规则 ${ruleId} 不需要用户决策`);
            }
            const decisionResult = await this.userDecisionService.processUserDecision(rule, body.answers);
            try {
                const existingDecision = await this.prisma.tripReadinessDecision.findUnique({
                    where: {
                        tripId_ruleId: {
                            tripId: tripId,
                            ruleId: ruleId,
                        },
                    },
                });
                const decisionData = {
                    tripId,
                    ruleId,
                    packId: pack.packId,
                    userId: undefined,
                    answers: body.answers,
                    decisionResult: {
                        updatedAction: decisionResult.updatedAction,
                        blockTrip: decisionResult.blockTrip,
                        nextQuestions: decisionResult.nextQuestions,
                        matchedBranch: decisionResult.matchedBranch,
                    },
                    matchedBranchId: ((_a = decisionResult.matchedBranch) === null || _a === void 0 ? void 0 : _a.id) || undefined,
                    blockTrip: decisionResult.blockTrip,
                    updatedAction: decisionResult.updatedAction,
                    category: rule.category,
                    severity: rule.severity,
                    level: decisionResult.updatedAction.level,
                };
                if (existingDecision) {
                    await this.prisma.tripReadinessDecision.update({
                        where: {
                            id: existingDecision.id,
                        },
                        data: decisionData,
                    });
                    this.logger.debug(`更新行程 ${tripId} 规则 ${ruleId} 的用户决策记录`);
                }
                else {
                    await this.prisma.tripReadinessDecision.create({
                        data: decisionData,
                    });
                    this.logger.debug(`创建行程 ${tripId} 规则 ${ruleId} 的用户决策记录`);
                }
            }
            catch (error) {
                this.logger.warn(`保存用户决策到数据库失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
                this.logger.log(`行程 ${tripId} 回答规则 ${ruleId} 的问题: ${JSON.stringify(body.answers)}`);
            }
            const updatedRule = {
                ...rule,
                then: decisionResult.updatedAction,
            };
            const tripContext = {
                traveler: {
                    nationality: undefined,
                    residencyCountry: undefined,
                    tags: [],
                },
                trip: {
                    startDate: undefined,
                    endDate: undefined,
                },
                itinerary: {
                    countries: [],
                    activities: [],
                    season: undefined,
                },
            };
            const packWithUpdatedRule = {
                ...pack,
                rules: pack.rules.map(r => (r.id === ruleId ? updatedRule : r)),
            };
            const findingItem = {
                id: rule.id,
                category: rule.category,
                severity: rule.severity,
                level: decisionResult.updatedAction.level,
                message: typeof decisionResult.updatedAction.message === 'string'
                    ? decisionResult.updatedAction.message
                    : decisionResult.updatedAction.message.en || decisionResult.updatedAction.message.zh || '',
                tasks: decisionResult.updatedAction.tasks,
                evidence: (_b = rule.evidence) === null || _b === void 0 ? void 0 : _b.map(e => ({
                    sourceId: e.sourceId,
                    sectionId: e.sectionId,
                    quote: e.quote,
                })),
            };
            let constraints = [];
            if (decisionResult.blockTrip || decisionResult.updatedAction.level === 'blocker') {
                const tempResult = {
                    findings: [
                        {
                            destinationId: pack.destinationId,
                            packId: pack.packId,
                            packVersion: pack.version,
                            blockers: decisionResult.blockTrip ? [findingItem] : [],
                            must: decisionResult.updatedAction.level === 'must' ? [findingItem] : [],
                            should: decisionResult.updatedAction.level === 'should' ? [findingItem] : [],
                            optional: decisionResult.updatedAction.level === 'optional' ? [findingItem] : [],
                            risks: [],
                        },
                    ],
                    summary: {
                        totalBlockers: decisionResult.blockTrip ? 1 : 0,
                        totalMust: decisionResult.updatedAction.level === 'must' ? 1 : 0,
                        totalShould: decisionResult.updatedAction.level === 'should' ? 1 : 0,
                        totalOptional: decisionResult.updatedAction.level === 'optional' ? 1 : 0,
                        totalRisks: 0,
                    },
                };
                constraints = await this.constraintsCompiler.compile(tempResult);
            }
            const answeredQuestionIds = Object.keys(body.answers);
            const questionGroups = this.userDecisionService.getQuestionGroups(rule, answeredQuestionIds);
            const nextQuestion = this.userDecisionService.getNextQuestion(rule, answeredQuestionIds);
            return (0, standard_response_dto_1.successResponse)({
                updatedFinding: {
                    id: ruleId,
                    level: decisionResult.updatedAction.level,
                    message: decisionResult.updatedAction.message,
                    tasks: decisionResult.updatedAction.tasks,
                    blockTrip: decisionResult.blockTrip,
                },
                gateResult: decisionResult.blockTrip ? 'BLOCK' : decisionResult.updatedAction.level === 'must' ? 'ADJUST_REQUIRED' : 'ALLOW',
                constraints,
                nextQuestions: decisionResult.nextQuestions || [],
                questionGroups: questionGroups.groups,
                progress: {
                    answered: questionGroups.answeredQuestions,
                    total: questionGroups.totalQuestions,
                    percentage: Math.round(questionGroups.overallProgress * 100),
                },
                currentGroupIndex: questionGroups.currentGroupIndex,
                nextQuestion: nextQuestion || undefined,
            });
        }
        catch (error) {
            const err = error;
            if (err instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, err.message);
            }
            this.logger.error(`处理用户决策失败: ${err.message}`, err.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, err.message);
        }
    }
};
exports.ReadinessController = ReadinessController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('check'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '检查旅行准备度',
        description: '基于目的地和行程信息，检查旅行准备度并返回 must/should/optional 清单',
    }),
    (0, swagger_1.ApiBody)({ type: CheckReadinessDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回准备度检查结果',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CheckReadinessDto]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "checkReadiness", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '根据行程ID检查准备度',
        description: '基于行程ID获取行程信息并检查准备度，返回 must/should/optional 清单。如果提供了用户认证信息，会自动从用户偏好接口获取国籍、居住国等信息。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程 ID (UUID)', example: 'd125c30f-44ab-4a9e-9970-b899fccdc3d8' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回准备度检查结果',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('lang')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getTripReadiness", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('capability-packs'),
    (0, swagger_1.ApiOperation)({
        summary: '获取能力包列表',
        description: '返回所有可用的能力包信息',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回能力包列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getCapabilityPacks", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('capability-packs/evaluate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '评估能力包',
        description: '评估哪些能力包应该被触发。支持自动获取目的地地理特征（P2增强）',
    }),
    (0, swagger_1.ApiBody)({ type: CheckReadinessDto }),
    (0, swagger_1.ApiQuery)({ name: 'autoEnhanceGeo', description: '是否自动获取目的地地理特征', required: false, type: Boolean }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回能力包评估结果',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Query)('autoEnhanceGeo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CheckReadinessDto, String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "evaluateCapabilityPacks", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('trip/:tripId/checklist/add-from-capability-pack'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '从能力包添加规则到准备清单',
        description: '将能力包评估结果中的规则添加到行程的准备清单中',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                packType: { type: 'string', description: '能力包类型', example: 'seasonal_road' },
                rules: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', example: 'rule.seasonal.night.driving' },
                            level: { type: 'string', enum: ['blocker', 'must', 'should', 'optional'] },
                            message: { type: 'string' },
                            category: { type: 'string' },
                            tasks: { type: 'array' },
                        },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功添加规则到准备清单',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "addFromCapabilityPack", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/checklist/capability-pack-items'),
    (0, swagger_1.ApiOperation)({
        summary: '获取能力包清单项',
        description: '获取行程中从能力包添加的准备清单项',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiQuery)({ name: 'packType', description: '能力包类型（可选，用于筛选）', required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回能力包清单项',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Query)('packType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getCapabilityPackItems", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)('trip/:tripId/checklist/capability-pack-items/:itemId/status'),
    (0, swagger_1.ApiOperation)({
        summary: '更新能力包清单项状态',
        description: '更新能力包清单项的勾选状态',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'itemId', description: '清单项 ID' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                checked: { type: 'boolean', description: '是否已完成' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新状态',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('itemId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "updateCapabilityPackItemStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)('trip/:tripId/checklist/capability-pack-items/:itemId'),
    (0, swagger_1.ApiOperation)({
        summary: '删除能力包清单项',
        description: '从准备清单中删除指定的能力包清单项',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'itemId', description: '清单项 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功删除',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('itemId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "removeCapabilityPackItem", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('personalized-checklist'),
    (0, swagger_1.ApiOperation)({
        summary: '获取个性化准备清单（故事6.1）',
        description: '获取适配行程的准备事项清单，按 blocker/must/should/optional 分类，包含截止时间和办理渠道',
    }),
    (0, swagger_1.ApiQuery)({ name: 'tripId', description: '行程 ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'lang', description: '语言', required: false, enum: ['en', 'zh'] }),
    (0, swagger_1.ApiQuery)({ name: 'userId', description: '用户 ID（可选，用于个性化）', required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回个性化准备清单',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('tripId')),
    __param(1, (0, common_1.Query)('lang')),
    __param(2, (0, common_1.Query)('userId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getPersonalizedChecklist", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('risk-warnings'),
    (0, swagger_1.ApiOperation)({
        summary: '行程潜在风险预警（故事6.2）',
        description: '提前知晓行程中的潜在风险，提供应对措施和救援信息',
    }),
    (0, swagger_1.ApiQuery)({ name: 'tripId', description: '行程 ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'lang', description: '语言', required: false, enum: ['en', 'zh'] }),
    (0, swagger_1.ApiQuery)({ name: 'userId', description: '用户 ID（可选，用于个性化）', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'includeCapabilityPackHazards', description: '是否包含能力包风险', required: false, type: Boolean }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回风险预警',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('tripId')),
    __param(1, (0, common_1.Query)('lang')),
    __param(2, (0, common_1.Query)('userId')),
    __param(3, (0, common_1.Query)('includeCapabilityPackHazards')),
    __param(4, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getRiskWarnings", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/coverage-map'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程覆盖地图数据',
        description: '获取行程的地图覆盖数据，用于前端渲染覆盖地图。包含 POI 覆盖状态、路段信息、覆盖缺口等。',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID (UUID)', example: 'ed69d9c5-660f-4549-bf03-85654e972403' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回覆盖地图数据',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'object',
                    properties: {
                        tripId: { type: 'string' },
                        bounds: {
                            type: 'object',
                            properties: {
                                northeast: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                                southwest: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                            },
                        },
                        center: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                        zoom: { type: 'number' },
                        pois: { type: 'array', items: { type: 'object' } },
                        segments: { type: 'array', items: { type: 'object' } },
                        gaps: { type: 'array', items: { type: 'object' } },
                        summary: {
                            type: 'object',
                            properties: {
                                totalPois: { type: 'number' },
                                coveredPois: { type: 'number' },
                                partialPois: { type: 'number' },
                                uncoveredPois: { type: 'number' },
                                totalSegments: { type: 'number' },
                                coveredSegments: { type: 'number' },
                                warningSegments: { type: 'number' },
                                blockedSegments: { type: 'number' },
                                totalGaps: { type: 'number' },
                                coverageRate: { type: 'number' },
                            },
                        },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getCoverageMap", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/score'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程准备度分数',
        description: '获取行程的准备度分数分解，包含证据覆盖、时间可行性、交通确定性、安全风险、缓冲时间等维度',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID (UUID)', example: 'ed69d9c5-660f-4549-bf03-85654e972403' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回准备度分数',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'object',
                    properties: {
                        tripId: { type: 'string' },
                        score: {
                            type: 'object',
                            properties: {
                                overall: { type: 'number', example: 78 },
                                evidenceCoverage: { type: 'number', example: 45 },
                                scheduleFeasibility: { type: 'number', example: 85 },
                                transportCertainty: { type: 'number', example: 70 },
                                safetyRisk: { type: 'number', example: 90 },
                                buffers: { type: 'number', example: 65 },
                            },
                        },
                        findings: { type: 'array', items: { type: 'object' } },
                        risks: { type: 'array', items: { type: 'object' } },
                        summary: {
                            type: 'object',
                            properties: {
                                totalFindings: { type: 'number' },
                                blockers: { type: 'number' },
                                must: { type: 'number', description: '🆕 统一字段命名：必须项数量（对应 must）' },
                                should: { type: 'number', description: '🆕 统一字段命名：建议项数量（对应 should）' },
                                warnings: { type: 'number', description: '@deprecated 使用 must 替代，向后兼容保留' },
                                suggestions: { type: 'number', description: '@deprecated 使用 should 替代，向后兼容保留' },
                                highRisks: { type: 'number' },
                                mediumRisks: { type: 'number' },
                                lowRisks: { type: 'number' },
                            },
                        },
                        calculatedAt: { type: 'string' },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getReadinessScore", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('repair-options'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '获取阻塞项修复选项',
        description: '根据准备度检查的阻塞项ID，获取可用的修复选项列表',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['tripId', 'blockerId'],
            properties: {
                tripId: { type: 'string', description: '行程 ID', example: 'ed69d9c5-660f-4549-bf03-85654e972403' },
                blockerId: { type: 'string', description: '阻塞项 ID', example: 'finding-1' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回修复选项',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'object',
                    properties: {
                        blockerId: { type: 'string', example: 'finding-1' },
                        blockerMessage: { type: 'string', example: '斯卡夫塔山国家公园缺少证据覆盖' },
                        options: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string', example: 'option-1' },
                                    title: { type: 'string', example: '查询天气预报' },
                                    description: { type: 'string', example: '获取该地点的天气信息' },
                                    cost: { type: 'number', example: 0 },
                                    impact: { type: 'string', enum: ['high', 'medium', 'low'], example: 'medium' },
                                    timeEstimate: { type: 'string', example: '2分钟' },
                                },
                            },
                        },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getRepairOptions", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)('trip/:tripId/checklist/status'),
    (0, swagger_1.ApiOperation)({
        summary: '批量保存勾选状态',
        description: '保存用户勾选的 must 项状态到后端，支持跨设备同步',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiBody)({ type: checklist_status_dto_1.UpdateChecklistStatusDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功保存勾选状态',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, checklist_status_dto_1.UpdateChecklistStatusDto]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "updateChecklistStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/checklist/status'),
    (0, swagger_1.ApiOperation)({
        summary: '获取勾选状态',
        description: '获取行程的检查清单勾选状态',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回勾选状态',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getChecklistStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/blockers/:blockerId/solutions'),
    (0, swagger_1.ApiOperation)({
        summary: '获取阻塞项修复方案',
        description: '获取指定阻塞项的修复方案列表',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'blockerId', description: '阻塞项 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回解决方案列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('blockerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getSolutions", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('trip/:tripId/findings/:findingId/mark-not-applicable'),
    (0, swagger_1.ApiOperation)({
        summary: '标记项为不适用',
        description: '将某个阻塞项或 must 项标记为"不适用"',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'findingId', description: 'Finding 项 ID' }),
    (0, swagger_1.ApiBody)({ type: finding_mark_dto_1.MarkNotApplicableDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功标记为不适用',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('findingId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, finding_mark_dto_1.MarkNotApplicableDto]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "markNotApplicable", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)('trip/:tripId/findings/:findingId/mark-not-applicable'),
    (0, swagger_1.ApiOperation)({
        summary: '取消标记不适用',
        description: '取消某个项的"不适用"标记',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'findingId', description: 'Finding 项 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功取消标记',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('findingId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "unmarkNotApplicable", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/findings/not-applicable'),
    (0, swagger_1.ApiOperation)({
        summary: '获取不适用项列表',
        description: '获取所有标记为"不适用"的项',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回不适用项列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getNotApplicableItems", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('trip/:tripId/findings/:findingId/add-to-later'),
    (0, swagger_1.ApiOperation)({
        summary: '添加到稍后处理',
        description: '将某个阻塞项或 must 项添加到"稍后处理"列表',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'findingId', description: 'Finding 项 ID' }),
    (0, swagger_1.ApiBody)({ type: finding_mark_dto_1.AddToLaterDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功添加到稍后处理',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('findingId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, finding_mark_dto_1.AddToLaterDto]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "addToLater", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)('trip/:tripId/findings/:findingId/remove-from-later'),
    (0, swagger_1.ApiOperation)({
        summary: '从稍后处理移除',
        description: '从"稍后处理"列表中移除某个项',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'findingId', description: 'Finding 项 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功从稍后处理移除',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('findingId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "removeFromLater", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/findings/later'),
    (0, swagger_1.ApiOperation)({
        summary: '获取稍后处理列表',
        description: '获取所有添加到"稍后处理"的项',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回稍后处理列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getLaterItems", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('trip/:tripId/packing-list/generate'),
    (0, swagger_1.ApiOperation)({
        summary: '生成打包清单',
        description: '根据准备度检查结果生成个性化的打包清单',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiBody)({ type: packing_list_dto_1.GeneratePackingListDto }),
    (0, swagger_1.ApiQuery)({ name: 'userId', description: '用户 ID（可选，用于个性化）', required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功生成打包清单',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Query)('userId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, packing_list_dto_1.GeneratePackingListDto, String, Object]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "generatePackingList", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/packing-list'),
    (0, swagger_1.ApiOperation)({
        summary: '获取打包清单',
        description: '获取行程的打包清单',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回打包清单',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getPackingList", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)('trip/:tripId/packing-list/items/:itemId'),
    (0, swagger_1.ApiOperation)({
        summary: '更新打包清单项状态',
        description: '更新打包清单项的勾选状态、数量或备注',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'itemId', description: '打包清单项 ID' }),
    (0, swagger_1.ApiBody)({ type: packing_list_dto_1.UpdatePackingListItemDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新打包清单项',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('itemId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, packing_list_dto_1.UpdatePackingListItemDto]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "updatePackingListItem", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('packing-order-steps'),
    (0, swagger_1.ApiOperation)({
        summary: '获取打包顺序步骤',
        description: '获取推荐的打包顺序步骤，帮助用户有序打包',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回打包顺序步骤',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getPackingOrderSteps", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('pre-departure-checklist'),
    (0, swagger_1.ApiOperation)({
        summary: '获取出发前检查清单',
        description: '获取出发前24小时的最终检查清单',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回出发前检查清单',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getPreDepartureChecklist", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/packs'),
    (0, swagger_1.ApiOperation)({
        summary: '获取准备度Pack列表（管理接口）',
        description: '获取准备度Pack列表，支持分页、筛选、搜索。需要管理员权限。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, description: '页码', example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: '每页数量', example: 20 }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: false, type: String, description: '国家代码筛选' }),
    (0, swagger_1.ApiQuery)({ name: 'destinationId', required: false, type: String, description: '目的地ID筛选' }),
    (0, swagger_1.ApiQuery)({ name: 'isActive', required: false, type: Boolean, description: '是否激活' }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, type: String, description: '搜索关键词' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回Pack列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_pack_dto_1.GetReadinessPacksQueryDto]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getReadinessPacks", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/packs/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取准备度Pack详情（管理接口）',
        description: '根据Pack ID获取完整的Pack数据，包含打包模板和指南。需要管理员权限。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Pack ID（packId）', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'includePacking', required: false, type: Boolean, description: '是否包含打包模板和指南，默认 true' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回Pack详情',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'Pack不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_1.Query)('includePacking')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getReadinessPackById", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('admin/packs'),
    (0, swagger_1.ApiOperation)({
        summary: '创建准备度Pack（管理接口）',
        description: '创建新的准备度Pack。需要管理员权限。',
    }),
    (0, swagger_1.ApiBody)({ type: admin_pack_dto_1.CreateReadinessPackDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: '成功创建Pack',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '输入数据验证失败',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_pack_dto_1.CreateReadinessPackDto]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "createReadinessPack", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)('admin/packs/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '更新准备度Pack（管理接口）',
        description: '更新准备度Pack数据或状态。需要管理员权限。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Pack ID（packId）', type: String }),
    (0, swagger_1.ApiBody)({ type: admin_pack_dto_1.UpdateReadinessPackDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新Pack',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'Pack不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, admin_pack_dto_1.UpdateReadinessPackDto]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "updateReadinessPack", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)('admin/packs/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '删除准备度Pack（管理接口）',
        description: '软删除准备度Pack（设置isActive=false）。需要管理员权限。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Pack ID（packId）', type: String }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功删除Pack',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'Pack不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_2.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "deleteReadinessPack", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trips/:tripId/decisions/:ruleId/questions'),
    (0, swagger_1.ApiOperation)({ summary: '获取规则的用户决策问题列表' }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程ID' }),
    (0, swagger_1.ApiParam)({ name: 'ruleId', description: '规则ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回问题列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程或规则不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_2.Param)('tripId')),
    __param(1, (0, common_2.Param)('ruleId')),
    __param(2, (0, common_1.Query)('answeredQuestionIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "getUserDecisionQuestions", null);
__decorate([
    (0, common_1.Post)('trips/:tripId/decisions/:ruleId/answer'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '回答用户决策问题',
        description: '用户回答准备度规则中的决策问题，系统根据回答评估决策分支并返回更新后的准备度检查结果。',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程ID', type: String }),
    (0, swagger_1.ApiParam)({ name: 'ruleId', description: '规则ID', type: String }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                answers: {
                    type: 'object',
                    description: '用户回答（questionId -> answer）',
                    example: {
                        'q1': true,
                        'q2': 'option1',
                        'q3': ['option1', 'option2'],
                        'q4': 100000,
                    },
                },
            },
            required: ['answers'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功处理用户回答',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程或规则不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_2.Param)('tripId')),
    __param(1, (0, common_2.Param)('ruleId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ReadinessController.prototype, "answerUserDecision", null);
exports.ReadinessController = ReadinessController = ReadinessController_1 = __decorate([
    (0, swagger_1.ApiTags)('readiness'),
    (0, common_1.Controller)('readiness'),
    __metadata("design:paramtypes", [readiness_service_1.ReadinessService,
        capability_pack_evaluator_service_1.CapabilityPackEvaluatorService,
        prisma_service_1.PrismaService,
        users_service_1.UsersService,
        checklist_status_service_1.ChecklistStatusService,
        finding_marks_service_1.FindingMarksService,
        packing_list_service_1.PackingListService,
        packing_template_service_1.PackingTemplateService,
        solution_service_1.SolutionService,
        pack_storage_service_1.PackStorageService,
        readiness_ai_service_1.ReadinessAIService,
        readiness_feature_flags_service_1.ReadinessFeatureFlagsService,
        capability_pack_checklist_service_1.CapabilityPackChecklistService,
        user_decision_service_1.UserDecisionService,
        readiness_to_constraints_compiler_1.ReadinessToConstraintsCompiler,
        coverage_map_service_1.CoverageMapService,
        risk_type_mapper_service_1.RiskTypeMapperService,
        core_1.ModuleRef])
], ReadinessController);
//# sourceMappingURL=readiness.controller.js.map