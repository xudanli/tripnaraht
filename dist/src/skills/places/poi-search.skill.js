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
var PoiSearchSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoiSearchSkill = void 0;
const common_1 = require("@nestjs/common");
const places_service_1 = require("../../places/places.service");
const entity_resolution_service_1 = require("../../places/services/entity-resolution.service");
const skill_decorator_1 = require("../decorators/skill.decorator");
let PoiSearchSkill = PoiSearchSkill_1 = class PoiSearchSkill {
    constructor(placesService, entityResolutionService) {
        this.placesService = placesService;
        this.entityResolutionService = entityResolutionService;
        this.logger = new common_1.Logger(PoiSearchSkill_1.name);
        this.metadata = {
            name: 'poi.search',
            description: '搜索 POI（地点）',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
            inputSchema: {
                required: ['query'],
            },
        };
        this.logger.log(`[PoiSearchSkill] 已初始化`);
    }
    async execute(input) {
        this.logger.debug(`执行 poi.search: query=${input.query}, limit=${input.limit || 10}`);
        try {
            const limit = input.limit || 10;
            let pois = [];
            if (this.entityResolutionService) {
                try {
                    const resolutionResult = await this.entityResolutionService.resolveEntities(input.query, [], input.lat, input.lng, limit);
                    pois = resolutionResult.results
                        .filter(r => r.lat != null && r.lng != null && r.lat !== 0 && r.lng !== 0)
                        .map(r => {
                        var _a, _b, _c, _d;
                        return ({
                            poi_id: String(r.id),
                            name: r.nameCN || r.nameEN || r.name,
                            nameCN: (_a = r.nameCN) !== null && _a !== void 0 ? _a : undefined,
                            nameEN: (_b = r.nameEN) !== null && _b !== void 0 ? _b : undefined,
                            coordinates: { lat: r.lat, lng: r.lng },
                            category: (_c = r.category) !== null && _c !== void 0 ? _c : undefined,
                            address: (_d = r.address) !== null && _d !== void 0 ? _d : undefined,
                            evidence_id: `poi_${r.id}_${Date.now()}`,
                        });
                    });
                }
                catch (error) {
                    this.logger.warn(`EntityResolutionService 失败: ${error === null || error === void 0 ? void 0 : error.message}，尝试使用 PlacesService`);
                }
            }
            if (pois.length === 0 && this.placesService) {
                try {
                    const searchResults = await this.placesService.search(input.query, input.lat, input.lng, undefined, undefined, limit);
                    pois = searchResults.map((place, index) => {
                        var _a, _b, _c, _d;
                        return ({
                            poi_id: String(place.id || place.place_id || `poi_${index}`),
                            name: place.name || place.nameCN || place.nameEN || '未知地点',
                            nameCN: (_a = place.nameCN) !== null && _a !== void 0 ? _a : undefined,
                            nameEN: (_b = place.nameEN) !== null && _b !== void 0 ? _b : undefined,
                            coordinates: place.geo || (place.lat && place.lng ? { lat: place.lat, lng: place.lng } : undefined),
                            category: (_c = place.category) !== null && _c !== void 0 ? _c : undefined,
                            address: (_d = place.address) !== null && _d !== void 0 ? _d : undefined,
                            evidence_id: `poi_${place.id || place.place_id || index}_${Date.now()}`,
                        });
                    });
                }
                catch (error) {
                    this.logger.error(`PlacesService 搜索失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                }
            }
            return {
                pois,
            };
        }
        catch (error) {
            this.logger.error(`poi.search 失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
};
exports.PoiSearchSkill = PoiSearchSkill;
exports.PoiSearchSkill = PoiSearchSkill = PoiSearchSkill_1 = __decorate([
    (0, skill_decorator_1.Skill)({
        name: 'poi.search',
        description: '搜索 POI（地点）',
        version: '1.0.0',
        category: 'trip',
        toolGroup: 'DOMAIN',
    }),
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [places_service_1.PlacesService,
        entity_resolution_service_1.EntityResolutionService])
], PoiSearchSkill);
//# sourceMappingURL=poi-search.skill.js.map